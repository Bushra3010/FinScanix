import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  ClipboardList,
  FileText,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/app/page-parts";
import { InvoiceReport } from "@/components/app/invoice-report";
import { Can } from "@/components/app/gates";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guard";
import { deleteInvoiceAction } from "@/lib/invoices/actions";
import { getInvoice, listCities } from "@/lib/db/queries";
import type { AnalysedInvoice } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Document" };

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Compute an overall audit score 0–100 from the invoice summary. */
function computeAuditScore(invoice: AnalysedInvoice): number {
  const { summary } = invoice;
  const totalItems = invoice.lineItems.length;
  if (totalItems === 0) return 0;

  // Positive variance = over-priced (bad). Each +1% variance deducts 3 pts, capped at 50.
  const varPenalty = summary.variancePct > 0 ? Math.min(50, summary.variancePct * 3) : 0;
  // Unmatched lines can't be audited — deduct up to 25 pts.
  const unmatchedPenalty = Math.min(25, (summary.unmatchedCount / totalItems) * 25);

  return Math.max(0, Math.round(100 - varPenalty - unmatchedPenalty));
}

type RiskLevel = "low" | "moderate" | "elevated";

function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "low";
  if (score >= 55) return "moderate";
  return "elevated";
}

const RISK_CONFIG: Record<RiskLevel, { label: string; icon: React.ElementType; colours: string; dot: string }> = {
  low:      { label: "Low Risk",      icon: ShieldCheck, colours: "border-par/40 bg-par-soft/80 text-par",             dot: "bg-par"     },
  moderate: { label: "Moderate Risk", icon: ShieldAlert, colours: "border-warning/40 bg-warning-soft/80 text-warning",  dot: "bg-warning" },
  elevated: { label: "Elevated Risk", icon: ShieldOff,   colours: "border-over/40 bg-over-soft/80 text-over",           dot: "bg-over"    },
};

const DONUT_R = 48;
const DONUT_CIRC = 2 * Math.PI * DONUT_R; // ≈ 301.6

