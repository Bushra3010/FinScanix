import { extractText, getDocumentProxy } from "unpdf";

/**
 * Line-item extraction from machine-generated PDFs — FR-2.1 / FR-2.2.
 *
 * This reads the embedded text layer and reconstructs the item table from it.
 * It is not OCR: a scanned image has no text layer and falls through to the
 * vision adapter (see lib/adapters/live.ts).
 *
 * Confidence is not decoration. Every candidate row is checked against its own
 * arithmetic — qty × rate should equal the printed amount — and rows that do
 * not reconcile are surfaced for review rather than silently trusted. That is a
 * real signal, unlike a model's self-reported score.
 */

export interface ExtractedLine {
  srNo: number;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  confidence: { description: number; quantity: number; rate: number };
}

export interface ExtractionResult {
  lines: ExtractedLine[];
  pageCount: number;
  vendor?: string;
  vendorGstin?: string;
  documentNumber?: string;
  taxPct: number;
  /** True when the file carried no usable text layer — needs OCR instead. */
  needsOcr: boolean;
}

/** Units seen in Indian construction and FM billing. */
const UNITS = [
  "cum", "cu.m", "m3", "sqm", "sq.m", "m2", "rmt", "rm", "metre", "meter", "mtr", "m",
  "kg", "mt", "ton", "tonne", "quintal", "bag", "bags", "nos", "no", "each", "unit",
  "point", "pt", "set", "pair", "litre", "liter", "ltr", "l", "sqft", "cft", "ft",
  "ls", "l.s", "lot", "job", "month", "day", "hour", "visit",
];

const UNIT_RE = new RegExp(`^(${UNITS.map((u) => u.replace(/\./g, "\\.")).join("|")})$`, "i");

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const NUMBER_RE = /^-?[\d,]+(?:\.\d+)?$/;

function toNumber(token: string) {
  return Number(token.replace(/,/g, ""));
}

function isNumeric(token: string) {
  return NUMBER_RE.test(token) && Number.isFinite(toNumber(token));
}

/**
 * Pulls one item row out of a text line.
 *
 * Handles the two layouts that cover most vendor bills:
 *   [sr] description  unit  qty  rate  amount
 *   [sr] description  qty  unit  rate  amount
 */
function parseLine(raw: string, srNo: number): ExtractedLine | null {
  const line = raw.replace(/\s+/g, " ").trim();
  if (line.length < 12) return null;

  const tokens = line.split(" ");
  if (tokens.length < 4) return null;

  // Walk back from the end collecting the trailing numeric columns.
  const trailing: string[] = [];
  let i = tokens.length - 1;
  while (i >= 0 && trailing.length < 4 && isNumeric(tokens[i])) {
    trailing.unshift(tokens[i]);
    i -= 1;
  }
  if (trailing.length < 3) return null;

  // A unit may sit immediately before the numbers, or between qty and rate.
  let unit = "";
  if (i >= 0 && UNIT_RE.test(tokens[i])) {
    unit = tokens[i];
    i -= 1;
  }

  let description = tokens.slice(0, i + 1).join(" ").trim();
  // Drop a leading serial number: "12." or "12)" or bare "12"
  description = description.replace(/^\d{1,3}[.)]?\s+/, "").trim();
  if (description.length < 4) return null;
  // A row that is all digits and punctuation is a totals line, not an item.
  if (!/[a-z]{3}/i.test(description)) return null;
  if (/^(total|sub\s*total|grand\s*total|gst|cgst|sgst|igst|round)/i.test(description)) {
    return null;
  }

  const [quantity, rate, amount] =
    trailing.length === 4
      ? [toNumber(trailing[0]), toNumber(trailing[2]), toNumber(trailing[3])]
      : [toNumber(trailing[0]), toNumber(trailing[1]), toNumber(trailing[2])];

  if (!(quantity > 0) || !(rate >= 0) || !(amount >= 0)) return null;

  // Does the row agree with itself?
  const expected = quantity * rate;
  const drift = expected === 0 ? 1 : Math.abs(expected - amount) / Math.max(expected, 1);
  const reconciles = drift <= 0.01;

  // Unit hidden inside the description tail, e.g. "… 20mm nominal size cum"
  if (!unit) {
    const tail = description.split(" ").pop() ?? "";
    if (UNIT_RE.test(tail)) {
      unit = tail;
      description = description.slice(0, -tail.length).trim();
    }
  }

  return {
    srNo,
    description,
    unit: unit.toLowerCase() || "nos",
    quantity,
    rate,
    amount: reconciles ? amount : Math.round(expected * 100) / 100,
    confidence: {
      description: description.length > 18 ? 0.95 : 0.78,
      quantity: reconciles ? 0.97 : 0.62,
      // The rate is what the whole verdict turns on, so an unreconciled row
      // drops below the review threshold rather than being taken on trust.
      rate: reconciles ? 0.97 : 0.58,
    },
  };
}

export async function extractFromPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const body = Array.isArray(text) ? text.join("\n") : text;

  // A scanned page yields almost no characters; that is the OCR signal.
  const needsOcr = body.replace(/\s/g, "").length < 200;

  const lines: ExtractedLine[] = [];
  if (!needsOcr) {
    let srNo = 0;
    for (const raw of body.split(/\r?\n/)) {
      const parsed = parseLine(raw, srNo + 1);
      if (parsed) {
        srNo += 1;
        lines.push({ ...parsed, srNo });
      }
    }
  }

  const gstin = body.match(GSTIN_RE)?.[0];
  const docNo = body.match(
    /(?:invoice|inv|bill|quotation|quote)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\-]{3,24})/i,
  )?.[1];
  const taxMatch = body.match(/\b(5|12|18|28)\s*%/);

  // The vendor is usually the most prominent line above the tax id.
  const vendor = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 6 && l.length < 60 && /[A-Za-z]{4}/.test(l) && !/invoice/i.test(l));

  return {
    lines,
    pageCount: totalPages ?? 1,
    vendor,
    vendorGstin: gstin,
    documentNumber: docNo,
    taxPct: taxMatch ? Number(taxMatch[1]) : 18,
    needsOcr,
  };
}
