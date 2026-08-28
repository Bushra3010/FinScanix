import Anthropic from "@anthropic-ai/sdk";
import { getCityAny } from "@/lib/data/cities";
import { answerInDomain, classifyDomain, OUT_OF_DOMAIN_REPLY } from "@/lib/assistant";
import { getTier } from "@/lib/data/org";
import { geminiClient, withGeminiRetry } from "@/lib/ai/gemini";
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

/**
 * Service-type line items: units and description keywords that identify labour,
 * installation, civil, or FM work rather than a supply/product item.
 *
 * Shopping search reliably prices products but returns component or tool prices
 * (₹200-800) for services — e.g. "Commissioning & BMS Integration" gets BMS
 * sensor listings. For these we fall back to a web search with construction-
 * rate context so the results reflect labour/contract rates, not goods prices.
 */
const SERVICE_UNITS = new Set(["job", "ls", "l.s", "lot", "lump", "lumpsum", "lump sum", "visit", "trip"]);
const SERVICE_KEYWORDS =
  /\b(install|erect|dismantl|remov|commission|decommission|test|balanc|integrat|repair|replac|servic|mainten|labour|labor|manpower|civil|plumb|weld|paint|prime|fabricat|align|calibrat|handl|transport|hauling|scaffold|formwork|shuttering|curing|water.proof|waterproof)\b/i;

/**
 * Minimum credible price (INR) per unit type.
 * Quotes below this threshold are almost certainly wrong product matches.
 */
const UNIT_MIN_PRICE: Record<string, number> = {
  job: 2_000,
  ls: 2_000,
  "l.s": 2_000,
  lot: 2_000,
  visit: 500,
  trip: 500,
  nos: 50,
  default: 20,
};

function minPriceFor(unit: string): number {
  const key = unit.toLowerCase().trim();
  return UNIT_MIN_PRICE[key] ?? UNIT_MIN_PRICE.default;
}

function isServiceItem(description: string, unit: string): boolean {
  return SERVICE_UNITS.has(unit.toLowerCase().trim()) || SERVICE_KEYWORDS.test(description);
}

/**
 * Web-search path for service/labour line items.
 *
 * Sends a Serper general-web query with construction-rate context terms so
 * the results page reflects contract rates, not e-commerce product listings.
 * Prices are parsed from snippets using a loose INR pattern.
 */
async function serviceWebSearch(options: {
  query: string;
  cityName: string;
  gl: string;
  location: string;
  limit: number;
  apiKey: string;
  cityId: string;
  unit: string;
  fetchedAt: string;
}): Promise<MarketQuote[]> {
  const { query, cityName, gl, location, limit, apiKey, cityId, unit, fetchedAt } = options;
  const minPrice = minPriceFor(unit);

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: `"${query}" rate cost India construction HVAC site`,
      gl,
      hl: "en",
      location,
      num: limit * 4,
    }),
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) return [];

  const payload = (await response.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
    answerBox?: { answer?: string; snippet?: string };
  };

  const candidates: number[] = [];

  // Try answer box first (Google often surfaces a direct rate answer).
  const boxText = payload.answerBox?.answer ?? payload.answerBox?.snippet ?? "";
  const boxMatch = boxText.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/i);
  if (boxMatch) {
    const v = parsePrice(boxMatch[1]);
    if (v !== null && v >= minPrice) candidates.push(v);
  }

  for (const item of payload.organic ?? []) {
    const snippet = item.snippet ?? "";
    // Match any INR price token in the snippet.
    const matches = [...snippet.matchAll(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/gi)];
    for (const m of matches) {
      const v = parsePrice(m[1]);
      if (v !== null && v >= minPrice) candidates.push(v);
    }
  }

  if (candidates.length === 0) return [];

  // Sort and de-dupe; take a spread around the median to produce limit quotes.
  candidates.sort((a, b) => a - b);
  const mid = Math.floor(candidates.length / 2);
  const spread = candidates.slice(
    Math.max(0, mid - Math.floor(limit / 2)),
    mid + Math.ceil(limit / 2) + 1,
  );

  return spread.slice(0, limit).map((price, i) => ({
    id: `web-svc-${cityId}-${i}-${fetchedAt}`,
    seller: "Web search (construction rates)",
    platform: "Web search" as MarketQuote["platform"],
    price,
    unit,
    location: cityName,
    url: "",
    fetchedAt,
    inStock: true,
    currency: "INR",
    vatPct: null,
  }));
}

