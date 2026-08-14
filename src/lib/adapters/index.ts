import {
  mockAssistant,
  mockExtraction,
  mockPayments,
  mockPricingSearch,
  mockQualityGate,
} from "./mock";
import { claudeAssistant, razorpayPayments, serperPricingSearch } from "./live";
import type {
  Adapter,
  AssistantAdapter,
  ExtractionAdapter,
  PaymentAdapter,
  PricingSearchAdapter,
  QualityGateAdapter,
} from "./types";

export * from "./types";

const hasEnv = (...keys: string[]) => keys.every((k) => Boolean(process.env[k]));

/**
 * Provider selection. A live adapter is only used when every credential it
 * needs is present, so a missing key degrades to the mock instead of throwing
 * at request time.
 */
export const services: {
  qualityGate: QualityGateAdapter;
  extraction: ExtractionAdapter;
  pricing: PricingSearchAdapter;
  payments: PaymentAdapter;
  assistant: AssistantAdapter;
} = {
  qualityGate: mockQualityGate,
  extraction: mockExtraction,
  pricing: hasEnv("SERPER_API_KEY") ? serperPricingSearch : mockPricingSearch,
  payments: hasEnv("RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET") ? razorpayPayments : mockPayments,
  assistant: hasEnv("ANTHROPIC_API_KEY") ? claudeAssistant : mockAssistant,
};

export interface ServiceStatus {
  key: string;
  name: string;
  requirement: string;
  adapter: Adapter;
}

/** Rendered on the admin integrations screen. */
export const SERVICE_STATUS: ServiceStatus[] = [
  {
    key: "qualityGate",
    name: "Image quality gate",
    requirement: "FR-1.2 — reject dirty scans and out-of-scope files",
    adapter: services.qualityGate,
  },
  {
    key: "extraction",
    name: "PDF / OCR extraction",
    requirement: "FR-2.1 — line items, quantities, rates, totals",
    adapter: services.extraction,
  },
  {
    key: "pricing",
    name: "Market pricing search",
    requirement: "FR-4.1 — live B2B / e-commerce prices",
    adapter: services.pricing,
  },
  {
    key: "payments",
    name: "Payment gateway",
    requirement: "FR-8.2 — subscription checkout",
    adapter: services.payments,
  },
  {
    key: "assistant",
    name: "AI assistant",
    requirement: "FR-10 — domain-restricted support",
    adapter: services.assistant,
  },
];
