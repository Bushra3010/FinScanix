import { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { analyseLines, summarise } from "@/lib/variance";
import type {
  ActivityEvent,
  AnalysedInvoice,
  City,
  CronJob,
  Invoice,
  InvoiceStatus,
  LineItem,
  MarketQuote,
  QualityReport,
  RateUpload,
  Role,
  SorEntry,
  User,
} from "@/lib/types";

/**
 * The only place Prisma rows become domain objects.
 *
 * Everything above this file speaks the types in src/lib/types.ts, which is why
 * the variance engine and every component survived the move from fixtures to a
 * database without a change.
 *
 * Every function takes an organisationId and scopes its query by it. Tenant
 * isolation is enforced here, not left to callers to remember.
 */

const invoiceInclude = {
  city: true,
  uploadedBy: { select: { name: true } },
  qualityChecks: { orderBy: { position: "asc" } },
  lineItems: {
    orderBy: { srNo: "asc" },
    include: {
      sorEntry: true,
      marketQuotes: { orderBy: { price: "asc" } },
    },
  },
} satisfies Prisma.InvoiceInclude;

type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * Mappers
 * ------------------------------------------------------------------ */

function toCity(row: { id: string; name: string; state: string; pin: string; indexFactor: number }): City {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    pin: row.pin,
    indexFactor: row.indexFactor,
  };
}

function toLineItem(row: InvoiceRow["lineItems"][number]): LineItem {
  return {
    id: row.id,
    srNo: row.srNo,
    description: row.description,
    unit: row.unit,
    quantity: row.quantity,
    rate: row.rate,
    amount: row.amount,
    printedAmount: row.printedAmount ?? undefined,
    confidence: {
      description: row.confDescription,
      quantity: row.confQuantity,
      rate: row.confRate,
    },
    corrected: row.corrected,
    sorMatch:
      row.sorEntry && row.sorAdjustedRate != null
        ? {
            sorId: row.sorEntry.id,
            code: row.sorEntry.code,
            description: row.sorEntry.description,
            unit: row.sorEntry.unit,
            baseRate: row.sorEntry.baseRate,
            matchScore: row.sorMatchScore ?? 0,
            adjustedRate: row.sorAdjustedRate,
            indexFactor: row.sorIndexFactor ?? 1,
            source: row.sorEntry.source,
          }
        : undefined,
    marketQuotes: row.marketQuotes.map(
      (quote): MarketQuote => ({
        id: quote.id,
        seller: quote.seller,
        platform: quote.platform as MarketQuote["platform"],
        price: quote.price,
        unit: quote.unit,
        location: quote.location,
        url: quote.url,
        fetchedAt: quote.fetchedAt.toISOString(),
        inStock: quote.inStock,
      }),
    ),
  };
}

function toQualityReport(row: InvoiceRow): QualityReport {
  return {
    passed: row.qualityPassed,
    score: row.qualityScore,
    rejectionReason: row.rejectionReason ?? undefined,
    checks: row.qualityChecks.map((check) => ({
      id: check.key,
      label: check.label,
      passed: check.passed,
      detail: check.detail,
    })),
  };
}

function toInvoice(row: InvoiceRow): Invoice {
  const lineItems = row.lineItems.map(toLineItem);
  const subtotal = round2(lineItems.reduce((sum, line) => sum + line.amount, 0));

  return {
    id: row.id,
    number: row.number,
    documentType: row.documentType as Invoice["documentType"],
    vendor: row.vendor,
    vendorGstin: row.vendorGstin,
    project: row.project,
    cityId: row.cityId,
    uploadedBy: row.uploadedBy.name,
    uploadedAt: row.uploadedAt.toISOString(),
    processedAt: row.processedAt?.toISOString(),
    status: row.status as InvoiceStatus,
    fileName: row.fileName,
    fileSizeKb: row.fileSizeKb,
    pageCount: row.pageCount,
    hasOriginal: row.storageKey !== null,
    extractionNote: row.extractionNote ?? undefined,
    language: row.language ?? undefined,
    quality: toQualityReport(row),
    // Totals are derived, never stored — the line items are the only source of
    // truth, so a corrected line can never leave a stale total behind.
    subtotal,
    taxPct: row.taxPct,
    total: round2(subtotal * (1 + row.taxPct / 100)),
    lineItems,
  };
}

function toAnalysed(row: InvoiceRow): AnalysedInvoice {
  const invoice = toInvoice(row);
  const lineItems = analyseLines(invoice.lineItems);
  return {
    ...invoice,
    lineItems,
    summary: summarise(lineItems),
    city: toCity(row.city),
  };
}

