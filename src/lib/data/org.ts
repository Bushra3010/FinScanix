import type {
  ActivityEvent,
  CronJob,
  Entitlement,
  Organisation,
  RateUpload,
  Role,
  Tier,
  TierId,
  User,
} from "../types";

export const ORGANISATION: Organisation = {
  id: "org-001",
  name: "Meridian Infra & Facilities",
  gstin: "09AAECM7712F1Z4",
  defaultCityId: "noida",
  subscription: {
    tierId: "professional",
    status: "active",
    renewsOn: "2026-09-01",
    billingCycle: "monthly",
    documentsUsed: 137,
    seatsUsed: 8,
  },
};

export const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 4999,
    priceAnnual: 49990,
    tagline: "For single-project teams starting to audit vendor rates.",
    documentQuota: 50,
    seats: 3,
    features: [
      "50 documents / month",
      "3 user seats",
      "CPWD SoR baseline matching",
      "Live market pricing",
      "Over / Under / Par variance reports",
      "PDF export",
      "Email support",
    ],
    entitlements: ["sor_matching", "market_pricing", "variance_reports", "export_pdf"],
  },
  {
    id: "professional",
    name: "Professional",
    priceMonthly: 14999,
    priceAnnual: 149990,
    tagline: "For estimating and audit teams running multiple projects.",
    documentQuota: 300,
    seats: 15,
    features: [
      "300 documents / month",
      "15 user seats",
      "Everything in Starter",
      "Excel + PDF export",
      "Bulk rate upload (CSV / Excel)",
      "Scheduled market-price refresh",
      "Multi-project workspaces",
      "Domain-restricted AI assistant",
    ],
    entitlements: [
      "sor_matching",
      "market_pricing",
      "variance_reports",
      "export_pdf",
      "export_excel",
      "bulk_upload",
      "scheduled_refresh",
      "multi_project",
      "ai_assistant",
    ],
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: "For owners and PMCs standardising audits across the portfolio.",
    documentQuota: null,
    seats: null,
    features: [
      "Unlimited documents",
      "Unlimited seats",
      "Everything in Professional",
      "REST API + webhooks",
      "SSO / SAML",
      "Private market-data feed integration",
      "Dedicated success manager",
      "Priority support with SLA",
    ],
    entitlements: [
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
    ],
  },
];

export function getTier(id: TierId): Tier {
  return TIERS.find((t) => t.id === id) ?? TIERS[0];
}

export function hasEntitlement(tierId: TierId, entitlement: Entitlement): boolean {
  return getTier(tierId).entitlements.includes(entitlement);
}

export const ENTITLEMENT_LABEL: Record<Entitlement, string> = {
  sor_matching: "SoR baseline matching",
  market_pricing: "Live market pricing",
  variance_reports: "Variance reports",
  export_pdf: "PDF export",
  export_excel: "Excel export",
  bulk_upload: "Bulk rate upload",
  api_access: "API access",
  ai_assistant: "AI assistant",
  scheduled_refresh: "Scheduled price refresh",
  multi_project: "Multi-project workspaces",
  sso: "SSO / SAML",
  priority_support: "Priority support",
};

/* ------------------------------------------------------------------ *
 * Role-based access control — FR-7.2
 * ------------------------------------------------------------------ */

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  estimator: "Estimator",
  auditor: "Auditor",
  viewer: "Viewer",
};

export type Permission =
  | "invoice.upload"
  | "invoice.correct"
  | "invoice.delete"
  | "report.export"
  | "rates.manage"
  | "users.manage"
  | "billing.manage";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [
    "invoice.upload",
    "invoice.correct",
    "invoice.delete",
    "report.export",
    "rates.manage",
    "users.manage",
    "billing.manage",
  ],
  admin: [
    "invoice.upload",
    "invoice.correct",
    "invoice.delete",
    "report.export",
    "rates.manage",
    "users.manage",
  ],
  estimator: ["invoice.upload", "invoice.correct", "report.export"],
  auditor: ["report.export"],
  viewer: [],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const ROLE_SUMMARY: Record<Role, string> = {
  owner: "Full access including billing and account ownership.",
  admin: "Manages users and rate data. No billing access.",
  estimator: "Uploads documents and corrects extracted line items.",
  auditor: "Read-only across reports, can export for audit files.",
  viewer: "Read-only. Cannot upload, correct or export.",
};

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

