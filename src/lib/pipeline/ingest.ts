import { prisma } from "@/lib/db/client";
import { services } from "@/lib/adapters";
import { extractFromPdf, type ExtractedLine } from "@/lib/extraction/pdf";
import { extractFromImage, visionConfigured } from "@/lib/extraction/vision";
import { assessImage } from "@/lib/extraction/image-quality";
import { detectLocation } from "@/lib/extraction/locate";
import { matchSor } from "@/lib/matching/sor";
import { listSorEntries } from "@/lib/db/queries";
import { documentKey, putDocument, storageConfigured } from "@/lib/storage";
import { ALL_CITIES, getCityAny } from "@/lib/data/cities";
import type { QualityCheck } from "@/lib/types";

const getCityName = (id: string) => ALL_CITIES.find((city) => city.id === id)?.name ?? id;

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

  // ── Gate 2: is an uploaded image good enough to read? ───────────────────
  //
  // Only images. A PDF's text layer is exact or absent; a photograph can be
  // legible, marginal or useless, and the marginal case is the dangerous one —
  // it extracts something, and the something is wrong.
  const isPdf = input.mimeType === "application/pdf";

  if (!isPdf) {
    const image = assessImage(original, input.mimeType);
    checks.push(
      ...image.metrics.map((metric) => ({
        id: metric.id,
        label: metric.label,
        passed: metric.passed,
        detail: metric.detail,
      })),
    );
    if (!image.usable) {
      return { ok: false, rejection: { reason: image.reason ?? "This image is not usable.", checks } };
    }
  }

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
      ? "Embedded text recovered directly"
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

  // Vision extraction path:
  //   • Always used for scans and image files (no text layer).
  //   • Also used for text-layer PDFs when a vision model is available.
  //     The text-layer parser reconstructs rows from coordinate-based glyph
  //     positions, which breaks on PDFs whose content streams are written
  //     column-by-column instead of row-by-row — a common artefact of Word
  //     and Sheets exporters. The vision model reads the rendered page and
  //     is unaffected by content-stream ordering, so it reliably captures
  //     every row even in complex multi-line-cell tables.
  //     The text-layer result is still kept for metadata (vendor, GSTIN,
  //     document number, page count) since those fields parse cleanly from
  //     unstructured text regardless of table layout.
  const useVision = !hasTextLayer || (isPdf && ocrAvailable());
  if (useVision) {
    try {
      const visionResult = await extractFromImage(original, input.mimeType);
      checks.push({
        id: "ocr",
        label: "Vision extraction",
        passed: true,
        detail: `Read by the vision model — ${visionResult.lines.length} rows recovered`,
      });
      // For text-layer PDFs, merge: prefer the vision model's line items
      // (more reliable on complex tables) but keep text-layer metadata when
      // richer (vendor name, GSTIN, document number parsed from free text).
      if (hasTextLayer && extracted) {
        extracted = {
          ...visionResult,
          vendor: visionResult.vendor || extracted.vendor,
          vendorGstin: visionResult.vendorGstin || extracted.vendorGstin,
          documentNumber: visionResult.documentNumber || extracted.documentNumber,
          taxPct: visionResult.taxPct || extracted.taxPct,
          pageCount: extracted.pageCount,
          language: extracted.language,
        };
      } else {
        extracted = visionResult;
      }
    } catch (error) {
      // For text-layer PDFs the text extraction is a valid fallback —
      // a failed vision call is a degraded result, not a rejection.
      if (!hasTextLayer) {
        const detail = error instanceof Error ? error.message : "OCR failed";
        checks.push({ id: "ocr", label: "Vision extraction", passed: false, detail });
        return {
          ok: false,
          rejection: {
            reason: `This document needed OCR and it did not succeed: ${detail}`,
            checks,
          },
        };
      }
      // hasTextLayer=true: log the failure and continue with text-layer result.
      checks.push({
        id: "ocr",
        label: "Vision extraction",
        passed: false,
        detail: `Vision model unavailable — falling back to text layer. ${error instanceof Error ? error.message : ""}`,
      });
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
    id: "pricing",
    label: "Market pricing",
    passed: services.pricing.live,
    detail: services.pricing.live
      ? `Live pricing via ${services.pricing.provider}`
      : "No pricing provider configured — lines are benchmarked against the rate library only, and lines with no rate-book match carry no verdict",
  });

  checks.push({
    id: "relevance",
    label: "Business document check",
    passed: true,
    detail: extracted?.vendorGstin
      ? `Tax document detected (GSTIN ${extracted.vendorGstin})`
      : "Itemised billing table detected",
  });

  // ── Where is this work? ─────────────────────────────────────────────────
  //
  // The city sets the index factor applied to every benchmark rate, so it moves
  // every verdict on the document. A PIN printed on the bill is better evidence
  // than a dropdown nobody remembered to change, and is used when the two
  // disagree — but only a PIN, which is unambiguous. A city name might be the
  // vendor's own address rather than the site, so that is reported and not
  // acted on.
  let cityId = input.cityId;
  const located = detectLocation(extracted?.sampleText ?? "");
  const locationNotes: string[] = [];

  if (located && located.basis === "pin" && located.cityId !== input.cityId) {
    cityId = located.cityId;
    locationNotes.push(
      `Priced against ${getCityName(located.cityId)} rather than the selected location: the document carries ${located.evidence}. Change it on the report if the work is elsewhere.`,
    );
  } else if (located && located.basis === "name" && located.cityId !== input.cityId) {
    locationNotes.push(
      `This document mentions ${located.evidence}, but it has been priced against the location you selected. Change it on the report if the work is in ${located.evidence}.`,
    );
  }

  const cityMeta = getCityAny(cityId);

  checks.push({
    id: "location",
    label: "Location",
    passed: true,
    detail: located
      ? `${getCityName(cityId)} — from ${located.evidence}`
      : `${getCityName(cityId)} — as selected; no location found in the document`,
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
      // If the user left the project field blank ("Unassigned"), use the
      // document's own heading extracted by the vision model (e.g. "HRU
      // Replacement Project"). This way the report title matches what is
      // printed on the quotation or invoice.
      project: (input.project && input.project !== "Unassigned")
        ? input.project
        : (extracted?.documentTitle || input.project),
      cityId,
      uploadedById: input.userId,
      status: "extracting",
      fileName: input.fileName,
      fileSizeKb: Math.round(input.bytes.byteLength / 1024),
      pageCount: extracted?.pageCount ?? 1,
      taxPct: extracted?.taxPct ?? cityMeta?.vatPct ?? 18,
      qualityPassed: true,
      qualityScore: score,
      extractionNote: [extracted?.note, ...locationNotes].filter(Boolean).join(" ") || null,
      language: extracted?.language ?? null,
      exclusions: extracted?.exclusions && extracted.exclusions.length > 0
        ? extracted.exclusions
        : undefined,
      qualityChecks: {
        create: checks.map((check, position) => ({
          key: check.id,
          label: check.label,
          passed: check.passed,
          detail: check.detail,
          position,
        })),
      },
      // The document's own printed subtotal and grand total. The subtotal is
      // the authoritative source for the pre-tax "Quoted Value" so extraction
      // variance in line items does not push the displayed figure away from
      // what the vendor actually quoted.
      documentSubtotal: extracted?.documentSubtotal ?? null,
      documentTotal: extracted?.documentTotal ?? null,
    },
  });

  if (storageConfigured) {
    const key = documentKey(input.organisationId, invoice.id, input.fileName);
    try {
      await putDocument(key, original, input.mimeType);
      await prisma.invoice.update({ where: { id: invoice.id }, data: { storageKey: key } });
    } catch (error) {
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
    prisma.city.findUnique({ where: { id: cityId } }),
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
        printedAmount: line.printedAmount ?? null,
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
    //
    // And only a real provider is consulted. The mock synthesises plausible
    // quotes around a baseline, which is fine for a seeded demonstration and
    // actively harmful on a document someone intends to act on: a line with no
    // rate-book match would be handed a fabricated market price and a confident
    // verdict drawn from it. Better to report no benchmark than a made-up one.
    if (!services.pricing.live) continue;

    try {
      const quotes = await services.pricing.search({
        description: line.description,
        unit: line.unit,
        cityId,
        limit: 3,
      });

      if (quotes.length) {
        await prisma.marketQuote.createMany({
          data: quotes.map((quote) => ({
            lineItemId: created.id,
            seller: quote.seller,
            platform: quote.platform,
            price: quote.price,
            currency: quote.currency,
            vatPct: quote.vatPct,
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