/* ------------------------------------------------------------------ *
 * Invoices
 * ------------------------------------------------------------------ */

export async function listInvoices(organisationId: string): Promise<AnalysedInvoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { organisationId },
    include: invoiceInclude,
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map(toAnalysed);
}

export async function getInvoice(
  organisationId: string,
  id: string,
): Promise<AnalysedInvoice | null> {
  const row = await prisma.invoice.findFirst({
    where: { id, organisationId },
    include: invoiceInclude,
  });
  return row ? toAnalysed(row) : null;
}

/** Documents that carry a verdict — everything the reports roll up. */
export async function listReportedInvoices(organisationId: string): Promise<AnalysedInvoice[]> {
  const rows = await prisma.invoice.findMany({
    where: { organisationId, status: { in: ["analysed", "needs_review"] } },
    include: invoiceInclude,
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map(toAnalysed);
}

/** FR-11.2 — removes this document and its artifacts, and nothing else. */
export async function deleteInvoice(organisationId: string, id: string) {
  return prisma.invoice.deleteMany({ where: { id, organisationId } });
}

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

export async function listCities(): Promise<City[]> {
  const rows = await prisma.city.findMany({ orderBy: { name: "asc" } });
  return rows.map(toCity);
}

export async function getCity(id: string): Promise<City | null> {
  const row = await prisma.city.findUnique({ where: { id } });
  return row ? toCity(row) : null;
}

/**
 * The shared rate book plus this tenant's own entries. A tenant's negotiated
 * rate takes priority over the public book on a code collision.
 */
export async function listSorEntries(organisationId: string): Promise<SorEntry[]> {
  const rows = await prisma.sorEntry.findMany({
    where: { OR: [{ organisationId: null }, { organisationId }] },
    orderBy: [{ chapter: "asc" }, { code: "asc" }],
  });

  const byCode = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    if (!existing || (row.organisationId !== null && existing.organisationId === null)) {
      byCode.set(row.code, row);
    }
  }

  return [...byCode.values()].map((row) => ({
    id: row.id,
    code: row.code,
    description: row.description,
    unit: row.unit,
    baseRate: row.baseRate,
    source: row.source,
    chapter: row.chapter,
    effectiveFrom: row.effectiveFrom.toISOString(),
    owned: row.organisationId !== null,
  }));
}

/* ------------------------------------------------------------------ *
 * Organisation
 * ------------------------------------------------------------------ */

export async function listUsers(organisationId: string): Promise<User[]> {
  const rows = await prisma.user.findMany({
    where: { organisationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as Role,
    status: row.status as User["status"],
    lastActive: row.lastActive.toISOString(),
  }));
}

export async function listActivity(organisationId: string, take = 20): Promise<ActivityEvent[]> {
  const rows = await prisma.activityEvent.findMany({
    where: { organisationId },
    orderBy: { at: "desc" },
    take,
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as ActivityEvent["kind"],
    actor: row.actor,
    message: row.message,
    at: row.at.toISOString(),
    invoiceId: row.invoiceId ?? undefined,
  }));
}

export async function listRateUploads(organisationId: string): Promise<RateUpload[]> {
  const rows = await prisma.rateUpload.findMany({
    where: { organisationId },
    include: { uploadedBy: { select: { name: true } } },
    orderBy: { uploadedAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    uploadedBy: row.uploadedBy.name,
    uploadedAt: row.uploadedAt.toISOString(),
    rowsTotal: row.rowsTotal,
    rowsAccepted: row.rowsAccepted,
    rowsRejected: row.rowsRejected,
    status: row.status as RateUpload["status"],
    note: row.note ?? undefined,
  }));
}

export async function listCronJobs(organisationId: string): Promise<CronJob[]> {
  const rows = await prisma.cronJob.findMany({
    where: { organisationId },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    target: row.target,
    kind: row.kind as CronJob["kind"],
    scope: row.scope ? row.scope.split(",").filter(Boolean) : [],
    lastRun: row.lastRun.toISOString(),
    nextRun: row.nextRun.toISOString(),
    lastStatus: row.lastStatus as CronJob["lastStatus"],
    itemsRefreshed: row.itemsRefreshed,
    enabled: row.enabled,
  }));
}

/** Seats in use, for the plan limit check — FR-8.3. */
export async function countActiveSeats(organisationId: string) {
  return prisma.user.count({
    where: { organisationId, status: { not: "suspended" } },
  });
}
