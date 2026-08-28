import { extractText, getDocumentProxy } from "unpdf";
import type { CommercialTerms } from "@/lib/commercial-terms";

/**
 * Line-item extraction from machine-generated PDFs — FR-2.1 / FR-2.2.
 *
 * This reads the embedded text layer and reconstructs the item table from it.
 * It is not OCR: a scanned image has no text layer and falls through to the
 * vision adapter (see lib/extraction/vision.ts).
 *
 * Four things about real vendor bills drive the shape of this file.
 *
 * A PDF has no notion of a line. Billing software draws each cell at its own
 * coordinates and a plain text dump returns them in content-stream order, which
 * is not reading order. Rows are rebuilt from glyph positions instead.
 *
 * Descriptions wrap. A row's text can occupy three visual lines while its
 * quantity and rate sit on only one, so rows are assembled by accumulating text
 * until the numbers that close a row arrive.
 *
 * Currency symbols are not text. Fonts encode the rupee sign in whatever slot
 * they like — a private-use codepoint, or NUL — and it arrives glued to the
 * figure. Left alone it stops the number being read as a number at all.
 *
 * Column order varies. "Qty Rate Amount" and "Price Quantity GST Amount" are
 * both common, and the second computes (price + tax) x qty. Guessing by
 * position gets the rate and quantity backwards, so the header is read first
 * and the columns it names are what the rows are mapped onto.
 *
 * Confidence is not decoration. Every row is checked against its own
 * arithmetic, and rows that do not reconcile are surfaced for review rather
 * than silently trusted. That is a real signal, unlike a model's self-report.
 */

export interface ExtractedLine {
  srNo: number;
  description: string;
  unit: string;
  quantity: number;
  /** Rate before tax — the basis the rate library and market pricing compare on. */
  rate: number;
  /** quantity x rate, before tax, so an invoice-level tax cannot be counted twice. */
  amount: number;
  /**
   * The line total exactly as the document prints it, when that differs from
   * quantity x rate — which it does whenever the amount column is tax-inclusive.
   * Kept so a reviewer can see the document's own figure beside the derived one
   * rather than wondering why the two disagree.
   */
  printedAmount?: number;
  confidence: { description: number; quantity: number; rate: number };
}

export interface ExtractionResult {
  lines: ExtractedLine[];
  pageCount: number;
  vendor?: string;
  vendorGstin?: string;
  documentNumber?: string;
  /**
   * The document's own heading / project title, e.g. "HRU Replacement Project".
   * Used as the project name when the user didn't supply one at upload time.
   */
  documentTitle?: string;
  taxPct: number;
  /** True when the file carried no usable text layer — needs OCR instead. */
  needsOcr: boolean;
  /**
   * Plain-language explanation of anything about this document that would
   * otherwise look like an extraction error — a tax-inclusive amount column,
   * most often. Shown on the report so the discrepancy is accounted for.
   */
  note?: string;
  /** Script detected in the text layer, which is not always Latin here. */
  language: string;
  /**
   * The document's own printed subtotal and grand total, read from the
   * totals section at the bottom of the document rather than derived from
   * line items. The subtotal is the authoritative pre-tax "Quoted Value" on
   * the report. Undefined when the document does not print these figures, or they
   * could not be parsed.
   */
  documentSubtotal?: number;
  documentTotal?: number;
  /**
   * Items the vendor explicitly stated as excluded from scope, read from the
   * document's Exclusions / Terms section. Undefined when no such section was found.
   */
  exclusions?: string[];
  /**
   * Scope gaps and loose wording the vision model found in this document —
   * items this scope of work would normally price but this one does not, and
   * phrases too vague to hold the vendor to. Undefined on the text-layer path,
   * which reads rows rather than reasoning about scope; the report then derives
   * its own from the line items.
   */
  scopeGaps?: string[];
  ambiguities?: string[];
  /** Payment, tax, validity and delivery terms read from the terms block. */
  commercialTerms?: CommercialTerms;
  /**
   * The reconstructed text, first few hundred characters. Surfaced when no rows
   * are found so the failure can be diagnosed from the report rather than
   * guessed at.
   */
  sampleText: string;
}

/** Units seen in Indian construction and FM billing. */
const UNITS = [
  "cum", "cu.m", "cu m", "m3", "sqm", "sq.m", "sq m", "m2", "rmt", "rm", "metre", "meter", "mtr", "m",
  "kg", "kgs", "mt", "ton", "tons", "tonne", "quintal", "bag", "bags", "nos", "no", "each", "unit", "units",
  "point", "points", "pt", "set", "sets", "pair", "pairs", "litre", "liter", "ltr", "l", "sqft", "sft", "cft", "ft", "rft",
  "ls", "l.s", "lot", "job", "month", "days", "day", "hour", "hrs", "visit", "trip", "roll", "coil", "box", "pkt",
  "pcs", "pc", "piece", "pieces",
];

