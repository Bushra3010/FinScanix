import { Type } from "@google/genai";
import { geminiClient, geminiMessage, withGeminiRetry } from "@/lib/ai/gemini";
import type { ExtractionResult } from "./pdf";
import {
  IMAGE_MEDIA_TYPES,
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  toCommercialTerms,
  toExtractionResult,
  type VisionPayload,
} from "./vision-shared";
import type { CommercialTerms } from "@/lib/commercial-terms";

/**
 * OCR through Google AI Studio (Gemini).
 *
 * Model choice is not a preference here, it is what the key can reach. The
 * Gemini free tier grants no quota at all on the Pro models — they answer 429
 * with a FreeTier quota of None — so the flash-lite tier is the working path.
 * `gemini-flash-lite-latest` is confirmed to support responseSchema (JSON mode)
 * and responds reliably. The -latest suffix follows Google's current release
 * instead of pinning a version that will one day be retired.
 *
 * Flash-Lite reads a clean printed page accurately, which is what a scanned
 * bill is. Every extracted row is still checked against its own arithmetic
 * downstream regardless of the model used here.
 */

const MODEL = "gemini-flash-lite-latest";

/**
 * Gemini takes its own schema dialect — uppercase type names, no
 * additionalProperties — so the shape is declared here rather than shared.
 * propertyOrdering keeps the fields in a stable order across responses.
 */
const EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    vendor: { type: Type.STRING, description: "Supplier name as printed on the document" },
    vendorGstin: { type: Type.STRING, description: "15-character GSTIN, or empty string if absent" },
    documentNumber: { type: Type.STRING, description: "Invoice or quotation number" },
    documentTitle: { type: Type.STRING, description: "The project or work title printed on the document, e.g. 'HRU Replacement Project', 'Swimming Pool Construction'. Empty string if absent." },
    taxPct: { type: Type.NUMBER, description: "GST percentage applied, e.g. 18" },
    lines: {
      type: Type.ARRAY,
      description: "One entry per billed line item, in printed order",
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING, description: "Full item description as printed" },
          unit: { type: Type.STRING, description: "Unit of measure, e.g. cum, sqm, kg, nos, bag" },
          quantity: { type: Type.NUMBER },
          rate: { type: Type.NUMBER, description: "Rate per unit in rupees" },
          amount: { type: Type.NUMBER, description: "Line amount in rupees" },
          legible: {
            type: Type.BOOLEAN,
            description: "False when any figure on this row had to be guessed",
          },
        },
        required: ["description", "unit", "quantity", "rate", "amount", "legible"],
        propertyOrdering: ["description", "unit", "quantity", "rate", "amount", "legible"],
      },
    },
    exclusions: {
      type: Type.ARRAY,
      description: "Items the vendor explicitly stated as NOT included — from an Exclusions, Scope Exclusions, Not Included, or Terms section. Empty array if no exclusions are stated.",
      items: { type: Type.STRING },
    },
    commercialTerms: {
      type: Type.OBJECT,
      description: "What the document's Terms and Conditions block states, copied in the vendor's own words. Empty string for any term the document does not state.",
      properties: {
        payment: { type: Type.STRING, description: "Payment schedule, e.g. '50% advance, 40% on delivery, 10% after commissioning'" },
        taxes: { type: Type.STRING, description: "Tax basis, e.g. 'GST as applicable'" },
        validity: { type: Type.STRING, description: "How long the quoted price holds, e.g. 'valid for 30 days'" },
        delivery: { type: Type.STRING, description: "Delivery lead time, e.g. '5-7 weeks from PO receipt'" },
        warranty: { type: Type.STRING, description: "Warranty or defect liability period" },
        other: { type: Type.ARRAY, description: "Any other stated term worth keeping", items: { type: Type.STRING } },
      },
      required: ["payment", "taxes", "validity", "delivery", "warranty", "other"],
      propertyOrdering: ["payment", "taxes", "validity", "delivery", "warranty", "other"],
    },
    scopeGaps: {
      type: Type.ARRAY,
      description: "Up to 5 items a buyer would expect to be priced for this particular scope of work, but which this document neither prices nor excludes. Judge against the trade the document is for. Empty array if the quotation is complete.",
      items: { type: Type.STRING },
    },
    ambiguities: {
      type: Type.ARRAY,
      description: "Up to 5 pieces of wording in this document that are too loose to hold the vendor to — unnamed makes, open quantities, undefined responsibility, deferred specifications. Each entry reads 'item — what is left undefined', never the item description on its own. Empty array if the document is specific throughout.",
      items: { type: Type.STRING },
    },
    documentSubtotal: {
      type: Type.NUMBER,
      description: "The printed subtotal (amount before tax) in rupees, if visible on the document. Return 0 if not visible.",
    },
    documentTotal: {
      type: Type.NUMBER,
      description: "The printed grand total (amount including all taxes) in rupees, if visible on the document. Return 0 if not visible.",
    },
    documentDiscount: {
      type: Type.NUMBER,
      description: "The discount amount printed in the totals block (Less / Discount / Rebate), in rupees. Return 0 if the document does not print one.",
    },
    documentTax: {
      type: Type.NUMBER,
      description: "The tax or levy amount printed in the totals block, in rupees — the amount, not a percentage. Return 0 if the document does not print one.",
    },
  },
  required: ["vendor", "vendorGstin", "documentNumber", "documentTitle", "taxPct", "lines", "exclusions", "commercialTerms", "scopeGaps", "ambiguities", "documentSubtotal", "documentTotal", "documentDiscount", "documentTax"],
  propertyOrdering: ["vendor", "vendorGstin", "documentNumber", "documentTitle", "taxPct", "lines", "exclusions", "commercialTerms", "scopeGaps", "ambiguities", "documentSubtotal", "documentTotal", "documentDiscount", "documentTax"],
};

