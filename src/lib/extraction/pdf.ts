import { extractText, getDocumentProxy } from "unpdf";

/**
 * Line-item extraction from machine-generated PDFs — FR-2.1 / FR-2.2.
 *
 * This reads the embedded text layer and reconstructs the item table from it.
 * It is not OCR: a scanned image has no text layer and falls through to the
 * vision adapter (see lib/extraction/vision.ts).
 *
 * Two things make real vendor bills harder than they look.
 *
 * First, a PDF has no notion of a "line". Billing software draws each cell at
 * its own coordinates, and a naive text dump returns them in content-stream
 * order, which is not reading order. So rows are rebuilt from the glyph
 * positions — grouped by y, ordered by x — rather than trusted as given.
 *
 * Second, descriptions wrap. A row's text can occupy three visual lines while
 * its quantity, rate and amount sit on only one of them. Rows are therefore
 * assembled by accumulating text until the numeric block that closes a row
 * appears, instead of assuming one row per line.
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
  "kg", "kgs", "mt", "ton", "tons", "tonne", "quintal", "bag", "bags", "nos", "no", "nO", "each", "unit", "units",
  "point", "points", "pt", "set", "sets", "pair", "pairs", "litre", "liter", "ltr", "l", "sqft", "sft", "cft", "ft", "rft",
  "ls", "l.s", "lot", "job", "month", "days", "day", "hour", "hrs", "visit", "trip", "roll", "coil", "box", "pkt",
];

const UNIT_RE = new RegExp(`^(${UNITS.map((u) => u.replace(/[.\s]/g, "\\$&")).join("|")})\\.?$`, "i");

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;
const NUMBER_RE = /^-?(?:\d{1,3}(?:,\d{2,3})*|\d+)(?:\.\d+)?$/;

/** Rows that close a table rather than belong to it. */
const NOT_AN_ITEM =
  /^(total|sub\s*-?\s*total|grand\s*total|net\s*(amount|total|payable)|amount\s*(in\s*words|chargeable)|gst|cgst|sgst|igst|vat|tax|round(ing)?|discount|freight|packing|advance|balance|less\b|add\b|tcs|tds|e\.?\s*&\s*o\.?e|terms|declaration|bank|ifsc|for\s+[A-Z])/i;

