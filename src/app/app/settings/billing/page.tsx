import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { AccessDenied } from "@/components/app/access-denied";
import { BillingPanel } from "@/components/app/billing-panel";
import { gateFor, requireUser } from "@/lib/auth/guard";
import { countActiveSeats } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const user = await requireUser();
  const gate = gateFor(user);

  const header = (
    <PageHeader
      title="Billing"
      description="Your subscription, usage against plan limits, and payment history. Limits are enforced server-side, so the interface and the entitlement never disagree."
    />
  );

  if (!gate.allows("billing.manage")) {
    return (
      <>
        {header}
        <AccessDenied message="Billing is visible to the account owner only. Ask them to review the plan or invoices." />
      </>
    );
  }

  const seatsUsed = await countActiveSeats(user.organisation.id);

  return (
    <>
      {header}
      <BillingPanel seatsUsed={seatsUsed} />
    </>
  );
}
