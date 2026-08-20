import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedLine, ExtractionResult } from "./pdf";
import { extractWithGemini, geminiConfigured } from "./vision-gemini";

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
  },
  required: ["vendor", "vendorGstin", "documentNumber", "taxPct", "lines"],
  additionalProperties: false,
} as const;

const SYSTEM = `You read vendor invoices and quotations from the Indian construction and facilities-management sector and return their line items.

Transcribe only what is printed. Never infer a rate, quantity or amount that you cannot read — set "legible": false on any row where a figure is unclear, and give your best reading rather than a plausible-looking invention.

Exclude subtotal, tax, discount, round-off and grand-total rows: they are not line items. Keep the vendor's own wording for each description verbatim, since it is matched against a rate book downstream.

Amounts are in Indian rupees. Report rate and amount as plain numbers with no currency symbol or thousands separator.`;

type VisionLine = {
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  legible: boolean;
};

type VisionPayload = {
  vendor: string;
  vendorGstin: string;
  documentNumber: string;
  taxPct: number;
  lines: VisionLine[];
};

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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
          media_type: (MEDIA_TYPES.has(mimeType) ? mimeType : "image/jpeg") as
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
      system: SYSTEM,
      thinking: { type: "adaptive" },
      output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            source,
            {
              type: "text",
              text: "Extract every billed line item from this document, along with the vendor, GSTIN, document number and GST rate.",
            },
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

  const lines: ExtractedLine[] = payload.lines
    .filter((line) => line.description?.trim() && line.quantity > 0 && line.rate >= 0)
    .map((line, index) => {
      // Same arithmetic check the text-layer parser applies: a row that does not
      // reconcile is surfaced for review rather than trusted.
      const expected = line.quantity * line.rate;
      const drift = expected === 0 ? 1 : Math.abs(expected - line.amount) / Math.max(expected, 1);
      const reconciles = drift <= 0.01;
      const confident = line.legible && reconciles;

      return {
        srNo: index + 1,
        description: line.description.trim(),
        unit: (line.unit || "nos").toLowerCase().trim(),
        quantity: line.quantity,
        rate: line.rate,
        amount: reconciles ? line.amount : Math.round(expected * 100) / 100,
        confidence: {
          description: line.legible ? 0.93 : 0.7,
          quantity: confident ? 0.93 : 0.6,
          // Never above the text-layer path: OCR is inherently less certain, so
          // a clean scan still lands below a machine-readable PDF.
          rate: confident ? 0.93 : 0.55,
        },
      };
    });

  return {
    lines,
    pageCount: 1,
    vendor: payload.vendor?.trim() || undefined,
    vendorGstin: payload.vendorGstin?.trim() || undefined,
    documentNumber: payload.documentNumber?.trim() || undefined,
    taxPct: Number.isFinite(payload.taxPct) && payload.taxPct > 0 ? payload.taxPct : 18,
    needsOcr: false,
    // The vision path reads the page as an image, so there is no text layer to
    // sample a script from; the model is prompted in English.
    language: "English",
    // The vision path never sees a text layer, so there is none to sample.
    sampleText: lines.map((line) => line.description).join(" | ").slice(0, 600),
  };
}