const UNIT_RE = new RegExp(`^(${UNITS.map((u) => u.replace(/[.\s]/g, "\\$&")).join("|")})\\.?$`, "i");

/**
 * Qualifiers that precede a unit and form part of it: "288 sq ft", "12 cu m".
 * Without absorbing these the walk halts on the qualifier and leaves the
 * quantity on the far side of it, unread.
 */
const UNIT_PREFIX_RE = /^(sq|cu|cubic|square|running|metric|lin|linear)\.?$/i;

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const NUMBER_RE = /^-?(?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d+)?$/;

/** Rows that close a table rather than belong to it. */
const NOT_AN_ITEM =
  /^(total|sub\s*-?\s*total|grand\s*total|net\s*(amount|total|payable)|amount\s*(in\s*words|chargeable)|round(ing)?|freight|packing|advance|balance|less\b|add\b|tcs|tds|e\.?\s*&\s*o\.?e|terms|declaration|bank|ifsc|account no|for\s+[A-Z]|scope\s+of\s+work|technical\s+spec|basis\s+of\s+quote|payment\s+(schedule|terms)|exclusions?|inclusions?|assumptions?|validity|warranty|notes?\b)/i;

/**
 * Tax and discount lines, which close a table — but only when a figure follows.
 *
 * "GST 18%" and "CGST @ 9" are totals. "GST Registration" and "Discount coupon
 * printing" are things a vendor sells, and dropping them loses real line items.
 * What separates them is what comes next: a number, a percentage, or nothing.
 */
const TAX_ROW =
  /^(gst|cgst|sgst|igst|utgst|vat|tax|discount|disc)\b\s*[:@-]?\s*(\d|%|$)/i;

/**
 * Characters a font may leave in the way of reading a figure: C0/C1 control
 * codes and the private-use area, where rupee glyphs frequently land.
 */
const INVISIBLE_RE = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\uE000-\\uF8FF]", "g");

/**
 * Strips everything a font may have put in the way of reading a figure.
 *
 * The rupee sign is the usual offender. Fonts map it to a private-use
 * codepoint, or — as one real quotation in testing did — to NUL, which
 * String.trim() does not remove because it is a control character, not
 * whitespace. Whatever slot it lands in, it arrives attached to the number and
 * has to go before the number can be recognised as one.
 */
