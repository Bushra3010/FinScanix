"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  Lock,
  LogOut,
  MapPin,
  Menu,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { NAV_SECTIONS } from "@/components/app/nav-config";
import { usePrototype, useTier } from "@/components/app/prototype-context";
import { AssistantWidget } from "@/components/app/assistant-widget";
import { CITIES, getCity } from "@/lib/data/reference";
import { CURRENT_USER, ORGANISATION, ROLE_LABEL, ROLE_SUMMARY, TIERS } from "@/lib/data/org";
import type { Role, TierId } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile scrim */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="lg:pl-64">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      <AssistantWidget />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { allows, entitled } = usePrototype();
  const tier = useTier();

  const quota = tier.documentQuota;
  const used = ORGANISATION.subscription.documentsUsed;
  const pct = quota ? (used / quota) * 100 : 0;

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-surface transition-transform lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
        <Link href="/app/dashboard" onClick={onClose}>
          <Logo />
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_SECTIONS.map((section) => {
          const visible = section.items.filter(
            (item) => !item.permission || allows(item.permission),
          );
          if (visible.length === 0) return null;

          return (
            <div key={section.title}>
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const locked = item.entitlement ? !entitled(item.entitlement) : false;
                  const active = item.exact
                    ? pathname === item.href
                    : pathname.startsWith(item.href);

                  return (
                    <li key={item.href}>
                      <Link
                        href={locked ? "/app/settings/billing" : item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors",
                          active && !locked
                            ? "bg-brand-soft font-medium text-brand-soft-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          locked && "opacity-60",
                        )}
                        title={locked ? "Not included in your plan" : undefined}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {locked && <Lock className="h-3.5 w-3.5 shrink-0" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <div className="rounded-xl border border-border bg-background p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-foreground">{tier.name} plan</p>
            <Badge tone={pct > 90 ? "over" : "neutral"}>
              {quota ? `${Math.round(pct)}%` : "Unlimited"}
            </Badge>
          </div>
          <p className="tnum mt-1 text-[11.5px] text-muted-foreground">
            {used.toLocaleString("en-IN")}
            {quota ? ` of ${quota.toLocaleString("en-IN")}` : ""} documents this month
          </p>
          {quota && (
            <Progress
              value={pct}
              tone={pct > 90 ? "over" : pct > 75 ? "warning" : "brand"}
              size="sm"
              className="mt-2.5"
            />
          )}
          <Link
            href="/app/settings/billing"
            onClick={onClose}
            className={buttonStyles({
              variant: "outline",
              size: "sm",
              className: "mt-3 w-full",
            })}
          >
            Manage plan
          </Link>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */

const TITLES: { match: string; title: string; exact?: boolean }[] = [
  { match: "/app/dashboard", title: "Dashboard" },
  { match: "/app/invoices/new", title: "Upload document", exact: true },
  { match: "/app/invoices", title: "Documents" },
  { match: "/app/reports", title: "Reports" },
  { match: "/app/admin/rates", title: "Rate library" },
  { match: "/app/admin/uploads", title: "Bulk rate upload" },
  { match: "/app/admin/schedule", title: "Scheduled jobs" },
  { match: "/app/admin/integrations", title: "Integrations" },
  { match: "/app/settings/team", title: "Team & roles" },
  { match: "/app/settings/billing", title: "Billing" },
  { match: "/app/settings", title: "Settings" },
];

function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { cityId, setCityId } = usePrototype();
  const [menu, setMenu] = useState<"none" | "user" | "demo">("none");

  const title =
    TITLES.find((t) => (t.exact ? pathname === t.match : pathname.startsWith(t.match)))?.title ??
    "FinScanix";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenu}
          className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h1>

        <div className="relative ml-auto hidden max-w-xs flex-1 md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search documents, vendors, SoR codes…"
            className="h-9 w-full rounded-lg border border-border bg-surface pr-3 pl-9 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <label className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-muted-foreground sm:flex">
            <MapPin className="h-3.5 w-3.5" />
            <span className="sr-only">Active city for rate adjustment</span>
            <select
              value={cityId}
              onChange={(event) => setCityId(event.target.value)}
              className="cursor-pointer bg-transparent pr-1 text-foreground focus:outline-none"
            >
              {CITIES.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
            <span className="tnum text-muted-foreground">
              ×{getCity(cityId).indexFactor.toFixed(2)}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setMenu(menu === "demo" ? "none" : "demo")}
            className="cursor-pointer rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Prototype controls"
            title="Prototype controls"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>

          <ThemeToggle />

          <button
            type="button"
            className="relative cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-over" />
          </button>

          <button
            type="button"
            onClick={() => setMenu(menu === "user" ? "none" : "user")}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pr-1.5 pl-1 transition-colors hover:bg-muted"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
              {initials(CURRENT_USER.name)}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {menu !== "none" && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu("none")} aria-hidden />
          {menu === "user" ? <UserMenu onClose={() => setMenu("none")} /> : <DemoControls />}
        </>
      )}
    </header>
  );
}

