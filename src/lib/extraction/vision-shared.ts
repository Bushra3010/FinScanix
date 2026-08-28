import { hasTerms, type CommercialTerms } from "@/lib/commercial-terms";
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

For "documentTitle": look for a project or work title printed prominently on the document (e.g. "HRU Replacement Project", "Swimming Pool Construction — Phase 2"). This is typically a heading line separate from the vendor name and invoice number. Return an empty string if absent.

For "exclusions": look for any "Exclusions", "Scope Exclusions", "Not included", or "Terms" section in the document. Return each exclusion as a short plain-text string. If none are stated, return an empty array.

For "commercialTerms": read the document's Terms and Conditions, Payment Terms, Commercial Terms or Notes block and return what it states, each field copied in the vendor's own words and left as an empty string when the document does not state it. "payment" is the payment schedule ("50% advance, 40% on delivery, 10% after commissioning"). "taxes" is the tax basis ("GST as applicable", "18% GST extra"). "validity" is how long the price holds ("valid for 30 days"). "delivery" is the lead time ("5-7 weeks from PO receipt"). "warranty" is the warranty or defect liability period. Put any other term worth keeping — penalties, site conditions, force majeure — in "other". Never infer a term that is not printed.

For "scopeGaps": name the items a buyer would normally expect to be priced for THIS particular scope of work, but which this document does not price anywhere — neither in a line item nor in the terms. Judge against the trade the document is actually for: a chiller or HRU replacement raises different gaps (removal and disposal of the old unit, refrigerant handling, testing and commissioning, making good after installation) from a swimming-pool build (dewatering, waterproofing, filtration commissioning) or a housekeeping contract (consumables, supervisor deployment, statutory labour compliance). Return at most 5, each a short noun phrase. Do not list something the document already prices or already excludes, and do not pad the list — return an empty array when the quotation is complete.

For "ambiguities": find the wording in this document that is too loose to hold the vendor to — unnamed makes or brands ("branded / equivalent", "approved make"), open quantities ("as required", "lump sum", "provisional"), undefined responsibility, or specifications deferred to a later decision. Write each entry as the item it applies to, an em dash, then what is left undefined — for example "Supply of 100 TR chiller — 'branded equivalent' names no make or model" or "Ducting modification — quantity left to site conditions". Never return the item description on its own: the reader can already see the line, and needs to be told what is wrong with it. Return at most 5, and an empty array when the document is specific throughout. Report only what is actually written — never invent a gap or an ambiguity to fill the list.`;

export const OCR_USER_PROMPT =
  "Extract every billed line item from this document, along with the vendor, GSTIN, document number, GST rate, document title, exclusions, commercial terms, scope gaps and ambiguities. Also return the document's printed Subtotal and Grand Total if visible — these are the totals printed on the document (usually near the bottom), NOT the sum of the line items.";

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
  documentTitle: string;
  taxPct: number;
  lines: VisionLine[];
  exclusions: string[];
  /** The payment, tax, validity and delivery terms the document states. */
  commercialTerms?: {
    payment?: string;
    taxes?: string;
    validity?: string;
    delivery?: string;
    warranty?: string;
    other?: string[];
  };
  /** Items this scope of work would normally include but this document does not price. */
  scopeGaps?: string[];
  /** Wording in this document that is too loose to hold the vendor to. */
  ambiguities?: string[];
  /** The document's own printed subtotal, read from the totals section. */
  documentSubtotal?: number;
  /** The document's own printed grand total, read from the totals section. */
  documentTotal?: number;
}

export const IMAGE_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * A model's free-text list, trimmed to the entries worth storing.
 *
 * Both providers return these lists, and both occasionally answer a prose
 * placeholder ("None", "N/A") instead of the empty array the schema asks for —
 * which would otherwise render as a bullet on the report.
 */
/**
 * The terms block, keeping only the fields the document actually stated.
 *
 * Both providers answer an empty string for a term that is not printed, and an
 * empty string rendered as a term would read as though the document said
 * something when it said nothing.
 */
export function toCommercialTerms(value: unknown): CommercialTerms | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const field = (key: string) => {
    const text = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
    return text && !/^(none|nil|n\/?a|not stated|not specified)\.?$/i.test(text) ? text : undefined;
  };

  const terms: CommercialTerms = {
    payment: field("payment"),
    taxes: field("taxes"),
    validity: field("validity"),
    delivery: field("delivery"),
    warranty: field("warranty"),
    other: toStringList(raw.other, 5),
  };
  if (terms.other?.length === 0) delete terms.other;

  return hasTerms(terms) ? terms : undefined;
}

export function toStringList(value: unknown, limit?: number): string[] {
  if (!Array.isArray(value)) return [];
  const EMPTY = /^(none|nil|n\/?a|not applicable|not stated|no exclusions?)\.?$/i;
  const entries = value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0 && !EMPTY.test(entry));
  return limit === undefined ? entries : entries.slice(0, limit);
}

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

  const exclusions = toStringList(payload.exclusions);
  const scopeGaps = toStringList(payload.scopeGaps, 5);
  const ambiguities = toStringList(payload.ambiguities, 5);
  const commercialTerms = toCommercialTerms(payload.commercialTerms);

  return {
    lines,
    pageCount: 1,
    vendor: payload.vendor?.trim() || undefined,
    vendorGstin: payload.vendorGstin?.trim() || undefined,
    documentNumber: payload.documentNumber?.trim() || undefined,
    documentTitle: payload.documentTitle?.trim() || undefined,
    taxPct: Number.isFinite(payload.taxPct) && payload.taxPct > 0 ? payload.taxPct : 18,
    needsOcr: false,
    exclusions: exclusions.length > 0 ? exclusions : undefined,
    scopeGaps: scopeGaps.length > 0 ? scopeGaps : undefined,
    ambiguities: ambiguities.length > 0 ? ambiguities : undefined,
    commercialTerms,
    documentSubtotal: Number.isFinite(payload.documentSubtotal ?? 0) && (payload.documentSubtotal ?? 0) > 0 ? payload.documentSubtotal : undefined,
    documentTotal: Number.isFinite(payload.documentTotal ?? 0) && (payload.documentTotal ?? 0) > 0 ? payload.documentTotal : undefined,
    // The vision path reads the page as an image, so there is no text layer to
    // sample a script from; the model is prompted in English.
    language: "English",
    note: `Read by OCR (${provider}). Figures are transcribed from the image, so confidence is held below that of a machine-readable PDF.`,
    sampleText: lines.map((line) => line.description).join(" | ").slice(0, 600),
  };
}
