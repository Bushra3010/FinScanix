/**
 * Domain guard for the in-app assistant — FR-10.2 / FR-10.3.
 *
 * The guard is deliberately implemented as real logic rather than mocked: the
 * exact fallback string is a hard requirement, so the prototype must be able to
 * demonstrate it. When a live model is wired in, this classifier stays in front
 * of it as a cheap pre-filter and the same string is used as the system-prompt
 * refusal.
 */

export const OUT_OF_DOMAIN_REPLY =
  "I'm sorry, I can only assist with construction and facilities management-related queries.";

const IN_DOMAIN_TERMS = [
  // Construction & civil
  "construction", "civil", "concrete", "rcc", "cement", "aggregate", "steel", "tmt",
  "rebar", "reinforcement", "brick", "masonry", "mortar", "plaster", "shuttering",
  "formwork", "excavation", "foundation", "plinth", "beam", "column", "slab", "roof",
  "scaffold", "curing", "waterproofing", "flooring", "tile", "vitrified", "granite",
  "marble", "paint", "putty", "distemper", "emulsion", "cladding", "acp", "facade",
  "glazing", "aluminium", "carpentry", "joinery", "boq", "bill of quantity",
  "bill of quantities", "tender", "contractor", "subcontractor", "site", "structure",
  "structural", "load bearing", "seismic", "soil", "survey", "levelling",
  // Rates, estimation & audit
  "sor", "schedule of rates", "dsr", "cpwd", "pwd", "rate analysis", "estimate",
  "estimation", "quantity surveyor", "quantity surveying", "abstract", "measurement",
  "quotation", "invoice", "variance", "overpriced", "over-priced", "underpriced",
  "under-priced", "market rate", "cost index", "escalation", "gst", "billing",
  "ra bill", "running account", "retention", "vendor", "procurement", "purchase order",
  "work order", "valuation", "audit", "benchmark",
  // MEP
  "mep", "hvac", "chiller", "ahu", "ductwork", "vrv", "vrf", "air conditioner",
  "plumbing", "cpvc", "upvc", "sanitary", "drainage", "sewage", "stp", "wtp",
  "firefighting", "sprinkler", "hydrant", "electrical", "wiring", "conduit", "cable",
  "switchgear", "mcb", "db", "distribution board", "transformer", "dg set", "generator",
  "luminaire", "led", "lighting", "earthing", "lift", "elevator", "escalator", "bms",
  "solar", "ups",
  // Facilities management & operations
  "facility", "facilities", "fm", "maintenance", "amc", "housekeeping", "cleaning",
  "janitorial", "pest control", "landscaping", "security", "helpdesk", "asset",
  "preventive maintenance", "breakdown", "sla", "occupancy", "building", "commercial",
  "hospitality", "hotel", "industrial", "warehouse", "campus", "tenant", "fit-out",
  "fitout", "refurbishment", "renovation", "retrofit", "energy audit", "hse", "safety",
  // Engineering generally
  "engineering", "engineer", "specification", "is code", "astm", "tolerance",
  "inspection", "quality control", "qa/qc", "drawing", "cad", "bim",
  // Product-specific help (the assistant should be able to explain FinScanix)
  "finscanix", "upload", "extraction", "ocr", "report", "dashboard", "subscription",
];

/** Questions about the tool itself count as in-domain support. */
const PRODUCT_TERMS = ["finscanix", "this tool", "this app", "the platform", "your system"];

const CLEAR_OUT_OF_DOMAIN = [
  "recipe", "cook", "biryani", "pizza", "football", "cricket score", "movie", "netflix",
  "song", "lyrics", "politics", "election", "vote", "stock tip", "crypto", "bitcoin",
  "dating", "horoscope", "astrology", "joke", "poem", "novel", "celebrity", "video game",
  "travel itinerary", "holiday", "weather forecast",
];

