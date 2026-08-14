"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";
import { usePrototype } from "@/components/app/prototype-context";
import { ENTITLEMENT_LABEL } from "@/lib/data/org";
import type { Entitlement } from "@/lib/types";
import type { Permission } from "@/lib/data/org";

/**
 * Client-side gates mirror what the server enforces — FR-7.2 / FR-8.1.
 * They exist to keep the interface honest, not to provide the protection:
 * the server is still the authority on both role and tier (FR-8.3).
 */

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { allows } = usePrototype();
  return <>{allows(permission) ? children : fallback}</>;
}

export function Entitled({
  entitlement,
  children,
  fallback = null,
}: {
  entitlement: Entitlement;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { entitled } = usePrototype();
  return <>{entitled(entitlement) ? children : fallback}</>;
}

/** Full-panel replacement shown when a whole screen is out of plan. */
export function UpgradeNotice({
  entitlement,
  description,
}: {
  entitlement: Entitlement;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">
        {ENTITLEMENT_LABEL[entitlement]} is not included in your plan
      </p>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Link href="/app/settings/billing" className={buttonStyles({ className: "mt-5" })}>
        Compare plans
      </Link>
    </div>
  );
}

/** Whole-screen guard: mirrors the server-side check for an admin route. */
export function RequirePermission({
  permission,
  children,
  message,
}: {
  permission: Permission;
  children: ReactNode;
  message: string;
}) {
  const { allows } = usePrototype();
  if (allows(permission)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">Not available for your role</p>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{message}</p>
      <Link
        href="/app/dashboard"
        className={buttonStyles({ variant: "outline", className: "mt-5" })}
      >
        Back to dashboard
      </Link>
    </div>
  );
}

/** Inline replacement shown when a role is missing a permission. */
export function PermissionNotice({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-[13px] text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
