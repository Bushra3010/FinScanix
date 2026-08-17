import type { SorEntry } from "@/lib/types";

/**
 * Matches a vendor's wording to a Schedule of Rates entry — FR-3.2.
 *
 * Vendors never quote the rate book verbatim: "RMC M-25 grade supplied and
 * placed at site" has to find "Providing and laying in position ready mixed
 * M-25 grade concrete…". Exact or prefix matching fails on every real invoice,
 * so this scores three different similarity signals and combines them.
 *
 * Below MATCH_THRESHOLD the line is reported unmatched rather than forced onto
 * the nearest entry. A wrong baseline produces a confident, wrong verdict,
 * which is worse for the user than an honest "we could not price this".
 */

export const MATCH_THRESHOLD = 0.34;

const STOPWORDS = new Set([
  "and", "the", "for", "with", "of", "in", "to", "at", "on", "as", "or", "by",
  "including", "incl", "excluding", "etc", "per", "any", "all", "from", "into",
  "complete", "approved", "required", "specified", "position", "work", "works",
  "providing", "supply", "supplying", "fixing", "laying", "made", "site",
]);

function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string) {
  return new Set(
    normalise(text)
      .split(" ")
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

function trigrams(text: string) {
  const padded = ` ${normalise(text)} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

function intersectionSize<T>(a: Set<T>, b: Set<T>) {
  let n = 0;
  for (const value of a) if (b.has(value)) n += 1;
  return n;
}

/** Units that mean the same thing, so a unit mismatch is not double-counted. */
const UNIT_ALIASES: Record<string, string> = {
  "cu.m": "cum", m3: "cum", "sq.m": "sqm", m2: "sqm", meter: "metre", mtr: "metre",
  m: "metre", rmt: "metre", rm: "metre", no: "nos", each: "nos", unit: "nos",
  pt: "point", liter: "litre", ltr: "litre", l: "litre", "l.s": "ls", lot: "ls",
};

export function canonicalUnit(unit: string) {
  const key = unit.toLowerCase().trim();
  return UNIT_ALIASES[key] ?? key;
}

export interface SorMatchResult {
  entry: SorEntry;
  score: number;
  unitAgrees: boolean;
}

export function matchSor(
  description: string,
  unit: string,
  entries: SorEntry[],
): SorMatchResult | null {
  const queryTokens = tokens(description);
  if (queryTokens.size === 0) return null;

  const queryGrams = trigrams(description);
  const queryUnit = canonicalUnit(unit);

  let best: SorMatchResult | null = null;

  for (const entry of entries) {
    const entryTokens = tokens(entry.description);
    if (entryTokens.size === 0) continue;

    const shared = intersectionSize(queryTokens, entryTokens);
    if (shared === 0) continue;

    // How much of what the vendor wrote is explained by this entry.
    const containment = shared / queryTokens.size;
    // How similar the two descriptions are overall.
    const union = queryTokens.size + entryTokens.size - shared;
    const jaccard = shared / union;
    // Character-level similarity, which survives word-order and spelling drift.
    const entryGrams = trigrams(entry.description);
    const gramShared = intersectionSize(queryGrams, entryGrams);
    const gram = gramShared / Math.max(queryGrams.size, entryGrams.size);

    const unitAgrees = canonicalUnit(entry.unit) === queryUnit;

    let score = 0.45 * containment + 0.3 * jaccard + 0.25 * gram;
    // A matching unit is corroboration, not proof; a mismatch is a real warning
    // because per-kg against per-tonne is the classic false positive.
    score += unitAgrees ? 0.06 : -0.1;
    score = Math.max(0, Math.min(0.99, score));

    if (!best || score > best.score) best = { entry, score, unitAgrees };
  }

  return best && best.score >= MATCH_THRESHOLD ? best : null;
}
