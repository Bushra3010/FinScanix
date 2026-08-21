import { INVOICES, buildQuotes } from "../data/invoices";
import { SOR_CATALOG, getCity } from "../data/reference";
import { answerInDomain, classifyDomain, OUT_OF_DOMAIN_REPLY } from "../assistant";
import { getTier } from "../data/org";
import type { LineItem, MarketQuote, QualityReport } from "../types";
import type {
  AssistantAdapter,
  ExtractionAdapter,
  PaymentAdapter,
  PricingSearchAdapter,
  QualityGateAdapter,
} from "./types";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];

/** FR-1.2 — heuristic stand-in for the real image-quality/relevance classifier. */
export const mockQualityGate: QualityGateAdapter = {
  id: "quality-gate",
  provider: "Mock heuristic gate",
  live: false,
  requiredEnv: ["ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY"],

  async assess({ fileName, sizeKb, mimeType }): Promise<QualityReport> {
    const name = fileName.toLowerCase();
    const isImage = mimeType.startsWith("image/");

    const unsupported = !ACCEPTED_TYPES.includes(mimeType);
    // Note: an `IMG_####` name is NOT a relevance signal — photographing an
    // invoice on a phone is a first-class path, and the real classifier reads
    // page content, not the filename.
    const looksLikeSnapshot =
      /(selfie|screenshot|whatsapp|wallpaper|offsite|holiday|vacation|family|team-)/i.test(name) ||
      /^dsc[_-]?\d/i.test(name);
    const looksBlurred = /(blur|shaky|unclear|smudge)/i.test(name);
    const tooSmall = sizeKb < 25;
    const tooLarge = sizeKb > 25000;

    if (unsupported) {
      return {
        passed: false,
        score: 0,
        rejectionReason: `Unsupported file type (${mimeType || "unknown"}). Upload a PDF or an image (JPG, PNG, WebP).`,
        checks: [
          {
            id: "relevance",
            label: "Business document check",
            passed: false,
            detail: "File type cannot contain an invoice or quotation",
          },
        ],
      };
    }

    const checks: QualityReport["checks"] = [
      {
        id: "readable",
        label: "Text legibility",
        passed: !looksBlurred && !tooSmall,
        detail: looksBlurred
          ? "Motion blur detected across the page"
          : tooSmall
            ? "File is unusually small — likely a thumbnail or partial capture"
            : isImage
              ? "Contrast normalised, characters resolved cleanly"
              : "Embedded text layer found",
      },
      {
        id: "skew",
        label: "Page skew & orientation",
        passed: true,
        detail: isImage ? "Skew corrected automatically" : "Not applicable to digital PDFs",
      },
      {
        id: "resolution",
        label: "Effective resolution",
        passed: !tooSmall,
        detail: tooSmall ? "Below 150 DPI equivalent" : isImage ? "≈ 320 DPI equivalent" : "Vector source",
      },
      {
        id: "relevance",
        label: "Business document check",
        passed: !looksLikeSnapshot,
        detail: looksLikeSnapshot
          ? "No invoice header, GSTIN or line-item table detected — looks like a personal photo"
          : "Tax invoice / quotation layout detected",
      },
      {
        id: "tables",
        label: "Table structure",
        passed: !looksBlurred,
        detail: looksBlurred ? "Line-item grid could not be resolved" : "Line-item grid detected",
      },
      {
        id: "size",
        label: "File size",
        passed: !tooLarge,
        detail: tooLarge ? "Over the 25 MB limit" : `${(sizeKb / 1024).toFixed(1)} MB`,
      },
    ];

    const passedCount = checks.filter((c) => c.passed).length;
    const score = passedCount / checks.length;
    const failed = checks.filter((c) => !c.passed);

    return {
      passed: failed.length === 0,
      score,
      checks,
      // Order matters: report the defect that actually blocks extraction, not
      // whichever check happens to be listed first.
      rejectionReason:
        failed.length === 0
          ? undefined
          : looksBlurred
            ? "Image is too blurred to extract line items reliably. Re-shoot the document flat, in even light, with the full page in frame — or upload the original PDF."
            : looksLikeSnapshot
              ? "This file does not appear to be a vendor invoice or quotation. Upload a tax invoice, quotation, or work order."
              : tooLarge
                ? "File exceeds the 25 MB upload limit. Split the document or compress the scan."
                : "Scan quality is below the threshold needed for reliable extraction. Re-scan at 300 DPI or higher.",
    };
  },
};

/** FR-2.1 — replays a known document so the review screen has real content. */
export const mockExtraction: ExtractionAdapter = {
  id: "extraction",
  provider: "Mock replay (fixture-backed)",
  live: false,
  requiredEnv: ["ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY"],

  async extract({ cityId }) {
    const template = INVOICES.find((i) => i.id === "inv-0842")!;
    const lineItems: LineItem[] = template.lineItems.map((item, idx) => ({
      ...item,
      id: `draft-L${idx + 1}`,
    }));

    return {
      lineItems,
      pageCount: template.pageCount,
      vendor: template.vendor,
      vendorGstin: template.vendorGstin,
      documentNumber: template.number,
      taxPct: template.taxPct,
      ...(cityId ? {} : {}),
    };
  },
};

/** FR-4.1 — synthesises quotes around the location-adjusted SoR rate. */
export const mockPricingSearch: PricingSearchAdapter = {
  id: "pricing",
  provider: "Mock market index",
  live: false,
  requiredEnv: ["SERPER_API_KEY"],

  async search({ description, unit, cityId, limit = 3 }): Promise<MarketQuote[]> {
    const city = getCity(cityId);
    const isGcc = city?.region === "gcc";
    const words = description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

    let best = SOR_CATALOG[0];
    let bestScore = 0;
    for (const entry of SOR_CATALOG) {
      const text = entry.description.toLowerCase();
      const score = words.filter((w) => text.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    }

    const spreadMultiplier = isGcc ? 0.25 : 0.19;
    const centre = best.baseRate * (city?.indexFactor ?? 1) * (isGcc ? 1.05 : 1.02);
    const quotes = buildQuotes(
      `search-${cityId}-${description.slice(0, 24)}`,
      description,
      unit || best.unit,
      centre,
      limit,
      city?.name ?? "",
      new Date().toISOString(),
      spreadMultiplier,
    );

    return quotes.map((q) => ({
      ...q,
      currency: city?.currency ?? "INR",
      vatPct: city?.vatPct ?? null,
    }));
  },
};

/** FR-8.2 — returns a local URL that simulates a completed checkout. */
export const mockPayments: PaymentAdapter = {
  id: "payments",
  provider: "Mock checkout",
  live: false,
  requiredEnv: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],

  async createCheckout({ tierId, billingCycle, organisationId }) {
    const tier = getTier(tierId);
    const amount = billingCycle === "annual" ? tier.priceAnnual : tier.priceMonthly;
    const reference = `MOCK-${organisationId}-${tierId}-${billingCycle}`;
    return {
      checkoutUrl: `/app/settings/billing?checkout=mock&tier=${tierId}&cycle=${billingCycle}`,
      reference,
      amount,
    };
  },
};

/** FR-10 — real domain guard, canned answers. */
export const mockAssistant: AssistantAdapter = {
  id: "assistant",
  provider: "Domain guard + canned answers",
  live: false,
  requiredEnv: ["ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY"],

  async ask({ question }) {
    const verdict = classifyDomain(question);
    if (!verdict.inDomain) {
      return { answer: OUT_OF_DOMAIN_REPLY, outOfDomain: true };
    }
    return { answer: answerInDomain(question), outOfDomain: false };
  },
};
