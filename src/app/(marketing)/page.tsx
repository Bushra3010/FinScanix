import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Clock,
  Database,
  FileSpreadsheet,
  FileText,
  Gauge,
  HardHat,
  Lock,
  MapPin,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ReportPreview } from "@/components/marketing/report-preview";
import { CITIES, SOR_CATALOG } from "@/lib/data/reference";
import { VARIANCE_CONFIG } from "@/lib/variance";

const steps = [
  {
    icon: FileText,
    title: "Upload the bill",
    body: "Drop in a vendor invoice or quotation as PDF or a phone photo. Bulk upload a whole month at once.",
  },
  {
    icon: ShieldCheck,
    title: "Quality gate",
    body: "Blurred scans, cropped pages and files that aren't business documents are rejected up front — with a reason, and without spending your quota.",
  },
  {
    icon: ScanLine,
    title: "Extract line items",
    body: "Descriptions, quantities, units, rates, amounts and totals are read out with per-field confidence. Anything uncertain is flagged for a quick correction.",
  },
  {
    icon: Search,
    title: "Benchmark twice",
    body: "Every line is matched to a CPWD/State PWD Schedule of Rates entry, adjusted by your city's cost index, and cross-checked against live market prices.",
  },
  {
    icon: TrendingUp,
    title: "Get the variance report",
    body: "Each item lands as over-priced, under-priced or at par, with the evidence attached and a roll-up of what's recoverable. Export to PDF or Excel.",
  },
];

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
    title: "Hours per bill",
    body: "A reviewer types line items off a PDF, then opens a rate book, then opens a browser, then repeats — for every single item.",
  },
  {
    icon: Users,
    title: "No two reviewers agree",
    body: "One estimator accepts a rate another would query. There is no shared definition of what 'fair' means for a given item in a given city.",
  },
  {
    icon: HardHat,
    title: "Nothing to show for it",
    body: "When a rate is challenged, the working is in someone's head or a spreadsheet nobody kept. There is no evidence trail to hand an auditor.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto w-full max-w-7xl px-5 pt-16 pb-20 lg:px-8 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="animate-fade-up">
              <Badge tone="brand" className="mb-5">
                <Sparkles className="h-3 w-3" />
                Built for construction & facilities procurement
              </Badge>

              {/* Two sentences, each kept on its own line at every breakpoint. */}
              <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-[3.4rem]">
                <span className="block">Audit Every Invoice &amp; Quotation.</span>
                <span className="block text-brand">Control Every Cost.</span>
              </h1>

              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-base">
                FinScanix is an AI-powered procurement intelligence that analyzes vendor
                invoices and quotations, benchmarks line items against government Schedule
                of Rates and live local market pricing and flags overcharges to drive
                data-driven decision making, scope validation, risk mitigation and cost
                savings — before you approve.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/register" className={buttonStyles({ size: "lg" })}>
                  Start free trial
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/app/invoices/inv-0842"
                  className={buttonStyles({ variant: "outline", size: "lg" })}
                >
                  See a sample report
                </Link>
              </div>

              <p className="mt-4 text-[13px] text-muted-foreground">
                14-day trial · No card required · Cancel anytime
              </p>

              <dl className="mt-10 grid max-w-lg grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-8 sm:grid-cols-4">
                <Stat value={`${SOR_CATALOG.length}+`} label="SoR items seeded" />
                <Stat value={`${CITIES.length}`} label="City cost indices" />
                <Stat value={`±${VARIANCE_CONFIG.parBandPct}%`} label="Par band" />
                <Stat value="4" label="Pricing sources" />
              </dl>
            </div>

            <div className="animate-fade-up lg:pl-4">
              <ReportPreview />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Live output from the variance engine on a sample RA bill.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">Benchmarked against</span>
            <span>CPWD DSR 2023</span>
            <span className="hidden text-border-strong sm:inline">•</span>
            <span>State PWD schedules</span>
            <span className="hidden text-border-strong sm:inline">•</span>
            <span>IndiaMART</span>
            <span className="hidden text-border-strong sm:inline">•</span>
            <span>Moglix</span>
            <span className="hidden text-border-strong sm:inline">•</span>
            <span>TradeIndia</span>
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
              Rate verification is still done by hand, one line at a time.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Every organisation procuring construction materials and services receives more
              bills than it can properly check. So most of them get a cursory look, and the
              overcharges that matter hide in the middle of a 60-line BOQ.
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
                <h3 className="mt-4 text-[15px] font-semibold text-foreground">{point.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-[13px] font-semibold tracking-wide text-brand uppercase">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground">
              Upload to defensible verdict in one pass.
            </h2>
          </div>

          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-2 lg:grid-cols-5">
            {steps.map((step, i) => (
              <li key={step.title} className="flex flex-col bg-surface p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                    <step.icon className="h-4.5 w-4.5" />
                  </div>
                  <span className="tnum text-xs font-semibold text-muted-foreground">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 text-[14.5px] font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Variance band explainer */}
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="text-[13px] font-semibold tracking-wide text-brand uppercase">
                The verdict
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance text-foreground">
                One benchmark, built from two independent sources.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                A government rate book alone lags the market. A market price alone has no
                standing in an audit. FinScanix blends both — weighted{" "}
                {Math.round(VARIANCE_CONFIG.sorWeight * 100)}% to the location-adjusted SoR
                rate and {Math.round(VARIANCE_CONFIG.marketWeight * 100)}% to the median live
                quote — then judges the billed rate against that blend.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  "Items within ±7% are at par — the band absorbs brand, batch and freight differences.",
                  "Both source rates, the city index applied and every quote used stay attached to the line.",
                  "Lines with no SoR match and no market quote are reported as unmatched, never guessed.",
                ].map((point) => (
                  <li key={point} className="flex gap-2.5 text-[13.5px] text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
              <p className="text-[13px] font-medium text-foreground">
                Variance against benchmark
              </p>

              <div className="mt-6">
                <div className="flex h-11 w-full overflow-hidden rounded-lg border border-border">
                  <div className="flex flex-[3] items-center justify-center bg-under-soft text-[12.5px] font-medium text-under-foreground">
                    Under-priced
                  </div>
                  <div className="flex flex-[2] items-center justify-center border-x border-border bg-par-soft text-[12.5px] font-medium text-par-foreground">
                    At par
                  </div>
                  <div className="flex flex-[3] items-center justify-center bg-over-soft text-[12.5px] font-medium text-over-foreground">
                    Over-priced
                  </div>
                </div>
                <div className="tnum mt-2 flex justify-between text-[11.5px] text-muted-foreground">
                  <span>−25%</span>
                  <span>−7%</span>
                  <span>+7%</span>
                  <span>+25%</span>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <ExampleRow
                  label="Vitrified tile flooring 600×600"
                  detail="Billed ₹1,690 · benchmark ₹1,412"
                  pct="+19.7%"
                  tone="over"
                />
                <ExampleRow
                  label="Interior acrylic emulsion, 2 coats"
                  detail="Billed ₹151 · benchmark ₹147"
                  pct="+2.7%"
                  tone="par"
                />
                <ExampleRow
                  label="Cement plaster 12 mm, CM 1:6"
                  detail="Billed ₹225 · benchmark ₹252"
                  pct="−10.9%"
                  tone="under"
                />
              </div>
            </div>
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
                <Link href="/register" className={buttonStyles({ size: "lg" })}>
                  Start free trial
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="tnum text-2xl font-semibold tracking-tight text-foreground">{value}</dd>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{label}</p>
    </div>
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
