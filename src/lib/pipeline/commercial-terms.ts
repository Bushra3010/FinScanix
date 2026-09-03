import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { extractTermsWithGemini, geminiConfigured } from "@/lib/extraction/vision-gemini";
import { signedDocumentUrl } from "@/lib/storage";
import type { CommercialTerms } from "@/lib/commercial-terms";

/**
 * Terms for a document analysed before they were captured — FR-3.5.
 *
 * Unlike scope gaps, terms cannot be inferred from the line items: a payment
 * schedule is printed in its own block and appears nowhere in the priced rows.
 * So the stored original is read again, once, and the answer kept.
 *
 * Documents whose original was not retained keep no terms. That is the honest
 * outcome — a payment schedule invented from nothing is worse than a blank
 * section — and re-uploading the file fills it in.
 */

/** Storage keeps the upload under its original name; the extension is the type. */
function mimeFromName(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export async function ensureCommercialTerms(invoiceId: string): Promise<CommercialTerms | null> {
  const row = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { commercialTerms: true, storageKey: true, fileName: true },
  });
  if (!row) return null;

  // An object here means the document was already read — including `{}`, which
  // records that it was read and stated nothing.
  if (row.commercialTerms && typeof row.commercialTerms === "object" && !Array.isArray(row.commercialTerms)) {
    return row.commercialTerms as CommercialTerms;
  }
  // No retained original means the terms can never be recovered — they are
  // printed on a page nobody kept. Recording that closes the question; leaving
  // it open had every view of those documents re-run the lookup and find the
  // same nothing.
  if (!row.storageKey) {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { commercialTerms: {} },
    });
    return null;
  }

  // A missing key is a deployment condition, not a fact about the document, so
  // that one is left open to be answered once the key is there.
  if (!geminiConfigured()) return null;

  try {
    const url = await signedDocumentUrl(row.storageKey);
    if (!url) return null;
    const response = await fetch(url);
    if (!response.ok) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    const terms = await extractTermsWithGemini(bytes, mimeFromName(row.fileName));

    // Written even when empty, so a document with no terms block is not re-read
    // on every page view.
    await prisma.invoice.update({
      where: { id: invoiceId },
      // Prisma's JSON input wants an index signature; the shape is ours to keep.
      data: { commercialTerms: (terms ?? {}) as Prisma.InputJsonObject },
    });
    return terms ?? null;
  } catch {
    // A terms read that did not happen is not worth failing a report over.
    return null;
  }
}
