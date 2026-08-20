import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getTier } from "@/lib/data/org";
import type { TierId } from "@/lib/types";

/**
 * Razorpay payment webhook — FR-8.2.
 *
 * This is the only thing that activates a paid tier. The browser returning from
 * a checkout page proves nothing: it can be navigated to directly, abandoned
 * mid-payment, or replayed. Entitlements therefore move when the gateway says
 * money was captured, and at no other time.
 *
 * Every request is authenticated by HMAC over the exact bytes received, so the
 * body is read raw — parsing first and re-serialising would change whitespace
 * and key order, and the signature would never match.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TIERS: TierId[] = ["starter", "professional", "enterprise"];

interface RazorpayEvent {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; amount?: number; notes?: Record<string, string> } };
    payment_link?: { entity?: { id?: string; notes?: Record<string, string>; status?: string } };
  };
}

function signatureMatches(raw: string, presented: string, secret: string) {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(presented, "utf8");
  // Length is compared separately; timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // Refusing is the safe failure. Accepting unauthenticated calls here would
    // let anyone grant themselves a paid plan.
    return NextResponse.json(
      { error: "Payment webhook is not configured on this deployment." },
      { status: 503 },
    );
  }

  const raw = await request.text();
  const presented = request.headers.get("x-razorpay-signature") ?? "";
  if (!presented || !signatureMatches(raw, presented, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(raw) as RazorpayEvent;
  } catch {
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  // Only events that mean money actually moved.
  const captured =
    event.event === "payment.captured" ||
    (event.event === "payment_link.paid" &&
      event.payload?.payment_link?.entity?.status === "paid");

  if (!captured) {
    // Acknowledged, deliberately ignored. Returning an error would make the
    // gateway retry an event we will never act on.
    return NextResponse.json({ received: true, applied: false, reason: `Ignoring ${event.event}` });
  }

  const notes =
    event.payload?.payment?.entity?.notes ?? event.payload?.payment_link?.entity?.notes ?? {};
  const organisationId = notes.organisationId;
  const tierId = notes.tierId as TierId | undefined;
  const billingCycle = notes.billingCycle === "annual" ? "annual" : "monthly";
  const reference =
    event.payload?.payment?.entity?.id ?? event.payload?.payment_link?.entity?.id ?? "unknown";

  if (!organisationId || !tierId || !VALID_TIERS.includes(tierId)) {
    return NextResponse.json(
      { error: "Payment carried no organisation and tier to apply." },
      { status: 400 },
    );
  }

  const subscription = await prisma.subscription.findFirst({ where: { organisationId } });
  if (!subscription) {
    return NextResponse.json({ error: "Unknown organisation." }, { status: 404 });
  }

  // Gateways retry until they get a 2xx, so the same capture arrives more than
  // once. Recording the reference makes reapplying it a no-op rather than a
  // second renewal.
  const alreadyApplied = await prisma.activityEvent.findFirst({
    where: { organisationId, kind: "billing", message: { contains: reference } },
  });
  if (alreadyApplied) {
    return NextResponse.json({ received: true, applied: false, reason: "Already applied" });
  }

  const renewsOn = new Date();
  renewsOn.setMonth(renewsOn.getMonth() + (billingCycle === "annual" ? 12 : 1));

  await prisma.subscription.update({
    where: { organisationId },
    data: { tierId, status: "active", billingCycle, renewsOn },
  });

  await prisma.activityEvent.create({
    data: {
      organisationId,
      kind: "billing",
      actor: "Razorpay",
      message: `Payment captured — ${getTier(tierId).name} plan activated (${billingCycle}, ref ${reference})`,
    },
  });

  return NextResponse.json({ received: true, applied: true, tierId });
}
