import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { CITIES, SOR_CATALOG } from "../src/lib/data/reference";
import { INVOICES } from "../src/lib/data/invoices";
import {
  ACTIVITY,
  CRON_JOBS,
  ORGANISATION,
  RATE_UPLOADS,
  USERS,
} from "../src/lib/data/org";

/**
 * Loads the demo dataset that the prototype previously held in memory.
 *
 * Fixture ids are preserved verbatim (org-001, u-001, sor-001, inv-0842 …) so
 * existing links, bookmarks and the sample-report reference on the marketing
 * page keep working after the move to a database.
 */

const prisma = new PrismaClient();

/** Development only. Documented in the README; not a production credential. */
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "FinScanix#Demo2026";

async function reset() {
  // Explicit order rather than relying on cascade, so the script is readable
  // and works the same on Postgres.
  await prisma.marketQuote.deleteMany();
  await prisma.lineItem.deleteMany();
  await prisma.qualityCheck.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.rateUpload.deleteMany();
  await prisma.cronJob.deleteMany();
  await prisma.session.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.sorEntry.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.city.deleteMany();
}

async function main() {
  console.log("Resetting database…");
  await reset();

  console.log(`Seeding ${CITIES.length} city cost indices…`);
  await prisma.city.createMany({
    data: CITIES.map((city) => ({
      id: city.id,
      name: city.name,
      state: city.state,
      pin: city.pin,
      indexFactor: city.indexFactor,
    })),
  });

  console.log(`Seeding ${SOR_CATALOG.length} Schedule of Rates entries…`);
  await prisma.sorEntry.createMany({
    data: SOR_CATALOG.map((entry) => ({
      id: entry.id,
      organisationId: null, // shared public rate book
      code: entry.code,
      description: entry.description,
      unit: entry.unit,
      baseRate: entry.baseRate,
      source: entry.source,
      chapter: entry.chapter,
      effectiveFrom: new Date(entry.effectiveFrom),
    })),
  });

  console.log("Seeding organisation…");
  await prisma.organisation.create({
    data: {
      id: ORGANISATION.id,
      name: ORGANISATION.name,
      gstin: ORGANISATION.gstin,
      defaultCityId: ORGANISATION.defaultCityId,
    },
  });

  console.log(`Seeding ${USERS.length} users…`);
  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const user of USERS) {
    await prisma.user.create({
      data: {
        id: user.id,
        organisationId: ORGANISATION.id,
        name: user.name,
        email: user.email.toLowerCase(),
        passwordHash,
        role: user.role,
        status: user.status,
        lastActive: new Date(user.lastActive),
      },
    });
  }

  const usersByName = new Map(USERS.map((user) => [user.name, user.id]));
  const fallbackUserId = USERS[0].id;

  console.log("Seeding subscription…");
  const subscription = ORGANISATION.subscription;
  await prisma.subscription.create({
    data: {
      organisationId: ORGANISATION.id,
      tierId: subscription.tierId,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      renewsOn: new Date(subscription.renewsOn),
      documentsUsed: subscription.documentsUsed,
      seatsUsed: subscription.seatsUsed,
    },
  });

  console.log(`Seeding ${INVOICES.length} documents…`);
  for (const invoice of INVOICES) {
    await prisma.invoice.create({
      data: {
        id: invoice.id,
        organisationId: ORGANISATION.id,
        number: invoice.number,
        documentType: invoice.documentType,
        vendor: invoice.vendor,
        vendorGstin: invoice.vendorGstin,
        project: invoice.project,
        cityId: invoice.cityId,
        uploadedById: usersByName.get(invoice.uploadedBy) ?? fallbackUserId,
        uploadedAt: new Date(invoice.uploadedAt),
        processedAt: invoice.processedAt ? new Date(invoice.processedAt) : null,
        status: invoice.status,
        fileName: invoice.fileName,
        fileSizeKb: invoice.fileSizeKb,
        pageCount: invoice.pageCount,
        taxPct: invoice.taxPct,
        qualityPassed: invoice.quality.passed,
        qualityScore: invoice.quality.score,
        rejectionReason: invoice.quality.rejectionReason ?? null,

        qualityChecks: {
          create: invoice.quality.checks.map((check, index) => ({
            key: check.id,
            label: check.label,
            passed: check.passed,
            detail: check.detail,
            position: index,
          })),
        },

        lineItems: {
          create: invoice.lineItems.map((line) => ({
            id: line.id,
            srNo: line.srNo,
            description: line.description,
            unit: line.unit,
            quantity: line.quantity,
            rate: line.rate,
            amount: line.amount,
            confDescription: line.confidence.description,
            confQuantity: line.confidence.quantity,
            confRate: line.confidence.rate,
            corrected: line.corrected ?? false,
            sorEntryId: line.sorMatch?.sorId ?? null,
            sorMatchScore: line.sorMatch?.matchScore ?? null,
            sorIndexFactor: line.sorMatch?.indexFactor ?? null,
            sorAdjustedRate: line.sorMatch?.adjustedRate ?? null,
            marketQuotes: {
              create: line.marketQuotes.map((quote) => ({
                id: quote.id,
                seller: quote.seller,
                platform: quote.platform,
                price: quote.price,
                unit: quote.unit,
                location: quote.location,
                url: quote.url,
                fetchedAt: new Date(quote.fetchedAt),
                inStock: quote.inStock,
              })),
            },
          })),
        },
      },
    });
  }

  console.log(`Seeding ${RATE_UPLOADS.length} rate uploads…`);
  for (const upload of RATE_UPLOADS) {
    await prisma.rateUpload.create({
      data: {
        id: upload.id,
        organisationId: ORGANISATION.id,
        uploadedById: usersByName.get(upload.uploadedBy) ?? fallbackUserId,
        fileName: upload.fileName,
        uploadedAt: new Date(upload.uploadedAt),
        rowsTotal: upload.rowsTotal,
        rowsAccepted: upload.rowsAccepted,
        rowsRejected: upload.rowsRejected,
        status: upload.status,
        note: upload.note ?? null,
      },
    });
  }

  console.log(`Seeding ${CRON_JOBS.length} scheduled jobs…`);
  await prisma.cronJob.createMany({
    data: CRON_JOBS.map((job) => ({
      id: job.id,
      organisationId: ORGANISATION.id,
      name: job.name,
      schedule: job.schedule,
      target: job.target,
      lastRun: new Date(job.lastRun),
      nextRun: new Date(job.nextRun),
      lastStatus: job.lastStatus,
      itemsRefreshed: job.itemsRefreshed,
      enabled: job.enabled,
    })),
  });

  console.log(`Seeding ${ACTIVITY.length} activity events…`);
  await prisma.activityEvent.createMany({
    data: ACTIVITY.map((event) => ({
      id: event.id,
      organisationId: ORGANISATION.id,
      invoiceId: event.invoiceId ?? null,
      kind: event.kind,
      actor: event.actor,
      message: event.message,
      at: new Date(event.at),
    })),
  });

  const counts = {
    cities: await prisma.city.count(),
    sorEntries: await prisma.sorEntry.count(),
    users: await prisma.user.count(),
    invoices: await prisma.invoice.count(),
    lineItems: await prisma.lineItem.count(),
    marketQuotes: await prisma.marketQuote.count(),
  };

  console.log("\nSeed complete:", counts);
  console.log(`\nDemo sign-in — password for every account: ${SEED_PASSWORD}`);
  for (const user of USERS.filter((u) => u.status === "active")) {
    console.log(`  ${user.role.padEnd(10)} ${user.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
