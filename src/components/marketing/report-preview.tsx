import { FileText, MapPin } from "lucide-react";
import { getInvoice } from "@/lib/data/invoices";
import { formatINR } from "@/lib/utils";
import { VarianceBadge, VariancePct } from "@/components/variance-badge";

/**
 * The hero visual. Deliberately rendered from the same fixtures and the same
 * variance engine the app uses, so the marketing page can never drift from what
 * the product actually outputs.
 */
export function ReportPreview() {
  const invoice = getInvoice("inv-0842");
  if (!invoice) return null;

  const lines = invoice.lineItems.filter((l) => l.variance.benchmarkBasis !== "none").slice(0, 5);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-raised">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-sunken/60 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">{invoice.number}</p>
            <p className="text-[11.5px] text-muted-foreground">{invoice.vendor}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-[11.5px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          {invoice.city.name} · index {invoice.city.indexFactor.toFixed(2)}
        </div>
      </div>

      <div className="divide-y divide-border">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {line.description}
              </p>
              <p className="tnum mt-0.5 text-[11.5px] text-muted-foreground">
                {line.quantity.toLocaleString("en-IN")} {line.unit} · billed{" "}
                {formatINR(line.rate, { decimals: 0 })} · benchmark{" "}
                {formatINR(line.variance.benchmarkRate, { decimals: 0 })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <VariancePct
                value={line.variance.variancePct}
                flag={line.variance.flag}
                className="text-[13px]"
              />
              <VarianceBadge flag={line.variance.flag} showIcon={false} className="hidden sm:inline-flex" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-over-soft/50 px-5 py-3.5">
        <div>
          <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
            Recoverable on this bill
          </p>
          <p className="tnum text-lg font-semibold text-over">
            {formatINR(invoice.summary.potentialSaving, { compact: true })}
          </p>
        </div>
        <div className="flex items-center gap-4 text-[11.5px] text-muted-foreground">
          <span className="tnum">
            <span className="font-semibold text-over">{invoice.summary.overCount}</span> over
          </span>
          <span className="tnum">
            <span className="font-semibold text-par">{invoice.summary.parCount}</span> par
          </span>
          <span className="tnum">
            <span className="font-semibold text-under">{invoice.summary.underCount}</span> under
          </span>
        </div>
      </div>
    </div>
  );
}
