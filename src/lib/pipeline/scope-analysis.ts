import { prisma } from "@/lib/db/client";
import { geminiClient, withGeminiRetry } from "@/lib/ai/gemini";

/**
 * Scope gaps and ambiguities read from a document's own line items — FR-3.4.
 *
 * A checklist cannot answer this question. Whatever the list contains, the
 * items that vendors rarely price — insurance, statutory approvals, temporary
 * utilities — are absent from almost every quotation, so "checklist minus what
 * is priced" returns the same three or four lines on every document, which is
 * exactly the complaint this replaces. What differs between an HRU replacement
 * and a swimming pool is not which boilerplate is missing but what the work
 * itself needs: refrigerant recovery on one, dewatering on the other.
 *
 * So the gaps are read per document by a model that is shown the actual scope.
 * The line items are already stored, which means this runs for documents that
 * were analysed long before scope gaps were captured — no re-upload, and no
 * need for the original file.
 */

const MODEL = "gemini-flash-lite-latest";

export interface ScopeAnalysisInput {
  project: string;
  documentType: string;
  lines: { description: string; unit: string; quantity: number; amount: number }[];
  exclusions?: string[];
}

export interface ModelScopeAnalysis {
  gaps: string[];
  ambiguities: string[];
}

function buildPrompt(input: ScopeAnalysisInput): string {
  const items = input.lines
    .map((l, i) => `${i + 1}. ${l.description} — ${l.quantity} ${l.unit}, ₹${Math.round(l.amount)}`)
    .join("\n");
  const excluded = input.exclusions?.length
    ? input.exclusions.map((e) => `- ${e}`).join("\n")
    : "(none stated)";

  return `You are a quantity surveyor reviewing a vendor quotation from the Indian construction and facilities-management sector.

Project: ${input.project}
Document type: ${input.documentType}

Priced line items:
${items}

Stated exclusions:
${excluded}

Identify two things, judging ONLY against the work this document is actually for.

"scopeGaps" — work or cost that this particular job cannot be delivered without, but which appears in neither the priced items nor the stated exclusions. Reason from the trade in front of you: an air-handling unit replacement needs the old unit removed, refrigerant recovered and the system balanced; a swimming pool needs dewatering, waterproofing and filtration commissioning; a housekeeping contract needs consumables, supervision and statutory labour compliance. Name the item in the vocabulary of that trade, referring to the actual equipment or work where you can — "Refrigerant recovery from the existing 2000 CFM unit" tells the buyer more than "Refrigerant handling".

Avoid generic commercial boilerplate — insurance, performance bonds, statutory approvals, taxes, freight — unless the scope makes it a material risk on THIS job specifically, and say why in the same phrase when you do include one. A reviewer reading five different quotations should not see the same list twice.

"ambiguities" — wording in these line items that is too loose to hold the vendor to: unnamed makes ("branded / equivalent"), open quantities ("as required", "lump sum"), undefined responsibility, or specifications deferred elsewhere. Write each as "item — what is left undefined", never the item description alone.

Return at most 4 of each, fewest first in importance order, and an empty array where there is genuinely nothing to report. Never invent an entry to fill the list.

Return ONLY valid JSON, no prose and no markdown:
{"scopeGaps": ["..."], "ambiguities": ["..."]}`;
}

function toList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0 && !/^(none|nil|n\/?a)\.?$/i.test(entry))
    .slice(0, 4);
}

/**
 * Asks the model to read this document's scope. Returns null when Gemini is not
 * configured or the call fails — the report then falls back to the derived
 * checklist rather than showing nothing.
 */
export async function generateScopeAnalysis(
  input: ScopeAnalysisInput,
): Promise<ModelScopeAnalysis | null> {
  if (!process.env.GOOGLE_AI_API_KEY) return null;
  if (input.lines.length === 0) return null;

  try {
    const ai = geminiClient();
    const result = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user" as const, parts: [{ text: buildPrompt(input) }] }],
        config: { responseMimeType: "application/json" },
      }),
    );

    const text = result.text ?? "";
    if (!text.trim()) return null;

    const parsed = JSON.parse(text) as { scopeGaps?: unknown; ambiguities?: unknown };
    return { gaps: toList(parsed.scopeGaps), ambiguities: toList(parsed.ambiguities) };
  } catch {
    // A scope read that did not happen is not worth failing a report over.
    return null;
  }
}

/**
 * The stored analysis for an invoice, generating and persisting it on first
 * view when the document predates this field.
 *
 * Both columns are written even when the model found nothing, so an empty
 * result is remembered as "asked and answered" rather than re-asked on every
 * page view. Callers get null when there is nothing to show and the derived
 * checklist should stand in.
 */
export async function ensureScopeAnalysis(invoiceId: string): Promise<ModelScopeAnalysis | null> {
  const row = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      project: true,
      documentType: true,
      exclusions: true,
      scopeGaps: true,
      ambiguities: true,
      lineItems: {
        select: { description: true, unit: true, quantity: true, amount: true },
        orderBy: { srNo: "asc" },
      },
    },
  });
  if (!row) return null;

  if (Array.isArray(row.scopeGaps) || Array.isArray(row.ambiguities)) {
    return {
      gaps: Array.isArray(row.scopeGaps) ? (row.scopeGaps as string[]) : [],
      ambiguities: Array.isArray(row.ambiguities) ? (row.ambiguities as string[]) : [],
    };
  }

  const analysis = await generateScopeAnalysis({
    project: row.project,
    documentType: row.documentType,
    lines: row.lineItems,
    exclusions: Array.isArray(row.exclusions) ? (row.exclusions as string[]) : [],
  });
  if (!analysis) return null;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { scopeGaps: analysis.gaps, ambiguities: analysis.ambiguities },
  });
  return analysis;
}
