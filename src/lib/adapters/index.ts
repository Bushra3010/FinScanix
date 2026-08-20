import {
  mockAssistant,
  mockExtraction,
  mockPayments,
  mockPricingSearch,
  mockQualityGate,
} from "./mock";
import {
  claudeAssistant,
  geminiAssistant,
  razorpayPayments,
  serperPricingSearch,
} from "./live";
import { visionConfigured, visionProvider } from "@/lib/extraction/vision";
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
  // Anthropic first where both are present: the larger model answers better.
  // Gemini serves when it is the key that exists.
  assistant: hasEnv("ANTHROPIC_API_KEY")
    ? claudeAssistant
    : hasEnv("GOOGLE_AI_API_KEY")
      ? geminiAssistant
      : mockAssistant,
};

export interface ServiceStatus {
  key: string;
  name: string;
  requirement: string;
  adapter: Adapter;
}

/**
 * Two entries describe work the pipeline does itself rather than through an
 * adapter, and reading their status off the vestigial mock adapter told the
 * admin screen the opposite of the truth.
 *
 * The quality gate runs locally on the uploaded pixels and needs no credential,
 * so it is always live. Extraction reads a PDF's text layer locally — also
 * always — and reaches for a provider only when a page has no text to read, so
 * it is live once either OCR key exists.
 */
const localQualityGate: Adapter = {
  id: "qualityGate",
  provider: "Local pixel analysis",
  live: true,
  requiredEnv: [],
};

const extractionStatus: Adapter = {
  id: "extraction",
  provider: visionConfigured()
    ? `Text layer (local) + OCR via ${visionProvider()}`
    : "Text layer (local); no OCR provider for scans",
  live: visionConfigured(),
  requiredEnv: ["ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY"],
};

/** Rendered on the admin integrations screen. */
export const SERVICE_STATUS: ServiceStatus[] = [
  {
    key: "qualityGate",
    name: "Image quality gate",
    requirement: "FR-1.2 — reject dirty scans and out-of-scope files",
    adapter: localQualityGate,
  },
  {
    key: "extraction",
    name: "PDF / OCR extraction",
    requirement: "FR-2.1 — line items, quantities, rates, totals",
    adapter: extractionStatus,
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