/**
 * Gemini-based market rate estimator.
 *
 * Serper shopping search reliably prices commodities but fails badly on two
 * common cases:
 *   1. Service items (job/ls) — returns component prices (₹340) instead of
 *      labour/contract rates (₹25,000+).
 *   2. Specialised equipment — finds cheap lookalike products instead of the
 *      correct grade (₹58K for a 2000 CFM HRU vs the real ₹2.5L market price).
 *
 * Gemini understands the full description, unit, and city context and returns
 * realistic 2024-2026 Indian HVAC/MEP/FM rates — the same approach that makes
 * Base44's pricing accurate. Serper shopping remains a fallback for when the
 * Gemini key is not configured.
 */

interface BaselineRate {
  low?: number;
  mid?: number;
  high?: number;
}

const BASELINE_TTL_MS = 86_400_000;
const baselineCache = new Map<string, { at: number; rate: BaselineRate | null }>();

/**
 * The national baseline for one item, held for a day.
 *
 * Caching is not only about cost. The same item has to price the same way each
 * time it is asked for, or the market half of the benchmark drifts between one
 * view of a document and the next, and a city comparison measures model noise
 * instead of the cities. Re-pricing one document across five cities is one call
 * rather than five.
 *
 * Deliberately a plain map rather than unstable_cache: pricing also runs from
 * the scheduled jobs, which have no request context, and unstable_cache throws
 * there — a failure that would fall through to the shopping-search fallback and
 * quietly price a 2000 CFM HRU at 58K.
 */
async function nationalBaseline(prompt: string, key: string): Promise<BaselineRate | null> {
  const hit = baselineCache.get(key);
  if (hit && Date.now() - hit.at < BASELINE_TTL_MS) return hit.rate;

  const ai = geminiClient();
  const result = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: [{ role: "user" as const, parts: [{ text: prompt }] }],
      // Sampling is what made the same item answer 2.5L on one call and 2.75L
      // on the next; the rate asked for here is a reference figure, not a
      // creative one.
      config: { responseMimeType: "application/json", temperature: 0 },
    }),
  );

  const text = result.text ?? "";
  const rate = text.trim() ? (JSON.parse(text) as BaselineRate) : null;
  baselineCache.set(key, { at: Date.now(), rate });
  return rate;
}

