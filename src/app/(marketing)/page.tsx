import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CirclePlay,
  Clock,
  Database,
  Equal,
  FileSpreadsheet,
  Gauge,
  HardHat,
  Lock,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { HeroIllustration } from "@/components/marketing/hero-illustration";
import { getInvoice } from "@/lib/data/invoices";
import { cn, formatINR } from "@/lib/utils";

/** The three assurances beside the hero CTAs. */
const heroChips: { icon: LucideIcon; title: string; body: string; tone: string }[] = [
  { icon: ShieldCheck, title: "Audit-ready", body: "evidence", tone: "text-brand" },
  { icon: Zap, title: "Live pricing", body: "updates", tone: "text-par" },
  { icon: Target, title: "Benchmark", body: "accuracy", tone: "text-under" },
];

/** Where the benchmark comes from — shown in place of customer logos. */
const sources: { name: string; kind: string }[] = [
  { name: "CPWD DSR", kind: "Government rate book" },
  { name: "State PWD", kind: "State schedules" },
  { name: "IndiaMART", kind: "B2B marketplace" },
  { name: "Moglix", kind: "B2B marketplace" },
  { name: "TradeIndia", kind: "B2B marketplace" },
];

/** Sample invoice the hero figures are drawn from. */
const sample = getInvoice("inv-0842");

const features = [
  {
    icon: Database,
    title: "Government SoR baseline",
    body: "Seeded with CPWD DSR and State PWD schedules, versioned by effective date. Every verdict traces back to a rate code you can cite in an audit file.",
  },
  {
    icon: MapPin,
    title: "Location-aware pricing",
    body: "Base rates are adjusted by city cost index — Mumbai at 1.18 is not Jaipur at 0.96 — and market quotes are filtered to the project's city or PIN code.",
  },
  {
    icon: RefreshCw,
    title: "Live market cross-check",
    body: "Prices pulled from B2B and e-commerce sources with seller, platform and fetch timestamp on every quote, refreshed on a schedule so nothing goes stale.",
  },
  {
    icon: Gauge,
    title: "Confidence you can see",
    body: "OCR confidence per field, SoR match score per line, and a verdict confidence that tells you how much weight a flag deserves.",
  },
  {
    icon: FileSpreadsheet,
    title: "Audit-ready exports",
    body: "Deterministic engine: the same document always produces the same report. Export to PDF or Excel with the full evidence trail intact.",
  },
  {
    icon: Bot,
    title: "Domain-restricted assistant",
    body: "An assistant that answers construction, FM and engineering questions — and politely declines everything else, by design.",
  },
];

