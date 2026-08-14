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
  /** Weighting when both reference sources are available. */
  sorWeight: 0.6,
  marketWeight: 0.4,
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
  const sourceConfidence =
    benchmarkBasis === "sor+market"
      ? 0.55 * matchScore + 0.45 * quoteCoverage
      : benchmarkBasis === "sor"
        ? 0.75 * matchScore
        : 0.7 * quoteCoverage;

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