export const USERS: User[] = [
  {
    id: "u-001",
    name: "Mohammad Asif",
    email: "asif@meridian-infra.in",
    role: "owner",
    status: "active",
    lastActive: "2026-08-14T09:05:00+05:30",
  },
  {
    id: "u-002",
    name: "Priya Nair",
    email: "priya.nair@meridian-infra.in",
    role: "admin",
    status: "active",
    lastActive: "2026-08-14T08:41:00+05:30",
  },
  {
    id: "u-003",
    name: "Rahul Verma",
    email: "rahul.verma@meridian-infra.in",
    role: "estimator",
    status: "active",
    lastActive: "2026-08-13T18:12:00+05:30",
  },
  {
    id: "u-004",
    name: "Ananya Iyer",
    email: "ananya.iyer@meridian-infra.in",
    role: "auditor",
    status: "active",
    lastActive: "2026-08-13T16:30:00+05:30",
  },
  {
    id: "u-005",
    name: "Karan Mehta",
    email: "karan.mehta@meridian-infra.in",
    role: "estimator",
    status: "active",
    lastActive: "2026-08-12T14:02:00+05:30",
  },
  {
    id: "u-006",
    name: "Sneha Kulkarni",
    email: "sneha.k@meridian-infra.in",
    role: "viewer",
    status: "invited",
    lastActive: "2026-08-11T10:00:00+05:30",
  },
  {
    id: "u-007",
    name: "Vikram Desai",
    email: "vikram.desai@meridian-infra.in",
    role: "auditor",
    status: "suspended",
    lastActive: "2026-06-28T11:20:00+05:30",
  },
  {
    id: "u-008",
    name: "Neha Sharma",
    email: "neha.sharma@meridian-infra.in",
    role: "estimator",
    status: "active",
    lastActive: "2026-08-14T07:55:00+05:30",
  },
];

/** The signed-in user for the prototype. Swappable from the demo control. */
export const CURRENT_USER: User = USERS[0];

/* ------------------------------------------------------------------ *
 * Activity, admin operations and trends
 * ------------------------------------------------------------------ */

export const ACTIVITY: ActivityEvent[] = [
  {
    id: "act-01",
    kind: "analysis",
    actor: "FinScanix engine",
    message: "Variance report ready for INV-2026-0842 — 3 items flagged over-priced",
    at: "2026-08-13T09:14:36+05:30",
    invoiceId: "inv-0842",
  },
  {
    id: "act-02",
    kind: "upload",
    actor: "Rahul Verma",
    message: "Uploaded apex-fm-monthly-aug.pdf for Bandra Kurla Complex FM Contract",
    at: "2026-08-14T08:47:00+05:30",
    invoiceId: "inv-0830",
  },
  {
    id: "act-03",
    kind: "correction",
    actor: "Rahul Verma",
    message: "Corrected 2 low-confidence fields on INV-2026-0839",
    at: "2026-08-12T11:31:00+05:30",
    invoiceId: "inv-0839",
  },
  {
    id: "act-04",
    kind: "rate_update",
    actor: "Priya Nair",
    message: "Bulk uploaded state-pwd-fm-schedule-2024.xlsx — 412 rates updated",
    at: "2026-08-12T09:20:00+05:30",
  },
  {
    id: "act-05",
    kind: "export",
    actor: "Ananya Iyer",
    message: "Exported QTN-1179 variance report as PDF",
    at: "2026-08-12T16:05:00+05:30",
    invoiceId: "qtn-1179",
  },
  {
    id: "act-06",
    kind: "analysis",
    actor: "FinScanix engine",
    message: "Rejected IMG_20260811_160142.jpg at the quality gate — image too blurred",
    at: "2026-08-11T16:02:12+05:30",
    invoiceId: "inv-0833",
  },
  {
    id: "act-07",
    kind: "member",
    actor: "Mohammad Asif",
    message: "Invited sneha.k@meridian-infra.in as Viewer",
    at: "2026-08-11T10:00:00+05:30",
  },
  {
    id: "act-08",
    kind: "rate_update",
    actor: "Scheduler",
    message: "Market price refresh completed — 1,284 items updated across 6 cities",
    at: "2026-08-14T03:00:00+05:30",
  },
  {
    id: "act-09",
    kind: "billing",
    actor: "Mohammad Asif",
    message: "Professional plan renewed — invoice RZP-2026-08-0114 paid",
    at: "2026-08-01T00:12:00+05:30",
  },
];

