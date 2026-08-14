import type { Metadata } from "next";
import { PricingTables } from "@/components/marketing/pricing-tables";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "FinScanix subscription tiers — Starter, Professional and Enterprise. Document quotas, seats and capabilities per plan.",
};

const faqs = [
  {
    q: "What counts as a document?",
    a: "One uploaded invoice or quotation, however many pages it has. Files rejected at the quality gate do not count — if a scan is too blurred to extract, you are not charged for it.",
  },
  {
    q: "What happens when I hit my monthly quota?",
    a: "Uploads are blocked until the next cycle or an upgrade, and you get a warning at 80% and 95%. Quotas are enforced on the server, so the limit holds regardless of what the interface shows.",
  },
  {
    q: "Which Schedule of Rates books are included?",
    a: "CPWD DSR (civil and E&M) and the State PWD schedules for the states you operate in, versioned by effective date. Additional state books can be seeded on request.",
  },
  {
    q: "Can I load our own negotiated rate card?",
    a: "Yes — from Professional upwards, admins can bulk upload rates as CSV or Excel and have them take priority over the public SoR baseline for matching.",
  },
  {
    q: "How is market pricing sourced?",
    a: "Through a search API across B2B and e-commerce platforms, filtered to the project city or PIN code. Every quote keeps its seller, platform and fetch timestamp so a reviewer can judge it.",
  },
  {
    q: "Can we switch or cancel?",
    a: "Any time. Upgrades apply immediately and are pro-rated; downgrades take effect at the end of the current cycle, at which point gated capabilities are restricted straight away.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-16 lg:px-8 lg:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground">
          Priced by the volume you actually audit.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          Every plan includes the full verification pipeline — SoR matching, live market
          pricing and variance reporting. Higher tiers add seats, volume, exports and
          automation.
        </p>
      </div>

      <PricingTables />

      <div className="mt-20">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Frequently asked
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {faqs.map((faq) => (
            <div key={faq.q} className="rounded-xl border border-border bg-surface p-5">
              <p className="text-[14.5px] font-semibold text-foreground">{faq.q}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
