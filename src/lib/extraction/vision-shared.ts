import type { ExtractedLine, ExtractionResult } from "./pdf";

/**
 * Everything the OCR providers agree on — FR-2.1.
 *
 * The prompt, the response shape and the arithmetic check live here rather than
 * in either provider, so switching between them cannot quietly change what is
 * asked for or how the answer is judged. A provider file is then only the call
 * itself: build a request, hand back a payload.
 */

export const OCR_SYSTEM_PROMPT = `You read vendor invoices and quotations from the Indian construction and facilities-management sector and return their line items.

Transcribe only what is printed. Never infer a rate, quantity or amount that you cannot read — set "legible": false on any row where a figure is unclear, and give your best reading rather than a plausible-looking invention.

Exclude subtotal, tax, discount, round-off and grand-total rows: they are not line items. Keep the vendor's own wording for each description verbatim, since it is matched against a rate book downstream.

Amounts are in Indian rupees. Report rate and amount as plain numbers with no currency symbol or thousands separator.

For "exclusions": look for any "Exclusions", "Scope Exclusions", "Not included", or "Terms" section in the document. Return each exclusion as a short plain-text string. If none are stated, return an empty array.`;

export const OCR_USER_PROMPT =
  "Extract every billed line item from this document, along with the vendor, GSTIN, document number and GST rate.";

export interface VisionLine {
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  legible: boolean;
}

export interface VisionPayload {
  vendor: string;
  vendorGstin: string;
  documentNumber: string;
  taxPct: number;
  lines: VisionLine[];
  exclusions: string[];
}

export const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Turns a provider's payload into the shape the pipeline consumes.
 *
 * The arithmetic check is the same one the text-layer parser applies, and it is
 * applied here rather than trusted from the model: a row that does not
 * reconcile is surfaced for review whichever provider read it.
 */
export function toExtractionResult(payload: VisionPayload, provider: string): ExtractionResult {
  const lines: ExtractedLine[] = (payload.lines ?? [])
    .filter((line) => line.description?.trim() && line.quantity > 0 && line.rate >= 0)
    .map((line, index) => {
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

  const exclusions = Array.isArray(payload.exclusions)
    ? payload.exclusions.map((e) => String(e).trim()).filter(Boolean)
    : [];

  return {
    lines,
    pageCount: 1,
    vendor: payload.vendor?.trim() || undefined,
    vendorGstin: payload.vendorGstin?.trim() || undefined,
    documentNumber: payload.documentNumber?.trim() || undefined,
    taxPct: Number.isFinite(payload.taxPct) && payload.taxPct > 0 ? payload.taxPct : 18,
    needsOcr: false,
    exclusions: exclusions.length > 0 ? exclusions : undefined,
    // The vision path reads the page as an image, so there is no text layer to
    // sample a script from; the model is prompted in English.
    language: "English",
    note: `Read by OCR (${provider}). Figures are transcribed from the image, so confidence is held below that of a machine-readable PDF.`,
    sampleText: lines.map((line) => line.description).join(" | ").slice(0, 600),
  };
}
