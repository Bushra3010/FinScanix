/**
 * FinScanix domain model.
 *
 * These types are the contract between the (currently mocked) data layer and
 * the UI. When the real backend lands, only the data layer changes — the
 * screens keep consuming these shapes.
 */

import type { CommercialTerms } from "@/lib/commercial-terms";

export type { CommercialTerms };

export type VarianceFlag = "over" | "under" | "par";

export type Role = "owner" | "admin" | "estimator" | "auditor" | "viewer";

export type TierId = "starter" | "professional" | "enterprise";

export type InvoiceStatus =
  | "rejected" // failed the image-quality gate (FR-1.2)
  | "queued"
  | "extracting"
  | "needs_review" // extracted, low-confidence fields await correction (FR-2.3)
  | "analysed" // variance report ready (FR-5.3)
  | "failed";

/** City cost-index factor applied to SoR base rates — FR-3.3. */
export interface City {
  id: string;
  name: string;
  state: string;
  /** Representative PIN used for market-price localisation. */
  pin: string;
  /** CPWD-style cost index, Delhi = 1.00 baseline. */
  indexFactor: number;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
  /** ISO 4217 currency code. */
  currency?: string;
  /** VAT rate as a percentage, or null where not applicable (e.g. India uses GST). */
  vatPct?: number | null;
  /** "india" | "gcc" — drives pricing adapter routing and display. */
  region?: string;
}

/** A Schedule of Rates entry seeded from CPWD / State PWD books — FR-3.1. */
export interface SorEntry {
  id: string;
  code: string;
  description: string;
  unit: string;
  /** Base rate at the Delhi baseline, before city indexing. */
  baseRate: number;
  source: string;
  chapter: string;
  effectiveFrom: string;
  /**
   * True when this entry belongs to the tenant rather than the shared public
   * rate book. Only owned entries can be edited or removed.
   */
  owned: boolean;
}

export type MarketPlatform =
  | "IndiaMART"
  | "Moglix"
  | "TradeIndia"
  | "Amazon Business"
  | "Direct dealer"
  | "Made-in-China"
  | "TradeKey"
  | "DubaiTrade"
  | "Saudi Suppliers"
  | "Web search";

/** A live market price fetched from a B2B/e-commerce source — FR-4.1. */
export interface MarketQuote {
  id: string;
  seller: string;
  platform: MarketPlatform;
  price: number;
  /** ISO 4217 currency code the price is denominated in. */
  currency: string;
  /** VAT rate included in the quoted price, or null if unknown / not applicable. */
  vatPct: number | null;
  unit: string;
  location: string;
  url: string;
  fetchedAt: string;
  inStock: boolean;
}

/** How an extracted line item was matched to a SoR entry — FR-3.2. */
export interface SorMatch {
  sorId: string;
  code: string;
  description: string;
  unit: string;
  baseRate: number;
  /** 0–1 similarity between the invoice description and the SoR description. */
  matchScore: number;
  /** baseRate × city index factor. */
  adjustedRate: number;
  indexFactor: number;
  source: string;
}

/** Per-field OCR confidence so reviewers know what to check — FR-2.3. */
export interface FieldConfidence {
  description: number;
  quantity: number;
  rate: number;
}

export interface LineItem {
  id: string;
  srNo: number;
  description: string;
  unit: string;
  quantity: number;
  /** Rate as printed on the vendor document. */
  rate: number;
  /** quantity x rate, before tax. */
  amount: number;
  /**
   * The line total exactly as the document prints it, present only when it
   * disagrees with quantity x rate — a tax-inclusive amount column, usually.
   */
  printedAmount?: number;
  confidence: FieldConfidence;
  /** True once a human has edited an extracted field. */
  corrected?: boolean;
  sorMatch?: SorMatch;
  marketQuotes: MarketQuote[];
}

/** Output of the variance engine for one line — FR-5.2. */
export interface LineVariance {
  /** Median of the fetched market quotes, if any. */
  marketMedian?: number;
  /** Blended reference rate the invoice is judged against. */
  benchmarkRate: number;
  benchmarkBasis: "sor+market" | "sor" | "market" | "none";
  variancePerUnit: number;
  varianceAmount: number;
  variancePct: number;
  flag: VarianceFlag;
  /** Confidence in the verdict itself (match quality × source coverage). */
  verdictConfidence: number;
}

export type AnalysedLineItem = LineItem & { variance: LineVariance };

export interface QualityCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

/** Pre-processing gate that rejects unusable uploads — FR-1.2. */
export interface QualityReport {
  passed: boolean;
  score: number;
  checks: QualityCheck[];
  rejectionReason?: string;
}

