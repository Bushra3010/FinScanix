import type { Metadata } from "next";
import { FileLock2, Lock, ShieldCheck, Trash2, UserCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Security & data handling",
  description:
    "How FinScanix protects vendor rate data: tenant isolation, encryption, role-based access, granular deletion and retention.",
};

const pillars = [
  {
    icon: Lock,
    title: "Encryption",
    body: "All traffic runs over HTTPS. Uploaded documents and extracted line-item data are encrypted at rest, and credentials for pricing, payment and model providers are held server-side only — never shipped to the browser.",
  },
  {
    icon: UserCheck,
    title: "Role-based access",
    body: "Owner, Admin, Estimator, Auditor and Viewer roles are enforced on the server for every request. A standard user cannot reach rate management, user administration or billing regardless of what they navigate to.",
  },
  {
    icon: ShieldCheck,
    title: "Tenant isolation",
    body: "Every query is scoped to the organisation that owns the record. Documents are stored per tenant with no shared bucket paths, so one customer's vendor rates are never reachable from another's session.",
  },
  {
    icon: FileLock2,
    title: "Least-privilege integrations",
    body: "Each external service sits behind a narrow adapter with only the credentials it needs. A pricing key cannot touch billing; a payment key cannot read documents.",
  },
];

export default function SecurityPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-16 lg:px-8 lg:py-20">
      <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground">
        Security & data handling
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
        Vendor rates, project names and margins are among the most commercially sensitive
        data a business holds. This page sets out how FinScanix handles them.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {pillars.map((pillar) => (
          <div key={pillar.title} className="rounded-xl border border-border bg-surface p-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-par-soft text-par">
              <pillar.icon className="h-4.5 w-4.5" />
            </div>
            <h2 className="mt-4 text-[15px] font-semibold text-foreground">{pillar.title}</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {pillar.body}
            </p>
          </div>
        ))}
      </div>

      <Section id="privacy" title="Privacy & consent">
        <p>
          Personal data is collected only where it is needed to run the service — account
          identity, the documents you choose to upload, and the audit trail of who did what.
          Uploaded documents are processed to produce your variance reports and for no other
          purpose.
        </p>
        <p>
          Location is used solely to select the correct city cost index and to localise market
          pricing. It can be set manually per project rather than detected, and the choice is
          shown on every report.
        </p>
      </Section>

      <Section id="retention" title="Retention & deletion">
        <p>
          FinScanix retains data linked to an active subscription and to core usage. Deleting a
          document removes that document, its extracted line items, its cached market quotes
          and its generated report — and nothing else. Deletion never cascades to other
          documents or to account data.
        </p>
        <p>
          On cancellation, exports remain available for a defined wind-down window, after which
          document artifacts are purged. The exact retention windows and deletion SLA are set
          in the service agreement.
        </p>
      </Section>

      <Section id="complaints" title="Complaints & escalation">
        <p>
          Any issue with a report, a rate, or the handling of your data can be raised from
          inside the app or by writing to the support address on your agreement. Complaints are
          acknowledged and tracked to resolution, and reports can always be regenerated for
          re-examination because the variance engine is deterministic.
        </p>
      </Section>

      <Section id="compliance" title="Compliance posture">
        <p>
          FinScanix is built to meet applicable government cybersecurity guidance and
          data-protection obligations in the jurisdictions it operates in. Variance output is
          advisory decision-support: it is evidence for a commercial conversation, not a
          legally binding valuation.
        </p>
      </Section>

      <div className="mt-12 flex gap-3 rounded-xl border border-border bg-surface p-5">
        <Trash2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-muted-foreground" />
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Want your data removed?</span> Account
          owners can delete individual documents from the app at any time, or request full
          account deletion from Settings. Confirmation is issued once the purge completes.
        </p>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-12 scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
