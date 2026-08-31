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
   * Beyond this ratio between the market price and a matched schedule rate,
   * the two are not measuring the same thing — a rate-book line matched by
   * wording alone, or a market estimate that landed on the wrong product. The
   * market figure is still the benchmark, so the disagreement is taken out of
   * the verdict's confidence instead of the number.
   */
  sourceDivergenceRatio: 2,
  /**
   * How far an uncorroborated market estimate may sit from the billed rate
   * before it is treated as a misread rather than a finding.
   *
   * On a handwritten estimate the model priced "7 Lainar" at 6,500 against a
   * billed 360 — it cannot read the shorthand, so it guesses something
   * expensive — and one such line pushed a 16.2K document to an 87.6K
   * benchmark. Nothing distinguishes "the vendor is 18x over" from "the
   * estimate found the wrong product" when the estimate stands alone, so the
   * line is reported as unpriced instead of carrying a verdict built on it. A
   * schedule rate that agrees with the estimate overrides this: corroborated,
   * even an extreme variance is a finding.
   */
  implausibleMarketRatio: 4,
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
 * How much a corroborating schedule rate is worth to the verdict.
 *
 * 1 while the two are within the tolerated ratio, then falling away as they
 * separate, to a floor of 0.4 — a market price the published schedule
 * contradicts is still the best available answer, just not one to act on
 * without reading the line.
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

  // The live market price is the benchmark wherever one exists. A published
  // schedule — PWD SSR, MJP CSR, DSR — is revised on its own cycle and carries
  // the input costs of whenever it was compiled, so it lags a live market and
  // lags it downward; blending it in pulled the benchmark under the current
  // price and read honest quotations as over-priced.
  //
  // A schedule match alongside it is kept as corroboration rather than as part
  // of the figure: it is what the verdict's confidence is checked against, and
  // it still serves as the benchmark on its own where no market quote came
  // back at all.
  const marketUsable =
    marketMedian != null &&
    (sorRate != null ||
      item.rate <= 0 ||
      Math.max(marketMedian, item.rate) / Math.min(marketMedian, item.rate) <=
        VARIANCE_CONFIG.implausibleMarketRatio);

  if (marketMedian != null && marketUsable) {
    benchmarkRate = marketMedian;
    benchmarkBasis = sorRate != null ? "sor+market" : "market";
  } else if (sorRate != null) {
    benchmarkRate = sorRate;
    benchmarkBasis = "sor";
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

  // Measured across the rate book, market estimates land anywhere from 0.14x
  // to 2.98x of the schedule — usually because the estimate found the wrong
  // product or the match caught the wrong line. With the market setting the
  // benchmark outright, a wrong estimate is not damped by anything, so where a
  // schedule rate exists to contradict it the verdict is still reported but
  // stops claiming to be certain.
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
