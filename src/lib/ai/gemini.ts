import { GoogleGenAI } from "@google/genai";

/**
 * Shared Gemini plumbing — the parts OCR and the assistant would otherwise
 * each get slightly wrong in their own way.
 *
 * The flash tier is busy infrastructure. 503 "high demand" and 429 rate limits
 * arrive in ordinary use and clear on their own, so surfacing either straight
 * to the user would cost them an upload or an answer for a condition that
 * resolves in seconds. Both callers retry on the same terms, and report the
 * same thing when retrying does not help.
 */

const RETRYABLE = new Set(["429", "500", "502", "503"]);
const BACKOFF_MS = [1200, 3000, 7000];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Google nests its detail as JSON inside the thrown message. */
export function geminiStatus(error: unknown): string | undefined {
  return String(error instanceof Error ? error.message : error).match(/"code":\s*(\d+)/)?.[1];
}

export function geminiClient() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_AI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey });
}

/**
 * Runs a Gemini call, waiting out the conditions that pass.
 *
 * Only transient statuses are retried — a rejected key or a malformed request
 * fails on the first attempt, because no amount of waiting will fix either.
 */
export async function withGeminiRetry<T>(call: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      return await call();
    } catch (error) {
      lastError = error;
      const status = geminiStatus(error);
      if (!status || !RETRYABLE.has(status) || attempt === BACKOFF_MS.length) break;
      await sleep(BACKOFF_MS[attempt]);
    }
  }

  throw lastError;
}

/** One wording for each failure, so both callers explain it the same way. */
export function geminiMessage(error: unknown, what: string): string {
  const status = geminiStatus(error);
  const raw = String(error instanceof Error ? error.message : error);

  if (status === "429") {
    return `Google AI is over quota. The free tier grants no quota on the Pro models and a small allowance on flash — check the plan at ai.google.dev/gemini-api/docs/rate-limits.`;
  }
  if (status === "503" || status === "502" || status === "500") {
    return `Google AI is busy and stayed busy across retries. This clears on its own — try again shortly.`;
  }
  if (status === "401" || status === "403") {
    return "Google AI rejected the configured API key.";
  }
  return `${what}${status ? ` (${status})` : ""}: ${raw.slice(0, 180)}`;
}
