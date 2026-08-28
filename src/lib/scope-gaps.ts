/**
 * Scope-gap analysis derived from a document's own content — FR-3.4.
 *
 * Section B answers two questions about a quotation: what a buyer would expect
 * to see priced that is not here, and what wording is too loose to hold the
 * vendor to. The vision model answers both while it reads the document, and its
 * answer is the one the report shows. This module is the fallback for documents
 * analysed before that was captured, and for the text-layer path, which reads
 * rows rather than reasoning about scope.
 *
 * The rule that makes the fallback useful is that nothing is raised unless this
 * document's own line items put it in scope: an HRU replacement and a
 * housekeeping contract must not produce the same list, which is exactly what
 * the fixed three-item checklist this replaces used to do.
 */

export interface ScopeInput {
  /** Line-item descriptions, as printed. */
  descriptions: string[];
  /** Vendor-stated exclusions — named as excluded is disclosed, not missed. */
  exclusions?: string[];
  /** The project or work title, which often names the trade. */
  project?: string;
}

export interface ScopeAnalysis {
  /** Items this scope of work would normally price but this document does not. */
  gaps: string[];
  /** Wording quoted from the lines it appears on, too loose to price against. */
  ambiguities: string[];
  /** Trades the document was read as covering — useful when explaining a gap. */
  trades: string[];
}

/** The trades a document can be read as covering, keyed by their own vocabulary. */
const TRADES: Record<string, string[]> = {
  civil: ["rcc", "concrete", "excavat", "brick", "block work", "plaster", "shutter", "reinforc", "masonry", "waterproof", "screed", "footing", "column", "slab"],
  pool: ["pool", "swimming", "spa", "jacuzzi", "skimmer", "filtration"],
  hvac: ["hru", "ahu", "hvac", "duct", "chiller", "vrf", "vrv", "fcu", "fan coil", "refrigerant", "condenser", "compressor", "grille", "diffuser", "air handling", "blower", "cassette", "split unit", "ventilat"],
  plumbing: ["plumb", "pipe", "cpvc", "upvc", "drain", "valve", "sanitary", "faucet", "water supply", "pump"],
  electrical: ["electric", "cable", "wiring", "conduit", "panel", "mcb", "mccb", "earthing", "luminaire", "light fitting", "starter", "vfd"],
  finishes: ["tile", "flooring", "paint", "false ceiling", "gypsum", "marble", "polish", "laminate", "cladding"],
  services: ["amc", "housekeep", "manpower", "deployment", "supervisor", "service visit", "annual maintenance", "facility management"],
};

/**
 * Items a buyer would expect to see priced.
 *
 * `trades` limits an item to the work it belongs to — empty means it applies to
 * any document. `kw` is the wording that shows it is already covered, and
 * `requires` gates an item on context that makes it relevant at all: removing
 * the old unit is only a gap on a replacement job.
 */
