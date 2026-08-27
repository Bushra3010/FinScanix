import { unstable_cache } from "next/cache";
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

/**
 * pgBouncer in transaction mode can return DateTime columns as strings rather
 * than Date objects. This helper normalises both forms to an ISO string so
 * callers never call .toISOString() on a plain string.
 */
function toISO(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
/** Same as toISO but returns undefined when the value is falsy. */
function toISOOpt(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

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

function toCity(row: {
  id: string; name: string; state: string; pin: string; indexFactor: number;
  country?: string; currency?: string; vatPct?: number | null; region?: string;
}): City {
  return {
    id: row.id,
    name: row.name,
    state: row.state,
    pin: row.pin,
    indexFactor: row.indexFactor,
    country: row.country ?? "IN",
    currency: row.currency ?? "INR",
    vatPct: row.vatPct ?? null,
    region: row.region ?? "india",
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
        currency: quote.currency,
        vatPct: quote.vatPct,
        unit: quote.unit,
        location: quote.location,
        url: quote.url,
        fetchedAt: toISO(quote.fetchedAt),
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
    uploadedAt: toISO(row.uploadedAt),
    processedAt: toISOOpt(row.processedAt),
    status: row.status as InvoiceStatus,
    fileName: row.fileName,
    fileSizeKb: row.fileSizeKb,
    pageCount: row.pageCount,
    hasOriginal: row.storageKey !== null,
    extractionNote: row.extractionNote ?? undefined,
    language: row.language ?? undefined,
    exclusions: Array.isArray(row.exclusions) ? (row.exclusions as string[]) : undefined,
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

/**
 * Reference and rate data is cached across requests, not just within one.
 *
 * The rate book is the heaviest read in the application and the least
 * volatile: every upload matches every line against the whole of it, and the
 * seeded book is only the beginning — a licensed CPWD edition runs to tens of
 * thousands of rows. Re-reading that per document is load with nothing to show
 * for it.
 *
 * Correctness comes from tags rather than from a timer. An import or an edit
 * revalidates the tag, so the next read sees the change immediately; the long
 * duration is a backstop for anything that changes the table without going
 * through those paths.
 */
export const CACHE_TAGS = { cities: "cities", rates: "rates" } as const;

async function readCities(): Promise<City[]> {
  const rows = await prisma.city.findMany({ orderBy: { name: "asc" } });
  return rows.map(toCity);
}

const cachedCities = unstable_cache(readCities, ["cities"], {
  tags: [CACHE_TAGS.cities],
  revalidate: 3600,
});

export async function listCities(): Promise<City[]> {
  try {
    return await cachedCities();
  } catch {
    return readCities();
  }
}

export async function getCity(id: string): Promise<City | null> {
  const row = await prisma.city.findUnique({ where: { id } });
  return row ? toCity(row) : null;
}

/**
 * The shared rate book plus this tenant's own entries. A tenant's negotiated
 * rate takes priority over the public book on a code collision.
 */
/**
 * The shared public rate book. Cached; contains no tenant data by construction.
 *
 * Only the rows with no organisationId are cached, and a tenant's own rates are
 * read fresh and merged on top. That split is deliberate: it puts the heavy,
 * near-static read behind the cache while making it impossible for one tenant's
 * rates to be served to another, whatever the cache key turns out to be. A
 * correctness property worth more than the handful of rows it costs.
 */
function readPublicRateBook() {
  return prisma.sorEntry.findMany({
    where: { organisationId: null },
    orderBy: [{ chapter: "asc" }, { code: "asc" }],
  });
}

const cachedPublicRateBook = unstable_cache(readPublicRateBook, ["public-rate-book"], {
  tags: [CACHE_TAGS.rates],
  revalidate: 3600,
});

/**
 * The cache is an optimisation, so it is never allowed to be a dependency.
 *
 * unstable_cache needs Next's request context and throws without it — which is
 * the situation in a seed, a migration script, or a job run outside a request.
 * Falling back to the direct read there keeps those paths working; the cost of
 * a cache miss is a query, and the cost of an exception would be a failed
 * upload.
 */
async function publicRateBook() {
  try {
    return await cachedPublicRateBook();
  } catch {
    return readPublicRateBook();
  }
}

/**
 * The shared rate book plus this tenant's own entries. A tenant's negotiated
 * rate takes priority over the public book on a code collision.
 */
export async function listSorEntries(organisationId: string): Promise<SorEntry[]> {
  const [shared, owned] = await Promise.all([
    publicRateBook(),
    prisma.sorEntry.findMany({
      where: { organisationId },
      orderBy: [{ chapter: "asc" }, { code: "asc" }],
    }),
  ]);

  const byCode = new Map<string, (typeof shared)[number]>();
  for (const row of shared) byCode.set(row.code, row);
  // The tenant's own entry wins on a collision, which is the whole point of
  // being able to add one.
  for (const row of owned) byCode.set(row.code, row);

  return [...byCode.values()]
    .sort((a, b) => a.chapter.localeCompare(b.chapter) || a.code.localeCompare(b.code))
    .map((row) => ({
      id: row.id,
      code: row.code,
      description: row.description,
      unit: row.unit,
      baseRate: row.baseRate,
      source: row.source,
      chapter: row.chapter,
      effectiveFrom: toISO(row.effectiveFrom),
      owned: row.organisationId !== null,
    }));
}

/**
 * Line items no rate in the library could price — SoW section 3.
 *
 * "No benchmark" tells someone the rate book is incomplete without saying what
 * it is missing, which leaves the one action that would fix it unguided. This
 * ranks the gaps by the money passing through them, so the next rates to load
 * are the ones that would price the most spend, not merely the most rows.
 */
export interface CoverageGap {
  description: string;
  unit: string;
  occurrences: number;
  value: number;
  lastSeen: string;
}

export async function listCoverageGaps(
  organisationId: string,
  limit = 25,
): Promise<{ gaps: CoverageGap[]; matched: number; unmatched: number }> {
  const lines = await prisma.lineItem.findMany({
    where: {
      invoice: { organisationId, status: { in: ["analysed", "needs_review"] } },
    },
    select: {
      description: true,
      unit: true,
      amount: true,
      sorEntryId: true,
      invoice: { select: { uploadedAt: true } },
    },
  });

  const matched = lines.filter((line) => line.sorEntryId !== null).length;
  const unmatched = lines.length - matched;

  // Grouped on the leading words rather than the whole string: two vendors
  // describing the same work rarely word all of it identically, and a list with
  // one row per phrasing hides how much of the spend is really one gap.
  const groups = new Map<string, CoverageGap>();
  for (const line of lines) {
    if (line.sorEntryId !== null) continue;
    const key = line.description.toLowerCase().split(/\s+/).slice(0, 6).join(" ");
    const existing = groups.get(key);
    const seen = toISO(line.invoice.uploadedAt);
    if (existing) {
      existing.occurrences += 1;
      existing.value += line.amount;
      if (seen > existing.lastSeen) existing.lastSeen = seen;
    } else {
      groups.set(key, {
        description: line.description,
        unit: line.unit,
        occurrences: 1,
        value: line.amount,
        lastSeen: seen,
      });
    }
  }

  return {
    gaps: [...groups.values()].sort((a, b) => b.value - a.value).slice(0, limit),
    matched,
    unmatched,
  };
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
    lastActive: toISO(row.lastActive),
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
    at: toISO(row.at),
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
    uploadedAt: toISO(row.uploadedAt),
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
    lastRun: toISO(row.lastRun),
    nextRun: toISO(row.nextRun),
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