/** Words that name a column. A line carrying several of them is a table header. */
const COLUMN_WORDS =
  /\b(s\.?\s?no|sr|sl|#|item|particulars|description|desc|hsn|sac|qty|quantity|unit|uom|rate|price|amount|value|disc|discount|total)\b/gi;

function isHeaderRow(line: string) {
  const hits = line.match(COLUMN_WORDS)?.length ?? 0;
  // Three column names and no substantial figures: a header, not an item.
  return hits >= 3 && !/\d{3,}/.test(line);
}

function toNumber(token: string) {
  return Number(token.replace(/,/g, ""));
}

function isNumeric(token: string) {
  return NUMBER_RE.test(token) && Number.isFinite(toNumber(token));
}

interface Positioned {
  str: string;
  x: number;
  y: number;
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
}

/**
 * Rebuilds reading-order lines from glyph positions.
 *
 * Items within roughly one line height of each other belong to the same visual
 * line; a wide horizontal gap between them is a column boundary and becomes a
 * space. Returns null when the document exposes no positional data, so the
 * caller can fall back to the plain text dump.
 */
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
      const text = item.str.trim();
      if (!text) continue;
      const transform = (item as { transform?: number[] }).transform;
      if (!transform || transform.length < 6) continue;
      items.push({ str: text, x: transform[4], y: transform[5] });
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
      if (text) out.push({ text, x: band[0].x });
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

/**
 * Chooses which of a row's numbers are quantity, rate and amount.
 *
 * A row can carry more numbers than the three that matter — an HSN code, a
 * discount, a per-line tax. Rather than guessing by position, every candidate
 * triple is tested against the arithmetic the row asserts about itself, and the
 * one that balances wins. Falling back to the last three only happens when
 * nothing balances.
 */
function pickTriple(nums: number[]): { quantity: number; rate: number; amount: number; reconciles: boolean } {
  const last3 = nums.slice(-3);
  let best: { quantity: number; rate: number; amount: number; drift: number } | null = null;

  for (let a = 0; a < nums.length; a++) {
    for (let b = a + 1; b < nums.length; b++) {
      for (let c = b + 1; c < nums.length; c++) {
        const [quantity, rate, amount] = [nums[a], nums[b], nums[c]];
        if (!(quantity > 0) || !(rate > 0) || !(amount > 0)) continue;
        const expected = quantity * rate;
        const drift = Math.abs(expected - amount) / Math.max(expected, 1);
        if (!best || drift < best.drift) best = { quantity, rate, amount, drift };
      }
    }
  }

  if (best && best.drift <= 0.01) {
    return { quantity: best.quantity, rate: best.rate, amount: best.amount, reconciles: true };
  }

  // Two numbers only: quantity and rate, with the amount left implied.
  if (nums.length === 2 && nums[0] > 0 && nums[1] > 0) {
    return { quantity: nums[0], rate: nums[1], amount: nums[0] * nums[1], reconciles: false };
  }

  const [quantity, rate, amount] = [last3[0] ?? 0, last3[1] ?? 0, last3[2] ?? 0];
  return { quantity, rate, amount, reconciles: false };
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

function cleanDescription(text: string) {
  return text
    // Only the unambiguous form here — "12." or "12)". A bare leading number is
    // left for stripSerialColumn, which reads the whole column before deciding.
    .replace(/^\d{1,3}\s*[.)\-:]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
 * Assembles item rows from reading-order lines.
 *
 * Text accumulates until a line arrives carrying the numeric block that closes
 * a row. That is what keeps a three-line wrapped description attached to the
 * quantity and rate printed beside its first line.
 */
function assembleRows(lines: SourceLine[]): ExtractedLine[] {
  const rows: ExtractedLine[] = [];
  let pending: string[] = [];

  // Whether the table declares an HSN/SAC column. Those codes sit in their own
  // column and land inside the description when the row is rebuilt, but they
  // cannot be removed on sight: a specification is full of standalone numbers
  // and IS codes run to five digits. Knowing the column exists is what makes
  // removing six-digit codes safe.
  let sawHsnColumn = false;

  // Where the row most recently closed began. A following text-only line that
  // starts to the right of it is that row's wrapped description; one starting
  // at or left of it belongs to whatever comes next.
  let lastRowX: number | null = null;

  const resetPending = () => {
    pending = [];
  };

  for (const source of lines) {
    const line = source.text.replace(/\s+/g, " ").trim();
    if (!line) continue;

    // A header ends whatever came before it — vendor name, address, document
    // number — so none of that can drift into the first item's description.
    if (isHeaderRow(line)) {
      if (/\b(hsn|sac)\b/i.test(line)) sawHsnColumn = true;
      resetPending();
      lastRowX = null;
      continue;
    }

    const tokens = line.split(" ");

    // Trailing numeric block: the columns that close a row.
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
    // side of the unit — read without it the row becomes rate × amount.
    //
    // But reaching across the unit indiscriminately swallows the end of the
    // description: specifications are full of bare numbers ("IS 1786, 8 mm to
    // 25 mm dia"), and taking those loses the words the rate library matches
    // on. So the reach is conditional — only when the numbers already in hand
    // do not balance, meaning something really is missing.
    if (i >= 0 && UNIT_RE.test(tokens[i])) {
      unit = tokens[i];
      i -= 1;
      while (
        i >= 0 &&
        isNumeric(tokens[i]) &&
        !pickTriple(trailing.map(toNumber)).reconciles
      ) {
        trailing.unshift(tokens[i]);
        i -= 1;
      }
    }

    const head = tokens.slice(0, i + 1).join(" ").trim();

    if (trailing.length < 2) {
      // No closing numbers, so this is description text. Which row it belongs
      // to depends on where it sits.
      if (NOT_AN_ITEM.test(line)) {
        resetPending();
        lastRowX = null;
        continue;
      }
      if (!/[a-z]{3}/i.test(line)) continue;

      const previous = rows[rows.length - 1];
      // Positional reads put a row's numbers on its FIRST line, so text-only
      // lines after a row are that row's wrapped description. A line starting
      // clearly left of the row is a new outdented block, not a wrap — and
      // where there is no serial column the wrap starts at exactly the row's
      // own x, so "at or right of" is the test, not "right of".
      const isContinuation =
        previous !== undefined &&
        source.x !== null &&
        lastRowX !== null &&
        source.x >= lastRowX - 2 &&
        pending.length === 0;

      if (isContinuation) {
        // Bounded: a description that keeps growing is a paragraph of terms,
        // not an item, and gluing it on would poison rate matching.
        if (previous.description.length < 300) {
          previous.description = `${previous.description} ${line}`.replace(/\s+/g, " ").trim();
        }
      } else {
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

    if (NOT_AN_ITEM.test(inlineDescription) || NOT_AN_ITEM.test(description)) {
      resetPending();
      lastRowX = null;
      continue;
    }
    // An item needs words. A bare numeric strip is a totals row or a stray.
    if (!/[a-z]{4}/i.test(description)) {
      resetPending();
      continue;
    }

    const { quantity, rate, amount, reconciles } = pickTriple(trailing.map(toNumber));
    if (!(quantity > 0) || !(rate > 0)) {
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

    rows.push({
      srNo: rows.length + 1,
      description: finalDescription,
      unit: unit.replace(/\.$/, "").toLowerCase() || "nos",
      quantity,
      rate,
      amount: reconciles ? amount : Math.round(quantity * rate * 100) / 100,
      confidence: {
        description: finalDescription.length > 18 ? 0.95 : 0.78,
        quantity: reconciles ? 0.97 : 0.62,
        // The rate is what the whole verdict turns on, so an unreconciled row
        // drops below the review threshold rather than being taken on trust.
        rate: reconciles ? 0.97 : 0.58,
      },
    });

    lastRowX = source.x;
    resetPending();
  }

  // Descriptions are only finalised once continuations have been appended.
  for (const row of rows) {
    row.description = cleanDescription(stripTariffCodes(row.description, sawHsnColumn));
  }

  stripSerialColumn(rows);

  for (const row of rows) {
    row.confidence.description = row.description.length > 18 ? 0.95 : 0.78;
  }

  return rows;
}

export async function extractFromPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const dumped: SourceLine[] = (Array.isArray(text) ? text.join("\n") : text)
    .split(/\r?\n/)
    .map((line) => ({ text: line, x: null }));

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

  let items = needsOcr ? [] : assembleRows(lines);

  // If positional reconstruction found nothing, the plain dump may still work —
  // some generators emit a clean text layer whose coordinates are unhelpful.
  if (!needsOcr && items.length === 0 && lines !== dumped) {
    items = assembleRows(dumped);
  }

  const gstin = body.match(GSTIN_RE)?.[0];
  const docNo = body.match(
    /(?:invoice|inv|bill|quotation|quote|estimate|proforma)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9/\-]{3,24})/i,
  )?.[1];
  const taxMatch = body.match(/\b(5|12|18|28)\s*%/);

  // The vendor is usually the most prominent line above the tax id.
  const vendor = lines
    .map((l) => l.text.trim())
    .find(
      (l) =>
        l.length > 6 &&
        l.length < 60 &&
        /[A-Za-z]{4}/.test(l) &&
        !/invoice|quotation|gstin|^\d/i.test(l),
    );

  return {
    lines: items,
    pageCount: totalPages ?? pdf.numPages ?? 1,
    vendor,
    vendorGstin: gstin,
    documentNumber: docNo,
    taxPct: taxMatch ? Number(taxMatch[1]) : 18,
    needsOcr,
    sampleText: body.slice(0, 600),
  };
}
