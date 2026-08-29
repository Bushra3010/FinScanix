"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLineCorrectionAction, setInvoiceCityAction } from "@/lib/invoices/actions";
import {
  AlignLeft,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  ListChecks,
  ListOrdered,
  Minus,
  Pencil,
  LoaderCircle,
  PiggyBank,
  RefreshCw,
  Save,
  ShieldAlert,
  Store,
  TriangleAlert,
  Table2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead } from "@/components/ui/table";
import { HealthBadge, VarianceBadge, VariancePct } from "@/components/variance-badge";
import { useSession } from "@/components/app/session-context";
import { analyseLines, summarise, VARIANCE_CONFIG } from "@/lib/variance";
import { deriveScopeAnalysis } from "@/lib/scope-gaps";
import { analyseCommercialTerms, hasTerms } from "@/lib/commercial-terms";
import { buildRecommendations } from "@/lib/recommendations";
import type { AnalysedInvoice, City, LineItem, VarianceFlag } from "@/lib/types";
import { cn, formatINR, formatNumber, relativeTime } from "@/lib/utils";

const NOW = new Date("2026-08-14T10:00:00+05:30");
const LOW_CONFIDENCE = 0.8;

type FilterKey = "all" | VarianceFlag | "unmatched";

interface AuditError {
  severity: "High" | "Medium";
  type: string;
  context: string;
  description: string;
  expected: number;
  actual: number;
}

