import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Database, FileText, Gauge, MapPin, ShieldCheck } from "lucide-react";
import { CITIES, SOR_CATALOG } from "@/lib/data/reference";
import { VARIANCE_CONFIG } from "@/lib/variance";

export const metadata: Metadata = {
  title: "Resources",
  description:
    "How FinScanix benchmarks rates: the Schedule of Rates baseline, city cost indices, market pricing sources and the variance method.",
};

const resources = [
  {
    icon: FileText,
    title: "Worked example",
    body: "A full variance report on a real RA bill — every line with its SoR reference, city index, market quotes and verdict.",
    href: "/app/invoices/inv-0842",
    cta: "Open the sample report",
  },
  {
    icon: Database,
    title: "Rate baseline",
    body: `Seeded from CPWD DSR and State PWD schedules — ${SOR_CATALOG.length} items across civil, E&M and facilities work, versioned by effective date.`,
    href: "/#features",
    cta: "How matching works",
  },
  {
    icon: MapPin,
    title: "City cost indices",
    body: `${CITIES.length} cities with CPWD-style factors, Delhi at 1.00 — Mumbai 1.18, Pune 1.11, Bengaluru 1.09, Jaipur 0.96.`,
    href: "/#features",
    cta: "See what it checks",
  },
  {
    icon: Gauge,
    title: "Variance method",
    body: `Benchmark = median live market price, location-adjusted, cross-checked against the Schedule of Rates where it matches. Items within ±${VARIANCE_CONFIG.parBandPct}% are at par.`,
    href: "/#features",
    cta: "Read the method",
  },
  {
    icon: ShieldCheck,
    title: "Security & data handling",
    body: "Tenant isolation, encryption, role-based access and granular deletion — what we keep and for how long.",
    href: "/security",
    cta: "Security overview",
  },
];

export default function ResourcesPage() {
  return (
    <div className="px-5 py-16 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground">
          Resources
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
          How the benchmark is built, where the numbers come from, and what a finished
          variance report actually looks like.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {resources.map((item) => (
            <div
              key={item.title}
              className="flex flex-col rounded-xl border border-border bg-surface p-6"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <item.icon className="h-4.5 w-4.5" />
              </span>
              <h2 className="mt-4 text-[15px] font-semibold text-foreground">{item.title}</h2>
              <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">
                {item.body}
              </p>
              <Link
                href={item.href}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline"
              >
                {item.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-[12.5px] leading-relaxed text-muted-foreground">
          Rate figures shown in the demo workspace are illustrative and structured on the
          CPWD DSR format. Licensed rate books are loaded per deployment.
        </p>
      </div>
    </div>
  );
}
