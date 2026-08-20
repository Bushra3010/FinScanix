import { Type } from "@google/genai";
import { geminiClient, geminiMessage, withGeminiRetry } from "@/lib/ai/gemini";
import type { ExtractionResult } from "./pdf";
import {
  IMAGE_MEDIA_TYPES,
  OCR_SYSTEM_PROMPT,
  OCR_USER_PROMPT,
  toExtractionResult,
  type VisionPayload,
} from "./vision-shared";

/**
 * OCR through Google AI Studio (Gemini).
 *
 * Model choice is not a preference here, it is what the key can reach. The
 * Gemini free tier grants no quota at all on the Pro models — they answer 429
 * with a FreeTier quota of None — so the flash tier is the working path, and
 * `gemini-flash-latest` is used rather than a pinned version so it follows
 * Google's current flash release instead of rotting when one is retired.
 *
 * Flash reads a clean printed page accurately, which is what a scanned bill is.
 * It is a smaller model than Pro, so the same confidence ceiling as the Claude
 * path applies and every row is still checked against its own arithmetic
 * downstream.
 */

const MODEL = "gemini-flash-latest";

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
  },
  required: ["vendor", "vendorGstin", "documentNumber", "taxPct", "lines"],
  propertyOrdering: ["vendor", "vendorGstin", "documentNumber", "taxPct", "lines"],
};

export function geminiConfigured() {
  return Boolean(process.env.GOOGLE_AI_API_KEY);
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
