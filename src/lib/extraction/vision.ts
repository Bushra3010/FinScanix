import Anthropic from "@anthropic-ai/sdk";
import type { ExtractionResult } from "./pdf";
import { extractWithGemini, geminiConfigured } from "./vision-gemini";
import {
  IMAGE_MEDIA_TYPES,
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  toExtractionResult,
  type VisionPayload,
} from "./vision-shared";

/**
 * OCR extraction for scans and photographs — the FR-2.1 path that the text-layer
 * parser cannot serve.
 *
 * A scanned page has no embedded text, so there is nothing to parse. This sends
 * the page to a vision model and constrains the reply with a JSON schema, so the
 * response is machine-readable by construction rather than by hopeful parsing of
 * prose.
 *
 * Only reachable when ANTHROPIC_API_KEY is set; ingest rejects scans with a
 * clear message when it is not, rather than accepting the file and producing an
 * empty report.
 */

const MODEL = "claude-opus-5";

/** Constrains the reply shape — structured outputs, not prompt-and-pray. */
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    vendor: { type: "string", description: "Supplier name as printed on the document" },
    vendorGstin: { type: "string", description: "15-character GSTIN, or empty string if absent" },
    documentNumber: { type: "string", description: "Invoice or quotation number" },
    documentTitle: { type: "string", description: "The project or work title printed on the document, e.g. 'HRU Replacement Project'. Empty string if absent." },
    taxPct: { type: "number", description: "GST percentage applied, e.g. 18" },
    lines: {
      type: "array",
      description: "One entry per billed line item, in printed order",
      items: {
        type: "object",
        properties: {
          description: { type: "string", description: "Full item description as printed" },
          unit: { type: "string", description: "Unit of measure, e.g. cum, sqm, kg, nos, bag" },
          quantity: { type: "number" },
          rate: { type: "number", description: "Rate per unit in rupees" },
          amount: { type: "number", description: "Line amount in rupees" },
          legible: {
            type: "boolean",
            description: "False when any figure on this row had to be guessed",
          },
        },
        required: ["description", "unit", "quantity", "rate", "amount", "legible"],
        additionalProperties: false,
      },
    },
    exclusions: {
      type: "array",
      description: "Items the vendor explicitly stated as NOT included, from an Exclusions, Scope Exclusions, Not Included or Terms section. Empty array if none are stated.",
      items: { type: "string" },
    },
    commercialTerms: {
      type: "object",
      description: "What the document's Terms and Conditions block states, in the vendor's own words. Empty string for any term the document does not state.",
      properties: {
        payment: { type: "string", description: "Payment schedule, e.g. '50% advance, 40% on delivery, 10% after commissioning'" },
        taxes: { type: "string", description: "Tax basis, e.g. 'GST as applicable'" },
        validity: { type: "string", description: "How long the quoted price holds" },
        delivery: { type: "string", description: "Delivery lead time" },
        warranty: { type: "string", description: "Warranty or defect liability period" },
        other: { type: "array", description: "Any other stated term worth keeping", items: { type: "string" } },
      },
      required: ["payment", "taxes", "validity", "delivery", "warranty", "other"],
      additionalProperties: false,
    },
    scopeGaps: {
      type: "array",
      description: "Up to 5 items a buyer would expect to be priced for this particular scope of work, but which this document neither prices nor excludes. Empty array if the quotation is complete.",
      items: { type: "string" },
    },
    ambiguities: {
      type: "array",
      description: "Up to 5 pieces of wording in this document that are too loose to hold the vendor to. Each entry reads 'item — what is left undefined', never the item description on its own. Empty array if the document is specific throughout.",
      items: { type: "string" },
    },
    documentSubtotal: { type: "number", description: "The printed subtotal (before tax) in rupees, if visible on the document" },
    documentTotal: { type: "number", description: "The printed grand total (including all taxes) in rupees, if visible on the document" },
    documentDiscount: { type: "number", description: "The discount amount printed in the totals block (Less / Discount / Rebate), in rupees. 0 if absent." },
    documentTax: { type: "number", description: "The tax or levy amount printed in the totals block, in rupees — the amount, not a percentage. 0 if absent." },
  },
  required: ["vendor", "vendorGstin", "documentNumber", "taxPct", "lines"],
  additionalProperties: false,
} as const;

/** Whether any OCR provider is reachable on this deployment. */
export function visionConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY) || geminiConfigured();
}

/** Which one will serve, named for the interface and the quality checks. */
export function visionProvider(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return `Anthropic ${MODEL}`;
  if (geminiConfigured()) return "Google AI Studio (Gemini)";
  return null;
}

/**
 * Reads a scan or photograph through whichever provider is configured.
 *
 * Anthropic wins when both keys are present — not out of preference, but
 * because a document read wrongly is worse than one read slowly, and the larger
 * model is the more accurate transcriber. Gemini serves when it is the only key
 * available, which on the free tier means the flash tier.
 */
export async function extractFromImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    if (geminiConfigured()) return extractWithGemini(bytes, mimeType);
    throw new Error(
      "No OCR provider is configured. Set ANTHROPIC_API_KEY or GOOGLE_AI_API_KEY.",
    );
  }

  const client = new Anthropic();
  const isPdf = mimeType === "application/pdf";
  const data = Buffer.from(bytes).toString("base64");

  // A PDF with no text layer still goes as a document block — the model reads
  // the rendered pages, which is exactly the scanned-PDF case.
  const source = isPdf
    ? ({
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data },
      })
    : ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: (IMAGE_MEDIA_TYPES.has(mimeType) ? mimeType : "image/jpeg") as
            | "image/jpeg"
            | "image/png"
            | "image/webp"
            | "image/gif",
          data,
        },
      });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: OCR_SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            source,
            { type: "text", text: OCR_USER_PROMPT },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("OCR provider is rate limited. Try again shortly.");
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("OCR provider rejected the configured API key.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`OCR provider error (${error.status}): ${error.message}`);
    }
    throw error;
  }

  // A refusal returns HTTP 200 with empty or partial content — check before
  // reading, or this throws on content[0].
  if (response.stop_reason === "refusal") {
    throw new Error("The OCR provider declined to process this document.");
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("OCR provider returned no readable content.");
  }

  let payload: VisionPayload;
  try {
    payload = JSON.parse(text.text) as VisionPayload;
  } catch {
    throw new Error("OCR provider returned malformed output.");
  }

  // Shared with the Gemini path: both providers answer the same schema, so the
  // arithmetic check and the field mapping are applied in one place rather than
  // drifting apart per provider — which is how this path came to silently drop
  // the document title and exclusions it was asking for.
  return toExtractionResult(payload, MODEL);
}