function normalise(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9/&-]+/g, " ").replace(/\s+/g, " ")} `;
}

export interface DomainVerdict {
  inDomain: boolean;
  matchedTerms: string[];
}

export function classifyDomain(question: string): DomainVerdict {
  const text = normalise(question);

  const blocked = CLEAR_OUT_OF_DOMAIN.filter((term) => text.includes(` ${term}`));
  const matched = IN_DOMAIN_TERMS.filter((term) => text.includes(` ${term}`) || text.includes(`${term} `));
  const productMatch = PRODUCT_TERMS.some((term) => text.includes(term));

  // An explicit off-topic subject wins unless the question is genuinely about
  // construction too (e.g. "safety at a cricket stadium construction site").
  if (blocked.length > 0 && matched.length === 0) {
    return { inDomain: false, matchedTerms: [] };
  }

  return { inDomain: matched.length > 0 || productMatch, matchedTerms: matched.slice(0, 4) };
}

/* ------------------------------------------------------------------ *
 * Canned in-domain answers for the prototype.
 * ------------------------------------------------------------------ */

interface CannedAnswer {
  keys: string[];
  answer: string;
}

const CANNED: CannedAnswer[] = [
  {
    keys: ["cost index", "city index", "index factor", "location"],
    answer:
      "City cost index factors adjust a Schedule of Rates base rate for local market conditions. FinScanix stores CPWD-style factors with Delhi as the 1.00 baseline — for example Mumbai 1.18, Pune 1.11, Bengaluru 1.09, Jaipur 0.96.\n\nWhen a line item is matched to a SoR entry, the baseline used for comparison is:\n\n  adjusted rate = SoR base rate × city index factor\n\nThe factor applied to each line is shown on the report, so a reviewer can always see how the baseline was derived.",
  },
  {
    keys: ["over", "under", "par", "variance", "flag", "classif"],
    answer:
      "Each line item is compared against a blended benchmark — 60% of the location-adjusted SoR rate and 40% of the median live market price, where both are available.\n\n• Over-priced — invoice rate is more than 7% above the benchmark\n• At par — within ±7% of the benchmark\n• Under-priced — more than 7% below the benchmark\n\nThe ±7% band absorbs normal brand, batch and freight differences. Items with no SoR match and no market quote are reported as unmatched rather than being forced into a verdict.",
  },
  {
    keys: ["sor", "schedule of rates", "dsr", "cpwd"],
    answer:
      "The Schedule of Rates is the government rate book used as the neutral baseline. FinScanix seeds CPWD DSR and State PWD schedules, keyed by item code, unit and effective date.\n\nMatching works on the item description: the vendor's wording is normalised and scored against the SoR text, and the match score is shown alongside the verdict. Anything below the match threshold is surfaced for manual confirmation rather than silently matched.",
  },
  {
    keys: ["market price", "live pricing", "indiamart", "moglix", "quote"],
    answer:
      "Market pricing is fetched from B2B and e-commerce sources (IndiaMART, Moglix, TradeIndia and equivalents) through a search API, filtered to the project's city or PIN code.\n\nEvery quote carries its seller, platform, location and fetch timestamp, and the report uses the median of the returned quotes rather than the lowest — a single outlier listing should not drive a variance verdict. Scheduled jobs refresh prices so stale quotes do not creep into reports.",
  },
  {
    keys: ["ocr", "extraction", "confidence", "scan", "upload"],
    answer:
      "Documents go through a quality gate before extraction: legibility, skew, effective resolution, and a check that the file is actually a business document. Anything that fails is rejected with a specific reason and does not consume extraction quota.\n\nAccepted documents are parsed into line items with per-field confidence scores. Fields below the confidence threshold are highlighted for review, and any field can be corrected before matching runs — corrections are recorded in the audit trail.",
  },
  {
    keys: ["amc", "maintenance", "hvac", "housekeeping", "facility", "facilities"],
    answer:
      "Facilities line items are handled the same way as civil works, but the baseline usually comes from a State PWD facilities schedule rather than the DSR — for instance comprehensive AMC of a split AC unit up to 2 TR, or deep cleaning charged per square metre per month.\n\nService items often have thin market-price coverage, so many are benchmarked against the SoR alone. The report labels the basis used for every line so a reviewer knows whether a verdict rests on one source or two.",
  },
  {
    keys: ["tmt", "steel", "rebar", "reinforcement"],
    answer:
      "Reinforcement steel is usually billed per kilogram or per metric tonne, so the first thing to confirm is unit consistency between the invoice and the baseline — a per-tonne rate compared against a per-kg baseline is the most common false positive in rate audits.\n\nFinScanix normalises units during matching and flags a unit mismatch instead of producing a variance verdict. For Fe-500D bars the benchmark blends the DSR rate for reinforcement work with live mill and dealer pricing for the same grade.",
  },
  {
    keys: ["report", "export", "audit"],
    answer:
      "A variance report contains the extracted line items, the SoR reference and applied city index, the market quotes with sources and timestamps, the per-line verdict, and an invoice-level roll-up of total variance and recoverable amount.\n\nBecause the engine is deterministic — same inputs, same verdict — a report can be regenerated later and will match the version that was signed off. Reports export to PDF and Excel for audit files.",
  },
];

export function answerInDomain(question: string): string {
  const text = question.toLowerCase();
  const hit = CANNED.find((c) => c.keys.some((k) => text.includes(k)));
  if (hit) return hit.answer;

  return (
    "That falls inside FinScanix's scope — construction, facilities management and engineering.\n\n" +
    "In this prototype the assistant answers from a fixed set of worked examples rather than a live model, so I can go deep on: variance classification, SoR matching, city cost indices, market-price sourcing, OCR confidence and corrections, AMC and facilities rates, and report exports.\n\n" +
    "Ask about any of those and you'll get the full answer. Connecting a live model is a matter of setting the API key — the domain guard you just passed through stays in front of it unchanged."
  );
}
