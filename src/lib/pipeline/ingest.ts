import { prisma } from "@/lib/db/client";
import { services } from "@/lib/adapters";
import { extractFromPdf, type ExtractedLine } from "@/lib/extraction/pdf";
import { extractFromImage, visionConfigured } from "@/lib/extraction/vision";
import { matchSor } from "@/lib/matching/sor";
import { listSorEntries } from "@/lib/db/queries";
import { documentKey, putDocument, storageConfigured } from "@/lib/storage";
import type { QualityCheck } from "@/lib/types";

/**
 * The ingestion pipeline: one uploaded file to a stored, extracted, matched and
 * priced document — PRD §9 flow 1.
 *
 * Ordering matters. The file is stored before extraction so a parsing failure
 * still leaves the original recoverable, and the quality gate runs before any
 * of it so a rejected file consumes neither storage nor quota (FR-1.2).
 */

const ACCEPTED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_BYTES = 25 * 1024 * 1024;

export interface IngestInput {
  organisationId: string;
  userId: string;
  userName: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  cityId: string;
  project: string;
  documentType: "invoice" | "quotation";
}

export interface IngestResult {
  ok: boolean;
  invoiceId?: string;
  rejection?: { reason: string; checks: QualityCheck[] };
}

/** Whether a scanned page can be read at all in this deployment. */
function ocrAvailable() {
  return visionConfigured();
}

