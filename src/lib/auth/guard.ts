import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./session";
import { can, hasEntitlement, type Permission } from "@/lib/data/org";
import type { Entitlement } from "@/lib/types";

/**
 * Server-side access control — FR-7.2 and FR-8.3.
 *
 * This is the authority. The client-side gates in components/app/gates.tsx only
 * keep the interface tidy; a user who navigates straight to an admin URL is
 * stopped here, and a server action that skips this check is the bug.
 */

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  // Via the route handler rather than straight to /login, because a page being
  // rendered cannot delete a cookie — and leaving a dead cookie in place is
  // what turned an expired session into a redirect loop.
  if (!user) redirect("/api/auth/expired");
  return user;
}

/** For server actions: refuse rather than redirect, so the caller sees why. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    throw new Error(`Forbidden: role "${user.role}" lacks permission "${permission}".`);
  }
  return user;
}

export async function requireEntitlement(entitlement: Entitlement): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasEntitlement(user.organisation.subscription.tierId, entitlement)) {
    throw new Error(
      `Forbidden: plan "${user.organisation.subscription.tierId}" does not include "${entitlement}".`,
    );
  }
  return user;
}

/** Convenience for pages that render a notice instead of redirecting. */
export function gateFor(user: SessionUser) {
  return {
    allows: (permission: Permission) => can(user.role, permission),
    entitled: (entitlement: Entitlement) =>
      hasEntitlement(user.organisation.subscription.tierId, entitlement),
  };
}
