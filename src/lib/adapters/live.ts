import Anthropic from "@anthropic-ai/sdk";
import { getCityAny } from "@/lib/data/cities";
import { answerInDomain, classifyDomain, OUT_OF_DOMAIN_REPLY } from "@/lib/assistant";
import { getTier } from "@/lib/data/org";
import type { MarketPlatform, MarketQuote } from "@/lib/types";
import type { AssistantAdapter, PaymentAdapter, PricingSearchAdapter } from "./types";

/**
 * Live provider implementations.
 *
 * Each is selected only when its credentials are present (see ./index.ts), so a
 * missing key degrades to the mock rather than failing a request. Keys are read
 * from the server environment and never prefixed NEXT_PUBLIC_ — none of this
 * reaches the browser.
 */

class NotConfiguredError extends Error {
  constructor(provider: string, env: string[]) {
    super(`${provider} is not configured. Set ${env.join(", ")} in the server environment.`);
    this.name = "NotConfiguredError";
  }
}

/* ------------------------------------------------------------------ *
 * Market pricing — Serper shopping search (FR-4.1 / FR-4.2)
 * ------------------------------------------------------------------ */

interface SerperShoppingItem {
  title?: string;
  source?: string;
  link?: string;
  price?: string;
  delivery?: string;
}

/** Serper returns prices as display strings — "₹1,234.00", "Rs. 980", "AED 42.50". */
function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function platformFor(link: string | undefined, gcc = false): MarketQuote["platform"] {
  const url = (link ?? "").toLowerCase();
  if (gcc) {
    if (url.includes("made-in-china")) return "Made-in-China";
    if (url.includes("tradekey")) return "TradeKey";
    if (url.includes("dubaitrade")) return "DubaiTrade";
    if (url.includes("amazon.ae") || url.includes("amazon.sa") || url.includes("amazon.ae")) return "Amazon Business";
    if (url.includes("saudi suppliers") || url.includes(" saudismart")) return "Saudi Suppliers";
    return "Direct dealer";
  }
  if (url.includes("indiamart")) return "IndiaMART";
  if (url.includes("moglix")) return "Moglix";
  if (url.includes("tradeindia")) return "TradeIndia";
  if (url.includes("amazon.")) return "Amazon Business";
  return "Direct dealer";
}

/** Per-city Serper parameters for GCC markets. */
const GCC_SERPER_CONFIG: Record<string, { gl: string; location: string }> = {
  "riyadh":      { gl: "sa", location: "Riyadh, Saudi Arabia" },
  "jeddah":      { gl: "sa", location: "Jeddah, Saudi Arabia" },
  "dubai":       { gl: "ae", location: "Dubai, United Arab Emirates" },
  "abu-dhabi":   { gl: "ae", location: "Abu Dhabi, United Arab Emirates" },
  "muscat":      { gl: "om", location: "Muscat, Oman" },
  "manama":      { gl: "bh", location: "Manama, Bahrain" },
  "kuwait-city": { gl: "kw", location: "Kuwait City, Kuwait" },
};

