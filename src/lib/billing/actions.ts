"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/client";
import { services } from "@/lib/adapters";
import { getTier } from "@/lib/data/org";
import type { TierId } from "@/lib/types";

const VALID_TIERS: TierId[] = ["starter", "professional", "enterprise"];

export interface PlanChangeState {
  error?: string;
  appliedTier?: TierId;
  checkoutUrl?: string;
}

/**
 * Subscription change — FR-8.2 / FR-8.3.
 *
 * The permission check is the important line here: entitlements are decided by
 * the row this writes, so anything able to write it must be gated server-side.
 *
 * With a live gateway this only starts a checkout; the tier is activated from
 * the gateway's webhook, never from the browser coming back, so an abandoned
 * payment cannot unlock a plan. With the mock adapter there is no webhook to
 * wait for, so the change is applied here directly.
 */
export async function changePlanAction(
  _prev: PlanChangeState,
  formData: FormData,
): Promise<PlanChangeState> {
  const user = await requirePermission("billing.manage");

  const raw = String(formData.get("tierId") ?? "");
  if (!VALID_TIERS.includes(raw as TierId)) {
    return { error: "Select a valid plan." };
  }
  const tierId = raw as TierId;

  if (tierId === user.organisation.subscription.tierId) {
    return { error: `You are already on the ${getTier(tierId).name} plan.` };
  }

  const session = await services.payments.createCheckout({
    tierId,
    billingCycle: user.organisation.subscription.billingCycle,
    organisationId: user.organisation.id,
  });

  if (services.payments.live) {
    // Hand off to the gateway. The webhook activates the tier.
    return { checkoutUrl: session.checkoutUrl };
  }

  await prisma.subscription.update({
    where: { organisationId: user.organisation.id },
    data: {
      tierId,
      status: "active",
      // A downgrade must not leave usage looking valid against a smaller quota;
      // the next cycle reset is what clears it, so it is left untouched here.
    },
  });

  revalidatePath("/app", "layout");

  return { appliedTier: tierId };
}
