import {
  FileText,
  Gauge,
  Home,
  LayoutGrid,
  MapPin,
  Settings,
  Users,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { getInvoice, REPORTED_INVOICES } from "@/lib/data/invoices";
import { ORGANISATION } from "@/lib/data/org";
import type { VarianceFlag } from "@/lib/types";
import { cn, formatINR, formatNumber } from "@/lib/utils";

/**
 * The product shot in the hero: a scaled-down rendering of the real dashboard.
 *
 * Figures come from the same fixtures and the same variance engine the app
 * serves, so the screenshot cannot show numbers the product would not produce.
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

const NAV = [
  { icon: Home, label: "Dashboard", active: true },
  { icon: LayoutGrid, label: "Projects" },
  { icon: FileText, label: "BOQ" },
  { icon: Gauge, label: "Rate Verification" },
  { icon: FileText, label: "Reports" },
  { icon: Users, label: "Users" },
  { icon: Settings, label: "Settings" },
];

/**
 * Splits recoverable value across three buckets, keyed off the matched SoR
 * code: MAT- prefixed entries are materials, FM- are facilities services, and
 * everything else is construction works.
 */
function overchargeSplit() {
  const buckets = { Materials: 0, Works: 0, Services: 0 };

  for (const invoice of REPORTED_INVOICES) {
    for (const line of invoice.lineItems) {
      if (line.variance.flag !== "over") continue;
      const code = line.sorMatch?.code ?? "";
      if (code.startsWith("MAT")) buckets.Materials += line.variance.varianceAmount;
      else if (code.startsWith("FM")) buckets.Services += line.variance.varianceAmount;
      else buckets.Works += line.variance.varianceAmount;
    }
  }
  return buckets;
}

export function AppWindow() {
  const invoice = getInvoice("inv-0842");
  if (!invoice) return null;

  const rows = invoice.lineItems
    .filter((line) => line.variance.benchmarkBasis !== "none")
    .slice(0, 5);

  const projects = new Set(REPORTED_INVOICES.map((i) => i.project)).size;
  const recoverable = REPORTED_INVOICES.reduce((s, i) => s + i.summary.potentialSaving, 0);
  const linesChecked = REPORTED_INVOICES.reduce((s, i) => s + i.lineItems.length, 0);

  const split = overchargeSplit();
  const total = split.Materials + split.Works + split.Services || 1;
  const segments = [
    { label: "Material overcharge", value: split.Materials, color: "var(--brand)" },
    { label: "Works overcharge", value: split.Works, color: "var(--par)" },
    { label: "Services overcharge", value: split.Services, color: "var(--warning)" },
  ];

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
      <div className="grid grid-cols-[auto_1fr]">
        {/* Sidebar */}
        <aside className="hidden w-44 shrink-0 border-r border-border bg-surface-sunken/40 p-3 sm:block">
          <div className="flex items-center gap-2 px-1.5 py-2">
            <LogoMark className="h-6 w-6" />
            <span className="text-[13px] font-semibold tracking-tight text-foreground">
              Fin<span className="text-brand">Scanix</span>
            </span>
          </div>
          <ul className="mt-3 space-y-0.5">
            {NAV.map((item) => (
              <li key={item.label}>
                <span
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px]",
                    item.active
                      ? "bg-brand-soft font-medium text-brand-soft-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Main */}
        <div className="min-w-0 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[15px] font-semibold tracking-tight text-foreground">Dashboard</p>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-[11.5px] text-muted-foreground">
              <MapPin className="h-3 w-3" />
              {invoice.city.name} · Index {invoice.city.indexFactor.toFixed(2)}
            </span>
          </div>

          {/* Stat cards */}
          <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Stat label="Projects" value={`${projects}`} hint="Active projects" />
            <Stat
              label="Documents scanned"
              value={`${ORGANISATION.subscription.documentsUsed}`}
              hint="This month"
            />
            <Stat
              label="Overcharges found"
              value={formatINR(recoverable, { compact: true })}
              hint="Total"
              tone="over"
            />
            <Stat label="Line items checked" value={`${linesChecked}`} hint="Benchmarked" />
          </div>

          <div className="mt-3 grid gap-2.5 lg:grid-cols-[1.55fr_1fr]">
            {/* Recent verifications */}
            <div className="rounded-xl border border-border bg-surface">
              <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                <p className="text-[12.5px] font-semibold text-foreground">Recent Verifications</p>
                <span className="text-[11px] text-brand">View all</span>
              </div>
              <ul className="divide-y divide-border">
                {rows.map((line) => (
                  <li key={line.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-medium text-foreground">
                        {line.description}
                      </p>
                      <p className="tnum mt-0.5 text-[10.5px] text-muted-foreground">
                        {formatNumber(line.quantity)} {line.unit} · Billed{" "}
                        {formatINR(line.rate, { decimals: 0 })} · Benchmark{" "}
                        {formatINR(line.variance.benchmarkRate, { decimals: 0 })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "tnum shrink-0 text-[11.5px] font-semibold",
                        VALUE[line.variance.flag],
                      )}
                    >
                      {line.variance.variancePct > 0 ? "+" : ""}
                      {line.variance.variancePct.toFixed(1)}%
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-medium whitespace-nowrap",
                        PILL[line.variance.flag],
                      )}
                    >
                      {line.variance.flag === "over"
                        ? "Over-priced"
                        : line.variance.flag === "under"
                          ? "Under-priced"
                          : "At par"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Overcharge summary */}
            <div className="rounded-xl border border-border bg-surface p-3.5">
              <p className="text-[12.5px] font-semibold text-foreground">Overcharge Summary</p>

              <div className="relative mx-auto mt-3 h-32 w-32">
                <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
                  <circle
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke="var(--surface-sunken)"
                    strokeWidth="16"
                  />
                  {segments.map((segment) => {
                    const length = (segment.value / total) * circumference;
                    const el = (
                      <circle
                        key={segment.label}
                        cx="70"
                        cy="70"
                        r={radius}
                        fill="none"
                        stroke={segment.color}
                        strokeWidth="16"
                        strokeDasharray={`${length} ${circumference - length}`}
                        strokeDashoffset={-offset}
                      />
                    );
                    offset += length;
                    return el;
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="tnum text-[15px] font-semibold text-foreground">
                    {formatINR(total, { compact: true })}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Total</p>
                </div>
              </div>

              <ul className="mt-3 space-y-1.5">
                {segments.map((segment) => (
                  <li key={segment.label} className="flex items-center gap-2 text-[10.5px]">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    <span className="flex-1 truncate text-muted-foreground">{segment.label}</span>
                    <span className="tnum font-medium text-foreground">
                      {formatINR(segment.value, { compact: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "over";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <p className="truncate text-[10.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-1 text-lg font-semibold tracking-tight",
          tone === "over" ? "text-over" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