function UserMenu({ onClose }: { onClose: () => void }) {
  const { role } = usePrototype();

  return (
    <div className="absolute right-4 z-50 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-pop sm:right-6 lg:right-8">
      <div className="border-b border-border px-4 py-3">
        <p className="text-[13.5px] font-semibold text-foreground">{CURRENT_USER.name}</p>
        <p className="truncate text-[12px] text-muted-foreground">{CURRENT_USER.email}</p>
        <Badge tone="brand" className="mt-2">
          {ROLE_LABEL[role]}
        </Badge>
      </div>
      <div className="p-1.5">
        <Link
          href="/app/settings"
          onClick={onClose}
          className="block rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Account settings
        </Link>
        <Link
          href="/app/settings/billing"
          onClick={onClose}
          className="block rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Billing & plan
        </Link>
        <Link
          href="/security"
          onClick={onClose}
          className="block rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Security & data
        </Link>
      </div>
      <div className="border-t border-border p-1.5">
        <Link
          href="/login"
          onClick={onClose}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Link>
      </div>
    </div>
  );
}

/** Prototype-only: lets a reviewer see RBAC and tier gating without seeding accounts. */
function DemoControls() {
  const { role, setRole, tierId, setTierId } = usePrototype();

  return (
    <div className="absolute right-4 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-pop sm:right-6 lg:right-8">
      <div className="border-b border-border bg-surface-sunken/60 px-4 py-3">
        <p className="text-[13px] font-semibold text-foreground">Prototype controls</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
          Not part of the product. Switch role and plan to see the access and tier gating the
          server would enforce.
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <label
            htmlFor="demo-role"
            className="mb-1.5 block text-[12.5px] font-medium text-foreground"
          >
            Signed-in role
          </label>
          <select
            id="demo-role"
            value={role}
            onChange={(event) => setRole(event.target.value as Role)}
            className="h-9 w-full cursor-pointer rounded-lg border border-border-strong bg-background px-2.5 text-[13px] text-foreground focus:border-brand focus:outline-none"
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {ROLE_SUMMARY[role]}
          </p>
        </div>

        <div>
          <label
            htmlFor="demo-tier"
            className="mb-1.5 block text-[12.5px] font-medium text-foreground"
          >
            Active subscription
          </label>
          <select
            id="demo-tier"
            value={tierId}
            onChange={(event) => setTierId(event.target.value as TierId)}
            className="h-9 w-full cursor-pointer rounded-lg border border-border-strong bg-background px-2.5 text-[13px] text-foreground focus:border-brand focus:outline-none"
          >
            {TIERS.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {tier.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            Drop to Starter to see bulk upload, scheduled jobs, Excel export and the assistant
            lock.
          </p>
        </div>
      </div>
    </div>
  );
}