/** Fallback pricing search for GCC when Serper shopping returns few results. */
async function webSearchFallback(options: {
  description: string;
  unit: string;
  cityId: string;
  limit: number;
}): Promise<MarketQuote[]> {
  const { description, unit, cityId, limit } = options;
  const city = getCityAny(cityId);
  if (!city || city.region !== "gcc") return [];

  // Use the built-in WebSearch tool via a fetch to a search API.
  // For now, synthesise plausible quotes from Gulf B2B platform references.
  // In production, wire this to a real WebSearch or Serper web endpoint.
  const words = description
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 6)
    .join(" ");

  const gl = GCC_SERPER_CONFIG[cityId]?.gl ?? "ae";
  const location = GCC_SERPER_CONFIG[cityId]?.location ?? "Dubai, UAE";

  try {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) return [];

    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${words} ${unit} price ${city.name} supplier`,
        gl,
        hl: "en",
        location,
        num: limit * 2,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) return [];

    const payload = (await response.json()) as { organic?: { title?: string; link?: string; snippet?: string }[] };
    const fetchedAt = new Date().toISOString();

    return (payload.organic ?? [])
      .map((item, index) => {
        const priceMatch = (item.snippet ?? "").match(/([\d,]+\.?\d*)\s*(?:AED|SAR|KWD|BHD|OMR|USD)/i);
        if (!priceMatch) return null;
        const price = parsePrice(priceMatch[1]);
        if (price === null) return null;
        const currencyMatch = (item.snippet ?? "").match(/(AED|SAR|KWD|BHD|OMR|USD)/i);
        const currency = currencyMatch?.[1] ?? city.currency;
        const exchangeRates: Record<string, number> = { USD: 3.67, AED: 1, SAR: 1, KWD: 1, BHD: 1, OMR: 1 };
        const localPrice = currency === "USD" ? price * (exchangeRates[city.currency ?? "USD"] ?? 3.67) : price;

        return {
          id: `web-${cityId}-${index}-${fetchedAt}`,
          seller: item.title?.slice(0, 50) ?? "Listed supplier",
          platform: "Web search" as MarketPlatform,
          price: localPrice,
          unit,
          location: city.name,
          url: item.link ?? "",
          fetchedAt,
          inStock: true,
          currency: city.currency,
          vatPct: city.vatPct ?? null,
        };
      })
      .filter((q): q is MarketQuote => q !== null)
      .slice(0, limit);
  } catch {
    return [];
  }
}

export const serperPricingSearch: PricingSearchAdapter = {
  id: "pricing",
  provider: "Serper",
  live: true,
  requiredEnv: ["SERPER_API_KEY"],

  async search({ description, unit, cityId, limit = 3 }): Promise<MarketQuote[]> {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new NotConfiguredError("Serper", ["SERPER_API_KEY"]);

    const city = getCityAny(cityId);
    const isGcc = city?.region === "gcc";

    // Trim to the distinctive words: a full 200-character SoR description is a
    // worse search query than the handful of terms that identify the product.
    const query = description
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 8)
      .join(" ");

    // GCC queries add "supplier wholesale" to find B2B listings; India queries
    // stay as-is.
    const suffix = isGcc ? " supplier wholesale" : "";
    const cityConfig = isGcc ? GCC_SERPER_CONFIG[cityId] : undefined;
    const gl = cityConfig?.gl ?? "in";
    const location = cityConfig?.location ?? `${city?.name ?? ""}, India`;
    const num = Math.max(limit * 3, 10);

    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        q: `${query}${suffix}`,
        gl,
        hl: "en",
        location,
        num,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`Serper returned ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as { shopping?: { title?: string; source?: string; link?: string; price?: string; delivery?: string }[] };
    const fetchedAt = new Date().toISOString();

    let quotes = (payload.shopping ?? [])
      .map((item, index) => {
        const price = parsePrice(item.price);
        if (price === null) return null;
        return {
          id: `serper-${cityId}-${index}-${fetchedAt}`,
          seller: item.source?.trim() || item.title?.slice(0, 40) || "Listed seller",
          platform: platformFor(item.link, isGcc) as MarketQuote["platform"],
          price,
          unit,
          location: city?.name ?? "",
          url: item.link ?? "",
          fetchedAt,
          inStock: !/out of stock/i.test(item.delivery ?? ""),
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null)
      .slice(0, limit);

    // WebSearch fallback for GCC markets where Serper shopping coverage is thin.
    if (isGcc && quotes.length < limit) {
      const webQuotes = await webSearchFallback({
        description,
        unit,
        cityId,
        limit: limit - quotes.length,
      });
      quotes = [...quotes, ...webQuotes];
    }

    return quotes.map((q) => ({
      ...q,
      currency: city?.currency ?? "INR",
      vatPct: city?.vatPct ?? null,
    }));
  },
};

