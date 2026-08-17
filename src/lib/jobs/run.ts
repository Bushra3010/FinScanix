import { prisma } from "@/lib/db/client";
import { services } from "@/lib/adapters";
import { nextRunAfter } from "./cron";
import type { CronKind } from "@/lib/types";

/**
 * Scheduled job execution — FR-9.2.
 *
 * The screen at /app/admin/schedule manages these; this file is what actually
 * runs them. Two entry points share it: an admin pressing "Run now", and the
 * /api/cron endpoint an external scheduler calls on a timer.
 */

export interface JobResult {
  status: "success" | "partial" | "failed";
  itemsRefreshed: number;
  detail: string;
}

/** How old a market quote may be before a refresh is worth doing. */
const STALE_AFTER_DAYS = 30;

/** A single run touches at most this many lines, so one job cannot run away. */
const MAX_LINES_PER_RUN = 120;

/**
 * Re-fetches market pricing for lines whose quotes have gone stale.
 *
 * `onlyStale` is what separates the two pricing jobs: the routine refresh takes
 * the oldest quotes regardless, the stale sweep takes only those past the
 * threshold and reports zero when there is nothing to do.
 */
async function refreshPrices(organisationId: string, onlyStale: boolean): Promise<JobResult> {
  const cutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60_000);

  const lines = await prisma.lineItem.findMany({
    where: {
      invoice: { organisationId, status: { in: ["analysed", "needs_review"] } },
      ...(onlyStale
        ? { marketQuotes: { some: { fetchedAt: { lt: cutoff } } } }
        : {}),
    },
    include: {
      invoice: { select: { cityId: true } },
      marketQuotes: { orderBy: { fetchedAt: "asc" }, take: 1 },
    },
    // Oldest pricing first — the lines most likely to be wrong get seen first
    // when a run hits the cap.
    orderBy: { invoice: { uploadedAt: "desc" } },
    take: MAX_LINES_PER_RUN,
  });

  if (lines.length === 0) {
    return {
      status: "success",
      itemsRefreshed: 0,
      detail: onlyStale
        ? `No quotes older than ${STALE_AFTER_DAYS} days.`
        : "No priced line items to refresh.",
    };
  }

  let refreshed = 0;
  let failed = 0;

  for (const line of lines) {
    try {
      const quotes = await services.pricing.search({
        description: line.description,
        unit: line.unit,
        cityId: line.invoice.cityId,
        limit: 3,
      });

      if (quotes.length === 0) {
        // No listing found. The previous quotes stay — dropping them would make
        // the report worse, not more current.
        failed += 1;
        continue;
      }

      // Replace atomically so a line is never left with no pricing at all.
      await prisma.$transaction([
        prisma.marketQuote.deleteMany({ where: { lineItemId: line.id } }),
        prisma.marketQuote.createMany({
          data: quotes.map((quote) => ({
            lineItemId: line.id,
            seller: quote.seller,
            platform: quote.platform,
            price: quote.price,
            unit: quote.unit,
            location: quote.location,
            url: quote.url,
            fetchedAt: new Date(quote.fetchedAt),
            inStock: quote.inStock,
          })),
        }),
      ]);
      refreshed += 1;
    } catch (error) {
      failed += 1;
      console.error("Price refresh failed for line", line.id, error);
    }
  }

  return {
    status: failed === 0 ? "success" : refreshed > 0 ? "partial" : "failed",
    itemsRefreshed: refreshed,
    detail:
      failed === 0
        ? `Refreshed pricing on ${refreshed} line items.`
        : `Refreshed ${refreshed} of ${lines.length}; ${failed} returned no usable listing and kept their previous quotes.`,
  };
}

/**
 * Checks the rate book for entries that have aged past a publication cycle.
 *
 * There is no machine-readable CPWD/State PWD revision feed, so this reports
 * what has gone stale rather than pretending to have downloaded a new edition.
 */
async function checkSorRevisions(organisationId: string): Promise<JobResult> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  const [stale, total] = await Promise.all([
    prisma.sorEntry.count({
      where: {
        OR: [{ organisationId: null }, { organisationId }],
        effectiveFrom: { lt: cutoff },
      },
    }),
    prisma.sorEntry.count({ where: { OR: [{ organisationId: null }, { organisationId }] } }),
  ]);

  if (stale === 0) {
    return { status: "success", itemsRefreshed: 0, detail: `All ${total} rates are within a year of their effective date.` };
  }

  await prisma.activityEvent.create({
    data: {
      organisationId,
      kind: "rate_update",
      actor: "Scheduled job",
      message: `${stale} of ${total} rates are more than a year old — check for a newer rate-book edition`,
    },
  });

  return {
    status: "partial",
    itemsRefreshed: stale,
    detail: `${stale} of ${total} rates predate the last 12 months. No automated publication feed exists for CPWD/State PWD books, so a newer edition has to be imported from Bulk upload.`,
  };
}

export async function runJob(job: {
  id: string;
  organisationId: string;
  name: string;
  schedule: string;
  kind: string;
}): Promise<JobResult> {
  let result: JobResult;

  try {
    switch (job.kind as CronKind) {
      case "price_refresh":
        result = await refreshPrices(job.organisationId, false);
        break;
      case "stale_sweep":
        result = await refreshPrices(job.organisationId, true);
        break;
      case "sor_revision":
        result = await checkSorRevisions(job.organisationId);
        break;
      default:
        result = { status: "failed", itemsRefreshed: 0, detail: `Unknown job kind "${job.kind}".` };
    }
  } catch (error) {
    result = {
      status: "failed",
      itemsRefreshed: 0,
      detail: error instanceof Error ? error.message : "The job failed.",
    };
  }

  const now = new Date();
  let nextRun: Date;
  try {
    nextRun = nextRunAfter(job.schedule, now);
  } catch {
    // A malformed schedule must not stop the run being recorded.
    nextRun = new Date(now.getTime() + 24 * 60 * 60_000);
  }

  await prisma.cronJob.update({
    where: { id: job.id },
    data: {
      lastRun: now,
      nextRun,
      lastStatus: result.status,
      itemsRefreshed: result.itemsRefreshed,
    },
  });

  return result;
}

/** Every enabled job across every organisation that is due to fire. */
export async function runDueJobs(now: Date = new Date()) {
  const due = await prisma.cronJob.findMany({
    where: { enabled: true, nextRun: { lte: now } },
    select: { id: true, organisationId: true, name: true, schedule: true, kind: true },
  });

  const results: { job: string; organisationId: string; result: JobResult }[] = [];
  for (const job of due) {
    results.push({ job: job.name, organisationId: job.organisationId, result: await runJob(job) });
  }
  return results;
}