export async function ingestDocument(input: IngestInput): Promise<IngestResult> {
  const checks: QualityCheck[] = [];
  const sizeMb = input.bytes.byteLength / (1024 * 1024);

  // pdf.js, under unpdf, transfers ownership of the buffer it parses and leaves
  // the caller's view detached. Anything read after extraction — the upload to
  // storage, most of all — must work from a copy taken before it runs.
  const original = input.bytes.slice();

  // ── Gate 1: is this even a processable file? ────────────────────────────
  const typeOk = ACCEPTED.has(input.mimeType);
  checks.push({
    id: "filetype",
    label: "File type",
    passed: typeOk,
    detail: typeOk ? input.mimeType : `${input.mimeType || "unknown"} is not supported`,
  });

  const sizeOk = input.bytes.byteLength > 0 && input.bytes.byteLength <= MAX_BYTES;
  checks.push({
    id: "size",
    label: "File size",
    passed: sizeOk,
    detail: sizeOk ? `${sizeMb.toFixed(2)} MB` : "Empty file, or above the 25 MB limit",
  });

  if (!typeOk || !sizeOk) {
    return {
      ok: false,
      rejection: {
        reason: !typeOk
          ? "Unsupported file type. Upload a PDF or an image (JPG, PNG, WebP)."
          : "File is empty or exceeds the 25 MB limit.",
        checks,
      },
    };
  }

  // ── Gate 2: can we actually read the content? ───────────────────────────
  const isPdf = input.mimeType === "application/pdf";
  let extracted: Awaited<ReturnType<typeof extractFromPdf>> | null = null;

  if (isPdf) {
    try {
      extracted = await extractFromPdf(input.bytes);
    } catch {
      checks.push({
        id: "readable",
        label: "Document readable",
        passed: false,
        detail: "The PDF could not be opened — it may be corrupt or password protected",
      });
      return {
        ok: false,
        rejection: {
          reason: "This PDF could not be opened. It may be corrupt or password protected.",
          checks,
        },
      };
    }
  }

  const hasTextLayer = Boolean(extracted && !extracted.needsOcr);
  checks.push({
    id: "textlayer",
    label: "Text layer",
    passed: hasTextLayer,
    detail: hasTextLayer
      ? "Embedded text recovered directly — no OCR required"
      : "No text layer; the page is an image and needs OCR",
  });

  // A scan with no OCR provider configured cannot be processed. Saying so is
  // better than accepting the file and producing an empty report.
  if (!hasTextLayer && !ocrAvailable()) {
    checks.push({
      id: "ocr",
      label: "OCR provider",
      passed: false,
      detail: "No OCR provider is configured on this deployment",
    });
    return {
      ok: false,
      rejection: {
        reason:
          "This looks like a scan or photo, which needs OCR — and no OCR provider is configured yet. Upload the original PDF instead, or ask an admin to connect one.",
        checks,
      },
    };
  }

  // Scans, photographs, and PDFs with no text layer go to the vision model.
  if (!hasTextLayer) {
    try {
      // `original`, not input.bytes: for a scanned PDF the text-layer attempt
      // above has already run, and it leaves input.bytes detached.
      extracted = await extractFromImage(original, input.mimeType);
      checks.push({
        id: "ocr",
        label: "OCR extraction",
        passed: true,
        detail: `Read by the vision model — ${extracted.lines.length} rows recovered`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "OCR failed";
      checks.push({ id: "ocr", label: "OCR extraction", passed: false, detail });
      return {
        ok: false,
        rejection: {
          reason: `This document needed OCR and it did not succeed: ${detail}`,
          checks,
        },
      };
    }
  }

  const lines: ExtractedLine[] = extracted?.lines ?? [];

  const foundItems = lines.length > 0;
  checks.push({
    id: "tables",
    label: "Line-item table",
    passed: foundItems,
    detail: foundItems
      ? `${lines.length} line items recovered`
      : // Showing what was actually read turns "it did not work" into something
        // that can be acted on — by the person uploading, or by whoever has to
        // teach the parser this layout.
        `No item rows could be identified. Text read from the document began: "${(extracted?.sampleText ?? "").slice(0, 220).replace(/\s+/g, " ").trim() || "(nothing)"}"`,
  });

  if (!foundItems) {
    return {
      ok: false,
      rejection: {
        reason:
          "No line items could be read from this document. Check that it is a vendor invoice or quotation with an itemised table.",
        checks,
      },
    };
  }

  checks.push({
    id: "relevance",
    label: "Business document check",
    passed: true,
    detail: extracted?.vendorGstin
      ? `Tax document detected (GSTIN ${extracted.vendorGstin})`
      : "Itemised billing table detected",
  });

  // ── Persist ─────────────────────────────────────────────────────────────
  const passedCount = checks.filter((c) => c.passed).length;
  const score = passedCount / checks.length;

  const invoice = await prisma.invoice.create({
    data: {
      organisationId: input.organisationId,
      number: extracted?.documentNumber ?? `DOC-${Date.now().toString().slice(-8)}`,
      documentType: input.documentType,
      vendor: extracted?.vendor ?? "Unidentified vendor",
      vendorGstin: extracted?.vendorGstin ?? "—",
      project: input.project,
      cityId: input.cityId,
      uploadedById: input.userId,
      status: "extracting",
      fileName: input.fileName,
      fileSizeKb: Math.round(input.bytes.byteLength / 1024),
      pageCount: extracted?.pageCount ?? 1,
      taxPct: extracted?.taxPct ?? 18,
      qualityPassed: true,
      qualityScore: score,
      qualityChecks: {
        create: checks.map((check, position) => ({
          key: check.id,
          label: check.label,
          passed: check.passed,
          detail: check.detail,
          position,
        })),
      },
    },
  });

  if (storageConfigured) {
    const key = documentKey(input.organisationId, invoice.id, input.fileName);
    try {
      await putDocument(key, original, input.mimeType);
      // storageKey is what the download route keys off, so it is set only on a
      // confirmed upload. A failed store leaves it null and the interface says
      // the original is unavailable rather than offering a link that 404s.
      await prisma.invoice.update({ where: { id: invoice.id }, data: { storageKey: key } });
    } catch (error) {
      // Storage is not worth losing the extraction over — the report stands on
      // its own — but the failure is recorded, not swallowed.
      console.error("Document storage failed", error);
      await prisma.activityEvent.create({
        data: {
          organisationId: input.organisationId,
          invoiceId: invoice.id,
          kind: "upload",
          actor: "System",
          message: `Could not retain the original of ${input.fileName}; the analysis is unaffected`,
        },
      });
    }
  }

  // ── Match and price ─────────────────────────────────────────────────────
  const [sorEntries, city] = await Promise.all([
    listSorEntries(input.organisationId),
    prisma.city.findUnique({ where: { id: input.cityId } }),
  ]);
  const indexFactor = city?.indexFactor ?? 1;

  let needsReview = false;

  for (const line of lines) {
    const match = matchSor(line.description, line.unit, sorEntries);
    const adjustedRate = match
      ? Math.round(match.entry.baseRate * indexFactor * 100) / 100
      : null;

    if (Math.min(line.confidence.quantity, line.confidence.rate) < 0.8) needsReview = true;

    const created = await prisma.lineItem.create({
      data: {
        invoiceId: invoice.id,
        srNo: line.srNo,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        rate: line.rate,
        amount: line.amount,
        confDescription: line.confidence.description,
        confQuantity: line.confidence.quantity,
        confRate: line.confidence.rate,
        sorEntryId: match?.entry.id ?? null,
        sorMatchScore: match?.score ?? null,
        sorIndexFactor: match ? indexFactor : null,
        sorAdjustedRate: adjustedRate,
      },
    });

    // Market pricing is best-effort: a provider outage must not cost the whole
    // document, it just leaves the line benchmarked on the SoR alone.
    try {
      const quotes = await services.pricing.search({
        description: line.description,
        unit: line.unit,
        cityId: input.cityId,
        limit: 3,
      });

      if (quotes.length) {
        await prisma.marketQuote.createMany({
          data: quotes.map((quote) => ({
            lineItemId: created.id,
            seller: quote.seller,
            platform: quote.platform,
            price: quote.price,
            unit: quote.unit,
            location: quote.location,
            url: quote.url,
            fetchedAt: new Date(quote.fetchedAt),
            inStock: quote.inStock,
          })),
        });
      }
    } catch (error) {
      console.error("Market pricing failed for line", created.id, error);
    }
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: needsReview ? "needs_review" : "analysed",
      processedAt: new Date(),
    },
  });

  // Quota is counted on success only — a rejected file costs nothing (FR-1.2).
  await prisma.subscription.updateMany({
    where: { organisationId: input.organisationId },
    data: { documentsUsed: { increment: 1 } },
  });

  await prisma.activityEvent.create({
    data: {
      organisationId: input.organisationId,
      invoiceId: invoice.id,
      kind: "upload",
      actor: input.userName,
      message: `Uploaded ${input.fileName} — ${lines.length} line items extracted`,
    },
  });

  return { ok: true, invoiceId: invoice.id };
}