const CHECKLIST: { item: string; kw: string[]; trades: string[]; requires?: string[] }[] = [
  { item: "Statutory approval and inspection fees", kw: ["statutory", "approval", "permit", "noc", "sanction", "liaison"], trades: ["civil", "pool", "hvac", "plumbing", "electrical"] },
  { item: "Contractor's insurance and performance bond", kw: ["insurance", "performance bond", "bank guarantee", "workmen compensation"], trades: [] },
  { item: "Temporary power and water at site", kw: ["temporary", "temp power", "temp water", "genset", "dg set", "utilit"], trades: ["civil", "pool", "hvac", "plumbing", "electrical", "finishes"] },
  { item: "Removal and disposal of the existing equipment", kw: ["dismantl", "removal", "remove", "disposal", "dispose", "buy back", "buyback", "scrap"], trades: ["hvac", "plumbing", "electrical"], requires: ["replace", "retrofit", "existing", "old"] },
  { item: "Debris removal and site clearance", kw: ["debris", "malba", "cart away", "carting", "clearance", "disposal", "dispose"], trades: ["civil", "pool", "finishes"] },
  { item: "Testing, balancing and commissioning", kw: ["testing", "commission", "balanc", "trial run"], trades: ["hvac", "plumbing", "electrical", "pool"] },
  { item: "Making good of civil works after installation", kw: ["making good", "make good", "restoration", "patch", "chipping", "core cut", "grouting"], trades: ["hvac", "plumbing", "electrical"] },
  { item: "Scaffolding and access arrangements", kw: ["scaffold", "staging", "cradle", "access platform", "chain pulley", "crane", "hydra"], trades: ["civil", "hvac", "finishes"] },
  { item: "Freight, unloading and shifting to site", kw: ["freight", "transport", "unload", "shifting", "cartage", "packing"], trades: ["civil", "pool", "hvac", "plumbing", "electrical", "finishes"] },
  { item: "Defect liability / warranty period", kw: ["warrant", "guarantee", "defect liability", "dlp"], trades: [] },
  { item: "O&M manuals and as-built drawings", kw: ["o&m", "manual", "as built", "as-built", "documentation"], trades: ["hvac", "plumbing", "electrical", "pool"] },
  { item: "Post-handover maintenance (AMC)", kw: ["amc", "annual maintenance", "maintenance contract", "service visit"], trades: ["hvac", "pool", "electrical"] },
  { item: "Statutory labour compliance (PF / ESI / minimum wages)", kw: ["pf", "esi", "minimum wage", "labour licence", "labour license", "compliance"], trades: ["services"] },
  { item: "Consumables and spares during the contract", kw: ["consumable", "spare", "chemical", "material"], trades: ["services"] },
];

/** Wording that cannot be priced against, and how to report it. */
const AMBIGUITIES: { kw: string[]; note: (desc: string) => string }[] = [
  { kw: ["branded", "equivalent", "approved make", "or similar", "reputed make"], note: (d) => `Make and model left open on '${d}' — "equivalent" is not a specification` },
  { kw: ["as required", "as directed", "as per site", "site condition", "if required"], note: (d) => `Quantity for '${d}' is left to site conditions` },
  { kw: ["lump sum", "lumpsum", "provisional"], note: (d) => `'${d}' is priced as a lump sum with no measurable basis` },
  { kw: ["etc", "misc", "miscellaneous", "and others"], note: (d) => `'${d}' ends open — "etc" leaves the scope undefined` },
  { kw: ["approx", "tentative", "to be decided", "tbd"], note: (d) => `'${d}' is only tentatively specified` },
  { kw: ["as per specification", "as per drawing", "as per standard", "as per attached"], note: (d) => `'${d}' refers to a specification not attached to this quotation` },
];

/**
 * Prefix match on a word boundary.
 *
 * Matching a prefix rather than a whole word is what lets one keyword cover a
 * family — "dismantl" catches dismantling, "commission" catches commissioned —
 * while the leading boundary keeps "etc" from firing inside "stretcher".
 */
function mentions(haystack: string, keywords: string[]): boolean {
  return keywords.some((k) =>
    new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(haystack),
  );
}

/** Keeps a quoted description short enough to read in a bullet. */
function short(description: string): string {
  return description.length > 58 ? `${description.slice(0, 55).trimEnd()}…` : description;
}

export function deriveScopeAnalysis(input: ScopeInput): ScopeAnalysis {
  const descriptions = input.descriptions.map((d) => d.trim()).filter(Boolean);
  const haystack = [...descriptions, ...(input.exclusions ?? []), input.project ?? ""]
    .join(" | ")
    .toLowerCase();

  const trades = Object.entries(TRADES)
    .filter(([, keywords]) => mentions(haystack, keywords))
    .map(([trade]) => trade);
  const covered = new Set(trades);

  const gaps = CHECKLIST.filter(
    (entry) =>
      (entry.trades.length === 0 || entry.trades.some((t) => covered.has(t))) &&
      (!entry.requires || mentions(haystack, entry.requires)) &&
      !mentions(haystack, entry.kw),
  ).map((entry) => entry.item);

  const ambiguities: string[] = [];
  for (const description of descriptions) {
    const pattern = AMBIGUITIES.find((p) => mentions(description, p.kw));
    if (pattern) ambiguities.push(pattern.note(short(description)));
  }

  return { gaps, ambiguities: Array.from(new Set(ambiguities)), trades };
}