const painPoints = [
  {
    icon: Clock,
    title: "Hours lost per bill",
    body: "Verifying a single item means jumping between PDFs, spreadsheets and browsers line by line. It's an exhausting, repetitive workflow that burns precious time.",
  },
  {
    icon: Users,
    title: "Subjective approvals create compliance risks",
    body: "Different team members apply different rules when evaluating quotes and rates. Without standardised data, your organisation loses control over market fairness and price accuracy.",
  },
  {
    icon: HardHat,
    title: "No clear trail of evidence",
    body: "Manual reviews leave behind scattered notes and untracked emails. When auditors or stakeholders ask for justification, there is no centralised record to prove how a decision was made.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-swoosh pointer-events-none absolute inset-0" aria-hidden />

        <div className="relative mx-auto w-full max-w-7xl px-5 pt-14 pb-14 lg:px-8">
          <div className="grid items-start gap-12 lg:grid-cols-[0.92fr_1.22fr] lg:gap-10">
            {/* Left column */}
            <div className="animate-fade-up">
              <span className="inline-flex items-center gap-2.5 rounded-full border border-brand/20 bg-brand-soft px-4 py-2 text-[13.5px] font-semibold text-brand-soft-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                AI-Powered Procurement Intelligence
              </span>

              <h1 className="mt-7 text-[3rem] leading-[1.02] font-bold tracking-[-0.035em] text-foreground sm:text-[3.6rem]">
                <span className="block">Audit Every Invoice &amp; Quotation.</span>
                <span className="block text-brand">Control Every Cost.</span>
              </h1>

              <p className="mt-6 max-w-xl text-[18.5px] leading-[1.62] text-foreground/75">
                FinScanix is an AI-powered procurement intelligence that analyzes vendor invoices
                and quotations, benchmarks line items against government Schedule of Rates and live
                local market pricing and flags overcharges to drive data-driven decision making,
                scope validation, risk mitigation and cost savings — before you approve.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className={buttonStyles({
                    size: "lg",
                    className:
                      "h-12 rounded-full px-7 bg-gradient-to-r from-teal-500 to-cyan-400 hover:from-teal-400 hover:to-cyan-300 border-0 text-white shadow-lg",
                  })}
                >
                  Upload Your First Quotation
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/#features"
                  className={buttonStyles({
                    variant: "outline",
                    size: "lg",
                    className: "h-12 rounded-xl px-6",
                  })}
                >
                  <CirclePlay className="h-4.5 w-4.5 text-brand" />
                  See what it checks
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
                {heroChips.map((chip) => (
                  <div key={chip.title} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface shadow-card",
                        chip.tone,
                      )}
                    >
                      <chip.icon className="h-5 w-5" />
                    </span>
                    <span className="text-[13.5px] leading-tight">
                      <span className="block font-semibold text-foreground">{chip.title}</span>
                      <span className="block text-muted-foreground">{chip.body}</span>
                    </span>
                  </div>
                ))}
              </div>

              <HeroIllustration className="mt-10 max-w-lg" />
            </div>

            {/* Right column */}
            <div className="animate-fade-up">
              {/*
                Muted and inline are what make autoplay actually run: a browser
                blocks an unmuted video from starting on its own, and iOS opens
                a fullscreen player without playsInline. The frame matches the
                product shot it replaces so the hero's proportions are unchanged.
              */}
              <video
                className="w-full rounded-2xl border border-border bg-surface shadow-pop"
                src="/hero.mp4"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label="FinScanix reviewing a vendor quotation"
              />

              {/* Figures lifted out of the window, as in the design. */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card">
                  <p className="text-[12.5px] text-muted-foreground">Recoverable on this bill</p>
                  <p className="tnum text-xl font-semibold text-over">
                    {sample ? formatINR(sample.summary.potentialSaving, { compact: true }) : "—"}
                  </p>
                </div>

                {sample && (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Tally
                      count={sample.summary.overCount}
                      label="Over-priced"
                      tone="over"
                      icon={ArrowUp}
                    />
                    <Tally count={sample.summary.parCount} label="At par" tone="par" icon={Equal} />
                    <Tally
                      count={sample.summary.underCount}
                      label="Under-priced"
                      tone="under"
                      icon={ArrowDown}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[13px] font-semibold tracking-wide text-brand uppercase">
              The problem
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground">
              Unverified rates and scope quietly drain your budget.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Eyeballing quotes and scope changes creates expensive blind spots. Rushed
              manual reviews allow hidden markups and unbudgeted work to pass through
              unchecked, turning small oversight into compounding budget leaks.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {painPoints.map((point) => (
              <div
                key={point.title}
                className="rounded-xl border border-border bg-surface p-6 shadow-card"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-over-soft text-over">
                  <point.icon className="h-4.5 w-4.5" />
                </div>
                {/* Two lines are reserved so the bodies stay on a shared
                    baseline: the titles differ enough in length that one wraps
                    at tablet widths and the others do not. */}
                <h3 className="mt-4 min-h-[2.875rem] text-[15px] font-semibold text-foreground">
                  {point.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[13px] font-semibold tracking-wide text-brand uppercase">
              Capabilities
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground">
              Everything an estimator and an auditor each need.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-6 transition-colors hover:border-border-strong"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  <feature.icon className="h-4.5 w-4.5" />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-par-soft text-par">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight text-balance text-foreground">
                Your commercial data stays yours.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                Vendor rates are among the most sensitive numbers a business holds. FinScanix
                is multi-tenant with strict isolation, encrypts data in transit and at rest,
                and deletes exactly what you ask it to delete — one document, never a
                cascade.
              </p>
              <Link
                href="/security"
                className={buttonStyles({ variant: "outline", className: "mt-6" })}
              >
                Read the security overview
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "Tenant isolation", body: "Every query is scoped to your organisation. No shared document storage." },
                { title: "Encryption", body: "TLS in transit, encryption at rest for documents and extracted data." },
                { title: "Granular deletion", body: "Deleting one invoice removes only its records and artifacts." },
                { title: "Role-based access", body: "Owner, admin, estimator, auditor and viewer roles enforced server-side." },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-surface p-5">
                  <p className="text-[14px] font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/*
        Provenance, kept to the end: the claim only means something once the
        reader has seen what is being benchmarked and how. Where customer logos
        would normally sit, this names the rate sources the product actually
        reads — the stronger claim for this product, and an honest one while
        there are no named customers who have agreed to be listed.
      */}
      <section className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-7xl px-5 py-9 lg:px-8">
          <p className="text-center text-[13.5px] text-muted-foreground">
            Benchmarked against official rate books and live market sources
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
            {sources.map((source) => (
              <div key={source.name} className="text-center">
                <p className="text-[15px] font-semibold tracking-tight text-foreground/75">
                  {source.name}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{source.kind}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-background px-6 py-14 text-center sm:px-12">
            <div className="surface-grid pointer-events-none absolute inset-0 opacity-70" aria-hidden />
            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground">
                Put a number on what you are overpaying.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted-foreground">
                Upload one bill and see the variance report in under three minutes. No card
                required for the trial.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/register"
                  className={buttonStyles({
                    size: "lg",
                    className:
                      "rounded-full px-7 bg-gradient-to-r from-teal-500 to-cyan-400 hover:from-teal-400 hover:to-cyan-300 border-0 text-white shadow-lg",
                  })}
                >
                  Upload Your First Quotation
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/pricing" className={buttonStyles({ variant: "outline", size: "lg" })}>
                  Compare plans
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Tally({
  count,
  label,
  tone,
  icon: Icon,
}: {
  count: number;
  label: string;
  tone: "over" | "par" | "under";
  icon: LucideIcon;
}) {
  const styles = {
    over: "border-over/25 bg-over-soft/50 text-over",
    par: "border-par/25 bg-par-soft/50 text-par",
    under: "border-under/25 bg-under-soft/50 text-under",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border bg-surface px-3.5 py-2.5 shadow-card",
        styles,
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="tnum text-[13.5px] font-semibold">{count}</span>
      <span className="text-[13px] text-foreground">{label}</span>
    </span>
  );
}

function ExampleRow({
  label,
  detail,
  pct,
  tone,
}: {
  label: string;
  detail: string;
  pct: string;
  tone: "over" | "under" | "par";
}) {
  const toneClass =
    tone === "over" ? "text-over" : tone === "under" ? "text-under" : "text-par";
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-foreground">{label}</p>
        <p className="tnum mt-0.5 text-[11.5px] text-muted-foreground">{detail}</p>
      </div>
      <span className={`tnum text-[13px] font-semibold ${toneClass}`}>{pct}</span>
    </div>
  );
}
