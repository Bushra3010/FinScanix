"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requirePermission } from "@/lib/auth/guard";
import { getTier } from "@/lib/data/org";
import { ingestDocument } from "@/lib/pipeline/ingest";
import { removeDocumentPrefix, storageConfigured } from "@/lib/storage";
import type { QualityCheck } from "@/lib/types";

export interface UploadState {
  error?: string;
  rejection?: { reason: string; checks: QualityCheck[] };
  invoiceId?: string;
}

/**
 * Upload and process one document — FR-1.1 through FR-5.
 *
 * Permission and quota are both checked here rather than in the browser: the
 * upload screen can be bypassed, this cannot (FR-8.3).
 */
export async function uploadDocumentAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requirePermission("invoice.upload");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  // Quota, enforced server-side against the subscription record.
  const tier = getTier(user.organisation.subscription.tierId);
  const subscription = await prisma.subscription.findUnique({
    where: { organisationId: user.organisation.id },
  });
  const used = subscription?.documentsUsed ?? 0;

  if (tier.documentQuota !== null && used >= tier.documentQuota) {
    return {
      error: `You have used all ${tier.documentQuota} documents on the ${tier.name} plan this cycle. Upgrade or wait for the reset to upload more.`,
    };
  }

  const cityId = String(formData.get("cityId") ?? user.organisation.defaultCityId);
  const project = String(formData.get("project") ?? "").trim() || "Unassigned";
  const documentType =
    String(formData.get("documentType") ?? "invoice") === "quotation"
      ? "quotation"
      : "invoice";

  const result = await ingestDocument({
    organisationId: user.organisation.id,
    userId: user.id,
    userName: user.name,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
    cityId,
    project,
    documentType,
  });

  if (!result.ok || !result.invoiceId) {
    return { rejection: result.rejection };
  }

  revalidatePath("/app/invoices");
  revalidatePath("/app/dashboard");

  // redirect() signals by throwing, so it stays outside the guarded work.
  redirect(`/app/invoices/${result.invoiceId}`);
}

/**
 * Persists a reviewer's correction — FR-2.3.
 *
 * Confidence goes to 1 for the corrected fields: a human has now confirmed
 * them, which is a stronger signal than any extraction score.
 */
export async function saveLineCorrectionAction(formData: FormData) {
  const user = await requirePermission("invoice.correct");

  const lineId = String(formData.get("lineId") ?? "");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const quantity = Number(formData.get("quantity"));
  const rate = Number(formData.get("rate"));

  if (!lineId || !invoiceId) return { error: "Missing line reference." };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be above zero." };
  if (!Number.isFinite(rate) || rate < 0) return { error: "Rate cannot be negative." };

  // Scoped by tenant: a line id from another organisation matches nothing.
  const line = await prisma.lineItem.findFirst({
    where: { id: lineId, invoice: { id: invoiceId, organisationId: user.organisation.id } },
  });
  if (!line) return { error: "That line item no longer exists." };

  await prisma.lineItem.update({
    where: { id: line.id },
    data: {
      quantity,
      rate,
      amount: Math.round(quantity * rate * 100) / 100,
      corrected: true,
      confDescription: 1,
      confQuantity: 1,
      confRate: 1,
    },
  });

  // Once every low-confidence field has been confirmed, the document is no
  // longer awaiting review.
  const remaining = await prisma.lineItem.count({
    where: {
      invoiceId,
      OR: [{ confQuantity: { lt: 0.8 } }, { confRate: { lt: 0.8 } }],
    },
  });

  if (remaining === 0) {
    await prisma.invoice.updateMany({
      where: { id: invoiceId, organisationId: user.organisation.id, status: "needs_review" },
      data: { status: "analysed" },
    });
  }

  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      invoiceId,
      kind: "correction",
      actor: user.name,
      message: `Corrected line ${line.srNo} on a document`,
    },
  });

  revalidatePath(`/app/invoices/${invoiceId}`);
  return { ok: true };
}

/**
 * Deletes one document and its artifacts — FR-11.2.
 *
 * Line items, quotes, checks and timeline rows go with it by cascade; storage
 * objects are removed by prefix. Nothing outside this document is touched.
 */
export async function deleteInvoiceAction(formData: FormData) {
  const user = await requirePermission("invoice.delete");
  const invoiceId = String(formData.get("invoiceId") ?? "");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organisationId: user.organisation.id },
    select: { id: true, number: true, fileName: true },
  });
  if (!invoice) redirect("/app/invoices");

  await prisma.invoice.delete({ where: { id: invoice.id } });

  if (storageConfigured) {
    try {
      await removeDocumentPrefix(`${user.organisation.id}/${invoice.id}`);
    } catch (error) {
      console.error("Storage cleanup failed for", invoice.id, error);
    }
  }

  // Written without invoiceId so the audit trail survives the deletion.
  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      kind: "upload",
      actor: user.name,
      message: `Deleted document ${invoice.number} (${invoice.fileName}) and its artifacts`,
    },
  });

  revalidatePath("/app/invoices");
  revalidatePath("/app/dashboard");
  redirect("/app/invoices");
}

/**
 * Re-prices a document against a different city — SoW section 3.
 *
 * The city index multiplies every benchmark rate, so changing it is not a label
 * change: each matched line's adjusted rate has to be recomputed, or the report
 * would show one city and benchmark against another. Extracted figures are left
 * exactly as they are — only the reference rates move.
 */
export async function setInvoiceCityAction(formData: FormData) {
  const user = await requirePermission("invoice.correct");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const cityId = String(formData.get("cityId") ?? "");

  const [invoice, city] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, organisationId: user.organisation.id },
      include: { lineItems: { include: { sorEntry: true } } },
    }),
    prisma.city.findUnique({ where: { id: cityId } }),
  ]);

  if (!invoice) return { error: "That document is not in your organisation." };
  if (!city) return { error: "Choose a valid location." };
  if (invoice.cityId === cityId) return { ok: true };

  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoice.id }, data: { cityId } }),
    ...invoice.lineItems
      .filter((line) => line.sorEntry !== null)
      .map((line) =>
        prisma.lineItem.update({
          where: { id: line.id },
          data: {
            sorIndexFactor: city.indexFactor,
            sorAdjustedRate:
              Math.round(line.sorEntry!.baseRate * city.indexFactor * 100) / 100,
          },
        }),
      ),
  ]);

  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      invoiceId: invoice.id,
      kind: "correction",
      actor: user.name,
      message: `Re-priced ${invoice.number} against ${city.name} (index x${city.indexFactor.toFixed(2)})`,
    },
  });

  revalidatePath(`/app/invoices/${invoice.id}`);
  return { ok: true };
}