export function InvoiceReport({
  invoice,
  cities,
}: {
  invoice: AnalysedInvoice;
  cities: City[];
}) {
  const { allows, entitled } = useSession();
  const [repricing, startRepricing] = useTransition();

  // Corrections are held locally; the variance engine re-runs on every edit so
  // the effect of a correction is visible immediately — FR-2.3 into FR-5.2.
  const [items, setItems] = useState<LineItem[]>(() =>
    invoice.lineItems.map(({ variance: _variance, ...rest }) => rest),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();

  const analysed = useMemo(() => analyseLines(items), [items]);
  const summary = useMemo(() => summarise(analysed), [analysed]);
  const netValue = useMemo(() => items.reduce((sum, i) => sum + i.amount, 0), [items]);
  const corrections = items.filter((i) => i.corrected).length;

  /** Detect arithmetic discrepancies between the document's own figures. */
  const auditErrors = useMemo<AuditError[]>(() => {
    const errors: AuditError[] = [];
    const TOLERANCE = 2; // ₹2 rounding tolerance

    // 1. Line-item errors: qty × rate ≠ printed amount
    for (const line of analysed) {
      if (line.printedAmount !== undefined) {
        errors.push({
          severity: "Medium",
          type: "Line Item Calculation Error",
          context: `Item #${line.srNo}: ${line.description}`,
          description: "Quoted line total does not match Quantity × Unit Price",
          expected: line.amount,          // qty × rate (our calc)
          actual:   line.printedAmount,   // what the vendor printed
        });
      }
    }

    // 2. Subtotal mismatch: sum of lines ≠ vendor's quoted subtotal
    if (invoice.subtotal > 0 && Math.abs(netValue - invoice.subtotal) > TOLERANCE) {
      errors.push({
        severity: "High",
        type: "Subtotal Mismatch",
        context: "Pricing Summary",
        description: "Quoted subtotal does not match the sum of all line items",
        expected: netValue,
        actual:   invoice.subtotal,
      });
    }

    // 3. Tax calculation error: printed tax ≠ subtotal × rate
    const impliedTax  = invoice.total - invoice.subtotal;
    const expectedTax = invoice.subtotal * (invoice.taxPct / 100);
    if (invoice.subtotal > 0 && Math.abs(expectedTax - impliedTax) > TOLERANCE) {
      errors.push({
        severity: "Medium",
        type: "Tax Calculation Error",
        context: "Pricing Summary",
        description: "Quoted tax does not match the inferred tax rate applied to the corrected taxable amount",
        expected: expectedTax,
        actual:   impliedTax,
      });
    }

    // 4. Grand total mismatch: subtotal + tax ≠ quoted total
    const expectedTotal = invoice.subtotal + expectedTax;
    if (invoice.total > 0 && Math.abs(expectedTotal - invoice.total) > TOLERANCE) {
      errors.push({
        severity: "High",
        type: "Grand Total Mismatch",
        context: "Pricing Summary",
        description: "Quoted grand total does not match the corrected calculation (Subtotal + Tax − Discount)",
        expected: expectedTotal,
        actual:   invoice.total,
      });
    }

    return errors;
  }, [analysed, netValue, invoice.subtotal, invoice.total, invoice.taxPct]);

  const visible = analysed.filter((line) => {
    if (filter === "all") return true;
    if (filter === "unmatched") return line.variance.benchmarkBasis === "none";
    return line.variance.benchmarkBasis !== "none" && line.variance.flag === filter;
  });

  const lowConfidence = analysed.filter(
    (line) =>
      Math.min(line.confidence.description, line.confidence.quantity, line.confidence.rate) <
      LOW_CONFIDENCE,
  );

  /**
   * Applies the edit locally first so the verdict moves as the reviewer types,
   * then persists it. The optimistic update is what makes the engine feel
   * live; the server write is what makes it real.
   */
  function applyEdit(id: string, patch: { quantity?: number; rate?: number }) {
    const current = items.find((item) => item.id === id);
    if (!current) return;

    const quantity = patch.quantity ?? current.quantity;
    const rate = patch.rate ?? current.rate;
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(rate) || rate < 0) return;
    if (quantity === current.quantity && rate === current.rate) return;

    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
              rate,
              amount: Math.round(quantity * rate * 100) / 100,
              corrected: true,
              // A confirmed field is no longer uncertain.
              confidence: { description: 1, quantity: 1, rate: 1 },
            }
          : item,
      ),
    );

    const payload = new FormData();
    payload.set("invoiceId", invoice.id);
    payload.set("lineId", id);
    payload.set("quantity", String(quantity));
    payload.set("rate", String(rate));

    startSaving(async () => {
      const result = await saveLineCorrectionAction(payload);
      if (result?.error) {
        setSaveError(result.error);
        router.refresh();
      } else {
        setSaveError(null);
      }
    });
  }

  // What the document itself says, as distinct from what the engine concluded.
  // BOQ value is the document's own bottom line, tax included, so it can be
  // checked against the paper without arithmetic.
  const boqValue = netValue * (1 + invoice.taxPct / 100);
  const minConfidence = analysed.length
    ? Math.min(
        ...analysed.map((line) =>
          Math.min(line.confidence.description, line.confidence.quantity, line.confidence.rate),
        ),
      )
    : 0;
  const extractionConfidence =
    minConfidence >= 0.95 ? "High" : minConfidence >= LOW_CONFIDENCE ? "Medium" : "Low";
  const restated = analysed.filter((line) => line.printedAmount !== undefined).length;

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: "all", label: "All items", count: analysed.length },
    { key: "over", label: "Over-priced", count: summary.overCount },
    { key: "par", label: "At par", count: summary.parCount },
    { key: "under", label: "Under-priced", count: summary.underCount },
    { key: "unmatched", label: "Unmatched", count: summary.unmatchedCount },
  ];

  /* ---- Section A derived values ---- */
  const varSign = summary.variancePct > 0 ? "+" : "";
  const varStr = `${varSign}${summary.variancePct.toFixed(1)}%`;
  const isOverMarket = summary.variancePct > VARIANCE_CONFIG.parBandPct;
  const isUnderMarket = summary.variancePct < -VARIANCE_CONFIG.parBandPct;

  type ClassLabel = "Competitive" | "Above Market" | "Below Market";
  const classLabel: ClassLabel = isOverMarket
    ? "Above Market"
    : isUnderMarket
      ? "Below Market"
      : "Competitive";

  const classStyle: Record<ClassLabel, string> = {
    Competitive:   "border-brand/40 bg-brand-soft text-brand-soft-foreground",
    "Above Market":"border-over/40 bg-over-soft/60 text-over",
    "Below Market":"border-par/40 bg-par-soft/60 text-par",
  };


  const benchmarkSource = `Internal ${invoice.city.name} Cost Indices`;

  /* Simplified per-line table rows (matched lines only, up to 10 preview rows) */
  const matchedLines = analysed.filter((l) => l.variance.benchmarkBasis !== "none");

  /* ── Risk Impact sub-scores (section 3) ── */
  const _totalItems = analysed.length || 1;
  const _varPenalty   = summary.variancePct > 0 ? Math.min(50, summary.variancePct * 3) : 0;
  const _unmatchedPen = Math.min(25, (summary.unmatchedCount / _totalItems) * 25);
  const riskAuditScore = Math.max(0, Math.round(100 - _varPenalty - _unmatchedPen));
  const riskPricingAcc = Math.max(0, Math.round(
    40 - Math.min(40, (summary.overCount / _totalItems) * 30 + Math.max(0, summary.variancePct) * 0.5),
  ));
  const riskCompliance = Math.round(invoice.quality.score * 20);
  const riskCostEff    = Math.max(0, Math.round(
    25 - Math.min(25, (summary.potentialSaving / Math.max(boqValue, 1)) * 100 * 3),
  ));
  const riskMarketCov  = Math.round((1 - summary.unmatchedCount / _totalItems) * 15);
  const riskBaseLevel  = riskAuditScore >= 75 ? "Low" : riskAuditScore >= 55 ? "Moderate" : "High";
  const _highSevErrors = auditErrors.filter((e) => e.severity === "High").length;
  const riskAdjusted   =
    _highSevErrors >= 2 || (_highSevErrors >= 1 && riskBaseLevel === "High")
      ? "Critical"
      : _highSevErrors >= 1 && riskBaseLevel !== "Low"
        ? "High"
        : riskBaseLevel;
  const riskElevated  = riskAdjusted !== riskBaseLevel;
  const riskSubScores = [
    { label: "Pricing Accuracy", score: riskPricingAcc, max: 40 },
    { label: "Compliance",       score: riskCompliance,  max: 20 },
    { label: "Cost Efficiency",  score: riskCostEff,     max: 25 },
    { label: "Market Coverage",  score: riskMarketCov,   max: 15 },
  ];
  const overPricedLines = analysed.filter(
    (l) => l.variance.flag === "over" && l.variance.benchmarkBasis !== "none",
  );

  // Rich executive summary — location, mathematical accuracy, audit score, savings.
  // Placed after riskAuditScore since it references that value.
  const summaryText = useMemo(() => {
    const location   = invoice.city.name;
    const docType    = invoice.documentType === "quotation" ? "quotation" : "invoice";
    const calcErrors = auditErrors.filter((e) => e.type === "arithmetic").length;
    const overCount  = summary.overCount;
    const savingPct  = boqValue > 0 ? (summary.potentialSaving / boqValue) * 100 : 0;

    // Sentence 1 — mathematical accuracy
    const accuracyClause =
      calcErrors === 0
        ? "reflects high mathematical accuracy with zero calculation errors and a balanced grand total"
        : `contains ${calcErrors} arithmetic discrepanc${calcErrors === 1 ? "y" : "ies"} that require correction`;
    const sentence1 = `The audit of the ${location}-based ${docType} ${accuracyClause}.`;

    // Sentence 2 — audit score + risk / savings
    let sentence2: string;
    if (overCount > 0 && summary.potentialSaving > 0) {
      sentence2 =
        `However, the audit score of ${riskAuditScore}/100 is impacted by ` +
        `${overCount === 1 ? "one" : overCount} high-risk, over-priced ` +
        `item${overCount === 1 ? "" : "s"}, representing a potential cost-saving opportunity of ` +
        `${formatINR(summary.potentialSaving, { compact: true, decimals: 0 })} or ` +
        `${savingPct.toFixed(1)}% of the total expenditure.`;
    } else if (classLabel === "Below Market") {
      sentence2 =
        `The audit score of ${riskAuditScore}/100 reflects competitive pricing — ` +
        `quoted rates are below current ${location} market benchmarks.`;
    } else {
      sentence2 =
        `The audit score of ${riskAuditScore}/100 is within an acceptable range ` +
        `with no significantly over-priced items detected.`;
    }

    return `${sentence1} ${sentence2}`;
  }, [
    invoice.city.name, invoice.documentType, auditErrors,
    summary, boqValue, riskAuditScore, classLabel,
  ]);

  const lineClassLabel: Record<string, string> = {
    over:   "Above Market",
    par:    "At Market",
    under:  "Below Market",
  };
  const lineClassStyle: Record<string, string> = {
    over:  "border-over/40 text-over",
    par:   "border-border text-muted-foreground",
    under: "border-par/40 text-par",
  };

  /* ── Section C · Risk Red Flags ── */
  interface RiskFlag {
    category: "Pricing" | "Commercial" | "Calculation" | "Quantity" | "Procurement" | "Data Quality";
    confidence: "High confidence" | "Medium confidence" | "Low confidence";
    description: string;
    evidence: string;
    recommendation: string;
  }
  const riskFlags = useMemo<RiskFlag[]>(() => {
    const flags: RiskFlag[] = [];

    // Line-item arithmetic errors
    const lineErrors = auditErrors.filter((e) => e.type === "Line Item Calculation Error");
    if (lineErrors.length > 0) {
      flags.push({
        category: "Pricing",
        confidence: "High confidence",
        description: "Quoted amounts do not match sum of quantities multiplied by unit rates.",
        evidence: `Line item ${lineErrors.map((e) => e.context.replace("Item #", "")).join(", ")} total discrepancy.`,
        recommendation: "Request a corrected BOQ from the vendor before final approval.",
      });
    }

    // Commercial note in extraction text
    const note = (invoice.extractionNote ?? "").toLowerCase();
    if (note.includes("budgetary") || note.includes("sample") || note.includes("indicative") || note.includes("non-binding")) {
      flags.push({
        category: "Commercial",
        confidence: "High confidence",
        description: "Indicated as budgetary sample only.",
        evidence: "Commercial Notes section.",
        recommendation: "Treat as a non-binding estimate and negotiate final fixed-price contract.",
      });
    }

    // Tax or subtotal mismatch
    if (auditErrors.some((e) => e.type === "Tax Calculation Error" || e.type === "Subtotal Mismatch")) {
      flags.push({
        category: "Calculation",
        confidence: "High confidence",
        description: "Subtotal or tax figure does not reconcile with the line items.",
        evidence: auditErrors
          .filter((e) => e.type === "Tax Calculation Error" || e.type === "Subtotal Mismatch")
          .map((e) => e.type)
          .join("; ") + " detected.",
        recommendation: "Cross-check all arithmetic before processing payment.",
      });
    }

    // Grand total mismatch
    if (auditErrors.some((e) => e.type === "Grand Total Mismatch")) {
      flags.push({
        category: "Calculation",
        confidence: "High confidence",
        description: "Quoted grand total does not match the corrected subtotal plus tax.",
        evidence: "Grand total mismatch detected in Pricing Summary.",
        recommendation: "Reject document and request a revised quotation with corrected totals.",
      });
    }

    // Over-priced market variance
    if (summary.overCount > 0) {
      flags.push({
        category: "Pricing",
        confidence: "Medium confidence",
        description: `${summary.overCount} line item${summary.overCount === 1 ? "" : "s"} priced above current ${invoice.city.name} market benchmarks by ${Math.abs(summary.variancePct).toFixed(1)}%.`,
        evidence: "Market comparison via IndiaMART, Moglix and live web prices.",
        recommendation: "Renegotiate rates on flagged items using the attached market data.",
      });
    }

    // Unmatched items
    if (summary.unmatchedCount > 0) {
      flags.push({
        category: "Procurement",
        confidence: "Medium confidence",
        description: `${summary.unmatchedCount} item${summary.unmatchedCount === 1 ? "" : "s"} could not be matched to any market price benchmark.`,
        evidence: `No benchmark found for ${summary.unmatchedCount} line item${summary.unmatchedCount === 1 ? "" : "s"}.`,
        recommendation: "Request rate justification from vendor for all unmatched items.",
      });
    }

    // Low extraction confidence
    if (extractionConfidence === "Low") {
      flags.push({
        category: "Data Quality",
        confidence: "Low confidence",
        description: "One or more fields were extracted with low confidence due to poor document quality.",
        evidence: "OCR confidence score below 80% on at least one line item.",
        recommendation: "Verify all flagged line items manually before processing.",
      });
    }

    return flags;
  }, [auditErrors, summary, invoice.extractionNote, invoice.city.name, extractionConfidence]);

  /* ── Actionable Recommendations (AI-derived from audit findings) ── */
  const recommendations = useMemo<string[]>(() => {
    const recs: string[] = [];
    if (auditErrors.some((e) => e.type === "Line Item Calculation Error"))
      recs.push(
        "Implement automated validation scripts within the invoicing system to cross-verify line item calculations against quantity and unit price before finalizing documents.",
      );
    if (summary.overCount > 0)
      recs.push(
        "Conduct an immediate audit of all high-risk line items to rectify existing pricing discrepancies and prevent further financial leakage.",
      );
    if (auditErrors.some((e) => e.type === "Tax Calculation Error"))
      recs.push(
        "Standardize tax calculation protocols to ensure the applied rates align consistently with the corrected subtotal amounts.",
      );
    if (auditErrors.some((e) => e.type === "Subtotal Mismatch" || e.type === "Grand Total Mismatch"))
      recs.push(
        "Perform a comprehensive review of the current procurement software to address the root causes of the subtotal and grand total mismatches.",
      );
    if (summary.unmatchedCount > 0)
      recs.push(
        "Request a detailed rate schedule from the vendor for all unmatched line items to enable complete market-rate benchmarking.",
      );
    if (summary.potentialSaving > 0)
      recs.push(
        `Renegotiate ${summary.overCount} over-priced line item${summary.overCount === 1 ? "" : "s"} using the market benchmarks provided — estimated savings: ${formatINR(summary.potentialSaving, { compact: true, decimals: 0 })}.`,
      );
    if (recs.length === 0)
      recs.push(
        "Continue periodic market-rate benchmarking to maintain pricing competitiveness across all future quotations.",
      );
    return recs;
  }, [auditErrors, summary]);

  /* ── SOW & Gap Analysis (Section B) ── */
  const sowAnalysis = useMemo(() => {
    // Extracted scope = the actual line item descriptions from the document.
    // Each line item IS a scope item; displaying them directly is far more
    // accurate than mapping through a hardcoded category list that only covers
    // civil/pool works and misses HVAC, MEP, FM and other trades.
    const extractedScope = analysed.map((l) => l.description.trim());

    // Exclusions: use what the vision model read from the document's
    // Exclusions / Terms section. Fall back to an empty list — never show
    // a hardcoded list that doesn't match the actual document.
    const exclusions = invoice.exclusions ?? [];

    // What the model read from this document wins: it saw the terms and notes,
    // not just the priced rows. The derived analysis stands in for documents
    // analysed before scope gaps were captured, and reads this document's own
    // line items rather than a fixed checklist that would be identical on every
    // quotation.
    const derived = deriveScopeAnalysis({
      descriptions: analysed.map((l) => l.description),
      exclusions,
      project: invoice.project,
    });
    // An empty stored array means the document was read and nothing was found,
    // which is an answer — only a document never read falls back to the
    // derived checklist.
    const missingItems = (invoice.scopeGaps ?? derived.gaps).slice(0, 5);
    const ambiguities = (invoice.ambiguities ?? derived.ambiguities).slice(0, 5);

    // Each unpriced item and each loose phrase is something the buyer may end
    // up paying for outside this quotation, so both pull the score down.
    const scopeRiskScore = Math.max(10, 100 - missingItems.length * 7 - ambiguities.length * 6);

    return {
      extractedScope: extractedScope.length > 0 ? extractedScope : ["(no line items found)"],
      missingItems,
      ambiguities,
      exclusions,
      scopeRiskScore,
    };
  }, [analysed, invoice.exclusions, invoice.scopeGaps, invoice.ambiguities, invoice.project]);

  /* ── Commercial terms: what the stated payment and delivery terms expose ── */
  const termsFindings = useMemo(
    () => analyseCommercialTerms(invoice.commercialTerms),
    [invoice.commercialTerms],
  );

  /* ── Final (bottom) Recommended Actions — document-specific ── */
  const finalRecommendations = useMemo<string[]>(
    () =>
      buildRecommendations({
        overCount: summary.overCount,
        unmatchedCount: summary.unmatchedCount,
        auditErrorCount: auditErrors.length,
        gaps: sowAnalysis.missingItems,
        ambiguities: sowAnalysis.ambiguities,
        termsFindings,
      }),
    [sowAnalysis, auditErrors, summary, termsFindings],
  );

  return (
    <>
      {/* ── Section A · Market Analysis ── */}
      <Card className="mb-6 overflow-hidden">
        {/* Header */}
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Section A · Market Analysis</CardTitle>
              <CardDescription>
                Gemini market benchmarking vs quoted prices
              </CardDescription>
            </div>
          </div>
          {/* City repricing control */}
          {allows("invoice.correct") ? (
            <select
              value={invoice.cityId}
              disabled={repricing}
              aria-label="Location this document is benchmarked against"
              onChange={(event) => {
                const data = new FormData();
                data.set("invoiceId", invoice.id);
                data.set("cityId", event.target.value);
                startRepricing(async () => {
                  await setInvoiceCityAction(data);
                  router.refresh();
                });
              }}
              className="cursor-pointer rounded-md border border-border-strong bg-surface px-2 py-1 text-[12.5px] text-foreground focus:border-brand focus:outline-none disabled:opacity-60"
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name} (×{city.indexFactor.toFixed(2)})
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded-full border border-border bg-surface-sunken px-3 py-1 text-[12px] text-muted-foreground">
              {invoice.city.name} ×{invoice.city.indexFactor.toFixed(2)}
            </span>
          )}
        </CardHeader>

        {/* Stats strip */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
          <div className="px-5 py-4">
            <p className="text-[11.5px] text-muted-foreground">Quoted Total</p>
            <p className="mt-1 text-[20px] font-bold text-foreground">
              {formatINR(netValue, { compact: true, decimals: 0 })}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11.5px] text-muted-foreground">Benchmark Source</p>
            <p className="mt-1 text-[14px] font-bold text-foreground">{benchmarkSource}</p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11.5px] text-muted-foreground">Market Variance</p>
            <p
              className={cn(
                "mt-1 text-[20px] font-bold",
                isOverMarket ? "text-over" : isUnderMarket ? "text-par" : "text-foreground",
              )}
            >
              {varStr}
            </p>
          </div>
          <div className="bg-brand-soft/30 px-5 py-4">
            <p className="text-[11.5px] text-brand-soft-foreground">Potential Savings</p>
            <p className="mt-1 text-[20px] font-bold text-brand">
              {summary.potentialSaving > 0
                ? formatINR(summary.potentialSaving, { compact: true, decimals: 0 })
                : "—"}
            </p>
          </div>
        </div>

        {/* Executive Summary + Classification + table */}
        <CardContent className="pt-5">
          {/* Executive Summary block */}
          <div className="mb-5 rounded-lg border border-border bg-surface-sunken/40 px-5 py-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
              Executive Summary
            </div>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {summaryText}
            </p>
          </div>

          <div className="mb-5 flex items-center gap-2.5">
            <span className="text-[13.5px] text-muted-foreground">Overall classification:</span>
            <span
              className={cn(
                "inline-block rounded border px-2.5 py-0.5 text-[12.5px] font-semibold",
                classStyle[classLabel],
              )}
            >
              {classLabel}
            </span>
          </div>

          {/* Simplified market comparison table */}
          {matchedLines.length > 0 && (
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>ITEM</TH>
                    <TH className="text-right">QUOTED</TH>
                    <TH className="text-right">MARKET</TH>
                    <TH className="text-right">VARIANCE</TH>
                    <TH>CLASSIFICATION</TH>
                  </tr>
                </THead>
                <TBody>
                  {matchedLines.slice(0, 10).map((line) => {
                    const flag = line.variance.flag;
                    const vPct = `${line.variance.variancePct > 0 ? "+" : ""}${line.variance.variancePct.toFixed(1)}%`;
                    return (
                      <tr key={line.id} className="hover:bg-muted/40">
                        <TD>
                          <span className="line-clamp-1 max-w-[240px] text-[13px]">
                            {line.description}
                          </span>
                        </TD>
                        <TD className="text-right tnum text-[13px]">
                          {formatINR(line.rate)}
                        </TD>
                        <TD className="text-right tnum text-[13px]">
                          {line.variance.benchmarkRate
                            ? formatINR(line.variance.benchmarkRate)
                            : "—"}
                        </TD>
                        <TD
                          className={cn(
                            "text-right tnum text-[13px] font-medium",
                            flag === "over" ? "text-over" : flag === "under" ? "text-par" : "text-foreground",
                          )}
                        >
                          {vPct}
                        </TD>
                        <TD>
                          <span
                            className={cn(
                              "inline-block rounded border px-2 py-0.5 text-[11.5px] font-medium",
                              lineClassStyle[flag] ?? "border-border text-muted-foreground",
                            )}
                          >
                            {lineClassLabel[flag] ?? "Unmatched"}
                          </span>
                        </TD>
                      </tr>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>

      {/* ── Calculation Errors ── */}
      {auditErrors.length > 0 && (
        <div className="mt-6">
          {/* Section heading */}
          <div className="mb-4 flex items-center gap-2.5">
            <TriangleAlert className="h-[18px] w-[18px] text-warning" />
            <h3 className="text-[15px] font-semibold text-foreground">
              1. Calculation Errors Found
            </h3>
            <span className="rounded-full bg-over-soft/80 px-2.5 py-0.5 text-[12px] font-semibold text-over">
              {auditErrors.length} error{auditErrors.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="space-y-3">
            {auditErrors.map((err, idx) => {
              const diff = err.actual - err.expected;
              const diffPositive = diff > 0;
              return (
                <div
                  key={idx}
                  className="overflow-hidden rounded-xl border border-border bg-surface shadow-card"
                >
                  {/* Error header */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 pt-4 pb-3">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[12px] font-semibold",
                        err.severity === "High"
                          ? "bg-over-soft/70 text-over"
                          : "bg-warning-soft/80 text-warning",
                      )}
                    >
                      {err.severity}
                    </span>
                    <span className="text-[13.5px] font-semibold text-foreground">
                      {err.type}
                    </span>
                    <span className="text-[13px] text-muted-foreground">{err.context}</span>
                  </div>

                  {/* Description */}
                  <p className="px-5 pb-4 text-[13.5px] text-foreground">{err.description}</p>

                  {/* Expected / Actual / Difference boxes */}
                  <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
                    <div className="px-5 py-3.5">
                      <p className="text-[11.5px] text-muted-foreground">Expected</p>
                      <p className="tnum mt-1 text-[15px] font-semibold text-brand">
                        {formatINR(err.expected, { compact: true })}
                      </p>
                    </div>
                    <div className="px-5 py-3.5">
                      <p className="text-[11.5px] text-muted-foreground">Actual</p>
                      <p className="tnum mt-1 text-[15px] font-semibold text-foreground">
                        {formatINR(err.actual, { compact: true })}
                      </p>
                    </div>
                    <div className="px-5 py-3.5">
                      <p className="text-[11.5px] text-muted-foreground">Difference</p>
                      <p
                        className={cn(
                          "tnum mt-1 text-[15px] font-semibold",
                          diff === 0 ? "text-muted-foreground" : "text-over",
                        )}
                      >
                        {diff === 0 ? "₹0" : `${diffPositive ? "+" : ""}${formatINR(diff, { compact: true })}`}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. Corrected Calculation ── */}
      {analysed.length > 0 && (
        <div className="mt-6">
          {/* Section heading */}
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-surface-sunken text-muted-foreground">
              <Table2 className="h-4 w-4" />
            </div>
            <h3 className="text-[15px] font-semibold text-foreground">2. Corrected Calculation</h3>
          </div>

          <Card>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH className="w-10">#</TH>
                    <TH>DESCRIPTION</TH>
                    <TH className="text-right">QTY</TH>
                    <TH className="text-right">UNIT PRICE</TH>
                    <TH className="text-right">EXPECTED TOTAL</TH>
                    <TH className="text-right">QUOTED TOTAL</TH>
                    <TH className="text-right">DIFF</TH>
                    <TH className="text-center">STATUS</TH>
                  </tr>
                </THead>
                <TBody>
                  {analysed.map((line) => {
                    const hasDiff = line.printedAmount !== undefined;
                    const quotedTotal = line.printedAmount ?? line.amount;
                    const diff = hasDiff ? (line.printedAmount! - line.amount) : 0;

                    return (
                      <tr
                        key={line.id}
                        className={cn(
                          "transition-colors",
                          hasDiff
                            ? "bg-over-soft/20 hover:bg-over-soft/30"
                            : "hover:bg-muted/30",
                        )}
                      >
                        {/* # */}
                        <TD className="tnum text-[12.5px] text-muted-foreground">{line.srNo}</TD>

                        {/* DESCRIPTION */}
                        <TD className="max-w-xs">
                          <p className="line-clamp-2 text-[13px] leading-snug text-foreground">
                            {line.description}
                          </p>
                        </TD>

                        {/* QTY + UNIT */}
                        <TD className="tnum text-right text-[13px] text-muted-foreground whitespace-nowrap">
                          {formatNumber(line.quantity)} {line.unit}
                        </TD>

                        {/* UNIT PRICE */}
                        <TD className="tnum text-right text-[13px] font-medium whitespace-nowrap">
                          {formatINR(line.rate, { compact: true })}
                        </TD>

                        {/* EXPECTED TOTAL — teal when discrepancy exists */}
                        <TD
                          className={cn(
                            "tnum text-right text-[13px] font-semibold whitespace-nowrap",
                            hasDiff ? "text-brand" : "text-foreground",
                          )}
                        >
                          {formatINR(line.amount, { compact: true })}
                        </TD>

                        {/* QUOTED TOTAL — red when discrepancy exists */}
                        <TD
                          className={cn(
                            "tnum text-right text-[13px] whitespace-nowrap",
                            hasDiff ? "font-medium text-over" : "text-foreground",
                          )}
                        >
                          {formatINR(quotedTotal, { compact: true })}
                        </TD>

                        {/* DIFF */}
                        <TD
                          className={cn(
                            "tnum text-right text-[13px] font-medium whitespace-nowrap",
                            hasDiff ? "text-over" : "text-muted-foreground",
                          )}
                        >
                          {hasDiff
                            ? `${diff > 0 ? "+" : ""}${formatINR(diff, { compact: true })}`
                            : "—"}
                        </TD>

                        {/* STATUS */}
                        <TD className="text-center whitespace-nowrap">
                          {hasDiff ? (
                            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-over">
                              <ArrowUp className="h-3 w-3" />
                              Discrepancy
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-par">
                              <Check className="h-3.5 w-3.5" />
                              Verified
                            </span>
                          )}
                        </TD>
                      </tr>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrap>
          </Card>
        </div>
      )}

      {/* ── 4. Potential Savings ── */}
      {summary.potentialSaving > 0 && (
        <div className="mt-6">
          {/* Section header */}
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted-foreground">
              <PiggyBank className="h-4 w-4" />
            </div>
            <h3 className="text-[15px] font-semibold text-foreground">4. Potential Savings</h3>
          </div>

          <Card className="overflow-hidden">
            {/* Stat strip */}
            <div className="grid grid-cols-2 divide-border border-b border-border sm:grid-cols-4 sm:divide-x">
              <div className="border-b border-border bg-over-soft/30 px-5 py-4 sm:border-b-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-over">Quoted Grand Total</p>
                <p className="tnum mt-1.5 text-[22px] font-bold text-over">
                  {formatINR(boqValue, { compact: true, decimals: 0 })}
                </p>
              </div>
              <div className="border-b border-border px-5 py-4 sm:border-b-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Market-Rate Total</p>
                <p className="tnum mt-1.5 text-[22px] font-bold text-foreground">
                  {summary.benchmarkTotal > 0
                    ? formatINR(summary.benchmarkTotal * (1 + invoice.taxPct / 100), { compact: true, decimals: 0 })
                    : "—"}
                </p>
              </div>
              <div className="border-b border-border bg-brand-soft/30 px-5 py-4 sm:border-b-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Total Potential Savings</p>
                <p className="tnum mt-1.5 text-[22px] font-bold text-brand">
                  {formatINR(summary.potentialSaving, { compact: true, decimals: 0 })}
                </p>
              </div>
              <div className="bg-brand-soft/15 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Savings %</p>
                <p className="tnum mt-1.5 text-[22px] font-bold text-brand">
                  {boqValue > 0
                    ? `${((summary.potentialSaving / boqValue) * 100).toFixed(1)}%`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Itemised savings */}
            {overPricedLines.length > 0 && (
              <CardContent className="pt-5">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Itemized Savings (Over-priced Items)
                </p>
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {overPricedLines.map((line) => {
                    const vendorTotal    = line.amount;
                    const mktTotal       = line.variance.benchmarkRate * line.quantity;
                    const saving         = vendorTotal - mktTotal;
                    return (
                      <div key={line.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                          {line.description}
                        </p>
                        <div className="flex shrink-0 items-center gap-2 text-[12.5px]">
                          <span className="tnum text-muted-foreground">
                            {formatINR(vendorTotal, { compact: true, decimals: 0 })}
                          </span>
                          <ArrowDown className="h-3 w-3 shrink-0 text-brand" />
                          <span className="tnum text-muted-foreground">
                            {formatINR(mktTotal, { compact: true, decimals: 0 })}
                          </span>
                          <span className="tnum ml-2 font-semibold text-brand">
                            {formatINR(saving, { compact: true, decimals: 0 })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      )}

      {/* ── 3. Risk Impact ── */}
      <div className="mt-6">
        {/* Section header */}
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <h3 className="text-[15px] font-semibold text-foreground">3. Risk Impact</h3>
        </div>

        <Card className="overflow-hidden">
          {/* Warning banner — shown only when errors pushed the risk level up */}
          {riskElevated && (
            <div className="flex items-start gap-3 border-b border-over/20 bg-over-soft/40 px-5 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
              <p className="text-[12.5px] leading-relaxed text-over">
                Risk elevated from <strong>{riskBaseLevel}</strong> to{" "}
                <strong>{riskAdjusted}</strong> due to {auditErrors.length} calculation error
                {auditErrors.length === 1 ? "" : "s"} ({_highSevErrors} high severity)
              </p>
            </div>
          )}

          <CardContent className="pt-6">
            {/* Score + risk level row */}
            <div className="mb-7 flex flex-wrap items-center gap-6">
              {/* Circular score badge */}
              <div className={cn(
                "flex h-[76px] w-[76px] shrink-0 flex-col items-center justify-center rounded-full border-4",
                riskAuditScore >= 75
                  ? "border-par/50 bg-par-soft/20"
                  : riskAuditScore >= 55
                    ? "border-warning/50 bg-warning-soft/20"
                    : "border-over/50 bg-over-soft/20",
              )}>
                <span className="tnum text-[28px] font-bold leading-none text-foreground">
                  {riskAuditScore}
                </span>
                <span className="text-[9.5px] text-muted-foreground">/ 100</span>
              </div>

              {/* Labels */}
              <div className="flex flex-wrap gap-8">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Audit Score
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-foreground">
                    {riskAuditScore} / 100
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Base Risk Level
                  </p>
                  <p className="mt-1 text-[15px] font-bold text-foreground">{riskBaseLevel}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Adjusted Risk Level
                  </p>
                  <p className={cn(
                    "mt-1 text-[15px] font-bold",
                    riskAdjusted === "Critical" || riskAdjusted === "High"
                      ? "text-over"
                      : riskAdjusted === "Moderate"
                        ? "text-warning"
                        : "text-par",
                  )}>
                    {riskAdjusted}
                  </p>
                </div>
              </div>
            </div>

            {/* Sub-score progress bars */}
            <div className="space-y-3.5">
              {riskSubScores.map(({ label, score, max }) => {
                const pct     = max > 0 ? (score / max) * 100 : 0;
                const barCls  = pct >= 75 ? "bg-par" : pct >= 40 ? "bg-warning" : "bg-over";
                return (
                  <div key={label} className="flex items-center gap-4">
                    <p className="w-36 shrink-0 text-[12.5px] text-muted-foreground">{label}</p>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", barCls)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="tnum w-14 shrink-0 text-right text-[12.5px] font-medium text-foreground">
                      {score} / {max}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review banner */}
      {lowConfidence.length > 0 && (
        <div className="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-warning/40 bg-warning-soft/60 p-4">
          <CircleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-foreground">
              {lowConfidence.length} line item{lowConfidence.length === 1 ? "" : "s"} need
              confirming
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              These fields were read with low confidence. Confirm or correct them — the variance
              verdict recalculates as you edit.
            </p>
          </div>
          {allows("invoice.correct") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setFilter("all");
                setExpanded(lowConfidence[0].id);
                setEditing(lowConfidence[0].id);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Start review
            </Button>
          )}
        </div>
      )}

      {/* ── Section B · Bill of Quantities ── */}
      <Card className="mt-6 overflow-hidden">

        {/* Card header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted-foreground">
              <ListOrdered className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">
                Scanned Line-Item Breakdown — Vendor vs Real-Time Market
              </h3>
              <p className="text-[12.5px] text-muted-foreground">
                Gemini OCR-extracted line items · market sourced from IndiaMART, Moglix &amp; live web prices
              </p>
            </div>
          </div>

          {/* Export + status */}
          <div className="flex flex-wrap items-center gap-2">
            {saving && (
              <Badge tone="neutral">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                Saving
              </Badge>
            )}
            {saveError && <Badge tone="over">{saveError}</Badge>}
            {corrections > 0 && !saving && (
              <Badge tone="brand">
                {corrections} correction{corrections === 1 ? "" : "s"} saved
              </Badge>
            )}
            {invoice.hasOriginal && (
              <a
                href={`/api/invoices/${invoice.id}/original`}
                className={buttonStyles({ variant: "outline", size: "sm" })}
                title={`Open ${invoice.fileName} as uploaded`}
              >
                <FileText className="h-3.5 w-3.5" />
                Original
              </a>
            )}
            {allows("report.export") ? (
              <>
                <a
                  href={`/api/invoices/${invoice.id}/export?format=pdf`}
                  className={buttonStyles({ variant: "outline", size: "sm" })}
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </a>
                {entitled("export_excel") ? (
                  <a
                    href={`/api/invoices/${invoice.id}/export?format=xlsx`}
                    className={buttonStyles({ variant: "outline", size: "sm" })}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel
                  </a>
                ) : (
                  <a
                    href="/app/settings/billing"
                    className={buttonStyles({ variant: "outline", size: "sm", className: "opacity-60" })}
                    title="Excel export is available from the Professional tier"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Excel · upgrade
                  </a>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
          <div className="px-5 py-3.5">
            <p className="text-[11.5px] text-muted-foreground">Total Items</p>
            <p className="mt-0.5 text-[18px] font-bold text-foreground">{items.length}</p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-[11.5px] text-muted-foreground">BOQ Value</p>
            <p className="mt-0.5 text-[18px] font-bold text-foreground">
              {formatINR(boqValue, { compact: true, decimals: 0 })}
            </p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-[11.5px] text-muted-foreground">Document Type</p>
            <p className="mt-0.5 text-[18px] font-bold text-foreground capitalize">
              {invoice.documentType === "quotation" ? "Quotation" : "Invoice"}
            </p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-[11.5px] text-muted-foreground">Extraction</p>
            <p
              className={cn(
                "mt-0.5 text-[18px] font-bold",
                extractionConfidence === "High"
                  ? "text-par"
                  : extractionConfidence === "Medium"
                    ? "text-warning"
                    : "text-over",
              )}
            >
              {extractionConfidence}
            </p>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-3">
          {filters.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
                filter === entry.key
                  ? "border-brand bg-brand-soft font-medium text-brand-soft-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
              <span className="tnum text-[11px] opacity-70">{entry.count}</span>
            </button>
          ))}
        </div>

        {/* Line items table */}
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH className="w-8" />
                <TH className="w-10">#</TH>
                <TH>MATERIAL / DESCRIPTION</TH>
                <TH className="text-right">QTY</TH>
                <TH>UNIT</TH>
                <TH className="text-right">VENDOR RATE</TH>
                <TH className="text-right">MARKET RATE</TH>
                <TH className="text-right">BILLED AMT</TH>
                <TH className="text-right">CALC AMT</TH>
                <TH className="text-right">VARIANCE</TH>
                <TH className="text-center">RISK</TH>
                <TH className="text-center">STATUS</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {visible.map((line) => {
                const isOpen = expanded === line.id;
                const isEditing = editing === line.id;
                const unmatched = line.variance.benchmarkBasis === "none";
                const calcDiffers = line.printedAmount !== undefined;
                const uncertain =
                  Math.min(
                    line.confidence.description,
                    line.confidence.quantity,
                    line.confidence.rate,
                  ) < LOW_CONFIDENCE;
                const flag = line.variance.flag;

                /* Market data source — first quote platform, or SoR code */
                const marketSource =
                  line.marketQuotes?.[0]?.platform ?? (line.sorMatch ? line.sorMatch.code : null);

                /* RISK: Low = at par, High = any variance (over or under) */
                const isHighRisk = !unmatched && flag !== "par";

                /* VARIANCE: signed ₹ amount + % */
                const varAmt = line.variance.varianceAmount;
                const varPct = line.variance.variancePct;
                const varAmtStr = `₹${varAmt < 0 ? "-" : "+"}${formatINR(Math.abs(varAmt), { compact: true }).replace("₹", "")}`;
                const varColor =
                  flag === "over" ? "text-over" : flag === "under" ? "text-brand" : "text-muted-foreground";

                return (
                  <Fragment key={line.id}>
                    <tr
                      className={cn(
                        "transition-colors hover:bg-muted/50",
                        isOpen && "bg-muted/40",
                      )}
                    >
                      {/* Expand toggle */}
                      <TD>
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : line.id)}
                          className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
                          aria-label={isOpen ? "Hide evidence" : "Show evidence"}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </TD>

                      {/* # */}
                      <TD className="tnum text-[12.5px] text-muted-foreground">{line.srNo}</TD>

                      {/* MATERIAL / DESCRIPTION */}
                      <TD className="max-w-xs">
                        <p
                          className={cn(
                            "text-[13px] leading-snug text-foreground",
                            isOpen ? "" : "line-clamp-2",
                          )}
                        >
                          {line.description}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {marketSource && (
                            <span className="text-[10.5px] text-muted-foreground">
                              {marketSource}
                            </span>
                          )}
                          {line.corrected && <Badge tone="brand">Corrected</Badge>}
                          {uncertain && !line.corrected && (
                            <Badge tone="warning">Low confidence</Badge>
                          )}
                        </div>
                      </TD>

                      {/* QTY */}
                      <TD className="tnum text-right text-[13px] whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            defaultValue={line.quantity}
                            onBlur={(e) => applyEdit(line.id, { quantity: Number(e.target.value) })}
                            className="tnum h-8 w-24 rounded border border-brand bg-background px-2 text-right text-[13px]"
                          />
                        ) : (
                          formatNumber(line.quantity)
                        )}
                      </TD>

                      {/* UNIT */}
                      <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                        {line.unit}
                      </TD>

                      {/* VENDOR RATE */}
                      <TD
                        className={cn(
                          "tnum text-right text-[13px] font-medium whitespace-nowrap",
                          line.confidence.rate < LOW_CONFIDENCE &&
                            !line.corrected &&
                            "decoration-warning underline decoration-wavy underline-offset-4",
                        )}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            defaultValue={line.rate}
                            onBlur={(e) => applyEdit(line.id, { rate: Number(e.target.value) })}
                            className="tnum h-8 w-28 rounded border border-brand bg-background px-2 text-right text-[13px]"
                          />
                        ) : (
                          formatINR(line.rate, { compact: true })
                        )}
                      </TD>

                      {/* MARKET RATE — teal to stand out as the benchmark */}
                      <TD className="tnum text-right text-[13px] font-semibold whitespace-nowrap text-brand">
                        {unmatched
                          ? <span className="font-normal text-muted-foreground">—</span>
                          : formatINR(line.variance.benchmarkRate, { compact: true })}
                      </TD>

                      {/* BILLED AMT */}
                      <TD className="tnum text-right text-[13px] font-medium whitespace-nowrap">
                        {formatINR(line.printedAmount ?? line.amount, { compact: true })}
                      </TD>

                      {/* CALC AMT — red when differs from printed amount */}
                      <TD
                        className={cn(
                          "tnum text-right text-[13px] font-medium whitespace-nowrap",
                          calcDiffers ? "text-over" : "text-foreground",
                        )}
                        title={calcDiffers ? "Qty × unit price differs from the printed total" : undefined}
                      >
                        {formatINR(line.amount, { compact: true })}
                      </TD>

                      {/* VARIANCE — ₹ amount on line 1, % on line 2 */}
                      <TD className={cn("tnum text-right text-[13px] whitespace-nowrap", varColor)}>
                        {unmatched ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <p className="font-semibold">{varAmtStr}</p>
                            <p className="text-[11px] opacity-80">
                              ({varPct > 0 ? "+" : ""}{varPct.toFixed(1)}%)
                            </p>
                          </>
                        )}
                      </TD>

                      {/* RISK badge */}
                      <TD className="text-center">
                        {unmatched ? (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
                              isHighRisk
                                ? "bg-over-soft/70 text-over"
                                : "bg-par-soft/70 text-par",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                isHighRisk ? "bg-over" : "bg-par",
                              )}
                            />
                            {isHighRisk ? "High" : "Low"}
                          </span>
                        )}
                      </TD>

                      {/* STATUS badge */}
                      <TD className="text-center">
                        {unmatched ? (
                          <span className="text-[12px] text-muted-foreground">—</span>
                        ) : flag === "par" ? (
                          <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11.5px] text-muted-foreground">
                            <Minus className="h-3 w-3" />
                            At Par
                          </span>
                        ) : flag === "under" ? (
                          <span className="inline-flex items-center gap-1 rounded border border-brand/40 bg-brand-soft/50 px-2 py-0.5 text-[11.5px] font-medium text-brand-soft-foreground">
                            <ArrowDown className="h-3 w-3" />
                            Under-priced
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-over/40 bg-over-soft/50 px-2 py-0.5 text-[11.5px] font-medium text-over">
                            <ArrowUp className="h-3 w-3" />
                            Over-priced
                          </span>
                        )}
                      </TD>

                      {/* Edit */}
                      <TD>
                        {allows("invoice.correct") && (
                          <button
                            type="button"
                            onClick={() => setEditing(isEditing ? null : line.id)}
                            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={isEditing ? "Finish editing" : "Correct this line"}
                          >
                            {isEditing ? (
                              <Check className="h-3.5 w-3.5 text-par" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </TD>
                    </tr>

                    {/* Evidence drawer */}
                    {isOpen && (
                      <tr className="bg-surface-sunken/40">
                        <td colSpan={13} className="px-5 py-5">
                          <Evidence line={line} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        </TableWrap>

        {visible.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No line items match this filter.
          </p>
        )}

        {/* Footer: extraction metadata */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-border bg-surface-sunken/40 px-5 py-3">
          <span className="text-[11.5px] text-muted-foreground">
            Source:{" "}
            <span className="font-medium text-foreground">
              {invoice.quality.checks.some((c) => c.id === "ocr" && c.passed)
                ? "OCR · vision model"
                : "Embedded text layer"}
            </span>
          </span>
          {invoice.language && (
            <span className="text-[11.5px] text-muted-foreground">
              Language:{" "}
              <span className="font-medium text-foreground">{invoice.language}</span>
            </span>
          )}
          {restated > 0 && (
            <span className="text-[11.5px] text-muted-foreground">
              Restated lines:{" "}
              <span className="font-medium text-over">{restated}</span>
            </span>
          )}
          <span className="text-[11.5px] text-muted-foreground">
            Market column = benchmark unit rate · median market quote,
            SoR cross-checked · par band ±{VARIANCE_CONFIG.parBandPct}%
          </span>
        </div>

        {invoice.extractionNote && (
          <div className="flex gap-2.5 border-t border-border bg-warning-soft/30 px-5 py-3">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            <p className="text-[12px] leading-relaxed text-foreground">
              {invoice.extractionNote}
            </p>
          </div>
        )}
      </Card>

      {/* ── Final Audit Summary ── */}
      <FinalAuditSummary summary={summary} currency={invoice.city?.currency ?? "INR"} />

      {/* ── Actionable Recommendations ── */}
      <Card className="mt-6">
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted-foreground">
              <ListChecks className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>Actionable Recommendations</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <ol className="space-y-3">
            {recommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                  {idx + 1}
                </span>
                <p className="text-[13.5px] leading-relaxed text-foreground">{rec}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ── Section B · SOW & Gap Analysis ── */}
      <Card className="mt-6 overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">Section B · SOW &amp; Gap Analysis</h3>
            <p className="text-[12.5px] text-muted-foreground">Scope of work, missing items and ambiguities</p>
          </div>
        </div>

        <CardContent className="pt-5">
          <div className="grid gap-8 sm:grid-cols-2">

            {/* ── LEFT: Extracted Scope + Exclusions ── */}
            <div className="space-y-6">
              {/* Extracted Scope */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <AlignLeft className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[13.5px] font-semibold text-foreground">Extracted Scope</p>
                </div>
                <ul className="space-y-2">
                  {sowAnalysis.extractedScope.map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-[13px] text-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-par" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Exclusions */}
              {sowAnalysis.exclusions.length > 0 && (
                <div>
                  <p className="mb-3 text-[13.5px] font-semibold text-foreground">Exclusions</p>
                  <ul className="space-y-2">
                    {sowAnalysis.exclusions.map((item) => (
                      <li key={item} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ── RIGHT: Missing Items + Ambiguities + Scope Risk Score ── */}
            <div className="space-y-5">
              {/* Missing Items */}
              {sowAnalysis.missingItems.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4 text-warning" />
                    <p className="text-[13.5px] font-semibold text-foreground">Missing Items</p>
                  </div>
                  <ul className="space-y-2">
                    {sowAnalysis.missingItems.map((item, idx) => (
                      <li key={`${idx}-${item}`} className="flex items-start gap-2.5 text-[13px] text-foreground">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ambiguities */}
              {sowAnalysis.ambiguities.length > 0 && (
                <div>
                  <p className="mb-3 text-[13.5px] font-semibold text-foreground">Ambiguities</p>
                  <ul className="space-y-2">
                    {sowAnalysis.ambiguities.map((item, idx) => (
                      <li key={`${idx}-${item}`} className="flex items-start gap-2.5 text-[13px] text-foreground">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Nothing found — say so, rather than leaving the column blank */}
              {sowAnalysis.missingItems.length === 0 && sowAnalysis.ambiguities.length === 0 && (
                <div className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
                  No scope gaps or ambiguous wording found in this document.
                </div>
              )}

              {/* Scope Risk Score */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-sunken px-4 py-3">
                <p className="text-[13px] font-medium text-foreground">Scope Risk Score</p>
                <p className={cn(
                  "tnum text-[18px] font-bold",
                  sowAnalysis.scopeRiskScore >= 75
                    ? "text-par"
                    : sowAnalysis.scopeRiskScore >= 50
                      ? "text-warning"
                      : "text-over",
                )}>
                  {sowAnalysis.scopeRiskScore} / 100
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Commercial Terms ── */}
      {hasTerms(invoice.commercialTerms) && (
        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">Commercial Terms</h3>
              <p className="text-[12.5px] text-muted-foreground">
                Payment, tax, validity and delivery as the document states them
              </p>
            </div>
          </div>

          <CardContent className="pt-5">
            <div className="grid gap-8 sm:grid-cols-2">
              {/* As printed on the document */}
              <div className="space-y-3">
                {([
                  ["Payment schedule", invoice.commercialTerms?.payment],
                  ["Taxes", invoice.commercialTerms?.taxes],
                  ["Validity", invoice.commercialTerms?.validity],
                  ["Delivery", invoice.commercialTerms?.delivery],
                  ["Warranty", invoice.commercialTerms?.warranty],
                ] as const)
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label} className="border-b border-border pb-3 last:border-0 last:pb-0">
                      <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 text-[13.5px] text-foreground">{value}</p>
                    </div>
                  ))}
                {invoice.commercialTerms?.other?.length ? (
                  <div>
                    <p className="text-[11.5px] uppercase tracking-wide text-muted-foreground">Other terms</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {invoice.commercialTerms.other.map((item, idx) => (
                        <li key={`${idx}-${item}`} className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              {/* What those terms expose the buyer to */}
              <div>
                <p className="mb-3 text-[13.5px] font-semibold text-foreground">Commercial Exposure</p>
                {termsFindings.length > 0 ? (
                  <ul className="space-y-3">
                    {termsFindings.map((finding, idx) => (
                      <li key={`${idx}-${finding.label}`} className="rounded-lg border border-border bg-surface-sunken/40 px-3.5 py-3">
                        <div className="flex items-start gap-2.5">
                          <span
                            className={cn(
                              "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                              finding.severity === "high"
                                ? "bg-over"
                                : finding.severity === "medium"
                                  ? "bg-warning"
                                  : "bg-muted-foreground/60",
                            )}
                          />
                          <div>
                            <p className="text-[13px] font-semibold text-foreground">{finding.label}</p>
                            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                              {finding.detail}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-start gap-2.5 text-[13px] text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
                    Nothing unusual in the stated terms.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Section C · Risk Red Flags ── */}
      {riskFlags.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-over-soft/60 text-over">
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-foreground">Section C · Risk Red Flags</h3>
              <p className="text-[12.5px] text-muted-foreground">
                Pricing, quantity, calculation, procurement and fraud-risk indicators
              </p>
            </div>
          </div>

          <CardContent className="space-y-4 pt-5">
            {riskFlags.map((flag, idx) => {
              const catStyle: Record<string, string> = {
                Pricing:      "border-over/40 bg-over-soft/30 text-over",
                Commercial:   "border-over/40 bg-over-soft/30 text-over",
                Calculation:  "border-warning/40 bg-warning-soft/40 text-warning",
                Quantity:     "border-warning/40 bg-warning-soft/40 text-warning",
                Procurement:  "border-border bg-surface-sunken text-muted-foreground",
                "Data Quality":"border-border bg-surface-sunken text-muted-foreground",
              };
              const confStyle: Record<string, string> = {
                "High confidence":   "bg-brand-soft text-brand",
                "Medium confidence": "bg-warning-soft text-warning",
                "Low confidence":    "bg-over-soft/40 text-over",
              };
              return (
                <div key={idx} className="rounded-xl border border-border bg-surface p-4 space-y-2">
                  {/* Tags row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold",
                      catStyle[flag.category] ?? "border-border text-muted-foreground",
                    )}>
                      {flag.category}
                    </span>
                    <span className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
                      confStyle[flag.confidence] ?? "bg-surface-sunken text-muted-foreground",
                    )}>
                      {flag.confidence}
                    </span>
                  </div>
                  {/* Description */}
                  <p className="text-[13.5px] font-medium text-foreground">{flag.description}</p>
                  {/* Evidence */}
                  <p className="text-[12.5px] text-muted-foreground">
                    <span className="font-medium text-foreground">Evidence:</span>{" "}
                    {flag.evidence}
                  </p>
                  {/* Recommendation */}
                  <p className="text-[12.5px]">
                    <span className="font-semibold text-brand">Recommendation:</span>{" "}
                    <span className="text-foreground">{flag.recommendation}</span>
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Pricing Details + Potential Savings (2-col) ── */}
      {(() => {
        const calcTax           = netValue * (invoice.taxPct / 100);
        const calcGrandTotal    = netValue + calcTax;          // boqValue
        const discount          = Math.max(0, invoice.subtotal - netValue);
        const subtotalDiff      = invoice.subtotal - netValue; // +ve = vendor quoted more
        const grandTotalDiff    = invoice.total - calcGrandTotal;
        const TOLS              = 2;
        const subtotalOk        = invoice.subtotal <= 0 || Math.abs(subtotalDiff) <= TOLS;
        const grandOk           = invoice.total    <= 0 || Math.abs(grandTotalDiff) <= TOLS;

        // Note text from audit context
        const lineErrCount = auditErrors.filter((e) => e.type === "Line Item Calculation Error").length;
        const pricingNote =
          lineErrCount > 0 && !subtotalOk
            ? `Mathematical errors identified in ${lineErrCount} line item${lineErrCount === 1 ? "" : "s"} and the subtotal sum, leading to a discrepancy between quoted and calculated totals.`
            : !subtotalOk || !grandOk
              ? "A discrepancy was detected between the vendor's quoted figures and the figures derived from the line-item data."
              : "All figures verified — quoted totals match the calculated values within rounding tolerance.";

        // Per-category savings (group over-priced lines)
        const SAVINGS_CATS: { label: string; kw: string[] }[] = [
          { label: "Civil works optimization",   kw: ["rcc", "concrete", "excavat", "civil", "brick", "block", "shutt", "back fill", "sand fill"] },
          { label: "Pool works optimization",    kw: ["pool", "swimming", "spa", "jacuzzi"] },
          { label: "Plumbing optimization",      kw: ["plumb", "pipe", "drain", "cpvc", "upvc", "fitting", "valve"] },
          { label: "Filtration optimization",    kw: ["filter", "filtration", "pump", "skimmer", "uv", "dosing"] },
          { label: "Electrical optimization",    kw: ["electric", "cable", "wiring", "conduit"] },
          { label: "Flooring & finishes",        kw: ["tile", "tiles", "flooring", "marble", "ceramic", "vitrified"] },
        ];
        type SavingsCat = { label: string; saving: number };
        const catSavings: SavingsCat[] = [];
        const usedIds = new Set<string>();
        for (const cat of SAVINGS_CATS) {
          const matches = overPricedLines.filter(
            (l) => !usedIds.has(l.id) && cat.kw.some((k) => l.description.toLowerCase().includes(k)),
          );
          if (matches.length === 0) continue;
          const saving = matches.reduce((s, l) => s + (l.amount - l.variance.benchmarkRate * l.quantity), 0);
          matches.forEach((l) => usedIds.add(l.id));
          catSavings.push({ label: cat.label, saving });
        }
        // Remaining uncategorised
        const uncategorised = overPricedLines.filter((l) => !usedIds.has(l.id));
        if (uncategorised.length > 0) {
          const saving = uncategorised.reduce((s, l) => s + (l.amount - l.variance.benchmarkRate * l.quantity), 0);
          catSavings.push({ label: "General optimization", saving });
        }

        return (
          <div className="mt-6 grid gap-5 sm:grid-cols-2">

            {/* ── Pricing Details & Calculations ── */}
            <Card>
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-sunken text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-foreground">Pricing Details &amp; Calculations</h3>
                  <p className="text-[12px] text-muted-foreground">Mathematical accuracy verification</p>
                </div>
              </div>

              <CardContent className="pt-4">
                {/* Main rows */}
                {[
                  { label: "Quoted subtotal",      value: invoice.subtotal > 0 ? invoice.subtotal : null, bold: false },
                  { label: "Calculated subtotal",  value: netValue,                                        bold: false },
                  { label: "Discount",             value: discount,                                        bold: false },
                  { label: "Tax",                  value: calcTax,                                         bold: false },
                  { label: "Quoted grand total",   value: invoice.total > 0 ? invoice.total : null,        bold: true  },
                  { label: "Calculated grand total", value: calcGrandTotal,                                bold: true  },
                ].map(({ label, value, bold }) => (
                  <div key={label} className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
                    <p className={cn("text-[13px]", bold ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {label}
                    </p>
                    <p className={cn("tnum text-[13px]", bold ? "font-bold text-foreground" : "font-medium text-foreground")}>
                      {value !== null && value !== undefined
                        ? formatINR(value, { compact: true, decimals: 0 })
                        : "—"}
                    </p>
                  </div>
                ))}

                {/* Discrepancy badge */}
                {!grandOk && invoice.total > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-over/30 bg-over-soft/40 px-3 py-1.5 text-[12.5px] font-semibold text-over">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    Discrepancy: {formatINR(grandTotalDiff, { compact: true, decimals: 0 })}
                  </div>
                )}

                {/* SUBTOTAL CHECK */}
                {invoice.subtotal > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Subtotal Check
                    </p>
                    {[
                      { label: "Expected", value: formatINR(netValue, { compact: true, decimals: 0 }) },
                      { label: "Quoted",   value: formatINR(invoice.subtotal, { compact: true, decimals: 0 }) },
                      { label: "Status",   value: subtotalOk ? "Verified" : "Discrepancy", isStatus: true, ok: subtotalOk },
                    ].map(({ label, value, isStatus, ok }) => (
                      <div key={label} className="flex items-baseline justify-between py-1">
                        <p className="text-[12.5px] text-muted-foreground">{label}</p>
                        <p className={cn(
                          "tnum text-[12.5px] font-medium",
                          isStatus ? (ok ? "text-par" : "text-over") : "text-foreground",
                        )}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* GRAND TOTAL CHECK */}
                {invoice.total > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Grand Total Check
                    </p>
                    {[
                      { label: "Expected", value: formatINR(calcGrandTotal, { compact: true, decimals: 0 }) },
                      { label: "Quoted",   value: formatINR(invoice.total, { compact: true, decimals: 0 }) },
                      { label: "Status",   value: grandOk ? "Verified" : "Discrepancy", isStatus: true, ok: grandOk },
                    ].map(({ label, value, isStatus, ok }) => (
                      <div key={label} className="flex items-baseline justify-between py-1">
                        <p className="text-[12.5px] text-muted-foreground">{label}</p>
                        <p className={cn(
                          "tnum text-[12.5px] font-medium",
                          isStatus ? (ok ? "text-par" : "text-over") : "text-foreground",
                        )}>
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Explanatory note */}
                <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
                  {pricingNote}
                </p>
              </CardContent>
            </Card>

            {/* ── Potential Savings (compact) ── */}
            <Card>
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <PiggyBank className="h-4 w-4" />
                </div>
                <h3 className="text-[14px] font-semibold text-foreground">Potential Savings</h3>
              </div>
              <CardContent className="pt-4">
                {/* Current / Benchmark / Saving strip */}
                <div className="mb-4 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border">
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">Current</p>
                    <p className="tnum mt-0.5 text-[16px] font-bold text-foreground">
                      {formatINR(netValue, { compact: true, decimals: 0 })}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] text-muted-foreground">Benchmark</p>
                    <p className="tnum mt-0.5 text-[16px] font-bold text-foreground">
                      {summary.benchmarkTotal > 0
                        ? formatINR(summary.benchmarkTotal, { compact: true, decimals: 0 })
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-brand-soft/40 px-4 py-3">
                    <p className="text-[11px] font-medium text-brand">Saving</p>
                    <p className="tnum mt-0.5 text-[16px] font-bold text-brand">
                      {summary.potentialSaving > 0
                        ? formatINR(summary.potentialSaving, { compact: true, decimals: 0 })
                        : "—"}
                    </p>
                  </div>
                </div>

                <p className="mb-3 text-[12px] text-muted-foreground">
                  Estimated potential savings — not guaranteed.
                </p>

                {/* Per-category savings */}
                <div className="space-y-2">
                  {catSavings.map(({ label, saving }) => (
                    <div key={label} className="flex items-baseline justify-between gap-2 border-b border-border pb-2 last:border-0">
                      <p className="text-[13px] text-foreground">{label}</p>
                      <p className="tnum shrink-0 text-[13px] font-semibold text-brand">
                        {formatINR(saving, { compact: true, decimals: 0 })}
                      </p>
                    </div>
                  ))}
                  {catSavings.length === 0 && (
                    <p className="text-[12.5px] text-muted-foreground">No over-priced items identified.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* ── Recommended Actions ── */}
      <Card className="mt-6">
        <CardContent className="pt-5">
          <h3 className="mb-4 text-[15px] font-semibold text-foreground">Recommended Actions</h3>
          <ol className="space-y-3">
            {finalRecommendations.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                  {idx + 1}
                </span>
                <p className="text-[13.5px] leading-relaxed text-foreground">{rec}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* ── Bottom action bar ── */}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
        >
          <Download className="h-3.5 w-3.5" />
          Download PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
        >
          <Download className="h-3.5 w-3.5" />
          Generate Report
        </Button>
        <Button
          size="sm"
          onClick={() => {/* saved state toast could go here */}}
        >
          <Save className="h-3.5 w-3.5" />
          Save Report
        </Button>
        <Button
          size="sm"
          onClick={() => { window.location.href = "/app/invoices/new"; }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Audit Another
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Final Audit Summary card
 * ------------------------------------------------------------------ */

function FinalAuditSummary({
  summary,
  currency,
}: {
  summary: ReturnType<typeof summarise>;
  currency: string;
}) {
  const totalMatched = summary.overCount + summary.underCount + summary.parCount;

  /* Overall risk level */
  type RiskLevel = "High" | "Medium" | "Low";
  let riskLevel: RiskLevel;
  if (summary.overCount >= 3 || summary.variancePct > 15) riskLevel = "High";
  else if (summary.overCount >= 1 || summary.variancePct > 5) riskLevel = "Medium";
  else riskLevel = "Low";

  const riskStyle: Record<RiskLevel, string> = {
    High:   "bg-over-soft/70 text-over",
    Medium: "bg-warning-soft/70 text-warning",
    Low:    "bg-par-soft/70 text-par",
  };
  const riskDot: Record<RiskLevel, string> = {
    High: "bg-over", Medium: "bg-warning", Low: "bg-par",
  };

  /* Audit verdict text */
  let verdict: string;
  if (summary.overCount === 0 && summary.underCount === 0) {
    verdict = "All benchmarked items are within the acceptable market range. This quotation appears fairly priced — standard approval recommended.";
  } else if (summary.overCount === 0) {
    verdict = `All ${totalMatched} benchmarked items are at or below market rates. This is a competitive quotation — approval recommended.`;
  } else if (summary.overCount >= 3 || summary.variancePct > 15) {
    verdict = `${summary.overCount} item${summary.overCount === 1 ? " is" : "s are"} significantly over-priced compared to current market rates. Negotiation strongly recommended before approval.`;
  } else {
    verdict = `${summary.overCount} item${summary.overCount === 1 ? " is" : "s are"} above market benchmark. Minor negotiation may recover savings before approval.`;
  }

  /* Potential savings copy */
  const savingsCopy =
    summary.potentialSaving <= 0
      ? "Quotation is at or below market rates"
      : `Recoverable by repricing ${summary.overCount} over-priced item${summary.overCount === 1 ? "" : "s"} to benchmark`;

  const rows: { label: string; value: string | number; colour: string }[] = [
    {
      label: "Overall Risk Level",
      value: riskLevel,
      colour: "",        /* handled separately as badge */
    },
    { label: "Over-priced Items",   value: summary.overCount,   colour: "text-over" },
    { label: "Under-priced Items",  value: summary.underCount,  colour: "text-brand" },
    { label: "At Par Items",        value: summary.parCount,    colour: "text-par" },
  ];

  return (
    <Card className="mt-6 overflow-hidden">
      {/* Card header */}
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-over-soft/60 text-over">
            <ShieldAlert className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Final Audit Summary</CardTitle>
            <CardDescription>Overall risk assessment &amp; recommendations</CardDescription>
          </div>
        </div>
      </CardHeader>

      {/* Body: left list + right panels */}
      <CardContent className="p-0">
        <div className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">

          {/* Left: risk metrics list */}
          <div className="flex-1 divide-y divide-border">
            {rows.map((row, i) => (
              <div key={row.label} className="flex items-center justify-between px-5 py-4">
                <span className="text-[13.5px] text-foreground">{row.label}</span>
                {i === 0 ? (
                  /* Risk Level badge */
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[12.5px] font-semibold",
                    riskStyle[riskLevel],
                  )}>
                    <span className={cn("h-2 w-2 rounded-full", riskDot[riskLevel])} />
                    {riskLevel}
                  </span>
                ) : (
                  <span className={cn("tnum text-[22px] font-bold", row.colour)}>
                    {row.value}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Right: savings + verdict stacked */}
          <div className="flex w-full flex-col divide-y divide-border sm:max-w-[340px]">
            {/* Potential Savings */}
            <div className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <PiggyBank className="h-4 w-4 text-brand" />
                Potential Savings
              </div>
              <p className="tnum text-[28px] font-bold text-foreground">
                {summary.potentialSaving > 0
                  ? formatINR(summary.potentialSaving, { compact: true, decimals: 0 })
                  : "₹0"}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {savingsCopy}
              </p>
            </div>

            {/* Audit Verdict */}
            <div className="px-5 py-4">
              <p className="mb-1.5 text-[13.5px] font-semibold text-foreground">
                Audit Verdict
              </p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{verdict}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-[15px] font-semibold text-foreground">
        {value}
        {hint && <span className="ml-1.5 text-[11.5px] font-normal text-muted-foreground">{hint}</span>}
      </p>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "over" | "under" | "par";
}) {
  const toneClass =
    tone === "over"
      ? "text-over"
      : tone === "under"
        ? "text-under"
        : tone === "par"
          ? "text-par"
          : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("tnum mt-2 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
      {hint && <p className="tnum mt-1 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Evidence({ line }: { line: ReturnType<typeof analyseLines>[number] }) {
  const { sorMatch, marketQuotes, variance } = line;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* SoR side */}
      <Card className="bg-surface">
        <CardHeader>
          <div>
            <CardTitle>Schedule of Rates baseline</CardTitle>
            <CardDescription>
              {sorMatch ? sorMatch.source : "No matching entry in the rate library"}
            </CardDescription>
          </div>
          {sorMatch && <Badge tone="neutral">{sorMatch.code}</Badge>}
        </CardHeader>
        <CardContent>
          {sorMatch ? (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                {sorMatch.description}
              </p>

              <div className="mt-4">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground">Description match</span>
                  <span className="tnum font-medium text-foreground">
                    {(sorMatch.matchScore * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress value={sorMatch.matchScore * 100} size="sm" className="mt-1.5" />
              </div>

              <dl className="mt-4 space-y-2 border-t border-border pt-3.5 text-[12.5px]">
                <Row label={`Base rate (per ${sorMatch.unit})`} value={formatINR(sorMatch.baseRate)} />
                <Row label="City cost index" value={`× ${sorMatch.indexFactor.toFixed(2)}`} />
                <Row
                  label="Location-adjusted baseline"
                  value={formatINR(sorMatch.adjustedRate)}
                  strong
                />
              </dl>
            </>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              This line could not be matched to a Schedule of Rates entry — typically a lump-sum,
              preliminary or bespoke item. It is reported as unmatched rather than being given a
              verdict, and it is excluded from the variance roll-up.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Market side */}
      <Card className="bg-surface">
        <CardHeader>
          <div>
            <CardTitle>Live market pricing</CardTitle>
            <CardDescription>
              {marketQuotes.length > 0
                ? `${marketQuotes.length} quotes · median ${formatINR(variance.marketMedian ?? 0)}`
                : "No market listing found for this item"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {marketQuotes.length > 0 ? (
            <ul className="divide-y divide-border">
              {marketQuotes.map((quote) => (
                <li key={quote.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">
                      {quote.seller}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {quote.platform} · {quote.location} · {relativeTime(quote.fetchedAt, NOW)}
                      {!quote.inStock && " · out of stock"}
                    </p>
                  </div>
                  <span className="tnum shrink-0 text-[12.5px] font-semibold text-foreground">
                    {formatINR(quote.price, { decimals: 0 })}
                  </span>
                  <a
                    href={quote.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="shrink-0 text-muted-foreground hover:text-brand"
                    aria-label={`Open ${quote.platform} listing`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pb-5 text-[12.5px] leading-relaxed text-muted-foreground">
              Service and composite items often have no comparable public listing. This line is
              benchmarked on the Schedule of Rates alone, which is reflected in a lower verdict
              confidence.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Verdict working */}
      <div className="rounded-xl border border-border bg-background p-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] font-semibold text-foreground">How this verdict was reached</p>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">Verdict confidence</span>
            <span className="tnum text-[12.5px] font-semibold text-foreground">
              {(variance.verdictConfidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {variance.benchmarkBasis === "none" ? (
          <p className="mt-2 text-[12.5px] text-muted-foreground">
            No reference rate available from either source, so no verdict was issued.
          </p>
        ) : (
          <p className="tnum mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {variance.benchmarkBasis === "sor+market" ? (
              <>
                Benchmark = median market quote{" "}
                <span className="font-medium text-foreground">
                  {formatINR(variance.benchmarkRate)}
                </span>
                {" · cross-checked against SoR "}
                {formatINR(line.sorMatch!.adjustedRate)}
                {" ("}
                {(() => {
                  const sor = line.sorMatch!.adjustedRate;
                  const gap = sor > 0 ? ((variance.benchmarkRate - sor) / sor) * 100 : 0;
                  return `${gap > 0 ? "+" : ""}${gap.toFixed(0)}%`;
                })()}
                {")"}
              </>
            ) : variance.benchmarkBasis === "sor" ? (
              <>
                Benchmark = location-adjusted SoR rate{" "}
                <span className="font-medium text-foreground">
                  {formatINR(variance.benchmarkRate)}
                </span>{" "}
                (no market quote available)
              </>
            ) : (
              <>
                Benchmark = median market quote{" "}
                <span className="font-medium text-foreground">
                  {formatINR(variance.benchmarkRate)}
                </span>{" "}
                (no SoR match)
              </>
            )}
            {" · "}Billed {formatINR(line.rate)} ={" "}
            <span
              className={cn(
                "font-semibold",
                variance.flag === "over"
                  ? "text-over"
                  : variance.flag === "under"
                    ? "text-under"
                    : "text-par",
              )}
            >
              {variance.variancePct > 0 ? "+" : ""}
              {variance.variancePct.toFixed(1)}%
            </span>{" "}
            over {formatNumber(line.quantity)} {line.unit} ={" "}
            {formatINR(variance.varianceAmount, { decimals: 0 })}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tnum", strong ? "font-semibold text-foreground" : "text-foreground")}>
        {value}
      </dd>
    </div>
  );
}