export const RATE_UPLOADS: RateUpload[] = [
  {
    id: "up-04",
    fileName: "state-pwd-fm-schedule-2024.xlsx",
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-08-12T09:20:00+05:30",
    rowsTotal: 428,
    rowsAccepted: 412,
    rowsRejected: 16,
    status: "processed",
    note: "16 rows rejected — unit mismatch against existing SoR codes",
  },
  {
    id: "up-03",
    fileName: "cpwd-dsr-2023-electrical-revision.csv",
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-07-28T15:44:00+05:30",
    rowsTotal: 196,
    rowsAccepted: 196,
    rowsRejected: 0,
    status: "processed",
  },
  {
    id: "up-02",
    fileName: "city-index-factors-q2.csv",
    uploadedBy: "Mohammad Asif",
    uploadedAt: "2026-07-04T11:02:00+05:30",
    rowsTotal: 15,
    rowsAccepted: 15,
    rowsRejected: 0,
    status: "processed",
  },
  {
    id: "up-01",
    fileName: "vendor-rate-card-draft.xlsx",
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-06-19T17:31:00+05:30",
    rowsTotal: 88,
    rowsAccepted: 0,
    rowsRejected: 88,
    status: "failed",
    note: "Missing required columns: code, unit, base_rate",
  },
];

export const CRON_JOBS: CronJob[] = [
  {
    id: "cron-01",
    kind: "price_refresh",
    name: "Market price refresh — core materials",
    schedule: "0 3 * * *",
    target: "Cement, steel, aggregates, tiles across 15 cities",
    lastRun: "2026-08-14T03:00:00+05:30",
    nextRun: "2026-08-15T03:00:00+05:30",
    lastStatus: "success",
    itemsRefreshed: 1284,
    enabled: true,
  },
  {
    id: "cron-02",
    kind: "price_refresh",
    name: "Market price refresh — E&M and fittings",
    schedule: "0 4 * * 1,4",
    target: "Luminaires, switchgear, plumbing fixtures",
    lastRun: "2026-08-11T04:00:00+05:30",
    nextRun: "2026-08-15T04:00:00+05:30",
    lastStatus: "partial",
    itemsRefreshed: 418,
    enabled: true,
  },
  {
    id: "cron-03",
    kind: "sor_revision",
    name: "SoR revision check",
    schedule: "0 6 1 * *",
    target: "CPWD DSR + State PWD publication feeds",
    lastRun: "2026-08-01T06:00:00+05:30",
    nextRun: "2026-09-01T06:00:00+05:30",
    lastStatus: "success",
    itemsRefreshed: 0,
    enabled: true,
  },
  {
    id: "cron-04",
    kind: "stale_sweep",
    name: "Stale price sweep",
    schedule: "30 2 * * 0",
    target: "Flag quotes older than 30 days for re-fetch",
    lastRun: "2026-08-09T02:30:00+05:30",
    nextRun: "2026-08-16T02:30:00+05:30",
    lastStatus: "success",
    itemsRefreshed: 96,
    enabled: false,
  },
];

/** Monthly roll-up powering the dashboard trend chart. */
export const MONTHLY_TREND = [
  { month: "Jan", documents: 62, variancePct: 11.4, savings: 486000 },
  { month: "Feb", documents: 78, variancePct: 10.1, savings: 512000 },
  { month: "Mar", documents: 94, variancePct: 12.8, savings: 741000 },
  { month: "Apr", documents: 88, variancePct: 9.2, savings: 623000 },
  { month: "May", documents: 112, variancePct: 8.6, savings: 698000 },
  { month: "Jun", documents: 126, variancePct: 7.9, savings: 812000 },
  { month: "Jul", documents: 149, variancePct: 6.8, savings: 905000 },
  { month: "Aug", documents: 137, variancePct: 6.1, savings: 742000 },
];
