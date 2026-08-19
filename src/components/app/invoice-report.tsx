"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLineCorrectionAction } from "@/lib/invoices/actions";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  Pencil,
  LoaderCircle,
  Store,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead } from "@/components/ui/table";
import { HealthBadge, VarianceBadge, VariancePct } from "@/components/variance-badge";
import { useSession } from "@/components/app/session-context";
import { analyseLines, summarise, VARIANCE_CONFIG } from "@/lib/variance";
import type { AnalysedInvoice, LineItem, VarianceFlag } from "@/lib/types";
import { cn, formatINR, formatNumber, relativeTime } from "@/lib/utils";

const NOW = new Date("2026-08-14T10:00:00+05:30");
const LOW_CONFIDENCE = 0.8;

type FilterKey = "all" | VarianceFlag | "unmatched";

export function InvoiceReport({ invoice }: { invoice: AnalysedInvoice }) {
  const { allows, entitled } = useSession();

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

  return (
    <>
      {/* What the document is, before what the engine made of it */}
      <div className="mb-4 flex flex-wrap items-center gap-x-10 gap-y-3 rounded-xl border border-border bg-surface px-5 py-4">
        <Fact label="Total items" value={String(items.length)} />
        <Fact label="BOQ value" value={formatINR(boqValue, { decimals: 0 })} hint={`incl. ${invoice.taxPct}% tax`} />
        <Fact
          label="Document type"
          value={invoice.documentType === "quotation" ? "Quotation" : "Invoice"}
        />
        <Fact label="Extraction confidence" value={extractionConfidence} />
        {invoice.language && <Fact label="Language" value={invoice.language} />}
        <Fact label="Pages" value={String(invoice.pageCount)} />
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Net billed value" value={formatINR(netValue, { decimals: 0 })} hint={`${items.length} line items`} />
        <SummaryTile
          label="Benchmark value"
          value={formatINR(summary.benchmarkTotal, { decimals: 0 })}
          hint={`${Math.round(VARIANCE_CONFIG.sorWeight * 100)}% SoR · ${Math.round(VARIANCE_CONFIG.marketWeight * 100)}% market`}
        />
        <SummaryTile
          label="Variance"
          value={`${summary.variancePct > 0 ? "+" : ""}${summary.variancePct.toFixed(1)}%`}
          hint={formatINR(summary.totalVariance, { decimals: 0 })}
          tone={summary.variancePct > VARIANCE_CONFIG.parBandPct ? "over" : summary.variancePct < -VARIANCE_CONFIG.parBandPct ? "under" : "par"}
        />
        <SummaryTile
          label="Recoverable"
          value={formatINR(summary.potentialSaving, { decimals: 0 })}
          hint={`${summary.overCount} item${summary.overCount === 1 ? "" : "s"} above benchmark`}
          tone="over"
        />
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

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setFilter(entry.key)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
                filter === entry.key
                  ? "border-brand bg-brand-soft font-medium text-brand-soft-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {entry.label}
              <span className="tnum text-[11.5px] opacity-70">{entry.count}</span>
            </button>
          ))}
        </div>

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
          ) : (
            <Badge tone="outline">Export not permitted for your role</Badge>
          )}
        </div>
      </div>

      {/* Line items */}
      <Card className="mt-4">
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH className="w-8" />
                <TH className="w-10">#</TH>
                <TH>Description</TH>
                <TH className="text-right">Qty</TH>
                <TH>Unit</TH>
                <TH className="text-right">Unit price</TH>
                <TH className="text-right">Line total</TH>
                <TH className="text-right">Calc total</TH>
                <TH className="text-right">Benchmark</TH>
                <TH className="text-right">Variance</TH>
                <TH>Health</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {visible.map((line) => {
                const isOpen = expanded === line.id;
                const isEditing = editing === line.id;
                const unmatched = line.variance.benchmarkBasis === "none";
                const uncertain =
                  Math.min(
                    line.confidence.description,
                    line.confidence.quantity,
                    line.confidence.rate,
                  ) < LOW_CONFIDENCE;

                return (
                  <Fragment key={line.id}>
                    <tr
                      className={cn(
                        "transition-colors hover:bg-muted/50",
                        isOpen && "bg-muted/40",
                      )}
                    >
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
                      <TD className="tnum text-[12.5px] text-muted-foreground">{line.srNo}</TD>
                      <TD className="max-w-md">
                        <p
                          className={cn(
                            "text-[13px] leading-snug text-foreground",
                            isOpen ? "" : "line-clamp-2",
                          )}
                        >
                          {line.description}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {line.sorMatch ? (
                            <span className="text-[11px] text-muted-foreground">
                              {line.sorMatch.code} · match{" "}
                              {(line.sorMatch.matchScore * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              No SoR match
                            </span>
                          )}
                          {line.corrected && <Badge tone="brand">Corrected</Badge>}
                          {uncertain && !line.corrected && (
                            <Badge tone="warning">Low confidence</Badge>
                          )}
                        </div>
                      </TD>
                      <TD className="tnum text-right text-[13px] whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            defaultValue={line.quantity}
                            onBlur={(event) =>
                              applyEdit(line.id, { quantity: Number(event.target.value) })
                            }
                            className="tnum h-8 w-24 rounded border border-brand bg-background px-2 text-right text-[13px]"
                          />
                        ) : (
                          formatNumber(line.quantity)
                        )}
                      </TD>
                      <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                        {line.unit}
                      </TD>
                      <TD
                        className={cn(
                          "tnum text-right text-[13px] whitespace-nowrap",
                          line.confidence.rate < LOW_CONFIDENCE &&
                            !line.corrected &&
                            "decoration-warning underline decoration-wavy underline-offset-4",
                        )}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            defaultValue={line.rate}
                            onBlur={(event) =>
                              applyEdit(line.id, { rate: Number(event.target.value) })
                            }
                            className="tnum h-8 w-28 rounded border border-brand bg-background px-2 text-right text-[13px]"
                          />
                        ) : (
                          formatINR(line.rate, { decimals: 2 })
                        )}
                      </TD>
                      <TD className="tnum text-right text-[13px] whitespace-nowrap">
                        {formatINR(line.printedAmount ?? line.amount, { decimals: 2 })}
                      </TD>
                      <TD
                        className={cn(
                          "tnum text-right text-[13px] whitespace-nowrap",
                          // Flagged only where the document's own total disagrees
                          // with quantity x unit price, which is the figure a
                          // reviewer needs pointed out rather than reconciled for
                          // them. The footer says why.
                          line.printedAmount !== undefined
                            ? "font-medium text-over"
                            : "text-muted-foreground",
                        )}
                        title={
                          line.printedAmount !== undefined
                            ? "Quantity x unit price. Differs from the printed line total — see the note below the table."
                            : undefined
                        }
                      >
                        {formatINR(line.amount, { decimals: 2 })}
                      </TD>
                      <TD className="tnum text-right text-[13px] whitespace-nowrap text-muted-foreground">
                        {unmatched
                          ? "—"
                          : formatINR(line.variance.benchmarkRate * line.quantity, { decimals: 2 })}
                      </TD>
                      <TD className="text-right whitespace-nowrap">
                        {unmatched ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <VariancePct
                              value={line.variance.variancePct}
                              flag={line.variance.flag}
                              className="text-[13px]"
                            />
                            <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
                              {formatINR(line.variance.varianceAmount, { compact: true })}
                            </p>
                          </>
                        )}
                      </TD>
                      <TD>
                        <HealthBadge flag={line.variance.flag} unmatched={unmatched} />
                      </TD>
                      <TD>
                        {allows("invoice.correct") && (
                          <button
                            type="button"
                            onClick={() => setEditing(isEditing ? null : line.id)}
                            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={isEditing ? "Finish editing" : "Correct this line"}
                          >
                            {isEditing ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Pencil className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </TD>
                    </tr>

                    {isOpen && (
                      <tr className="bg-surface-sunken/40">
                        <td colSpan={12} className="px-5 py-5">
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
            No line items in this view.
          </p>
        )}

        {/* How the figures above were obtained, and anything that would
            otherwise read as an extraction error. */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-2 border-t border-border px-5 py-3">
          <span className="text-[12px] text-muted-foreground">
            Extraction confidence{" "}
            <span
              className={cn(
                "font-medium",
                extractionConfidence === "High"
                  ? "text-par"
                  : extractionConfidence === "Medium"
                    ? "text-warning"
                    : "text-over",
              )}
            >
              {extractionConfidence}
            </span>
          </span>
          {invoice.language && (
            <span className="text-[12px] text-muted-foreground">
              Language <span className="font-medium text-foreground">{invoice.language}</span>
            </span>
          )}
          <span className="text-[12px] text-muted-foreground">
            Source{" "}
            <span className="font-medium text-foreground">
              {invoice.quality.checks.some((c) => c.id === "ocr" && c.passed)
                ? "OCR (vision model)"
                : "Embedded text layer"}
            </span>
          </span>
          {restated > 0 && (
            <span className="text-[12px] text-muted-foreground">
              Restated lines <span className="font-medium text-over">{restated}</span>
            </span>
          )}
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

      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        Benchmark = {Math.round(VARIANCE_CONFIG.sorWeight * 100)}% location-adjusted SoR rate +{" "}
        {Math.round(VARIANCE_CONFIG.marketWeight * 100)}% median market quote, where both exist.
        Items within ±{VARIANCE_CONFIG.parBandPct}% of benchmark are reported at par. The engine
        is deterministic: re-running this document reproduces this report exactly.
        {" "}Line total is the figure printed on the document; calc total is quantity x unit
        price. Where the two differ the calc total is marked, and benchmarking uses the pre-tax
        unit price either way.
      </p>
    </>
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
                Benchmark = {Math.round(VARIANCE_CONFIG.sorWeight * 100)}% ×{" "}
                {formatINR(line.sorMatch!.adjustedRate)} (SoR){" + "}
                {Math.round(VARIANCE_CONFIG.marketWeight * 100)}% ×{" "}
                {formatINR(variance.marketMedian ?? 0)} (market median) ={" "}
                <span className="font-medium text-foreground">
                  {formatINR(variance.benchmarkRate)}
                </span>
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
