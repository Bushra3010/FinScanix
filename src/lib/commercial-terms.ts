/**
 * The commercial terms a quotation is won or lost on — FR-3.5.
 *
 * A buyer comparing two quotations is not only comparing rates. "50% advance,
 * 40% on delivery, 10% after commissioning" against "30 days from invoice" is a
 * cash-flow difference worth more than a few percent on a line item, and a
 * 30-day validity against a 5-7 week lead time means the price can expire
 * before the work can start. So the terms are read off the document and the
 * exposure in them is stated rather than left for the reader to spot.
 */

export interface CommercialTerms {
  /** Payment schedule as printed, e.g. "50% advance, 40% on delivery, 10% after commissioning". */
  payment?: string;
  /** Tax basis as printed, e.g. "GST as applicable". */
  taxes?: string;
  /** How long the quoted price holds, e.g. "30 days". */
  validity?: string;
  /** Lead time, e.g. "5-7 weeks from PO receipt". */
  delivery?: string;
  /** Warranty or defect liability, where stated. */
  warranty?: string;
  /** Anything else in the terms block worth keeping. */
  other?: string[];
}

export interface TermsFinding {
  severity: "high" | "medium" | "info";
  label: string;
  detail: string;
  /** What to do about it, phrased for the Recommended Actions list. */
  action: string;
}

/** First percentage in a string, e.g. "50% advance, 40% on delivery" → 50. */
function firstPercent(text: string): number | null {
  const match = text.match(/(\d{1,3})\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 0 && value <= 100 ? value : null;
}

/** Largest day count a validity clause states, e.g. "valid for 30 days" → 30. */
function days(text: string): number | null {
  const found = [...text.matchAll(/(\d{1,3})\s*(day|days)\b/gi)].map((m) => Number(m[1]));
  return found.length > 0 ? Math.max(...found) : null;
}

/** Longest lead time in weeks, taking the far end of a range: "5-7 weeks" → 7. */
function weeks(text: string): number | null {
  const asWeeks = [...text.matchAll(/(\d{1,2})\s*(?:-|–|to)?\s*(\d{1,2})?\s*week/gi)]
    .map((m) => Number(m[2] ?? m[1]))
    .filter((n) => Number.isFinite(n));
  if (asWeeks.length > 0) return Math.max(...asWeeks);
  const asDays = days(text);
  return asDays !== null ? Math.round(asDays / 7) : null;
}

/**
 * Reads the exposure out of the stated terms.
 *
 * Every finding quotes the figure it is based on, so a reader can disagree with
 * the judgement while still seeing where it came from.
 */
export function analyseCommercialTerms(terms: CommercialTerms | undefined): TermsFinding[] {
  if (!terms) return [];
  const findings: TermsFinding[] = [];

  if (terms.payment) {
    const advance = /advance|upfront|along with (the )?(po|order)|with order/i.test(terms.payment)
      ? firstPercent(terms.payment)
      : null;
    if (advance !== null && advance >= 40) {
      findings.push({
        severity: advance >= 50 ? "high" : "medium",
        label: `${advance}% payable in advance`,
        detail:
          "A large share of the contract value is paid before anything is delivered, so the money is at risk on the vendor's performance. Tie it to a bank guarantee or move part of it to a delivery milestone.",
        action: `Negotiate the ${advance}% advance down, or secure it against a bank guarantee before releasing payment.`,
      });
    }
    const retention = /after commissioning|on commissioning|retention|after handover/i.test(terms.payment);
    if (!retention) {
      findings.push({
        severity: "medium",
        label: "No payment held back to commissioning",
        detail:
          "Nothing in the schedule is withheld until the work is proved to run. A 5-10% retention released on commissioning is the usual protection.",
        action: "Hold back 5-10% of the value until commissioning is signed off.",
      });
    }
  }

  if (terms.taxes && /as applicable|extra|at actuals|as per (prevailing|applicable)/i.test(terms.taxes)) {
    findings.push({
      severity: "medium",
      label: "Tax stated as applicable, not quantified",
      detail: `"${terms.taxes}" leaves the tax outside the quoted figure, so the amount payable is not fixed by this document. Ask for the rate and the inclusive total.`,
      action: "Clarify the tax liability and request a breakdown with the tax-inclusive total.",
    });
  }

  const validityDays = terms.validity ? days(terms.validity) : null;
  const leadWeeks = terms.delivery ? weeks(terms.delivery) : null;

  if (validityDays !== null && validityDays <= 15) {
    findings.push({
      severity: "medium",
      label: `Price holds for only ${validityDays} days`,
      detail: "A short window forces a decision before the quotation can be benchmarked properly.",
      action: `Ask for the validity to be extended beyond ${validityDays} days while the quotation is reviewed.`,
    });
  }

  // The pairing is the point: a price that expires before the work can even be
  // scheduled is a re-quote waiting to happen.
  if (validityDays !== null && leadWeeks !== null && leadWeeks * 7 > validityDays) {
    findings.push({
      severity: "high",
      label: `Validity (${validityDays} days) is shorter than the ${leadWeeks}-week lead time`,
      detail:
        "The quoted price can expire before delivery is due, leaving the rate open to revision after the order is placed. Fix the price to the delivery date in the PO.",
      action: "Fix the quoted price to the delivery date in the PO, so it cannot be revised mid-order.",
    });
  }

  if (!terms.warranty) {
    findings.push({
      severity: "info",
      label: "No warranty or defect liability stated",
      detail: "Nothing in the document says what is covered after handover, or for how long.",
      action: "Request a formal warranty period and performance guarantees in writing.",
    });
  }

  return findings;
}

/** True when the document stated nothing worth showing. */
export function hasTerms(terms: CommercialTerms | undefined): boolean {
  if (!terms) return false;
  return Boolean(
    terms.payment || terms.taxes || terms.validity || terms.delivery || terms.warranty || terms.other?.length,
  );
}
