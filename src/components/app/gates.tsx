"use client";

import type { ReactNode } from "react";
import { useSession } from "@/components/app/session-context";
import type { Permission } from "@/lib/data/org";

/**
 * Hides an interface affordance the current role cannot use — a button, a menu
 * entry, an action.
 *
 * This is presentation only. It runs after the server has already rendered and
 * sent the surrounding payload, so it must never be the thing standing between
 * a user and restricted *data*. Pages decide that before they query, with
 * gateFor()/requireUser() in lib/auth/guard.ts, and render <AccessDenied />.
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
  const { allows } = useSession();
  return <>{allows(permission) ? children : fallback}</>;
}
