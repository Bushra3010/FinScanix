import type { TermsFinding } from "@/lib/commercial-terms";

/**
 * Recommended Actions, composed from every finding the report already made.
 *
 * Reading all the findings matters more than any single rule. The version this
 * replaces keyed off civil-works vocabulary — "rcc", the literal word
 * "branded", "soil" — so an HVAC or facilities quotation matched none of them
 * and fell through to a single pricing line, losing the specification, tax and
 * warranty actions a reviewer most needs.
 */

export interface RecommendationInput {
  /** Line items priced above the benchmark. */
  overCount: number;
  /** Line items with no benchmark to compare against. */
  unmatchedCount: number;
  /** Arithmetic discrepancies found in the document's own figures. */
  auditErrorCount: number;
  /** Work this scope would normally price that the document does not. */
  gaps: string[];
  /** Wording too loose to hold the vendor to, as "item — what is undefined". */
  ambiguities: string[];
  /** Findings from the stated payment, tax, validity and delivery terms. */
  termsFindings: TermsFinding[];
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * Shortens the quoted fragment, never the sentence built around it.
 *
 * Trimming the finished sentence cuts its own ending off — "…or to confirm in
 * w…" — so the model's wording is clipped before it is placed, and the action
 * always reads to a full stop.
 */
const clip = (text: string, max = 96) =>
  text.length > max ? `${text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}…` : text;

/** High findings must survive the cap ahead of the merely informational ones. */
const SEVERITY_ORDER: Record<TermsFinding["severity"], number> = { high: 0, medium: 1, info: 2 };

/**
 * "Supply of HRU — make and model are left undefined" → an action naming both.
 *
 * The undefined half arrives as either a noun phrase ("make, model and static
 * pressure") or a full clause ("no make or model specified"), so it is quoted
 * after a dash rather than slotted into a sentence — the one phrasing that
 * stays grammatical for both.
 */
function fromAmbiguity(ambiguity: string): string {
  const [item, undefinedPart] = ambiguity.split(/\s+[—–]\s+/);
  if (!undefinedPart) return `Clarify with the vendor: ${clip(lowerFirst(ambiguity), 120)}`;
  const what = undefinedPart.replace(/\.$/, "").trim();
  return `Confirm "${clip(item.trim(), 60)}" with the vendor before ordering — ${clip(lowerFirst(what))}.`;
}

export function buildRecommendations(input: RecommendationInput): string[] {
  const pricing: string[] = [];
  if (input.overCount > 0) {
    pricing.push(
      `Renegotiate pricing on ${input.overCount} over-priced line item${input.overCount === 1 ? "" : "s"} using the attached market benchmarks.`,
    );
  }
  if (input.unmatchedCount > 0) {
    pricing.push(
      `Obtain rate justification from the vendor for ${input.unmatchedCount} unmatched item${input.unmatchedCount === 1 ? "" : "s"} before approving.`,
    );
  }
  if (input.auditErrorCount > 0) {
    pricing.push("Correct the mathematical discrepancies in the BOQ tables before issuing the PO.");
  }

  const scope = input.gaps
    .slice(0, 2)
    .map((gap) => `Ask the vendor to price ${clip(lowerFirst(gap))}, or to confirm in writing that it is excluded.`);

  const specs = input.ambiguities.slice(0, 2).map(fromAmbiguity);

  const commercial = [...input.termsFindings]
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .map((finding) => finding.action);

  // Money first, then what the quotation leaves open — scope, then
  // specification, then the commercial terms it would be signed under.
  const recs = [...pricing, ...scope, ...specs, ...commercial];

  if (recs.length === 0) {
    return ["All figures verified — approve quotation subject to standard commercial terms."];
  }

  return Array.from(new Set(recs)).slice(0, 8);
}