async function geminiPricingEstimate(options: {
  description: string;
  unit: string;
  cityName: string;
  limit: number;
  fetchedAt: string;
  cityId: string;
  currency: string;
}): Promise<MarketQuote[]> {
  const { description, unit, cityName, limit, fetchedAt, cityId, currency } = options;

  if (!process.env.GOOGLE_AI_API_KEY) return [];

  // The rate asked for is the national baseline, not the city rate. Asked per
  // city, the model answers within a couple of percent for Delhi and Bengaluru
  // and identically for service items — it simply is not that city-sensitive —
  // which left the market side of the benchmark flat across locations while the
  // rate book moved with its index. Taking a national figure and applying the
  // same published index factor makes both halves move together, and makes the
  // difference between two cities explainable from a number the report shows.
  const prompt = `You are a construction and facilities-management cost database for India (2024-2026 market rates).

Provide the current all-India baseline market rate for this line item from a vendor quotation:

Description: "${description}"
Unit of measure: ${unit}

Return ONLY valid JSON with this exact shape — no prose, no markdown:
{"low": <20th-percentile rate in ${currency}>, "mid": <median rate in ${currency}>, "high": <80th-percentile rate in ${currency}>}

Rules:
- For supply items (Nos, each): give the typical wholesale/dealer price for the exact specification described.
- For service items (Job, LS, lot): give the total contract price for a single complete job including labour, tools, and overheads.
- Give the national baseline, averaged across major Indian metros. Do NOT add a premium or discount for any particular city — the caller applies its own city cost index.
- Return plain integers or decimals only (no currency symbols, no commas).`;

  try {
    // Temperature 0 and a cached baseline together make the answer repeatable.
    // Sampled at the default temperature the same item came back at 2.5L on one
    // call and 2.75L on the next — and "Testing, BMS Integration & Balancing"
    // swung between 75K and 2.5L — so re-pricing a document to another city
    // moved the benchmark for reasons that had nothing to do with the city, and
    // two cities could not be compared at all.
    const parsed = await nationalBaseline(prompt, `${description}|${unit}|${currency}`);
    if (!parsed) return [];

    const { low, mid, high } = parsed;
    if (!mid || mid <= 0) return [];

    // The published city cost index is what turns a national baseline into a
    // local one — the same factor the rate book is indexed by, so a line
    // benchmarked on market quotes and one benchmarked on the rate book move
    // by the same amount when the document is re-priced to another city.
    const indexFactor = getCityAny(cityId)?.indexFactor ?? 1;
    const prices = [low, mid, high]
      .filter((p): p is number => typeof p === "number" && p > 0)
      .map((price) => Math.round(price * indexFactor));

    return prices.slice(0, limit).map((price, i) => ({
      id: `gemini-price-${cityId}-${i}-${fetchedAt}`,
      seller: `AI Market Estimate (${cityName} index)`,
      platform: "Web search" as MarketPlatform,
      price,
      unit,
      location: cityName,
      url: "",
      fetchedAt,
      inStock: true,
      currency,
      vatPct: null,
    }));
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
    const cityName = city?.name ?? "";
    const cityConfig = isGcc ? GCC_SERPER_CONFIG[cityId] : undefined;
    const gl = cityConfig?.gl ?? "in";
    const location = cityConfig?.location ?? `${cityName}, India`;
    const minPrice = minPriceFor(unit);
    const fetchedAt = new Date().toISOString();
    const currency = city?.currency ?? "INR";

    // ── Primary: Gemini AI rate estimation ─────────────────────────────────
    //
    // Gemini understands the full item description and returns realistic
    // Indian HVAC/MEP/FM market rates for both supply and service items.
    // This is far more accurate than shopping search (which finds cheap
    // components instead of the correct unit or service contract rate).
    //
    // Serper shopping is kept as a fallback for when GOOGLE_AI_API_KEY is
    // absent, and as a cross-check for GCC markets.
    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const geminiQuotes = await geminiPricingEstimate({
          description,
          unit,
          cityName,
          limit,
          fetchedAt,
          cityId,
          currency,
        });
        if (geminiQuotes.length > 0) return geminiQuotes;
      } catch {
        // fall through to Serper
      }
    }

    // ── Fallback: Serper shopping (products only) ───────────────────────────
    //
    // Used when Gemini is not available. Service items are routed to web
    // search — shopping search returns component prices for them.
    if (isServiceItem(description, unit)) {
      // Trim to most distinctive keywords.
      const query = description
        .replace(/[^a-zA-Z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 8)
        .join(" ");
      const webQuotes = await serviceWebSearch({
        query, cityName, gl, location, limit, apiKey, cityId, unit, fetchedAt,
      });
      return webQuotes.map((q) => ({ ...q, currency, vatPct: city?.vatPct ?? null }));
    }

    // Product items: shopping search.
    const query = description
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 8)
      .join(" ");
    const suffix = isGcc ? " supplier wholesale" : "";
    const num = Math.max(limit * 3, 10);

    const response = await fetch("https://google.serper.dev/shopping", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query}${suffix}`, gl, hl: "en", location, num }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      throw new Error(`Serper returned ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as {
      shopping?: { title?: string; source?: string; link?: string; price?: string; delivery?: string }[];
    };

    let quotes = (payload.shopping ?? [])
      .map((item, index) => {
        const price = parsePrice(item.price);
        if (price === null || price < minPrice) return null;
        return {
          id: `serper-${cityId}-${index}-${fetchedAt}`,
          seller: item.source?.trim() || item.title?.slice(0, 40) || "Listed seller",
          platform: platformFor(item.link, isGcc) as MarketQuote["platform"],
          price,
          unit,
          location: cityName,
          url: item.link ?? "",
          fetchedAt,
          inStock: !/out of stock/i.test(item.delivery ?? ""),
        };
      })
      .filter((q): q is NonNullable<typeof q> => q !== null)
      .slice(0, limit);

    if (isGcc && quotes.length < limit) {
      const webQ = await webSearchFallback({ description, unit, cityId, limit: limit - quotes.length });
      quotes = [...quotes, ...webQ];
    }

    return quotes.map((q) => ({ ...q, currency, vatPct: city?.vatPct ?? null }));
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
