import type {
  AnalysedLineItem,
  InvoiceSummary,
  LineItem,
  LineVariance,
  VarianceFlag,
} from "./types";

/**
 * The valuation & variance engine — FR-5.1 / FR-5.2.
 *
 * Deliberately a pure function of its inputs: given the same invoice rate,
 * SoR baseline and market quotes it always produces the same verdict, which is
 * what makes reports reproducible for audit (NFR: Auditability).
 */

export const VARIANCE_CONFIG = {
  /** Within ±this % of the benchmark an item is considered fairly priced. */
  parBandPct: 7,
  /**
   * Weighting when both reference sources are available.
   *
   * The market leads. A published schedule of rates — PWD SSR, MJP CSR, DSR —
   * is revised on its own cycle and carries the input costs of whenever it was
   * compiled, so it lags a live market and lags it downward. Benchmarking a
   * current quotation mostly against a stale schedule understates the fair
   * price and reads honest quotations as over-priced.
   *
   * The schedule is not dropped, because it is the auditable half: it is a
   * published figure with a code behind it, where the market side is an
   * estimate. It anchors the estimate rather than setting the answer.
   */
  sorWeight: 0.35,
  marketWeight: 0.65,
  /**
   * Beyond this ratio between the two sources, they are not measuring the same
   * thing — a rate-book line matched by wording alone, or a market estimate
   * that landed on the wrong product. Blending them still gives a number, so
   * the divergence is taken out of the verdict's confidence instead.
   */
  sourceDivergenceRatio: 2,
} as const;

export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function classify(variancePct: number, band = VARIANCE_CONFIG.parBandPct): VarianceFlag {
  if (variancePct > band) return "over";
  if (variancePct < -band) return "under";
  return "par";
}

/**
 * How much the two reference sources agreeing is worth to the verdict.
 *
 * 1 while they are within the tolerated ratio, then falling away as they
 * separate, to a floor of 0.4 — a benchmark built from two sources that
 * contradict each other is still the best available answer, just not one to
 * act on without reading the line.
 */
function divergencePenalty(sorRate: number, marketMedian: number): number {
  if (sorRate <= 0 || marketMedian <= 0) return 1;
  const ratio = Math.max(sorRate, marketMedian) / Math.min(sorRate, marketMedian);
  if (ratio <= VARIANCE_CONFIG.sourceDivergenceRatio) return 1;
  return Math.max(0.4, VARIANCE_CONFIG.sourceDivergenceRatio / ratio);
}

export function evaluateLine(item: LineItem): LineVariance {
  const quotePrices = item.marketQuotes.map((q) => q.price);
  const marketMedian = median(quotePrices);
  const sorRate = item.sorMatch?.adjustedRate;

  let benchmarkRate = 0;
  let benchmarkBasis: LineVariance["benchmarkBasis"] = "none";

  if (sorRate != null && marketMedian != null) {
    benchmarkRate =
      sorRate * VARIANCE_CONFIG.sorWeight + marketMedian * VARIANCE_CONFIG.marketWeight;
    benchmarkBasis = "sor+market";
  } else if (sorRate != null) {
    benchmarkRate = sorRate;
    benchmarkBasis = "sor";
  } else if (marketMedian != null) {
    benchmarkRate = marketMedian;
    benchmarkBasis = "market";
  }

  if (benchmarkBasis === "none") {
    return {
      marketMedian,
      benchmarkRate: 0,
      benchmarkBasis,
      variancePerUnit: 0,
      varianceAmount: 0,
      variancePct: 0,
      flag: "par",
      verdictConfidence: 0,
    };
  }

  const variancePerUnit = item.rate - benchmarkRate;
  const variancePct = (variancePerUnit / benchmarkRate) * 100;

  // Verdict confidence blends how well we matched SoR, how many market quotes
  // corroborate it, and how confident OCR was about the rate we read.
  const matchScore = item.sorMatch?.matchScore ?? 0;
  const quoteCoverage = Math.min(item.marketQuotes.length / 3, 1);
  const baseConfidence =
    benchmarkBasis === "sor+market"
      ? 0.55 * matchScore + 0.45 * quoteCoverage
      : benchmarkBasis === "sor"
        ? 0.75 * matchScore
        : 0.7 * quoteCoverage;

  // Two sources far apart are evidence against each other. Measured across the
  // rate book, market estimates land anywhere from 0.14x to 2.98x of the
  // schedule — usually because the estimate found the wrong product or the
  // match caught the wrong line — and now that the market carries most of the
  // weight, a wrong estimate moves the benchmark further than it used to. The
  // verdict is still reported, but it stops claiming to be certain.
  const sourceConfidence =
    benchmarkBasis === "sor+market" && sorRate != null && marketMedian != null
      ? baseConfidence * divergencePenalty(sorRate, marketMedian)
      : baseConfidence;

  return {
    marketMedian,
    benchmarkRate,
    benchmarkBasis,
    variancePerUnit,
    varianceAmount: variancePerUnit * item.quantity,
    variancePct,
    flag: classify(variancePct),
    verdictConfidence: Math.round(sourceConfidence * item.confidence.rate * 100) / 100,
  };
}

export function analyseLines(items: LineItem[]): AnalysedLineItem[] {
  return items.map((item) => ({ ...item, variance: evaluateLine(item) }));
}

export function summarise(items: AnalysedLineItem[]): InvoiceSummary {
  let overCount = 0;
  let underCount = 0;
  let parCount = 0;
  let unmatchedCount = 0;
  let totalVariance = 0;
  let benchmarkTotal = 0;
  let potentialSaving = 0;
  let invoiceTotal = 0;

  for (const item of items) {
    invoiceTotal += item.amount;

    if (item.variance.benchmarkBasis === "none") {
      unmatchedCount += 1;
      // An unmatched line contributes its own value to the benchmark so the
      // roll-up percentage is not distorted by items we could not price.
      benchmarkTotal += item.amount;
      continue;
    }

    benchmarkTotal += item.variance.benchmarkRate * item.quantity;
    totalVariance += item.variance.varianceAmount;

    if (item.variance.flag === "over") {
      overCount += 1;
      potentialSaving += item.variance.varianceAmount;
    } else if (item.variance.flag === "under") {
      underCount += 1;
    } else {
      parCount += 1;
    }
  }

  return {
    overCount,
    underCount,
    parCount,
    unmatchedCount,
    totalVariance,
    variancePct: benchmarkTotal > 0 ? ((invoiceTotal - benchmarkTotal) / benchmarkTotal) * 100 : 0,
    potentialSaving,
    benchmarkTotal,
  };
}

export const FLAG_LABEL: Record<VarianceFlag, string> = {
  over: "Over-priced",
  under: "Under-priced",
  par: "At par",
};
