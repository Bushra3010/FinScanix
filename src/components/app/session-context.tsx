"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { can, getTier, hasEntitlement, type Permission } from "@/lib/data/org";
import type { Entitlement, SessionUser } from "@/lib/types";

/**
 * The signed-in session, handed down from the server layout.
 *
 * `allows` and `entitled` mirror the server-side checks in lib/auth/guard.ts so
 * the interface shows the same thing the server would permit. They are a
 * convenience for rendering, never the protection itself.
 *
 * The active city is the one piece of genuinely client-side state: it selects
 * which cost index the rate library and upload screen preview, and defaults to
 * the organisation's configured city.
 */

interface SessionState {
  user: SessionUser;
  allows: (permission: Permission) => boolean;
  entitled: (entitlement: Entitlement) => boolean;
  cityId: string;
  setCityId: (cityId: string) => void;
}

const SessionContext = createContext<SessionState | null>(null);

const CITY_KEY = "finscanix-active-city";

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const [cityId, setCityId] = useState(user.organisation.defaultCityId);

  // Read after mount so the server and first client render agree.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CITY_KEY);
      if (saved) setCityId(saved);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CITY_KEY, cityId);
    } catch {
      /* storage unavailable */
    }
  }, [cityId]);

  const value = useMemo<SessionState>(
    () => ({
      user,
      cityId,
      setCityId,
      allows: (permission) => can(user.role, permission),
      entitled: (entitlement) =>
        hasEntitlement(user.organisation.subscription.tierId, entitlement),
    }),
    [user, cityId],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

export function useTier() {
  const { user } = useSession();
  return getTier(user.organisation.subscription.tierId);
}
