"use server";

import { requirePermission } from "@/lib/auth/guard";
import { services } from "./index";
import { visionConfigured } from "@/lib/extraction/vision";

/**
 * Live connection tests for each external provider.
 *
 * Pasting a key and hoping is not configuration. Until now the only way to find
 * out whether a credential worked was to upload a document and read the result,
 * which conflates a bad key with a bad document and wastes quota either way.
 * Each test here makes the smallest real call the provider supports and reports
 * exactly what came back.
 *
 * Nothing throws: a failed test is an answer, not an error, and the message is
 * the provider's own so a typo'd key reads as "unauthorised" rather than
 * "something went wrong".
 */

export interface ProviderTest {
  ok: boolean;
  live: boolean;
  detail: string;
}

const NOT_CONFIGURED = (env: string[]): ProviderTest => ({
  ok: false,
  live: false,
  detail: `Running on the built-in mock. Set ${env.join(" and ")} to connect the real provider.`,
});

async function testPricing(): Promise<ProviderTest> {
  if (!services.pricing.live) return NOT_CONFIGURED(services.pricing.requiredEnv);
  try {
    const quotes = await services.pricing.search({
      description: "ordinary portland cement 53 grade 50 kg bag",
      unit: "bag",
      cityId: "delhi",
      limit: 3,
    });
    if (quotes.length === 0) {
      return {
        ok: false,
        live: true,
        detail: `${services.pricing.provider} answered but returned no listings for a cement query. The key works; the search did not match anything.`,
      };
    }
    const cheapest = quotes.reduce((a, b) => (a.price < b.price ? a : b));
    return {
      ok: true,
      live: true,
      detail: `${services.pricing.provider} returned ${quotes.length} listings for cement — cheapest ₹${cheapest.price} from ${cheapest.seller} (${cheapest.platform}).`,
    };
  } catch (error) {
    return { ok: false, live: true, detail: message(error) };
  }
}

async function testAssistant(): Promise<ProviderTest> {
  if (!services.assistant.live) return NOT_CONFIGURED(services.assistant.requiredEnv);
  try {
    const reply = await services.assistant.ask({
      question: "In one short sentence, what is a Schedule of Rates?",
      history: [],
    });
    if (reply.outOfDomain) {
      return {
        ok: false,
        live: true,
        detail: "The model answered but classified a construction question as out of domain, which points at the prompt rather than the key.",
      };
    }
    return {
      ok: true,
      live: true,
      detail: `Answered in ${reply.answer.length} characters: "${reply.answer.slice(0, 110)}${reply.answer.length > 110 ? "…" : ""}"`,
    };
  } catch (error) {
    return { ok: false, live: true, detail: message(error) };
  }
}

async function testPayments(): Promise<ProviderTest> {
  if (!services.payments.live) return NOT_CONFIGURED(services.payments.requiredEnv);

  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  try {
    // A read-only call: it proves the credentials without creating anything.
    const response = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status === 401) {
      return { ok: false, live: true, detail: "Razorpay rejected the key pair (401). Check the key id and secret, and that they are from the same mode." };
    }
    if (!response.ok) {
      return { ok: false, live: true, detail: `Razorpay returned ${response.status}: ${(await response.text()).slice(0, 160)}` };
    }

    const mode = keyId.startsWith("rzp_live") ? "live" : "test";
    const webhook = process.env.RAZORPAY_WEBHOOK_SECRET
      ? "webhook secret set"
      : "webhook secret NOT set — captures will not activate a plan";
    return { ok: true, live: true, detail: `Credentials accepted in ${mode} mode; ${webhook}.` };
  } catch (error) {
    return { ok: false, live: true, detail: message(error) };
  }
}

async function testVision(): Promise<ProviderTest> {
  if (!visionConfigured()) return NOT_CONFIGURED(["ANTHROPIC_API_KEY"]);
  // The assistant and the vision reader share one credential, so proving one
  // proves the other; this avoids spending a vision call to learn the same fact.
  const assistant = await testAssistant();
  return {
    ok: assistant.ok,
    live: true,
    detail: assistant.ok
      ? "ANTHROPIC_API_KEY is accepted, so scanned pages and photographs can be read."
      : assistant.detail,
  };
}

function message(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text.slice(0, 220);
}

export async function testProviderAction(formData: FormData): Promise<ProviderTest> {
  // Credentials and provider behaviour are administrative information.
  await requirePermission("rates.manage");

  switch (String(formData.get("key") ?? "")) {
    case "pricing":
      return testPricing();
    case "assistant":
      return testAssistant();
    case "payments":
      return testPayments();
    case "extraction":
      return testVision();
    case "qualityGate":
      return {
        ok: true,
        live: true,
        detail:
          "Runs locally on the uploaded pixels — resolution, focus, exposure and ink coverage. No credential, and no network call.",
      };
    default:
      return { ok: false, live: false, detail: "Unknown provider." };
  }
}