function normaliseGlyphs(text: string) {
  return text
    .replace(INVISIBLE_RE, " ")
    // Currency signs, symbolic or written.
    .replace(/[₹₨￥$€£¥]/g, " ")
    .replace(/\b(?:INR|Rs\.?)\s*(?=[\d.,])/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DEVANAGARI_RE = new RegExp("[\\u0900-\\u097F]");
const TAMIL_RE = new RegExp("[\\u0B80-\\u0BFF]");
const TELUGU_RE = new RegExp("[\\u0C00-\\u0C7F]");

/** Which script the text layer is in — reported, never guessed past what is there. */
function detectLanguage(body: string) {
  const scripts: string[] = [];
  if (/[A-Za-z]{4}/.test(body)) scripts.push("English");
  if (DEVANAGARI_RE.test(body)) scripts.push("Devanagari");
  if (TAMIL_RE.test(body)) scripts.push("Tamil");
  if (TELUGU_RE.test(body)) scripts.push("Telugu");
  if (scripts.length === 0) return "Undetermined";
  return scripts.join(" + ");
}

function toNumber(token: string) {
  return Number(token.replace(/,/g, ""));
}

/**
 * Reads the document's own printed subtotal or grand total from its text body.
 *
 * A line in an Indian quotation like
 *   "Subtotal: Rs. 3,20,000.00"
 *   "TOTAL  ₹ 3,78,400  (inclusive of GST)"
 *   "GRAND TOTAL       3,78,400.00"
 *   "Net Amount Payable: INR 3,78,400"
 * carries one figure and a label. The rightmost number on a labelled line is
 * the value, since the label is always on the left and rupee figures either
 * precede or follow it. We accept "label on the left, value on the right"
 * because every standard quotation template does it that way.
 *
 * The figure is not validated against the sum of the parsed line items — that
 * would force every discrepancy into one of two interpretations ("extraction
 * wrong" or "vendor wrong"), and we have no way to tell which is right. The
 * report already shows the discrepancy side-by-side in the audit panel.
 */
function readDocumentTotal(body: string, kind: "subtotal" | "grand"): number | undefined {
  // Patterns are read with the rupee sign / INR / Rs. stripped first — the
  // sign is encoded in a private-use codepoint in some fonts and confuses the
  // number regex when it arrives glued to the figure.
  const cleaned = body
    .replace(/[  ]/g, " ")
    .replace(/[₹₨₹]/g, "INR ")
    .replace(/INR\s*\.?\s*/gi, "");

  // The grand-total pattern matches the strongest labels first, so that
  // "Total: 3,78,400" (the bottom line) is preferred over "Quantity Total: 12"
  // (a column footer we never want to read as the grand total).
  const grandPatterns = [
    /(grand\s*total|total\s*payable|net\s*amount(?:\s*payable)?|amount\s*payable|total\s*amount(?:\s*payable)?|total\s*\(?(?:incl\.?|inclusive)\w*\s*(?:of\s*)?(?:gst|vat|tax)\)?|final\s*amount|total\s*in\s*words\s*[:\-]?\s*(?:[a-z]+\s+)*)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi,
    /\btotal\b\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi,
  ];

  const subtotalPatterns = [
    /(?:sub\s*-?\s*total|sub\s*total|taxable\s*value|taxable\s*amount|total\s*before\s*tax|net\s*amount\s*\(?before\s*tax\)?|amount\s*before\s*tax)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/gi,
  ];

  const patterns = kind === "grand" ? grandPatterns : subtotalPatterns;

  // Search line-by-line so a label on one line does not grab a number from a
  // following line.
  const lines = cleaned.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    for (const pattern of patterns) {
      // Each pattern is global with the capture group on the figure.
      pattern.lastIndex = 0;
      const matches = [...line.matchAll(pattern)];
      if (matches.length === 0) continue;
      // Take the rightmost figure on this line — the label is leftmost by
      // convention, and a stray number on the left side (date, ref no.)
      // should not be picked up.
      const figures = matches
        .map((m) => (kind === "grand" ? m[2] : m[1]))
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.replace(/,/g, ""))
        .map(Number)
        .filter((value) => Number.isFinite(value) && value > 0);
      if (figures.length === 0) continue;
      return figures[figures.length - 1];
    }
  }

  return undefined;
}

function isNumeric(token: string) {
  return NUMBER_RE.test(token) && Number.isFinite(toNumber(token));
}

/**
 * Collapses a stated range to its midpoint.
 *
 * Indian material quotations routinely price a line as "410 – 440 / bag". That
 * is a real quote, not a defect, and the midpoint is how it gets costed — so it
 * is read, and the row's confidence marked down to say the figure was derived
 * rather than printed.
 */
function collapseRanges(tokens: string[]): { tokens: string[]; sawRange: boolean } {
  const out: string[] = [];
  let sawRange = false;

  for (let i = 0; i < tokens.length; i++) {
    const glued = tokens[i].match(/^(\d[\d,]*(?:\.\d+)?)\s*[–—−-]\s*(\d[\d,]*(?:\.\d+)?)$/);
    if (glued && isNumeric(glued[1]) && isNumeric(glued[2])) {
      out.push(String((toNumber(glued[1]) + toNumber(glued[2])) / 2));
      sawRange = true;
      continue;
    }

    const isDash = /^[–—−-]$|^to$/i.test(tokens[i + 1] ?? "");
    if (isNumeric(tokens[i]) && isDash && isNumeric(tokens[i + 2] ?? "")) {
      out.push(String((toNumber(tokens[i]) + toNumber(tokens[i + 2])) / 2));
      sawRange = true;
      i += 2;
      continue;
    }

    out.push(tokens[i]);
  }

  return { tokens: out, sawRange };
}

/* ------------------------------------------------------------------ *
 * Reading the header
 * ------------------------------------------------------------------ */

type ColumnKind = "hsn" | "qty" | "rate" | "tax" | "discount" | "amount";

const COLUMN_PATTERNS: [RegExp, ColumnKind][] = [
  [/^(hsn|sac)$/i, "hsn"],
  [/^(qty|quantity|nos)\.?$/i, "qty"],
  [/^(rate|price|mrp|rates)$/i, "rate"],
  [/^(gst|tax|cgst|sgst|igst|vat)$/i, "tax"],
  [/^(disc|discount)%?$/i, "discount"],
  [/^(amount|value|total)$/i, "amount"],
];

