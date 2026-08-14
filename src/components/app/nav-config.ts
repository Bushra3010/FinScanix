import {
  CreditCard,
  Database,
  FileCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Receipt,
  Settings,
  Timer,
  Upload,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Entitlement } from "@/lib/types";
import type { Permission } from "@/lib/data/org";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hidden entirely when the role lacks this permission — FR-7.2. */
  permission?: Permission;
  /** Shown but locked when the tier lacks this entitlement — FR-8.1. */
  entitlement?: Entitlement;
  exact?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [{ href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Verification",
    items: [
      { href: "/app/invoices", label: "Documents", icon: Receipt },
      {
        href: "/app/invoices/new",
        label: "Upload",
        icon: Upload,
        permission: "invoice.upload",
        exact: true,
      },
      { href: "/app/reports", label: "Reports", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/app/admin/rates",
        label: "Rate library",
        icon: Database,
        permission: "rates.manage",
      },
      {
        href: "/app/admin/uploads",
        label: "Bulk rate upload",
        icon: FileCheck,
        permission: "rates.manage",
        entitlement: "bulk_upload",
      },
      {
        href: "/app/admin/schedule",
        label: "Scheduled jobs",
        icon: Timer,
        permission: "rates.manage",
        entitlement: "scheduled_refresh",
      },
      {
        href: "/app/admin/integrations",
        label: "Integrations",
        icon: Zap,
        permission: "rates.manage",
      },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/app/settings", label: "Settings", icon: Settings, exact: true },
      { href: "/app/settings/team", label: "Team & roles", icon: Users, permission: "users.manage" },
      {
        href: "/app/settings/billing",
        label: "Billing",
        icon: CreditCard,
        permission: "billing.manage",
      },
    ],
  },
];
