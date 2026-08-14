"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { CURRENT_USER, ORGANISATION, getTier, hasEntitlement, can } from "@/lib/data/org";
import type { Entitlement, Role, TierId } from "@/lib/types";
import type { Permission } from "@/lib/data/org";

/**
 * Session state for the prototype.
 *
 * In production the signed-in role and the active subscription tier come from
 * the session and the billing record, and gating is enforced on the server
 * (FR-8.3). Here they are switchable so the RBAC and tier-gating requirements
 * can actually be demonstrated in a click-through — the gating logic itself is
 * the same code either way.
 */

interface PrototypeState {
  role: Role;
  tierId: TierId;
  cityId: string;
  setRole: (role: Role) => void;
  setTierId: (tier: TierId) => void;
  setCityId: (city: string) => void;
  /** Convenience wrappers so screens read cleanly. */
  allows: (permission: Permission) => boolean;
  entitled: (entitlement: Entitlement) => boolean;
}

const PrototypeContext = createContext<PrototypeState | null>(null);

const STORAGE_KEY = "finscanix-prototype";

export function PrototypeProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(CURRENT_USER.role);
  const [tierId, setTierId] = useState<TierId>(ORGANISATION.subscription.tierId);
  const [cityId, setCityId] = useState<string>(ORGANISATION.defaultCityId);

  // Read after mount so server and first client render agree.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{ role: Role; tierId: TierId; cityId: string }>;
      if (saved.role) setRole(saved.role);
      if (saved.tierId) setTierId(saved.tierId);
      if (saved.cityId) setCityId(saved.cityId);
    } catch {
      /* ignore malformed state */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ role, tierId, cityId }));
    } catch {
      /* storage unavailable */
    }
  }, [role, tierId, cityId]);

  const value = useMemo<PrototypeState>(
    () => ({
      role,
      tierId,
      cityId,
      setRole,
      setTierId,
      setCityId,
      allows: (permission) => can(role, permission),
      entitled: (entitlement) => hasEntitlement(tierId, entitlement),
    }),
    [role, tierId, cityId],
  );

  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const ctx = useContext(PrototypeContext);
  if (!ctx) throw new Error("usePrototype must be used inside PrototypeProvider");
  return ctx;
}

export function useTier() {
  const { tierId } = usePrototype();
  return getTier(tierId);
}