/** Words that name a column. A line carrying several of them is a table header. */
const COLUMN_WORDS =
  /\b(s\.?\s?no|sl|sr|#|item|particulars|description|desc|hsn|sac|qty|quantity|unit|uom|rate|price|mrp|amount|value|gst|tax|disc|discount|total|cost)\b/gi;

function isHeaderRow(line: string) {
  const hits = line.match(COLUMN_WORDS)?.length ?? 0;
  // Three column names and no substantial figures: a header, not an item.
  return hits >= 3 && !/\d{3,}/.test(line);
}

/**
 * The value-bearing columns a header declares, left to right.
 *
 * Only these matter: the serial, description and unit columns carry no figure,
 * so they cannot be confused with one when the row's numbers are mapped back.
 */
function readHeaderColumns(line: string): ColumnKind[] {
  const kinds: ColumnKind[] = [];
  for (const token of line.split(/[\s()]+/)) {
    const word = token.replace(/[^A-Za-z%.]/g, "");
    if (!word) continue;
    for (const [pattern, kind] of COLUMN_PATTERNS) {
      if (pattern.test(word) && !kinds.includes(kind)) {
        kinds.push(kind);
        break;
      }
    }
  }
  return kinds;
}

/* ------------------------------------------------------------------ *
 * Reading one row's figures
 * ------------------------------------------------------------------ */

interface RowValues {
  quantity: number;
  rate: number;
  amount: number;
  tax: number;
  reconciles: boolean;
}

/**
 * Whether a row's figures agree with each other.
 *
 * Three arrangements are accepted, because all three appear in the wild:
 * quantity x rate = amount; (rate + tax) x quantity = amount, where the tax
 * column is per unit; and quantity x rate + tax = amount, where it is per line.
 */
function agrees(quantity: number, rate: number, amount: number, tax: number) {
  if (!(quantity > 0) || !(rate > 0) || !(amount > 0)) return false;
  const candidates = [quantity * rate, (rate + tax) * quantity, quantity * rate + tax];
  return candidates.some((value) => Math.abs(value - amount) / Math.max(amount, 1) <= 0.01);
}

/** Maps a row's figures onto the columns the header declared. */
function readByHeader(nums: number[], columns: ColumnKind[]): RowValues | null {
  if (columns.length < 2 || nums.length < 2) return null;

  // Both sides are aligned from the right. The amount column ends every table,
  // so anchoring there survives a row that omits an optional leading column —
  // or carries a stray number the description leaked into the figures.
  const width = Math.min(nums.length, columns.length);
  const kinds = columns.slice(columns.length - width);
  const slice = nums.slice(nums.length - width);
  const at = (kind: ColumnKind) => {
    const index = kinds.indexOf(kind);
    return index === -1 ? undefined : slice[index];
  };

  const quantity = at("qty");
  const rate = at("rate");
  const amount = at("amount");
  const tax = at("tax") ?? 0;

  if (quantity === undefined || rate === undefined) return null;
  const resolved = amount ?? quantity * rate;

  return { quantity, rate, amount: resolved, tax, reconciles: agrees(quantity, rate, resolved, tax) };
}

/**
 * Works out a row's figures with no header to go on.
 *
 * Every candidate arrangement is tested against the arithmetic the row asserts
 * about itself, and the one that balances wins — which is what lets extra
 * columns (an HSN code, a discount, a per-line tax) be present without having
 * to be recognised.
 */
function readByArithmetic(nums: number[]): RowValues | null {
  let best: RowValues | null = null;
  let bestScore = -1;

  for (let q = 0; q < nums.length; q++) {
    for (let r = 0; r < nums.length; r++) {
      if (r === q) continue;
      for (let a = 0; a < nums.length; a++) {
        if (a === q || a === r) continue;
        const tax = nums.find((_, i) => i !== q && i !== r && i !== a) ?? 0;
        if (!agrees(nums[q], nums[r], nums[a], tax)) continue;
        // Several arrangements can balance at once — q x r and r x q both do.
        // Prefer the amount furthest right, then quantity before rate, which is
        // the order nearly every table is laid out in.
        const score = (a === nums.length - 1 ? 2 : 0) + (q < r ? 1 : 0);
        if (!best || score > bestScore) {
          best = { quantity: nums[q], rate: nums[r], amount: nums[a], tax, reconciles: true };
          bestScore = score;
        }
      }
    }
  }

  if (best) return best;

  // Nothing balances. Fall back to the commonest order so the row is still
  // reported — with the low confidence that says so.
  if (nums.length >= 3) {
    const [quantity, rate, amount] = nums.slice(-3);
    return { quantity, rate, amount, tax: 0, reconciles: false };
  }
  if (nums.length === 2 && nums[0] > 0 && nums[1] > 0) {
    return { quantity: nums[0], rate: nums[1], amount: nums[0] * nums[1], tax: 0, reconciles: false };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Rebuilding lines from glyph positions
 * ------------------------------------------------------------------ */

interface Positioned {
  str: string;
  x: number;
  y: number;
  h: number;
}

/**
 * A reading-order line, with the x it starts at where that is known.
 *
 * The x is what distinguishes a wrapped continuation — indented into the
 * description column — from the first line of the next item, which starts back
 * at the serial-number column.
 */
interface SourceLine {
  text: string;
  x: number | null;
  y: number | null;
  /** Glyph height of the tallest run on the line, i.e. its font size. */
  h: number | null;
}

/**
 * The vertical gap that separates one table row from the next.
 *
 * Indentation alone cannot tell a wrapped description from the first line of
 * the following item — in a table with no serial column both start at the same
 * x. The spacing does: lines within a row sit at the font's leading, while a
 * new row is separated by the cell padding as well. Taking the median gap makes
 * that threshold a property of the document rather than a guessed constant.
 */
function rowGapThreshold(line: SourceLine) {
  // Leading is a little over the font size; row padding is well beyond it.
  // Measuring against the line's own height keeps the threshold local, where a
  // document-wide median is skewed by whatever prose sits above the table.
  return line.h && line.h > 0 ? line.h * 1.8 : Number.POSITIVE_INFINITY;
}

async function positionalLines(
  pdf: Awaited<ReturnType<typeof getDocumentProxy>>,
): Promise<SourceLine[] | null> {
  const out: SourceLine[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    const items: Positioned[] = [];
    for (const item of content.items) {
      if (!("str" in item) || typeof item.str !== "string") continue;
      const text = normaliseGlyphs(item.str);
      if (!text) continue;
      const transform = (item as { transform?: number[] }).transform;
      if (!transform || transform.length < 6) continue;
      const height = (item as { height?: number }).height ?? 0;
      items.push({ str: text, x: transform[4], y: transform[5], h: height });
    }
    if (items.length === 0) continue;

    // Group by y. PDF y grows upward, so descending y is top-to-bottom.
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    let band: Positioned[] = [];
    let bandY = items[0].y;
    const flush = () => {
      if (!band.length) return;
      band.sort((a, b) => a.x - b.x);
      const text = band.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, x: band[0].x, y: band[0].y, h: Math.max(...band.map((i) => i.h)) });
      band = [];
    };

    for (const item of items) {
      // 3pt tolerance keeps sub- and superscripts on their own line's band
      // without splitting a row whose cells sit a fraction of a point apart.
      if (Math.abs(item.y - bandY) > 3) {
        flush();
        bandY = item.y;
      }
      band.push(item);
    }
    flush();
  }

  return out.length ? out : null;
}

/* ------------------------------------------------------------------ *
 * Assembling rows
 * ------------------------------------------------------------------ */

/**
 * Removes the serial-number column when the document turns out to have one.
 *
 * A leading digit cannot be judged row by row: "12 mm cement plaster" opens
 * with a number that is part of the specification, and dropping it would change
 * what the line says. Read down the column instead — if the leading numbers of
 * the rows form a consecutive run, they are serial numbers and every one of
 * them goes; if they do not, they are part of the descriptions and all stay.
 */
function stripSerialColumn(rows: ExtractedLine[]) {
  if (rows.length < 2) return;

  const leading = rows.map((row) => {
    const match = row.description.match(/^(\d{1,3})\s+/);
    return match ? Number(match[1]) : null;
  });

  const seen = leading.filter((value): value is number => value !== null);
  if (seen.length < Math.max(2, Math.ceil(rows.length * 0.6))) return;

  const consecutive = seen.every((value, index) => index === 0 || value === seen[index - 1] + 1);
  if (!consecutive) return;

  rows.forEach((row, index) => {
    if (leading[index] === null) return;
    const stripped = row.description.replace(/^\d{1,3}\s+/, "").trim();
    if (stripped.length >= 4) row.description = stripped;
  });
}

/**
 * Removes an HSN/SAC code that a column layout dropped into the description.
 *
 * Eight digits standalone is always a tariff code — no Indian standard runs
 * that long. Six is only removed once the table has declared an HSN or SAC
 * column, because without that context the number is as likely to be part of
 * the specification, and losing it costs a rate match.
 */
function stripTariffCodes(text: string, sawHsnColumn: boolean) {
  let out = text.replace(/(?<![\d.,])\d{8}(?![\d.,])/g, " ");
  if (sawHsnColumn) out = out.replace(/(?<![\d.,])\d{6}(?![\d.,])/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * How well a description was read — which is not the same as how long it is.
 *
 * Length was standing in for quality, and it flagged real items for review on
 * no evidence: "DSC Fee" is complete at seven characters. Only a description
 * short enough to be a fragment earns any doubt.
 */
function describeConfidence(description: string) {
  if (description.length >= 8) return 0.95;
  if (description.length >= 4) return 0.85;
  return 0.7;
}

function cleanDescription(text: string) {
  return text
    // Only the unambiguous form here — "12." or "12)". A bare leading number is
    // left for stripSerialColumn, which reads the whole column before deciding.
    .replace(/^\d{1,3}\s*[.)\-:]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Assembled {
  rows: ExtractedLine[];
  /** Effective tax rate derived from a per-line tax column, if the table had one. */
  taxPct?: number;
  note?: string;
}

function assembleRows(lines: SourceLine[]): Assembled {
  const rows: ExtractedLine[] = [];
  let pending: string[] = [];
  let lastY: number | null = null;

  // Where a document names its columns, that is where its table begins — and
  // the covering letter, addresses and pool dimensions above it are not rows,
  // however many figures they contain. Documents with no header anywhere are
  // read throughout, since there is nothing better to go on.
  const hasHeader = lines.some((line) => isHeaderRow(line.text));
  let insideTable = !hasHeader;

  // Learned from the header: which columns carry figures, and in what order.
  let columns: ColumnKind[] = [];
  let sawHsnColumn = false;

  // Where the row most recently closed began. A following text-only line that
  // starts to the right of it is that row's wrapped description.
  let lastRowX: number | null = null;

  let taxTotal = 0;
  let netTotal = 0;
  // How many rows print a total that already carries their tax.
  let taxInclusiveRows = 0;

  // Where the row's description began, which is not always where its figures
  // are: a description on its own band leaves the numbers indented into the
  // price column, and a wrap measured against those looks outdented.
  let pendingX: number | null = null;

  const resetPending = () => {
    pending = [];
    pendingX = null;
  };

  for (const source of lines) {
    const line = source.text.replace(/\s+/g, " ").trim();
    const previousY = lastY;
    if (source.y !== null) lastY = source.y;
    if (!line) continue;

    // A header ends whatever came before it — vendor name, address, document
    // number — so none of that can drift into the first item's description.
    if (isHeaderRow(line)) {
      const declared = readHeaderColumns(line);
      if (declared.length >= 2) columns = declared;
      if (/\b(hsn|sac)\b/i.test(line)) sawHsnColumn = true;
      insideTable = true;
      resetPending();
      lastRowX = null;
      continue;
    }

    if (!insideTable) continue;

    const { tokens, sawRange } = collapseRanges(line.split(" "));

    // The numbers that close a row, read right to left.
    const trailing: string[] = [];
    let i = tokens.length - 1;
    let unit = "";
    while (i >= 0 && isNumeric(tokens[i])) {
      trailing.unshift(tokens[i]);
      i -= 1;
    }

    // The unit is not always tidy about which side of the numbers it sits on.
    // "…description cum 42.5 6850 291125" and "…description 42.5 cum 6850 291125"
    // are both common, and in the second the quantity is stranded on the far
    // side of the unit — read without it the row becomes rate x amount.
    //
    // But reaching across the unit indiscriminately swallows the end of the
    // description: specifications are full of bare numbers ("IS 1786, 8 mm to
    // 25 mm dia"), and taking those loses the words the rate library matches
    // on. So the reach is conditional — only while the row does not balance.
    if (i >= 0 && UNIT_RE.test(tokens[i])) {
      unit = tokens[i];
      i -= 1;
      if (i >= 0 && UNIT_PREFIX_RE.test(tokens[i])) {
        unit = `${tokens[i].replace(/\.$/, "")}${unit}`;
        i -= 1;
      }
      while (i >= 0 && isNumeric(tokens[i])) {
        const sofar = readByArithmetic(trailing.map(toNumber));
        if (sofar?.reconciles) break;
        trailing.unshift(tokens[i]);
        i -= 1;
      }
    }

    let head = tokens.slice(0, i + 1).join(" ").trim();
    let figures = trailing.map(toNumber);

    // Some rows trail a suffix after the figures — "7 – 9 / piece 52,000"
    // leaves "/ piece" between them. Falling back to every number on the line
    // reads those rather than discarding the row.
    if (figures.length < 2) {
      const all = tokens.filter(isNumeric).map(toNumber);
      if (all.length >= 2) {
        figures = all;
        head = tokens.filter((token) => !isNumeric(token)).join(" ").trim();
        if (!unit) {
          const found = tokens.find((token) => UNIT_RE.test(token));
          if (found) unit = found;
        }
      }
    }

    if (figures.length < 2) {
      // No figures, so this is description text. Which row it belongs to
      // depends on where it sits.
      if (NOT_AN_ITEM.test(line) || TAX_ROW.test(line)) {
        resetPending();
        lastRowX = null;
        continue;
      }
      if (!/[a-z]{3}/i.test(line)) continue;

      const previous = rows[rows.length - 1];
      // Positional reads put a row's numbers on its FIRST line, so text-only
      // lines after a row are usually that row's wrapped description. Two
      // signals separate a wrap from the start of the next item: a wrap is
      // indented into the description column, and it follows at the font's
      // leading rather than across the row padding. Indentation alone is not
      // enough — with no serial column a wrap starts at exactly the row's own x.
      const gap = previousY !== null && source.y !== null ? previousY - source.y : null;
      const closeBelow = gap !== null && gap <= rowGapThreshold(source);
      const indented = source.x !== null && lastRowX !== null && source.x > lastRowX + 2;
      const aligned = source.x !== null && lastRowX !== null && source.x >= lastRowX - 2;

      const isContinuation =
        previous !== undefined &&
        pending.length === 0 &&
        (indented || (aligned && closeBelow));

      if (isContinuation) {
        // Bounded: a description that keeps growing is a paragraph of terms,
        // not an item, and gluing it on would poison rate matching.
        if (previous.description.length < 300) {
          previous.description = `${previous.description} ${line}`.replace(/\s+/g, " ").trim();
        }
      } else {
        if (pending.length === 0) pendingX = source.x;
        pending.push(line);
        if (pending.join(" ").length > 600) resetPending();
      }
      continue;
    }

    let headTokens = head.split(" ").filter(Boolean);
    if (!unit && headTokens.length && UNIT_RE.test(headTokens[headTokens.length - 1])) {
      unit = headTokens[headTokens.length - 1];
      headTokens = headTokens.slice(0, -1);
    }

    const inlineDescription = headTokens.join(" ").trim();
    const description = cleanDescription([...pending, inlineDescription].join(" "));

    if (
      NOT_AN_ITEM.test(inlineDescription) ||
      NOT_AN_ITEM.test(description) ||
      TAX_ROW.test(description)
    ) {
      resetPending();
      lastRowX = null;
      continue;
    }
    // An item needs words, but not long ones: "DSC Fee" and "PAN TAN and
    // INC20A Fee" are real line items with no four-letter run in them. Counting
    // letters rather than requiring a run still rejects a bare numeric strip.
    if ((description.match(/[a-z]/gi)?.length ?? 0) < 4) {
      resetPending();
      continue;
    }

    // The header is the better authority on which figure is which — but only
    // while it produces a row that adds up. A stray number in the description
    // shifts the mapping, and then the arithmetic is the more reliable guide.
    const byHeader = readByHeader(figures, columns);
    const byArithmetic = readByArithmetic(figures);
    const values = byHeader?.reconciles ? byHeader : (byArithmetic ?? byHeader);

    if (!values || !(values.quantity > 0) || !(values.rate > 0)) {
      resetPending();
      continue;
    }

    // Unit still missing: it may be trapped at the end of the description.
    let finalDescription = description;
    if (!unit) {
      const tail = finalDescription.split(" ").pop() ?? "";
      if (UNIT_RE.test(tail)) {
        unit = tail;
        finalDescription = finalDescription.slice(0, -tail.length).trim();
      }
    }

    if (finalDescription.length < 4) {
      resetPending();
      continue;
    }

    // A last check that the row was read at all, rather than merely read into.
    //
    // Whatever the columns turn out to mean, the total this row implies should
    // be a figure the row actually prints — either directly, or with its tax
    // added where the amount column is tax-inclusive. When it is not, the
    // numbers have been picked up in the wrong roles, and the safe response is
    // to drop the row: a fabricated line of 210,000,000 on a 1,250,000 estimate
    // does more damage to a variance report than a missing one.
    const implied = values.quantity * values.rate;
    const withTax = implied + values.tax * values.quantity;
    const printed = figures.some(
      (figure) =>
        Math.abs(figure - implied) / Math.max(implied, 1) <= 0.01 ||
        Math.abs(figure - withTax) / Math.max(withTax, 1) <= 0.01,
    );
    if (!printed) {
      resetPending();
      continue;
    }

    // Amounts are stored before tax. The document's amount column may include
    // it — "(price + GST) x qty" is a common arrangement — and an invoice-level
    // tax rate applied on top of a tax-inclusive line would count it twice.
    const net = Math.round(values.quantity * values.rate * 100) / 100;
    netTotal += net;
    taxTotal += values.tax * values.quantity;

    // Keep the document's own figure whenever it disagrees with quantity x rate.
    const differs = Math.abs(values.amount - net) / Math.max(net, 1) > 0.01;
    const printedAmount = differs ? values.amount : undefined;
    if (differs && Math.abs(values.amount - (net + values.tax * values.quantity)) <= 0.01) {
      taxInclusiveRows += 1;
    }

    rows.push({
      srNo: rows.length + 1,
      description: finalDescription,
      unit: unit.replace(/\.$/, "").toLowerCase() || "nos",
      quantity: values.quantity,
      rate: values.rate,
      amount: net,
      printedAmount,
      confidence: {
        description: describeConfidence(finalDescription),
        // A midpoint taken from a stated range is derived, not printed, and is
        // held below the review threshold so a human confirms it.
        quantity: sawRange ? 0.7 : values.reconciles ? 0.97 : 0.62,
        // The rate is what the whole verdict turns on, so an unreconciled row
        // drops below the review threshold rather than being taken on trust.
        rate: sawRange ? 0.7 : values.reconciles ? 0.97 : 0.58,
      },
    });

    lastRowX = pendingX ?? source.x;
    resetPending();
  }

  // Descriptions are only finalised once continuations have been appended.
  for (const row of rows) {
    row.description = cleanDescription(stripTariffCodes(row.description, sawHsnColumn));
  }

  stripSerialColumn(rows);

  for (const row of rows) {
    row.confidence.description = describeConfidence(row.description);
  }

  // A per-line tax column gives the real effective rate, which beats assuming
  // a flat 18% over a document whose lines are taxed differently.
  const taxPct =
    taxTotal > 0 && netTotal > 0 ? Math.round((taxTotal / netTotal) * 10000) / 100 : undefined;

  const note =
    taxInclusiveRows > 0
      ? `GST appears to be included in the line totals printed on this document (${taxInclusiveRows} of ${rows.length} rows). Quantity x unit price therefore differs from the printed line total. Benchmarking uses the pre-tax unit price, and tax is applied once at the document level.`
      : undefined;

  return { rows, taxPct, note };
}

export async function extractFromPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const dumped: SourceLine[] = (Array.isArray(text) ? text.join("\n") : text)
    .split(/\r?\n/)
    .map((line) => ({ text: normaliseGlyphs(line), x: null, y: null, h: null }));

  // Positional reconstruction is the primary read; the plain dump is the
  // fallback for documents that expose no glyph coordinates.
  let lines: SourceLine[];
  try {
    lines = (await positionalLines(pdf)) ?? dumped;
  } catch {
    lines = dumped;
  }

  const body = lines.map((line) => line.text).join("\n");

  // A scanned page yields almost no characters; that is the OCR signal.
  const needsOcr = body.replace(/\s/g, "").length < 200;

  let assembled: Assembled = needsOcr ? { rows: [] } : assembleRows(lines);

  // If positional reconstruction found nothing, the plain dump may still work —
  // some generators emit a clean text layer whose coordinates are unhelpful.
  if (!needsOcr && assembled.rows.length === 0 && lines !== dumped) {
    assembled = assembleRows(dumped);
  }

  const gstin = body.match(GSTIN_RE)?.[0];
  const docNo = body.match(
    /(?:invoice|inv|bill|quotation|quote|estimate|proforma)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\-]{3,24})/i,
  )?.[1];
  const taxMatch = body.match(/\b(5|12|18|28)\s*%/);

  // A company name, preferably self-identified as one. Falling back to the
  // first substantial line is a guess, and "Quote Number" is what that guess
  // returns on a document whose letterhead is an image.
  const candidates = lines
    .map((l) => l.text.trim())
    .filter(
      (l) =>
        l.length > 6 &&
        l.length < 60 &&
        /[A-Za-z]{4}/.test(l) &&
        !/invoice|quotation|quote|gstin|^\d|^(dear|thank|to|from|date|ref)\b/i.test(l) &&
        // A name, not a sentence: prose ends in a full stop and runs long.
        !/[.!?]$/.test(l) &&
        l.split(/\s+/).length <= 8,
    );
  const vendor =
    candidates.find((l) =>
      /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|corporation|enterprises?|industries|traders?|services|suppliers?|associates|constructions?|infra\w*|&\s*co\.?)\b/i.test(l),
    ) ?? candidates[0];

  return {
    lines: assembled.rows,
    pageCount: totalPages ?? pdf.numPages ?? 1,
    vendor,
    vendorGstin: gstin,
    documentNumber: docNo,
    taxPct: assembled.taxPct ?? (taxMatch ? Number(taxMatch[1]) : 18),
    needsOcr,
    note: assembled.note,
    language: detectLanguage(body),
    sampleText: body.slice(0, 600),
    documentSubtotal: readDocumentTotal(body, "subtotal"),
    documentTotal: readDocumentTotal(body, "grand"),
  };
}
