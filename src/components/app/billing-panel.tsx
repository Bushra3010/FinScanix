"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Download, LoaderCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usePrototype, useTier } from "@/components/app/prototype-context";
import { mockPayments } from "@/lib/adapters/mock";
import { ORGANISATION, TIERS, USERS } from "@/lib/data/org";
import type { TierId } from "@/lib/types";
import { cn, formatDate, formatINR } from "@/lib/utils";

const PAYMENT_HISTORY = [
  { id: "RZP-2026-08-0114", at: "2026-08-01T00:12:00+05:30", amount: 14999, status: "Paid" },
  { id: "RZP-2026-07-0098", at: "2026-07-01T00:09:00+05:30", amount: 14999, status: "Paid" },
  { id: "RZP-2026-06-0081", at: "2026-06-01T00:11:00+05:30", amount: 14999, status: "Paid" },
  { id: "RZP-2026-05-0067", at: "2026-05-01T00:14:00+05:30", amount: 4999, status: "Paid" },
];

export function BillingPanel({ checkoutTier }: { checkoutTier?: TierId }) {
  const router = useRouter();
  const { tierId, setTierId } = usePrototype();
  const tier = useTier();
  const [pending, setPending] = useState<TierId | null>(null);
  const [confirmed, setConfirmed] = useState<TierId | null>(null);

  // Returning from the (mock) gateway activates the tier. In production this
  // only happens from the gateway webhook, never from the browser redirect.
  useEffect(() => {
    if (!checkoutTier) return;
    setTierId(checkoutTier);
    setConfirmed(checkoutTier);
  }, [checkoutTier, setTierId]);

  const subscription = ORGANISATION.subscription;
  const documentsUsed = subscription.documentsUsed;
  const quota = tier.documentQuota;
  const docPct = quota ? (documentsUsed / quota) * 100 : 0;
  const seatsUsed = USERS.filter((u) => u.status !== "suspended").length;
  const seatPct = tier.seats ? (seatsUsed / tier.seats) * 100 : 0;

  async function startCheckout(target: TierId) {
    setPending(target);
    const session = await mockPayments.createCheckout({
      tierId: target,
      billingCycle: subscription.billingCycle,
      organisationId: ORGANISATION.id,
    });
    setTimeout(() => {
      setPending(null);
      router.push(session.checkoutUrl);
    }, 700);
  }

  return (
    <div className="space-y-6">
      {confirmed && (
        <div className="flex items-start gap-2.5 rounded-xl border border-par/40 bg-par-soft/50 p-4">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
          <div>
            <p className="text-[13.5px] font-semibold text-foreground">
              {TIERS.find((t) => t.id === confirmed)?.name} plan activated
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Entitlements updated across the app — check the sidebar, the export buttons and the
              assistant. In production this activation is driven by the gateway webhook, not the
              browser redirect, so a cancelled payment can never unlock a tier.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle>{tier.name} plan</CardTitle>
                <Badge tone={subscription.status === "active" ? "par" : "warning"}>
                  {subscription.status}
                </Badge>
              </div>
              <CardDescription>
                {tier.id === "enterprise"
                  ? "Custom pricing, invoiced annually"
                  : `${formatINR(subscription.billingCycle === "annual" ? tier.priceAnnual : tier.priceMonthly, { decimals: 0 })} per ${subscription.billingCycle === "annual" ? "year" : "month"} plus GST`}
                {" · renews "}
                {formatDate(subscription.renewsOn, "long")}
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-muted-foreground">Documents this cycle</span>
                <span className="tnum font-medium text-foreground">
                  {documentsUsed.toLocaleString("en-IN")} /{" "}
                  {quota ? quota.toLocaleString("en-IN") : "unlimited"}
                </span>
              </div>
              {quota && (
                <Progress
                  value={docPct}
                  tone={docPct > 90 ? "over" : docPct > 75 ? "warning" : "brand"}
                  className="mt-2"
                />
              )}
              {quota && docPct > 100 && (
                <p className="mt-1.5 text-[12px] text-over">
                  Over quota — uploads are blocked until the cycle resets or the plan is upgraded.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="text-muted-foreground">Seats</span>
                <span className="tnum font-medium text-foreground">
                  {seatsUsed} / {tier.seats ?? "unlimited"}
                </span>
              </div>
              {tier.seats && <Progress value={seatPct} className="mt-2" />}
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                Included in this plan
              </p>
              <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2 text-[12.5px] text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Payment method</CardTitle>
                <CardDescription>Managed by the payment gateway</CardDescription>
              </div>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-sunken/50 p-3.5">
                <div className="flex h-9 w-12 items-center justify-center rounded-md bg-surface text-[11px] font-semibold text-foreground">
                  VISA
                </div>
                <div className="min-w-0 flex-1">
                  <p className="tnum text-[13px] font-medium text-foreground">•••• •••• •••• 4821</p>
                  <p className="text-[11.5px] text-muted-foreground">Expires 09/2029</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="mt-3 w-full">
                Update payment method
              </Button>
              <p className="mt-3 flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Card details are entered on the gateway&apos;s own hosted page. FinScanix never
                sees or stores them.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Plan switcher */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Change plan</CardTitle>
            <CardDescription>
              Upgrades apply immediately and are pro-rated. Downgrades restrict gated capabilities
              at once.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-3">
            {TIERS.map((option) => {
              const isCurrent = option.id === tierId;
              const currentIndex = TIERS.findIndex((t) => t.id === tierId);
              const optionIndex = TIERS.findIndex((t) => t.id === option.id);

              return (
                <div
                  key={option.id}
                  className={cn(
                    "flex flex-col rounded-xl border p-5",
                    isCurrent ? "border-brand bg-brand-soft/30" : "border-border bg-background",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-foreground">{option.name}</p>
                    {isCurrent && <Badge tone="brand">Current</Badge>}
                  </div>
                  <p className="tnum mt-2 text-xl font-semibold text-foreground">
                    {option.id === "enterprise"
                      ? "Custom"
                      : formatINR(option.priceMonthly, { decimals: 0 })}
                    {option.id !== "enterprise" && (
                      <span className="text-[12px] font-normal text-muted-foreground">/month</span>
                    )}
                  </p>
                  <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    {option.tagline}
                  </p>

                  <Button
                    size="sm"
                    variant={isCurrent ? "outline" : optionIndex > currentIndex ? "primary" : "outline"}
                    className="mt-4 w-full"
                    disabled={isCurrent || pending !== null}
                    onClick={() => startCheckout(option.id)}
                  >
                    {pending === option.id ? (
                      <>
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        Opening checkout…
                      </>
                    ) : isCurrent ? (
                      "Current plan"
                    ) : optionIndex > currentIndex ? (
                      `Upgrade to ${option.name}`
                    ) : (
                      `Switch to ${option.name}`
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            Checkout runs through the payment adapter. With no gateway credentials configured it
            uses a mock that returns here immediately — no card details are collected anywhere in
            this prototype.
          </p>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Billing history</CardTitle>
            <CardDescription>Tax invoices for this organisation</CardDescription>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Invoice</TH>
                <TH>Date</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="w-10" />
              </tr>
            </THead>
            <TBody>
              {PAYMENT_HISTORY.map((entry) => (
                <TR key={entry.id}>
                  <TD className="font-mono text-[12.5px] text-foreground">{entry.id}</TD>
                  <TD className="text-[13px] text-muted-foreground">
                    {formatDate(entry.at, "long")}
                  </TD>
                  <TD className="tnum text-right text-[13px]">
                    {formatINR(entry.amount, { decimals: 0 })}
                  </TD>
                  <TD>
                    <Badge tone="par">{entry.status}</Badge>
                  </TD>
                  <TD>
                    <button
                      type="button"
                      className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Download ${entry.id}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      </Card>
    </div>
  );
}
