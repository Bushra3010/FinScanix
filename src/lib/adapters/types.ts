import type {
  ChatMessage,
  LineItem,
  MarketQuote,
  QualityReport,
  TierId,
} from "../types";

/**
 * Every external dependency FinScanix needs sits behind one of these
 * interfaces. The prototype ships mock implementations; wiring a live provider
 * means adding a class in this folder and setting the matching env var — no
 * screen or page has to change.
 */

export interface Adapter {
  /** Stable key used in the integrations panel. */
  readonly id: string;
  readonly provider: string;
  /** False when the adapter is a mock or is missing credentials. */
  readonly live: boolean;
  /** Env vars this adapter needs before it can go live. */
  readonly requiredEnv: string[];
}

/** FR-1.2 — reject dirty scans and out-of-scope files before any quota is spent. */
export interface QualityGateAdapter extends Adapter {
  assess(input: {
    fileName: string;
    sizeKb: number;
    mimeType: string;
  }): Promise<QualityReport>;
}

/** FR-2.1 / FR-2.2 — PDF + OCR extraction into structured line items. */
export interface ExtractionAdapter extends Adapter {
  extract(input: {
    fileName: string;
    mimeType: string;
    cityId: string;
  }): Promise<{
    lineItems: LineItem[];
    pageCount: number;
    vendor: string;
    vendorGstin: string;
    documentNumber: string;
    taxPct: number;
  }>;
}

/** FR-4.1 / FR-4.2 — live market pricing, localised to the user's city. */
export interface PricingSearchAdapter extends Adapter {
  search(input: {
    description: string;
    unit: string;
    cityId: string;
    limit?: number;
  }): Promise<MarketQuote[]>;
}

/** FR-8.2 — subscription checkout. */
export interface PaymentAdapter extends Adapter {
  createCheckout(input: {
    tierId: TierId;
    billingCycle: "monthly" | "annual";
    organisationId: string;
  }): Promise<{ checkoutUrl: string; reference: string; amount: number }>;
}

/** FR-10 — domain-restricted assistant. */
export interface AssistantAdapter extends Adapter {
  ask(input: {
    question: string;
    history: ChatMessage[];
  }): Promise<{ answer: string; outOfDomain: boolean }>;
}
