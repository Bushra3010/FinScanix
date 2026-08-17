"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireEntitlement, requirePermission } from "@/lib/auth/guard";

/**
 * Rate library management — FR-9.1.
 *
 * Tenant-authored rates carry an organisationId; the seeded CPWD/State PWD rows
 * are shared and have none. A tenant can therefore add or override a rate
 * without touching the public rate book, and matching prefers their own entry
 * on a code collision (see listSorEntries).
 */

export interface RateActionState {
  error?: string;
  ok?: boolean;
  summary?: {
    total: number;
    accepted: number;
    rejected: number;
    problems: string[];
  };
}

const REQUIRED_COLUMNS = [
  "code",
  "description",
  "unit",
  "base_rate",
  "source",
  "chapter",
  "effective_from",
] as const;

/**
 * Minimal RFC-4180 reader: handles quoted fields and embedded commas, which
 * every real rate export contains because descriptions are full sentences.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ""));
}

/** Bulk rate import from CSV — FR-9.1. */
export async function importRatesAction(
  _prev: RateActionState,
  formData: FormData,
): Promise<RateActionState> {
  const user = await requirePermission("rates.manage");
  await requireEntitlement("bulk_upload");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to import." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { error: "Rate files are limited to 5 MB (roughly 40,000 rows)." };
  }

  const rows = parseCsv(await file.text());
  if (rows.length < 2) {
    return { error: "That file has a header but no data rows." };
  }

  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return { error: `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.` };
  }

  const index = Object.fromEntries(header.map((name, i) => [name, i])) as Record<string, number>;
  const problems: string[] = [];
  const accepted: {
    code: string;
    description: string;
    unit: string;
    baseRate: number;
    source: string;
    chapter: string;
    effectiveFrom: Date;
  }[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((row, offset) => {
    const lineNo = offset + 2; // 1-indexed, plus the header
    const value = (column: string) => (row[index[column]] ?? "").trim();

    const code = value("code");
    const description = value("description");
    const unit = value("unit");
    const rateRaw = value("base_rate").replace(/,/g, "");
    const source = value("source");
    const chapter = value("chapter");
    const effectiveRaw = value("effective_from");

    if (!code || !description || !unit) {
      problems.push(`Row ${lineNo}: code, description and unit are all required`);
      return;
    }
    const baseRate = Number(rateRaw);
    if (!Number.isFinite(baseRate) || baseRate < 0) {
      problems.push(`Row ${lineNo}: base_rate "${value("base_rate")}" is not a number`);
      return;
    }
    const effectiveFrom = new Date(effectiveRaw);
    if (Number.isNaN(effectiveFrom.getTime())) {
      problems.push(`Row ${lineNo}: effective_from "${effectiveRaw}" is not a valid date`);
      return;
    }
    if (seen.has(code)) {
      problems.push(`Row ${lineNo}: duplicate code "${code}" within this file`);
      return;
    }

    seen.add(code);
    accepted.push({
      code,
      description,
      unit: unit.toLowerCase(),
      baseRate,
      source: source || "Uploaded rate card",
      chapter: chapter || "Uncategorised",
      effectiveFrom,
    });
  });

  if (accepted.length === 0) {
    return {
      error: "No rows could be imported.",
      summary: { total: rows.length - 1, accepted: 0, rejected: problems.length, problems: problems.slice(0, 8) },
    };
  }

  // Upsert so re-importing a corrected file updates rather than duplicating.
  await prisma.$transaction(
    accepted.map((entry) =>
      prisma.sorEntry.upsert({
        where: {
          organisationId_code: { organisationId: user.organisation.id, code: entry.code },
        },
        create: { ...entry, organisationId: user.organisation.id },
        update: {
          description: entry.description,
          unit: entry.unit,
          baseRate: entry.baseRate,
          source: entry.source,
          chapter: entry.chapter,
          effectiveFrom: entry.effectiveFrom,
        },
      }),
    ),
  );

  await prisma.rateUpload.create({
    data: {
      organisationId: user.organisation.id,
      uploadedById: user.id,
      fileName: file.name,
      rowsTotal: rows.length - 1,
      rowsAccepted: accepted.length,
      rowsRejected: problems.length,
      status: problems.length > 0 ? "processed" : "processed",
      note: problems.length > 0 ? `${problems.length} rows rejected during validation` : null,
    },
  });

  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      kind: "rate_update",
      actor: user.name,
      message: `Imported ${file.name} — ${accepted.length} rates updated`,
    },
  });

  revalidatePath("/app/admin/rates");
  revalidatePath("/app/admin/uploads");

  return {
    ok: true,
    summary: {
      total: rows.length - 1,
      accepted: accepted.length,
      rejected: problems.length,
      problems: problems.slice(0, 8),
    },
  };
}

/** Adds or updates a single tenant-owned rate. */
export async function saveRateAction(
  _prev: RateActionState,
  formData: FormData,
): Promise<RateActionState> {
  const user = await requirePermission("rates.manage");

  const code = String(formData.get("code") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const unit = String(formData.get("unit") ?? "").trim().toLowerCase();
  const baseRate = Number(String(formData.get("baseRate") ?? "").replace(/,/g, ""));
  const source = String(formData.get("source") ?? "").trim() || "Own rate card";
  const chapter = String(formData.get("chapter") ?? "").trim() || "Uncategorised";
  const effectiveRaw = String(formData.get("effectiveFrom") ?? "");

  if (!code || !description || !unit) {
    return { error: "Code, description and unit are required." };
  }
  if (!Number.isFinite(baseRate) || baseRate < 0) {
    return { error: "Base rate must be a number of zero or more." };
  }
  const effectiveFrom = new Date(effectiveRaw || Date.now());
  if (Number.isNaN(effectiveFrom.getTime())) {
    return { error: "Effective date is not valid." };
  }

  await prisma.sorEntry.upsert({
    where: { organisationId_code: { organisationId: user.organisation.id, code } },
    create: {
      organisationId: user.organisation.id,
      code,
      description,
      unit,
      baseRate,
      source,
      chapter,
      effectiveFrom,
    },
    update: { description, unit, baseRate, source, chapter, effectiveFrom },
  });

  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      kind: "rate_update",
      actor: user.name,
      message: `Saved rate ${code}`,
    },
  });

  revalidatePath("/app/admin/rates");
  return { ok: true };
}

/**
 * Removes a tenant-owned rate. The shared public rate book is never deletable
 * from a tenant session — the where clause simply will not match it.
 */
export async function deleteRateAction(formData: FormData) {
  const user = await requirePermission("rates.manage");
  const id = String(formData.get("id") ?? "");

  const deleted = await prisma.sorEntry.deleteMany({
    where: { id, organisationId: user.organisation.id },
  });

  if (deleted.count > 0) {
    await prisma.activityEvent.create({
      data: {
        organisationId: user.organisation.id,
        kind: "rate_update",
        actor: user.name,
        message: "Removed a rate from the library",
      },
    });
  }

  revalidatePath("/app/admin/rates");
  return { ok: deleted.count > 0 };
}