export function geminiConfigured() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
}

/** Just the terms block — for documents read before these were captured. */
const TERMS_SCHEMA = {
  type: Type.OBJECT,
  properties: EXTRACTION_SCHEMA.properties.commercialTerms.properties,
  required: EXTRACTION_SCHEMA.properties.commercialTerms.required,
  propertyOrdering: EXTRACTION_SCHEMA.properties.commercialTerms.propertyOrdering,
};

/**
 * Re-reads only the Terms and Conditions from a stored original.
 *
 * A document analysed before terms were captured cannot have them recovered
 * from its line items — they are printed in their own block — so the page has
 * to be read again. Asking for the terms alone keeps that to a fraction of a
 * full re-extraction.
 */
export async function extractTermsWithGemini(
  bytes: Uint8Array,
  mimeType: string,
): Promise<CommercialTerms | undefined> {
  if (!geminiConfigured()) return undefined;

  const declared = mimeType === "application/pdf"
    ? "application/pdf"
    : IMAGE_MEDIA_TYPES.has(mimeType)
      ? mimeType
      : "image/jpeg";

  const result = await withGeminiRetry(() =>
    geminiClient().models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user" as const,
          parts: [
            { inlineData: { mimeType: declared, data: Buffer.from(bytes).toString("base64") } },
            {
              text: "Read only this document's Terms and Conditions / Payment Terms / Notes block and return what it states, in the vendor's own words. Use an empty string for any term the document does not state.",
            },
          ],
        },
      ],
      config: {
        systemInstruction: OCR_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: TERMS_SCHEMA,
      },
    }),
  );

  const text = result.text ?? "";
  if (!text.trim()) return undefined;
  return toCommercialTerms(JSON.parse(text));
}

export async function extractWithGemini(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractionResult> {
  if (!geminiConfigured()) {
    throw new Error("GOOGLE_AI_API_KEY is not set — OCR extraction is unavailable.");
  }
  const ai = geminiClient();
  const isPdf = mimeType === "application/pdf";
  // Gemini reads a PDF's rendered pages directly, which is exactly the
  // scanned-PDF case; no rasterising step of our own is needed.
  const declared = isPdf
    ? "application/pdf"
    : IMAGE_MEDIA_TYPES.has(mimeType)
      ? mimeType
      : "image/jpeg";

  const request = {
    model: MODEL,
    contents: [
      {
        role: "user" as const,
        parts: [
          { inlineData: { mimeType: declared, data: Buffer.from(bytes).toString("base64") } },
          { text: OCR_USER_PROMPT },
        ],
      },
    ],
    config: {
      systemInstruction: OCR_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: EXTRACTION_SCHEMA,
    },
  };

  let text: string;
  try {
    text = (await withGeminiRetry(() => ai.models.generateContent(request))).text ?? "";
  } catch (error) {
    throw new Error(geminiMessage(error, "OCR provider error"));
  }

  if (!text.trim()) throw new Error("OCR provider returned no readable content.");

  let payload: VisionPayload;
  try {
    payload = JSON.parse(text) as VisionPayload;
  } catch {
    throw new Error("OCR provider returned malformed output.");
  }

  return toExtractionResult(payload, `Google ${MODEL}`);
}