export interface InvoiceSummary {
  overCount: number;
  underCount: number;
  parCount: number;
  unmatchedCount: number;
  /** Sum of line variance amounts (positive = billed above benchmark). */
  totalVariance: number;
  variancePct: number;
  /** What could be recovered by repricing the over-priced lines to benchmark. */
  potentialSaving: number;
  benchmarkTotal: number;
}

export interface Invoice {
  id: string;
  number: string;
  documentType: "invoice" | "quotation";
  vendor: string;
  vendorGstin: string;
  project: string;
  cityId: string;
  uploadedBy: string;
  uploadedAt: string;
  processedAt?: string;
  status: InvoiceStatus;
  fileName: string;
  fileSizeKb: number;
  pageCount: number;
  /** True when the uploaded original was retained and can be downloaded. */
  hasOriginal: boolean;
  /** Why the document's own figures differ from the derived ones, where they do. */
  extractionNote?: string;
  /** Script(s) detected while reading the document. */
  language?: string;
  /** Items the vendor explicitly excluded from scope, parsed from the document. */
  exclusions?: string[];
  /** Items this scope of work would normally price but this document does not,
   *  as judged against the document itself. Undefined when it was analysed
   *  before these were captured, or read through the text-layer path. */
  scopeGaps?: string[];
  /** Wording in this document too loose to hold the vendor to. Undefined on the
   *  same terms as {@link scopeGaps}. */
  ambiguities?: string[];
  /** Payment schedule, tax basis, validity and lead time, as the document
   *  states them. Undefined when it states none. */
  commercialTerms?: CommercialTerms;
  quality: QualityReport;
  subtotal: number;
  taxPct: number;
  total: number;
  /** The document's own printed subtotal (before tax). Used as the "Quoted
   *  Value" on the report so rounding or rate extraction errors do not skew
   *  the displayed figure away from what the vendor actually quoted. Null when
   *  the document does not print a subtotal, or it could not be read. */
  documentSubtotal?: number;
  /** The document's own printed grand total, including GST/VAT. Not the
   *  "Quoted Value" — that is reported pre-tax. Null if unreadable. */
  documentTotal?: number;
  lineItems: LineItem[];
}

export type AnalysedInvoice = Omit<Invoice, "lineItems"> & {
  lineItems: AnalysedLineItem[];
  summary: InvoiceSummary;
  city: City;
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  lastActive: string;
}

export interface Tier {
  id: TierId;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  tagline: string;
  /** Documents per month; null = unlimited. Enforced server-side — FR-8.3. */
  documentQuota: number | null;
  seats: number | null;
  features: string[];
  /** Feature keys this tier unlocks; drives UI gating — FR-8.1. */
  entitlements: Entitlement[];
  highlighted?: boolean;
}

export type Entitlement =
  | "sor_matching"
  | "market_pricing"
  | "variance_reports"
  | "export_pdf"
  | "export_excel"
  | "bulk_upload"
  | "api_access"
  | "ai_assistant"
  | "scheduled_refresh"
  | "multi_project"
  | "sso"
  | "priority_support";

export interface Subscription {
  tierId: TierId;
  status: "active" | "trialing" | "past_due" | "cancelled";
  renewsOn: string;
  billingCycle: "monthly" | "annual";
  documentsUsed: number;
  seatsUsed: number;
}

export interface Organisation {
  id: string;
  name: string;
  gstin: string;
  defaultCityId: string;
  subscription: Subscription;
}

export interface ActivityEvent {
  id: string;
  kind: "upload" | "analysis" | "correction" | "export" | "rate_update" | "member" | "billing";
  actor: string;
  message: string;
  at: string;
  invoiceId?: string;
}

/** Admin-side record of a bulk rate upload — FR-9.1. */
export interface RateUpload {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  rowsTotal: number;
  rowsAccepted: number;
  rowsRejected: number;
  status: "processed" | "processing" | "failed";
  note?: string;
}

/** Scheduled market-price refresh — FR-9.2. */
export type CronKind = "price_refresh" | "sor_revision" | "stale_sweep" | "retention";

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  target: string;
  /** Which routine this job runs — the runner dispatches on it. */
  kind: CronKind;
  /** Keywords limiting which lines the job touches; empty = everything. */
  scope: string[];
  lastRun: string;
  nextRun: string;
  lastStatus: "success" | "partial" | "failed";
  itemsRefreshed: number;
  enabled: boolean;
}

/** The signed-in user, resolved from the session cookie on every request. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited" | "suspended";
  organisation: {
    id: string;
    name: string;
    gstin: string;
    defaultCityId: string;
    subscription: Subscription;
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Set when the domain guard rejected the question — FR-10.3. */
  outOfDomain?: boolean;
  at: string;
}