/* ------------------------------------------------------------------ *
 * Payments — Razorpay payment links (FR-8.2)
 * ------------------------------------------------------------------ */

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

    const tier = getTier(tierId);
    const rupees = billingCycle === "annual" ? tier.priceAnnual : tier.priceMonthly;
    if (rupees <= 0) {
      throw new Error(`${tier.name} is quoted manually and has no self-serve checkout.`);
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const base = process.env.APP_BASE_URL ?? "";

    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Razorpay works in paise.
        amount: Math.round(rupees * 100),
        currency: "INR",
        description: `FinScanix ${tier.name} — ${billingCycle}`,
        reference_id: `${organisationId}:${tierId}:${billingCycle}:${Date.now()}`,
        notes: { organisationId, tierId, billingCycle },
        callback_url: `${base}/app/settings/billing`,
        callback_method: "get",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Razorpay returned ${response.status}: ${await response.text()}`);
    }

    const link = (await response.json()) as { id: string; short_url: string };

    // The tier is NOT activated here. Entitlements change only when the
    // payment webhook confirms capture — otherwise abandoning the checkout
    // page would unlock a paid plan (FR-8.3).
    return { checkoutUrl: link.short_url, reference: link.id, amount: rupees };
  },
};

/* ------------------------------------------------------------------ *
 * Assistant — Claude, behind the domain guard (FR-10)
 * ------------------------------------------------------------------ */

const ASSISTANT_SYSTEM = `You are the FinScanix assistant. FinScanix verifies vendor invoices and quotations for the construction and facilities-management sector, benchmarking each line item against government Schedule of Rates data and live market pricing.

You answer only questions about construction, facilities management, engineering, hospitality and commercial buildings, building maintenance, industrial projects, procurement and rate auditing, and the FinScanix product itself.

If a question falls outside those areas, reply with exactly this sentence and nothing else:
${OUT_OF_DOMAIN_REPLY}

Answer in British English. Be concrete: cite rate codes, units and figures where they apply, and say plainly when something depends on data the user would need to check rather than guessing at it.`;

export const claudeAssistant: AssistantAdapter = {
  id: "assistant",
  provider: "Claude",
  live: true,
  requiredEnv: ["ANTHROPIC_API_KEY"],

  async ask({ question, history }) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new NotConfiguredError("Claude", ["ANTHROPIC_API_KEY"]);
    }

    // Cheap pre-filter: an obviously off-topic question never reaches the model,
    // which saves a call and makes the refusal instant and exact.
    const verdict = classifyDomain(question);
    if (!verdict.inDomain) {
      return { answer: OUT_OF_DOMAIN_REPLY, outOfDomain: true };
    }

    const client = new Anthropic();

    try {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 16000,
        system: ASSISTANT_SYSTEM,
        thinking: { type: "adaptive" },
        messages: [
          ...history.slice(-8).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: "user" as const, content: question },
        ],
      });

      if (response.stop_reason === "refusal") {
        return { answer: OUT_OF_DOMAIN_REPLY, outOfDomain: true };
      }

      const text = response.content.find((block) => block.type === "text");
      const answer = text && text.type === "text" ? text.text.trim() : "";
      if (!answer) return { answer: answerInDomain(question), outOfDomain: false };

      // The model was told the exact refusal sentence; honour it if it used one.
      return { answer, outOfDomain: answer === OUT_OF_DOMAIN_REPLY };
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Assistant provider error (${error.status}): ${error.message}`);
      }
      throw error;
    }
  },
};

/* ------------------------------------------------------------------ *
 * Assistant — Google AI Studio (Gemini), behind the same domain guard
 * ------------------------------------------------------------------ */

export const geminiAssistant: AssistantAdapter = {
  id: "assistant",
  provider: "Google AI Studio (Gemini)",
  live: true,
  requiredEnv: ["GOOGLE_AI_API_KEY"],

  async ask({ question, history }) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new NotConfiguredError("Google AI Studio", ["GOOGLE_AI_API_KEY"]);

    // The same cheap pre-filter the Claude path uses: an obviously off-topic
    // question never reaches the model, which makes the refusal instant, exact,
    // and free.
    if (!classifyDomain(question).inDomain) {
      return { answer: OUT_OF_DOMAIN_REPLY, outOfDomain: true };
    }

    const { geminiClient, geminiMessage, withGeminiRetry } = await import("@/lib/ai/gemini");
    const ai = geminiClient();

    try {
      const response = await withGeminiRetry(() =>
        ai.models.generateContent({
        // The free tier has no quota on the Pro models. gemini-flash-lite-latest
        // is confirmed to respond reliably and is the working path. The -latest
        // suffix follows Google's current release rather than pinning a version
        // that will one day be retired.
        model: "gemini-flash-lite-latest",
        contents: [
          ...history.slice(-8).map((message) => ({
            role: message.role === "assistant" ? ("model" as const) : ("user" as const),
            parts: [{ text: message.content }],
          })),
          { role: "user" as const, parts: [{ text: question }] },
        ],
          config: { systemInstruction: ASSISTANT_SYSTEM },
        }),
      );

      const answer = (response.text ?? "").trim();
      if (!answer) return { answer: answerInDomain(question), outOfDomain: false };

      // The model was given the exact refusal sentence; honour it if it used one.
      return { answer, outOfDomain: answer === OUT_OF_DOMAIN_REPLY };
    } catch (error) {
      throw new Error(geminiMessage(error, "Assistant provider error"));
    }
  },
};
