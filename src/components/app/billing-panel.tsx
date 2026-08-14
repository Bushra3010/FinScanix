"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, CreditCard, Download, LoaderCircle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useSession, useTier } from "@/components/app/session-context";
import { changePlanAction, type PlanChangeState } from "@/lib/billing/actions";
import { TIERS, getTier } from "@/lib/data/org";
import { cn, formatDate, formatINR } from "@/lib/utils";

/**
 * Illustrative until the gateway is connected — real tax invoices are issued
 * and stored by the payment provider, not by FinScanix.
 */
const PAYMENT_HISTORY = [
  { id: "RZP-2026-08-0114", at: "2026-08-01T00:12:00+05:30", amount: 14999, status: "Paid" },
  { id: "RZP-2026-07-0098", at: "2026-07-01T00:09:00+05:30", amount: 14999, status: "Paid" },
  { id: "RZP-2026-06-0081", at: "2026-06-01T00:11:00+05:30", amount: 14999, status: "Paid" },
  { id: "RZP-2026-05-0067", at: "2026-05-01T00:14:00+05:30", amount: 4999, status: "Paid" },
];

export function BillingPanel({ seatsUsed }: { seatsUsed: number }) {
  const router = useRouter();
  const { user, allows } = useSession();
  const tier = useTier();
  const [state, formAction, pending] = useActionState<PlanChangeState, FormData>(
    changePlanAction,
    {},
  );

  const subscription = user.organisation.subscription;
  const canManage = allows("billing.manage");

  // A live gateway hands back a hosted checkout URL to send the user to.
  useEffect(() => {
    if (state.checkoutUrl) router.push(state.checkoutUrl);
  }, [state.checkoutUrl, router]);

  // The plan lives on the session, so pull a fresh one after a change.
  useEffect(() => {
    if (state.appliedTier) router.refresh();
  }, [state.appliedTier, router]);

  const quota = tier.documentQuota;
  const documentsUsed = subscription.documentsUsed;
  const docPct = quota ? (documentsUsed / quota) * 100 : 0;
  const seatPct = tier.seats ? (seatsUsed / tier.seats) * 100 : 0;

  return (
    <div className="space-y-6">
      {state.appliedTier && (
        <div className="flex items-start gap-2.5 rounded-xl border border-par/40 bg-par-soft/50 p-4">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
          <div>
            <p className="text-[13.5px] font-semibold text-foreground">
              {getTier(state.appliedTier).name} plan activated
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Written to the subscription record, so entitlements changed everywhere at once —
              the sidebar, export buttons and assistant all follow it. With a live gateway this
              activation is driven by the payment webhook rather than the browser.
            </p>
          </div>
        </div>
      )}

      {state.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-over/40 bg-over-soft/50 p-4">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
          <p className="text-[13px] text-foreground">{state.error}</p>
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
              {quota && documentsUsed > quota && (
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
            <Button size="sm" variant="outline" className="mt-3 w-full" disabled={!canManage}>
              Update payment method
            </Button>
            <p className="mt-3 flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Card details are entered on the gateway&apos;s own hosted page. FinScanix never sees
              or stores them.
            </p>
          </CardContent>
        </Card>
      </div>

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
              const isCurrent = option.id === subscription.tierId;
              const currentIndex = TIERS.findIndex((t) => t.id === subscription.tierId);
              const optionIndex = TIERS.findIndex((t) => t.id === option.id);

              return (
                <form
                  key={option.id}
                  action={formAction}
                  className={cn(
                    "flex flex-col rounded-xl border p-5",
                    isCurrent ? "border-brand bg-brand-soft/30" : "border-border bg-background",
                  )}
                >
                  <input type="hidden" name="tierId" value={option.id} />

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
                    type="submit"
                    size="sm"
                    variant={!isCurrent && optionIndex > currentIndex ? "primary" : "outline"}
                    className="mt-4 w-full"
                    disabled={isCurrent || pending || !canManage}
                  >
                    {pending ? (
                      <>
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        Working…
                      </>
                    ) : isCurrent ? (
                      "Current plan"
                    ) : optionIndex > currentIndex ? (
                      `Upgrade to ${option.name}`
                    ) : (
                      `Switch to ${option.name}`
                    )}
                  </Button>
                </form>
              );
            })}
          </div>

          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            {canManage
              ? "Checkout runs through the payment adapter. With no gateway credentials configured it uses a mock that applies the change directly — no card details are collected anywhere in this build."
              : "Only the account owner can change the subscription."}
          </p>
        </CardContent>
      </Card>

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
