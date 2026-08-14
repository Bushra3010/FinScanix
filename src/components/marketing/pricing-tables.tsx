"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { ENTITLEMENT_LABEL, TIERS } from "@/lib/data/org";
import type { Entitlement } from "@/lib/types";
import { cn, formatINR } from "@/lib/utils";

const ALL_ENTITLEMENTS: Entitlement[] = [
  "sor_matching",
  "market_pricing",
  "variance_reports",
  "export_pdf",
  "export_excel",
  "bulk_upload",
  "scheduled_refresh",
  "multi_project",
  "ai_assistant",
  "api_access",
  "sso",
  "priority_support",
];

export function PricingTables() {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div className="mt-8 flex items-center justify-center gap-3">
        <span
          className={cn(
            "text-[13.5px] font-medium",
            annual ? "text-muted-foreground" : "text-foreground",
          )}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Toggle annual billing"
          onClick={() => setAnnual((v) => !v)}
          className={cn(
            "relative h-6 w-11 cursor-pointer rounded-full border transition-colors",
            annual ? "border-brand bg-brand" : "border-border-strong bg-surface-sunken",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-surface shadow-sm transition-transform",
              annual ? "translate-x-5.5" : "translate-x-0.5",
            )}
          />
        </button>
        <span
          className={cn(
            "text-[13.5px] font-medium",
            annual ? "text-foreground" : "text-muted-foreground",
          )}
        >
          Annual
        </span>
        <Badge tone="par">2 months free</Badge>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {TIERS.map((tier) => {
          const isEnterprise = tier.id === "enterprise";
          const price = annual ? tier.priceAnnual : tier.priceMonthly;

          return (
            <div
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card",
                tier.highlighted ? "border-brand ring-1 ring-brand/25" : "border-border",
              )}
            >
              {tier.highlighted && (
                <Badge tone="brand" className="absolute -top-2.5 left-6">
                  Most popular
                </Badge>
              )}

              <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
              <p className="mt-1.5 min-h-10 text-[13px] leading-relaxed text-muted-foreground">
                {tier.tagline}
              </p>

              <div className="mt-5 flex items-baseline gap-1.5">
                {isEnterprise ? (
                  <span className="text-3xl font-semibold tracking-tight text-foreground">
                    Custom
                  </span>
                ) : (
                  <>
                    <span className="tnum text-3xl font-semibold tracking-tight text-foreground">
                      {formatINR(price, { decimals: 0 })}
                    </span>
                    <span className="text-[13px] text-muted-foreground">
                      /{annual ? "year" : "month"}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isEnterprise
                  ? "Volume pricing, invoiced annually"
                  : `Plus GST · ${tier.documentQuota} documents / month · ${tier.seats} seats`}
              </p>

              <Link
                href={isEnterprise ? "/register?plan=enterprise" : `/register?plan=${tier.id}`}
                className={buttonStyles({
                  variant: tier.highlighted ? "primary" : "outline",
                  className: "mt-6 w-full",
                })}
              >
                {isEnterprise ? "Talk to sales" : "Start free trial"}
              </Link>

              <ul className="mt-6 space-y-2.5 border-t border-border pt-6">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-[13px] text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Comparison */}
      <div className="mt-16">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Compare capabilities
        </h2>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          Limits are enforced on the server, not just hidden in the interface — downgrading
          takes effect immediately.
        </p>

        <div className="scrollbar-thin mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-sunken/60">
                <th className="border-b border-border px-4 py-3 text-left text-[12px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Capability
                </th>
                {TIERS.map((tier) => (
                  <th
                    key={tier.id}
                    className="border-b border-border px-4 py-3 text-center text-[12px] font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="px-4 py-3 text-[13.5px] font-medium text-foreground">
                  Documents per month
                </td>
                {TIERS.map((tier) => (
                  <td key={tier.id} className="tnum px-4 py-3 text-center text-[13.5px]">
                    {tier.documentQuota ?? "Unlimited"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 text-[13.5px] font-medium text-foreground">
                  User seats
                </td>
                {TIERS.map((tier) => (
                  <td key={tier.id} className="tnum px-4 py-3 text-center text-[13.5px]">
                    {tier.seats ?? "Unlimited"}
                  </td>
                ))}
              </tr>
              {ALL_ENTITLEMENTS.map((entitlement) => (
                <tr key={entitlement}>
                  <td className="px-4 py-3 text-[13.5px] font-medium text-foreground">
                    {ENTITLEMENT_LABEL[entitlement]}
                  </td>
                  {TIERS.map((tier) => (
                    <td key={tier.id} className="px-4 py-3 text-center">
                      {tier.entitlements.includes(entitlement) ? (
                        <Check className="mx-auto h-4 w-4 text-par" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
