import { FileText, MapPin, TrendingUp } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import { getInvoice } from "@/lib/data/invoices";
import { FLAG_LABEL } from "@/lib/variance";
import type { VarianceFlag } from "@/lib/types";
import { cn, formatINR, formatNumber } from "@/lib/utils";

/**
 * The hero's product shot.
 *
 * Every figure is produced by the real variance engine from the same fixture
 * the app serves, so the marketing page cannot drift from what the product
 * actually outputs.
 */

const PILL: Record<VarianceFlag, string> = {
  over: "bg-over-soft text-over-foreground",
  par: "bg-par-soft text-par-foreground",
  under: "bg-under-soft text-under-foreground",
};

const VALUE: Record<VarianceFlag, string> = {
  over: "text-over",
  par: "text-par",
  under: "text-under",
};

export function InvoicePreview({ rows = 5 }: { rows?: number }) {
  const invoice = getInvoice("inv-0842");
  if (!invoice) return null;

  const lines = invoice.lineItems
    .filter((line) => line.variance.benchmarkBasis !== "none")
    .slice(0, rows);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-raised">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand px-5 py-4 text-brand-foreground">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <FileText className="h-4.5 w-4.5" />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">{invoice.number}</p>
            <p className="text-[12.5px] opacity-80">{invoice.vendor}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[12.5px] opacity-90">
          <MapPin className="h-3.5 w-3.5" />
          {invoice.city.name} · index {invoice.city.indexFactor.toFixed(2)}
        </div>
      </div>

      {/* Column headings */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-5 py-2.5 sm:grid-cols-[1fr_5.5rem_6rem_6.5rem]">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Line items ({lines.length})
        </p>
        <p className="hidden text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase sm:block">
          Variance
        </p>
        <span className="hidden sm:block" />
        <p className="text-right text-[11px] font-semibold tracking-wider text-muted-foreground uppercase sm:text-center">
          Status
        </p>
      </div>

      {/* Rows */}
      <ul className="divide-y divide-border">
        {lines.map((line) => {
          const { variance } = line;
          const perUnit = variance.variancePerUnit;
          return (
            <li
              key={line.id}
              className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3.5 sm:grid-cols-[1fr_5.5rem_6rem_6.5rem]"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
                    {line.description}
                  </p>
                  <p className="tnum mt-1 text-[11.5px] text-muted-foreground">
                    {formatNumber(line.quantity)} {line.unit} · Billed{" "}
                    {formatINR(line.rate, { decimals: 0 })} · Benchmark{" "}
                    {formatINR(variance.benchmarkRate, { decimals: 0 })}
                  </p>
                </div>
              </div>

              <div className="hidden text-center sm:block">
                <p className={cn("tnum text-[15px] font-semibold", VALUE[variance.flag])}>
                  {variance.variancePct > 0 ? "+" : ""}
                  {variance.variancePct.toFixed(1)}%
                </p>
                <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
                  {formatINR(Math.abs(perUnit), { decimals: 0 })} {perUnit >= 0 ? "over" : "under"}
                </p>
              </div>

              <div className="hidden justify-center sm:flex">
                <Sparkline seed={line.id} flag={variance.flag} />
              </div>

              <div className="flex justify-end sm:justify-center">
                <span
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap",
                    PILL[variance.flag],
                  )}
                >
                  {FLAG_LABEL[variance.flag]}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-border bg-over-soft/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Recoverable on this bill
            </p>
            <p className="tnum text-2xl font-semibold text-over">
              {formatINR(invoice.summary.potentialSaving, { compact: true })}
            </p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning">
            <TrendingUp className="h-4.5 w-4.5" />
          </span>
        </div>

        <div className="flex items-center gap-6 border-l border-border/70 pl-6">
          <Tally value={invoice.summary.overCount} label="Over-priced" tone="over" />
          <Tally value={invoice.summary.parCount} label="At par" tone="par" />
          <Tally value={invoice.summary.underCount} label="Under-priced" tone="under" />
        </div>
      </div>
    </div>
  );
}

function Tally({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: VarianceFlag;
}) {
  return (
    <div className="text-center">
      <p className={cn("tnum text-lg font-semibold", VALUE[tone])}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
