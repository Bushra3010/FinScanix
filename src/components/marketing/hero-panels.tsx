import { Fragment } from "react";
import {
  ArrowRight,
  Boxes,
  Brain,
  Building2,
  Clock,
  Database,
  FileCheck,
  FileText,
  Handshake,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { CITIES, SOR_CATALOG } from "@/lib/data/reference";
import { REPORTED_INVOICES } from "@/lib/data/invoices";
import { MONTHLY_TREND } from "@/lib/data/org";
import { VARIANCE_CONFIG } from "@/lib/variance";
import { cn, formatINR } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Process rail — the four stages of the pipeline, under the hero copy.
 * ------------------------------------------------------------------ */

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Upload, title: "Upload", body: "Invoices / Quotations" },
  { icon: Brain, title: "AI Analysis", body: "Line-item audit, benchmarking & variance check" },
  { icon: ShieldCheck, title: "Risk Detection", body: "Flags overpricing, scope gaps & policy issues" },
  { icon: TrendingUp, title: "Actionable Insights", body: "Clear results to negotiate & save instantly" },
];

export function ProcessRail() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:items-stretch sm:gap-0">
      {STEPS.map((step, i) => (
        <Fragment key={step.title}>
          <div className="flex-1 rounded-xl border border-border bg-surface px-3 py-4 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <step.icon className="h-5 w-5" />
            </span>
            <p className="mt-2.5 text-[12.5px] font-semibold text-foreground">{step.title}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{step.body}</p>
          </div>
          {i < STEPS.length - 1 && (
            <div className="hidden shrink-0 items-center self-center px-1.5 sm:flex" aria-hidden>
              <span className="w-3 border-t border-dashed border-border-strong" />
              <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stat cards
 * ------------------------------------------------------------------ */

export function HeroStats() {
  const stats: { icon: LucideIcon; value: string; label: string; tone: string }[] = [
    {
      icon: Boxes,
      value: `${SOR_CATALOG.length}+`,
      label: "SoR items seeded",
      tone: "bg-brand-soft text-brand",
    },
    {
      icon: Building2,
      value: `${CITIES.length}`,
      label: "City cost indices",
      tone: "bg-par-soft text-par",
    },
    {
      icon: Target,
      value: `±${VARIANCE_CONFIG.parBandPct}%`,
      label: "Par band accuracy",
      tone: "bg-under-soft text-under",
    },
    {
      icon: FileText,
      value: "4",
      label: "Pricing sources",
      tone: "bg-warning-soft text-warning",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-border bg-surface p-4">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg",
              stat.tone,
            )}
          >
            <stat.icon className="h-4.5 w-4.5" />
          </span>
          <p className="tnum mt-3 text-2xl font-semibold tracking-tight text-foreground">
            {stat.value}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * AI variance engine
 * ------------------------------------------------------------------ */

const ENGINE: { icon: LucideIcon; title: string; body: string; tone: string }[] = [
  { icon: FileText, title: "Input", body: "Invoice / Quotation", tone: "bg-brand-soft text-brand" },
  { icon: Brain, title: "AI Engine", body: "Parse, analyse & benchmark", tone: "bg-brand-soft text-brand" },
  { icon: ShieldCheck, title: "Checks", body: "Price, scope, policy, SoR", tone: "bg-par-soft text-par" },
  { icon: FileCheck, title: "Output", body: "Variance report & savings", tone: "bg-brand-soft text-brand" },
];

export function VarianceEnginePanel() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        AI variance engine{" "}
        <span className="font-normal normal-case opacity-80">(How it works)</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:items-stretch sm:gap-0">
        {ENGINE.map((step, i) => (
          <Fragment key={step.title}>
            <div className="flex-1 rounded-xl border border-border bg-background px-2.5 py-3 text-center">
              <span
                className={cn(
                  "mx-auto flex h-9 w-9 items-center justify-center rounded-lg",
                  step.tone,
                )}
              >
                <step.icon className="h-4.5 w-4.5" />
              </span>
              <p className="mt-2 text-[12px] font-semibold text-foreground">{step.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                {step.body}
              </p>
            </div>
            {i < ENGINE.length - 1 && (
              <div className="hidden shrink-0 items-center self-center px-1 sm:flex" aria-hidden>
                <span className="w-2.5 border-t border-dashed border-border-strong" />
                <ArrowRight className="h-3 w-3 text-muted-foreground/60" />
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Live savings impact
 * ------------------------------------------------------------------ */

export function SavingsImpactPanel() {
  // Real figure from the variance engine across the demo dataset, not a
  // decorative number.
  const identified = REPORTED_INVOICES.reduce(
    (sum, invoice) => sum + invoice.summary.potentialSaving,
    0,
  );

  const series = MONTHLY_TREND.map((m) => m.savings);
  const width = 260;
  const height = 96;
  const pad = 6;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = (width - pad * 2) / (series.length - 1);

  const points = series.map((v, i) => ({
    x: pad + i * step,
    y: pad + (1 - (v - min) / span) * (height - pad * 2 - 10),
  }));

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;
  const last = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Live savings impact
        </p>
        <span className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
          This month
        </span>
      </div>

      <p className="tnum mt-3 text-2xl font-semibold tracking-tight text-foreground">
        {formatINR(identified, { compact: true })}
      </p>
      <p className="text-[12px] text-muted-foreground">Potential savings identified</p>

      <div className="relative mt-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-24 w-full" role="img" aria-label="Savings identified by month">
          <defs>
            <linearGradient id="fs-savings" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#fs-savings)" />
          <path
            d={line}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={last.x} cy={last.y} r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" />
        </svg>
        <span className="absolute -top-1 right-0 rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-brand-foreground">
          {formatINR(identified, { compact: true })}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Trust bar
 * ------------------------------------------------------------------ */

const TRUST: { icon: LucideIcon; label: string }[] = [
  { icon: Database, label: "Data-driven decisions" },
  { icon: ShieldCheck, label: "Reduce overpayments" },
  { icon: Handshake, label: "Stronger vendor negotiations" },
  { icon: FileCheck, label: "Policy & audit compliance" },
  { icon: Clock, label: "Real-time savings" },
];

export function TrustBar() {
  return (
    <div className="border-t border-border pt-6">
      <p className="text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Trusted by procurement &amp; finance teams
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {TRUST.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <item.icon className="h-4.5 w-4.5 text-brand" />
            <span className="max-w-32 text-[12.5px] leading-snug text-muted-foreground">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
