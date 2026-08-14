import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { BillingPanel } from "@/components/app/billing-panel";
import type { TierId } from "@/lib/types";

export const metadata: Metadata = { title: "Billing" };

const VALID_TIERS: TierId[] = ["starter", "professional", "enterprise"];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; tier?: string }>;
}) {
  const { checkout, tier } = await searchParams;
  const activated =
    checkout === "mock" && VALID_TIERS.includes(tier as TierId) ? (tier as TierId) : undefined;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Your subscription, usage against plan limits, and payment history. Limits are enforced server-side, so the interface and the entitlement never disagree."
      />
      <BillingPanel checkoutTier={activated} />
    </>
  );
}
