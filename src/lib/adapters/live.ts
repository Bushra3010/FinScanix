import type { MarketQuote } from "../types";
import type { AssistantAdapter, PaymentAdapter, PricingSearchAdapter } from "./types";

/**
 * Live adapter seams.
 *
 * These are the exact places a real provider gets wired in. Each one is
 * intentionally thin: request shape, response mapping, nothing else. They are
 * only selected when their credentials are present (see ./index.ts), so the
 * prototype never calls them.
 *
 * Keys are read from the server environment and must never be exposed to the
 * client — no NEXT_PUBLIC_ prefix on any of them (NDA §12, NFR: Security).
 */

class NotConfiguredError extends Error {
  constructor(provider: string, env: string[]) {
    super(`${provider} is not configured. Set ${env.join(", ")} in the server environment.`);
    this.name = "NotConfiguredError";
  }
}

/** FR-4.1 — Serper (or any search API) for B2B/e-commerce pricing. */
export const serperPricingSearch: PricingSearchAdapter = {
  id: "pricing",
  provider: "Serper",
  live: true,
  requiredEnv: ["SERPER_API_KEY"],

  async search({ description, unit, cityId, limit = 3 }): Promise<MarketQuote[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new NotConfiguredError("Serper", ["SERPER_API_KEY"]);

    // TODO(live): POST https://google.serper.dev/shopping with
    //   { q: `${description} price ${cityName} site:indiamart.com OR site:moglix.com`, gl: "in" }
    // then map each result to a MarketQuote, dropping listings whose unit does
    // not normalise to `unit`, and stamp fetchedAt for the freshness display.
    void description;
    void unit;
    void cityId;
    void limit;
    throw new NotConfiguredError("Serper pricing search", ["SERPER_API_KEY"]);
  },
};

/** FR-8.2 — Razorpay subscription checkout. */
export const razorpayPayments: PaymentAdapter = {
  id: "payments",
  provider: "Razorpay",
  live: true,
  requiredEnv: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],

  async createCheckout({ tierId, billingCycle, organisationId }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new NotConfiguredError("Razorpay", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]);
    }

    // TODO(live): create a subscription against the plan id mapped from tierId +
    // billingCycle, return its short_url. Entitlements must be activated from the
    // webhook (subscription.charged), never from the browser redirect — FR-8.3.
    void tierId;
    void billingCycle;
    void organisationId;
    throw new NotConfiguredError("Razorpay checkout", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"]);
  },
};

/** FR-10 — model-backed assistant, still behind the domain guard. */
export const claudeAssistant: AssistantAdapter = {
  id: "assistant",
  provider: "Claude",
  live: true,
  requiredEnv: ["ANTHROPIC_API_KEY"],

  async ask({ question, history }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new NotConfiguredError("Claude", ["ANTHROPIC_API_KEY"]);

    // TODO(live): call the Messages API with a system prompt that restates the
    // domain restriction and the exact fallback sentence. classifyDomain() runs
    // first as a cheap pre-filter so obvious off-topic questions never reach the
    // model — see lib/assistant.ts.
    void question;
    void history;
    throw new NotConfiguredError("Claude assistant", ["ANTHROPIC_API_KEY"]);
  },
};