function DonutGauge({ score, level }: { score: number; level: RiskLevel }) {
  const filled = (score / 100) * DONUT_CIRC;
  const strokeColour =
    level === "low" ? "#22c55e" : level === "moderate" ? "#f59e0b" : "#f97316";

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
      <svg viewBox="0 0 120 120" className="-rotate-90 h-full w-full">
        {/* Background track */}
        <circle
          cx="60" cy="60" r={DONUT_R}
          fill="none"
          stroke="var(--border)"
          strokeWidth="10"
        />
        {/* Foreground arc */}
        <circle
          cx="60" cy="60" r={DONUT_R}
          fill="none"
          stroke={strokeColour}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${DONUT_CIRC}`}
          strokeDashoffset="0"
        />
      </svg>
      {/* Score text centred over the SVG */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold leading-none text-foreground">{score}</span>
        <span className="mt-0.5 text-[11.5px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const [invoice, cities] = await Promise.all([
    getInvoice(user.organisation.id, id),
    listCities(),
  ]);
  if (!invoice) notFound();

  const processing = invoice.status === "extracting" || invoice.status === "queued";
  const rejected = invoice.status === "rejected" || invoice.status === "failed";

  /* Audit score is only meaningful once analysis is complete */
  const score = !processing && !rejected ? computeAuditScore(invoice) : null;
  const risk = score !== null ? riskLevel(score) : null;
  const riskCfg = risk ? RISK_CONFIG[risk] : null;

  const currency = invoice.city?.currency ?? "INR";
  const isGcc = invoice.city?.region === "gcc";

  /* Format helpers */
  const quotedValue =
    invoice.total > 0
      ? formatCurrency(invoice.total, currency, { compact: true, decimals: 0 })
      : "—";
  const potentialSaving =
    invoice.summary?.potentialSaving > 0
      ? formatCurrency(invoice.summary.potentialSaving, currency, { compact: true, decimals: 0 })
      : "—";
  const variancePct =
    invoice.summary?.variancePct != null
      ? `${invoice.summary.variancePct > 0 ? "+" : ""}${invoice.summary.variancePct.toFixed(1)}%`
      : null;

  return (
    <>
      {/* Back link */}
      <div className="mb-5 flex items-center justify-between">
        <Link
          href="/app/invoices"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Link>

        <div className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          <Badge tone="outline" className="capitalize">{invoice.documentType}</Badge>
          <Can permission="invoice.delete">
            <form action={deleteInvoiceAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button
                type="submit"
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                title="Delete this document"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </form>
          </Can>
        </div>
      </div>

      {/* ── Audit Hero Card ── */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-stretch sm:gap-0">

          {/* Left: summary info */}
          <div className="flex flex-1 flex-col gap-5">
            {/* Label row */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium tracking-wide text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" />
                Quotation Audit Summary
              </span>
              {invoice.number !== "—" && (
                <span className="rounded-full border border-border bg-surface-sunken px-2.5 py-0.5 text-[11.5px] font-mono text-muted-foreground">
                  {invoice.number}
                </span>
              )}
            </div>

            {/* Title */}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {invoice.project && invoice.project !== "—"
                  ? invoice.project
                  : invoice.number !== "—"
                    ? invoice.number
                    : invoice.fileName}
              </h1>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <StatBlock
                label="Contractor"
                value={invoice.vendor !== "—" ? invoice.vendor : "—"}
              />
              <StatBlock label="Quoted Value" value={quotedValue} />
              <StatBlock
                label="Potential Savings"
                value={potentialSaving}
                valueClass="text-brand font-semibold"
              />
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              {riskCfg && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold",
                    riskCfg.colours,
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", riskCfg.dot)} />
                  {riskCfg.label}
                </span>
              )}
              {variancePct && (
                <span className="rounded-full border border-border bg-surface-sunken px-3 py-1 text-[12px] text-muted-foreground">
                  Market variance {variancePct}
                </span>
              )}
              <span className="rounded-full border border-border bg-surface-sunken px-3 py-1 text-[12px] text-muted-foreground">
                {invoice.city?.name ?? "—"}
              </span>
              <span className="rounded-full border border-border bg-surface-sunken px-3 py-1 text-[12px] text-muted-foreground">
                {invoice.taxPct}% {isGcc ? "VAT" : "GST"}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="hidden w-px bg-border sm:block sm:mx-6" />

          {/* Right: donut gauge */}
          {score !== null && risk !== null ? (
            <div className="flex shrink-0 flex-col items-center justify-center gap-3 sm:pl-2">
              <DonutGauge score={score} level={risk} />
              <p className="text-[12.5px] font-medium text-muted-foreground">
                Overall Audit Score
              </p>
            </div>
          ) : processing ? (
            <div className="flex shrink-0 flex-col items-center justify-center gap-3 sm:pl-2">
              <div className="relative flex h-36 w-36 items-center justify-center">
                <LoaderCircle className="h-16 w-16 animate-spin text-brand/30" />
                <span className="absolute text-[12px] text-muted-foreground">Analysing</span>
              </div>
              <p className="text-[12.5px] font-medium text-muted-foreground">
                Overall Audit Score
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ── Executive Summary ── */}
      {invoice.extractionNote && (
        <Card className="mb-5">
          <CardHeader>
            {riskCfg && (
              <span
                className={cn(
                  "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold",
                  riskCfg.colours,
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", riskCfg.dot)} />
                {riskCfg.label}
              </span>
            )}
            <CardTitle>Executive Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[13.5px] leading-relaxed text-muted-foreground">
              {invoice.extractionNote}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Body ── */}
      {rejected ? (
        <RejectedPanel invoice={invoice} />
      ) : processing ? (
        <ProcessingPanel />
      ) : (
        <InvoiceReport invoice={invoice} cities={cities} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Sub-components
 * ------------------------------------------------------------------ */

function StatBlock({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-0.5 text-[14px] font-semibold text-foreground", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function RejectedPanel({ invoice }: { invoice: AnalysedInvoice }) {
  return (
    <Card className="border-over/40">
      <CardHeader className="bg-over-soft/50">
        <div className="flex items-start gap-2.5">
          <CircleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-over" />
          <div>
            <CardTitle>Rejected at the quality gate</CardTitle>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {invoice.quality.rejectionReason}
            </p>
          </div>
        </div>
        <Badge tone="par">No extraction quota consumed</Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-[12.5px] font-medium text-foreground">
          Checks run before processing · score {(invoice.quality.score * 100).toFixed(0)}%
        </p>
        <ul className="space-y-2">
          {invoice.quality.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2.5 text-[13px]">
              {check.passed ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-over" />
              )}
              <div>
                <span className="font-medium text-foreground">{check.label}</span>
                <span className="text-muted-foreground"> — {check.detail}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
          <Can permission="invoice.upload">
            <Link href="/app/invoices/new" className={buttonStyles({ size: "sm" })}>
              <Upload className="h-3.5 w-3.5" />
              Upload a replacement
            </Link>
          </Can>
          <Link
            href="/app/invoices"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            Back to documents
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ProcessingPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-sunken">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="animate-scan absolute inset-x-0 top-0 h-0.5 bg-brand" />
        </div>
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin text-brand" />
          Extraction in progress
        </p>
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Line items, quantities and rates are being read from the document, then matched to the
          Schedule of Rates and live market pricing. This usually takes under three minutes.
        </p>
        <Link
          href="/app/invoices"
          className={buttonStyles({ variant: "outline", size: "sm", className: "mt-6" })}
        >
          Back to documents
        </Link>
      </CardContent>
    </Card>
  );
}
