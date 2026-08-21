import type {
  AnalysedInvoice,
  FieldConfidence,
  Invoice,
  LineItem,
  MarketQuote,
  QualityReport,
} from "../types";
import { analyseLines, summarise } from "../variance";
import { CITIES, getCity, getSor } from "./reference";

/* ------------------------------------------------------------------ *
 * Deterministic pseudo-randomness
 *
 * Market quotes are synthesised, not hand-written, so the fixtures stay
 * compact. Everything is seeded off a stable string id so the server and the
 * client render identical numbers (no hydration drift) and screenshots of the
 * prototype are reproducible.
 * ------------------------------------------------------------------ */

function hashString(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const SELLERS: { platform: MarketQuote["platform"]; sellers: string[]; searchUrl: string }[] = [
  {
    platform: "IndiaMART",
    sellers: ["Ganpati Traders", "Shree Ram Buildmart", "Krishna Enterprises", "Bharat Hardware Mart"],
    searchUrl: "https://www.indiamart.com/search.mp?ss=",
  },
  {
    platform: "Moglix",
    sellers: ["Moglix Business", "Moglix Bulk Supply"],
    searchUrl: "https://www.moglix.com/search?q=",
  },
  {
    platform: "TradeIndia",
    sellers: ["Sai Infra Suppliers", "Om Construction Supplies"],
    searchUrl: "https://www.tradeindia.com/search.html?keyword=",
  },
  {
    platform: "Amazon Business",
    sellers: ["Industrial Supplies Hub", "BuildPro Store"],
    searchUrl: "https://www.amazon.in/s?k=",
  },
  {
    platform: "Direct dealer",
    sellers: ["Regional Dealer Network", "Authorised Distributor"],
    searchUrl: "https://www.google.com/search?q=",
  },
];

/** Keeps the generated search URL short and meaningful. */
function searchTerms(description: string) {
  return description
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .join(" ");
}

/** Also used by the mock pricing adapter so synthesised quotes look consistent. */
export function buildQuotes(
  itemId: string,
  description: string,
  unit: string,
  centre: number,
  count: number,
  cityName: string,
  fetchedAt: string,
  spreadMultiplier = 0.19,
): MarketQuote[] {
  const rng = mulberry32(hashString(itemId));
  const quotes: MarketQuote[] = [];
  const used = new Set<number>();

  for (let i = 0; i < count; i++) {
    let pick = Math.floor(rng() * SELLERS.length);
    while (used.has(pick) && used.size < SELLERS.length) {
      pick = (pick + 1) % SELLERS.length;
    }
    used.add(pick);
    const source = SELLERS[pick];
    const seller = source.sellers[Math.floor(rng() * source.sellers.length)];
    const spread = (rng() - 0.45) * spreadMultiplier; // roughly ±9.5% default
    const price = centre * (1 + spread);
    const ageMinutes = Math.floor(rng() * 220) + 20;

    quotes.push({
      id: `${itemId}-q${i + 1}`,
      seller,
      platform: source.platform,
      price: price > 500 ? Math.round(price) : round2(price),
      unit,
      location: cityName,
      url: source.searchUrl + encodeURIComponent(searchTerms(description)),
      fetchedAt: new Date(new Date(fetchedAt).getTime() - ageMinutes * 60000).toISOString(),
      inStock: rng() > 0.15,
      currency: "INR",
      vatPct: null,
    });
  }
  return quotes;
}

/* ------------------------------------------------------------------ *
 * Seed specification
 * ------------------------------------------------------------------ */

interface LineSeed {
  /** The vendor's own wording, deliberately different from the SoR text. */
  desc: string;
  qty: number;
  /** SoR code this line should match. Omit for a line with no SoR baseline. */
  code?: string;
  /** Vendor rate as a multiple of the city-adjusted SoR rate. */
  ratex?: number;
  /** Market centre as a multiple of the city-adjusted SoR rate. null = no quotes found. */
  marketx?: number | null;
  quotes?: number;
  match?: number;
  conf?: Partial<FieldConfidence>;
  corrected?: boolean;
  /** For unmatched / lump-sum lines. */
  unit?: string;
  rate?: number;
}

function buildLines(
  invoiceId: string,
  cityId: string,
  seeds: LineSeed[],
  fetchedAt: string,
): LineItem[] {
  const city = getCity(cityId);

  return seeds.map((seed, idx) => {
    const id = `${invoiceId}-L${idx + 1}`;
    const sor = seed.code ? getSor(seed.code) : undefined;
    const adjusted = sor ? round2(sor.baseRate * city.indexFactor) : undefined;

    const rate =
      seed.rate ?? (adjusted != null ? round2(adjusted * (seed.ratex ?? 1)) : 0);
    const unit = seed.unit ?? sor?.unit ?? "nos";

    const marketCentre =
      seed.marketx === null || adjusted == null ? null : adjusted * (seed.marketx ?? 1);

    return {
      id,
      srNo: idx + 1,
      description: seed.desc,
      unit,
      quantity: seed.qty,
      rate,
      amount: round2(rate * seed.qty),
      confidence: {
        description: seed.conf?.description ?? 0.97,
        quantity: seed.conf?.quantity ?? 0.98,
        rate: seed.conf?.rate ?? 0.98,
      },
      corrected: seed.corrected,
      sorMatch:
        sor && adjusted != null
          ? {
              sorId: sor.id,
              code: sor.code,
              description: sor.description,
              unit: sor.unit,
              baseRate: sor.baseRate,
              matchScore: seed.match ?? 0.91,
              adjustedRate: adjusted,
              indexFactor: city.indexFactor,
              source: sor.source,
            }
          : undefined,
      marketQuotes:
        marketCentre == null
          ? []
          : buildQuotes(
              id,
              seed.desc,
              unit,
              marketCentre,
              seed.quotes ?? 3,
              city.name,
              fetchedAt,
            ),
    } satisfies LineItem;
  });
}

const passedGate = (score: number, note: string): QualityReport => ({
  passed: true,
  score,
  checks: [
    { id: "readable", label: "Text legibility", passed: true, detail: note },
    { id: "skew", label: "Page skew & orientation", passed: true, detail: "Within ±1.5° tolerance" },
    { id: "resolution", label: "Effective resolution", passed: true, detail: "≥ 300 DPI equivalent" },
    { id: "relevance", label: "Business document check", passed: true, detail: "Tax invoice / quotation layout detected" },
    { id: "tables", label: "Table structure", passed: true, detail: "Line-item grid detected on all pages" },
  ],
});

/* ------------------------------------------------------------------ *
 * Invoice fixtures
 * ------------------------------------------------------------------ */

const rawInvoices: Omit<Invoice, "hasOriginal">[] = [
  {
    id: "inv-0842",
    number: "INV-2026-0842",
    documentType: "invoice",
    vendor: "Shreeji Buildmart Pvt Ltd",
    vendorGstin: "09AABCS1429P1ZK",
    project: "Sector 62 Commercial Tower — Noida",
    cityId: "noida",
    uploadedBy: "Rahul Verma",
    uploadedAt: "2026-08-13T09:12:00+05:30",
    processedAt: "2026-08-13T09:14:36+05:30",
    status: "analysed",
    fileName: "shreeji-buildmart-aug-ra-bill-04.pdf",
    fileSizeKb: 842,
    pageCount: 3,
    quality: passedGate(0.94, "Machine-generated PDF with embedded text layer"),
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: buildLines(
      "inv-0842",
      "noida",
      [
        {
          desc: "RMC M-25 grade supplied and placed at site including pumping charges",
          code: "DSR 5.1.2",
          qty: 186,
          ratex: 1.14,
          marketx: 1.06,
          match: 0.93,
        },
        {
          desc: "TMT reinforcement bars Fe-500D — cut, bent and tied in position",
          code: "DSR 5.22.6",
          qty: 12500,
          ratex: 1.09,
          marketx: 1.02,
          match: 0.95,
          quotes: 4,
        },
        {
          desc: "Brickwork in CM 1:6 using FPS bricks class 7.5 — foundation and plinth",
          code: "DSR 6.1.2",
          qty: 42,
          ratex: 1.02,
          marketx: 0.99,
          match: 0.9,
        },
        {
          desc: "Cement plaster 12 mm thick in CM 1:6 on internal wall surfaces",
          code: "DSR 13.1.2",
          qty: 1850,
          ratex: 0.88,
          marketx: 0.97,
          match: 0.92,
        },
        {
          desc: "Vitrified tile flooring 600x600 mm (Kajaria or equivalent) laid on cement mortar bed",
          code: "DSR 11.41.1",
          qty: 620,
          ratex: 1.24,
          marketx: 1.04,
          match: 0.88,
          quotes: 4,
        },
        {
          desc: "Interior acrylic emulsion paint — two coats over primer",
          code: "DSR 13.46.1",
          qty: 2400,
          ratex: 1.03,
          marketx: 1.0,
          match: 0.94,
        },
        {
          desc: "OPC 53 grade cement supplied at site — 50 kg bags",
          code: "MAT-CEM 1.1",
          qty: 340,
          ratex: 1.17,
          marketx: 0.98,
          match: 0.97,
          quotes: 4,
        },
        {
          desc: "Site mobilisation, temporary hutment and watch & ward charges (lump sum)",
          qty: 1,
          unit: "LS",
          rate: 185000,
          conf: { description: 0.93 },
        },
      ],
      "2026-08-13T09:14:00+05:30",
    ),
  },
  {
    id: "qtn-1179",
    number: "QTN-1179",
    documentType: "quotation",
    vendor: "Nirman Traders & Contractors",
    vendorGstin: "27AAFCN8821L1Z9",
    project: "Riverside Hospitality Block — Pune",
    cityId: "pune",
    uploadedBy: "Ananya Iyer",
    uploadedAt: "2026-08-12T15:40:00+05:30",
    processedAt: "2026-08-12T15:42:11+05:30",
    status: "analysed",
    fileName: "nirman-traders-quotation-hospitality-blk.pdf",
    fileSizeKb: 1180,
    pageCount: 2,
    quality: passedGate(0.91, "Scanned at 400 DPI, text recovered cleanly"),
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: buildLines(
      "qtn-1179",
      "pune",
      [
        {
          desc: "ACP cladding 4 mm PVDF coated over aluminium framework incl. structural sealant",
          code: "DSR 14.7.2",
          qty: 480,
          ratex: 1.31,
          marketx: 1.08,
          match: 0.89,
          quotes: 4,
        },
        {
          desc: "Aluminium sliding windows, powder coated, with 5 mm float glass",
          code: "DSR 10.25.2",
          qty: 265,
          ratex: 1.12,
          marketx: 1.03,
          match: 0.9,
        },
        {
          desc: "Glazed ceramic wall tiles 300x600 mm fixed in CM 1:3 — toilets and pantry",
          code: "DSR 11.37.2",
          qty: 390,
          ratex: 1.05,
          marketx: 1.01,
          match: 0.93,
        },
        {
          desc: "White cement based wall putty, 2 mm average thickness",
          code: "DSR 13.5.1",
          qty: 3100,
          ratex: 0.86,
          marketx: 0.95,
          match: 0.95,
        },
        {
          desc: "CPVC concealed plumbing 25 mm dia incl. fittings and chasing",
          code: "DSR 17.2.3",
          qty: 720,
          ratex: 1.19,
          marketx: 1.05,
          match: 0.87,
        },
        {
          desc: "Vitreous china wash basin 550x400 mm with CP fittings",
          code: "DSR 17.11.1",
          qty: 46,
          ratex: 1.02,
          marketx: 0.99,
          match: 0.92,
        },
        {
          desc: "uPVC SWR drainage piping 110 mm dia incl. clamps and jointing",
          code: "DSR 18.3.1",
          qty: 340,
          ratex: 0.97,
          marketx: 1.0,
          match: 0.91,
        },
      ],
      "2026-08-12T15:42:00+05:30",
    ),
  },
  {
    id: "inv-0839",
    number: "INV-2026-0839",
    documentType: "invoice",
    vendor: "Metro Electricals & Hardware",
    vendorGstin: "29AAGCM4471R1ZD",
    project: "IT Park Facility AMC — Bengaluru",
    cityId: "bengaluru",
    uploadedBy: "Rahul Verma",
    uploadedAt: "2026-08-12T11:05:00+05:30",
    processedAt: "2026-08-12T11:07:52+05:30",
    status: "needs_review",
    fileName: "metro-electricals-scan-aug.jpg",
    fileSizeKb: 2340,
    pageCount: 1,
    quality: {
      passed: true,
      score: 0.72,
      checks: [
        {
          id: "readable",
          label: "Text legibility",
          passed: true,
          detail: "Mobile photo — contrast normalised, 3 fields below confidence threshold",
        },
        { id: "skew", label: "Page skew & orientation", passed: true, detail: "Corrected 4.2° skew" },
        {
          id: "resolution",
          label: "Effective resolution",
          passed: true,
          detail: "218 DPI equivalent — below the 300 DPI target",
        },
        { id: "relevance", label: "Business document check", passed: true, detail: "Tax invoice detected" },
        {
          id: "tables",
          label: "Table structure",
          passed: false,
          detail: "Right-hand column partially cropped — amounts recomputed from qty × rate",
        },
      ],
    },
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: buildLines(
      "inv-0839",
      "bengaluru",
      [
        {
          desc: "Light point wiring with 1.5 sq mm FR copper cable in PVC conduit incl. modular switch",
          code: "DSR(E&M) 1.4.2",
          qty: 148,
          ratex: 1.16,
          marketx: 1.04,
          match: 0.86,
          conf: { rate: 0.71, description: 0.82 },
        },
        {
          desc: "LED panel light 24W recessed, 4000K, driver inbuilt",
          code: "DSR(E&M) 2.1.5",
          qty: 210,
          ratex: 1.27,
          marketx: 0.96,
          match: 0.94,
          quotes: 4,
        },
        {
          desc: "Modular switch socket 6A/16A with plate and GI box",
          code: "DSR(E&M) 3.6.1",
          qty: 96,
          ratex: 1.08,
          marketx: 1.02,
          match: 0.9,
          conf: { quantity: 0.64 },
        },
        {
          desc: "MCB distribution board 8 way double door IP-43",
          code: "DSR(E&M) 5.2.1",
          qty: 12,
          ratex: 0.99,
          marketx: 1.0,
          match: 0.93,
        },
        {
          desc: "AMC — split AC units up to 2 TR, comprehensive, per unit per annum",
          code: "FM-AMC 3.2",
          qty: 34,
          ratex: 1.21,
          marketx: null,
          match: 0.79,
          conf: { rate: 0.68 },
        },
      ],
      "2026-08-12T11:07:00+05:30",
    ),
  },
  {
    id: "inv-0836",
    number: "INV-2026-0836",
    documentType: "invoice",
    vendor: "Sundaram Steel & Cement Co.",
    vendorGstin: "36AACCS9012Q1ZP",
    project: "Airport Cargo Terminal Fit-out — Hyderabad",
    cityId: "hyderabad",
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-08-10T17:22:00+05:30",
    processedAt: "2026-08-10T17:24:03+05:30",
    status: "analysed",
    fileName: "sundaram-steel-invoice-0836.pdf",
    fileSizeKb: 612,
    pageCount: 2,
    quality: passedGate(0.96, "Machine-generated PDF with embedded text layer"),
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: buildLines(
      "inv-0836",
      "hyderabad",
      [
        {
          desc: "Structural steel sections fabricated and erected incl. one priming coat",
          code: "DSR 8.1.1",
          qty: 28400,
          ratex: 1.07,
          marketx: 1.01,
          match: 0.92,
          quotes: 4,
        },
        {
          desc: "OPC 53 grade cement — 50 kg bags delivered at site",
          code: "MAT-CEM 1.1",
          qty: 1250,
          ratex: 0.95,
          marketx: 0.99,
          match: 0.97,
        },
        {
          desc: "Fe-500D TMT bars supplied, cut and bent as per BBS",
          code: "DSR 5.22.6",
          qty: 42000,
          ratex: 1.04,
          marketx: 1.01,
          match: 0.95,
        },
        {
          desc: "PCC 1:2:4 in foundation and plinth, M15 grade",
          code: "DSR 4.1.3",
          qty: 310,
          ratex: 1.01,
          marketx: 0.98,
          match: 0.93,
        },
        {
          desc: "Mechanical excavation in ordinary soil up to 1.5 m depth incl. disposal",
          code: "DSR 2.8.1",
          qty: 4800,
          ratex: 0.91,
          marketx: 0.96,
          match: 0.89,
        },
        {
          desc: "Cement concrete flooring 40 mm thick, 1:2:4 with neat cement finish",
          code: "DSR 11.3.1",
          qty: 2150,
          ratex: 1.06,
          marketx: 1.02,
          match: 0.91,
        },
      ],
      "2026-08-10T17:24:00+05:30",
    ),
  },
  {
    id: "qtn-1174",
    number: "QTN-1174",
    documentType: "quotation",
    vendor: "Deccan Interiors & Finishes",
    vendorGstin: "33AAECD6650M1ZT",
    project: "Corporate Office Refurbishment — Chennai",
    cityId: "chennai",
    uploadedBy: "Ananya Iyer",
    uploadedAt: "2026-08-07T10:31:00+05:30",
    processedAt: "2026-08-07T10:33:19+05:30",
    status: "analysed",
    fileName: "deccan-interiors-quote-refurb.pdf",
    fileSizeKb: 498,
    pageCount: 1,
    quality: passedGate(0.93, "Machine-generated PDF with embedded text layer"),
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: buildLines(
      "qtn-1174",
      "chennai",
      [
        {
          desc: "Half brick partition masonry in CM 1:4 — superstructure",
          code: "DSR 6.4.1",
          qty: 285,
          ratex: 1.09,
          marketx: 1.02,
          match: 0.9,
        },
        {
          desc: "Oil bound washable distemper, two coats over primer",
          code: "DSR 13.61.1",
          qty: 4200,
          ratex: 1.34,
          marketx: 1.06,
          match: 0.92,
          quotes: 4,
        },
        {
          desc: "uPVC door frames 50x47 mm factory made, mitred corners",
          code: "DSR 9.21.1",
          qty: 168,
          ratex: 0.93,
          marketx: 0.97,
          match: 0.88,
        },
        {
          desc: "Housekeeping deep clean of refurbished area — per sqm per month",
          code: "FM-HK 1.1",
          qty: 5600,
          ratex: 1.11,
          marketx: null,
          match: 0.81,
        },
        {
          desc: "Premium acrylic emulsion, interior grade, two coats",
          code: "DSR 13.46.1",
          qty: 3800,
          ratex: 1.02,
          marketx: 1.0,
          match: 0.94,
        },
      ],
      "2026-08-07T10:33:00+05:30",
    ),
  },
  {
    id: "inv-0827",
    number: "INV-2026-0827",
    documentType: "invoice",
    vendor: "Vertex Aluminium Systems",
    vendorGstin: "06AAHCV3388J1ZM",
    project: "Sector 62 Commercial Tower — Noida",
    cityId: "gurugram",
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-08-04T13:18:00+05:30",
    processedAt: "2026-08-04T13:20:44+05:30",
    status: "analysed",
    fileName: "vertex-aluminium-inv-0827.pdf",
    fileSizeKb: 705,
    pageCount: 2,
    quality: passedGate(0.95, "Machine-generated PDF with embedded text layer"),
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: buildLines(
      "inv-0827",
      "gurugram",
      [
        {
          desc: "Aluminium sliding window system with 5 mm float glass and EPDM gaskets",
          code: "DSR 10.25.2",
          qty: 412,
          ratex: 1.16,
          marketx: 1.05,
          match: 0.93,
          quotes: 4,
        },
        {
          desc: "ACP cladding 4 mm PVDF on aluminium sub-frame",
          code: "DSR 14.7.2",
          qty: 260,
          ratex: 1.03,
          marketx: 1.01,
          match: 0.9,
        },
        {
          desc: "Structural steel supports for facade — fabricated and primed",
          code: "DSR 8.1.1",
          qty: 6800,
          ratex: 0.98,
          marketx: 0.99,
          match: 0.86,
        },
      ],
      "2026-08-04T13:20:00+05:30",
    ),
  },
  {
    id: "inv-0830",
    number: "INV-2026-0830",
    documentType: "invoice",
    vendor: "Apex Facility Services",
    vendorGstin: "27AAJCA7761N1ZB",
    project: "Bandra Kurla Complex FM Contract — Mumbai",
    cityId: "mumbai",
    uploadedBy: "Rahul Verma",
    uploadedAt: "2026-08-14T08:47:00+05:30",
    status: "extracting",
    fileName: "apex-fm-monthly-aug.pdf",
    fileSizeKb: 934,
    pageCount: 4,
    quality: passedGate(0.9, "Machine-generated PDF with embedded text layer"),
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: [],
  },
  {
    id: "inv-0833",
    number: "INV-2026-0833",
    documentType: "invoice",
    vendor: "GreenBuild Infra Solutions",
    vendorGstin: "24AABCG5590H1ZQ",
    project: "Warehouse Shed Extension — Ahmedabad",
    cityId: "ahmedabad",
    uploadedBy: "Ananya Iyer",
    uploadedAt: "2026-08-11T16:02:00+05:30",
    status: "rejected",
    fileName: "IMG_20260811_160142.jpg",
    fileSizeKb: 3180,
    pageCount: 1,
    quality: {
      passed: false,
      score: 0.31,
      rejectionReason:
        "Image is too blurred to extract line items reliably. Re-shoot the document flat, in even light, with the full page in frame — or upload the original PDF.",
      checks: [
        {
          id: "readable",
          label: "Text legibility",
          passed: false,
          detail: "Severe motion blur — 68% of detected text below the legibility threshold",
        },
        { id: "skew", label: "Page skew & orientation", passed: false, detail: "Page skewed 14° and partially cropped" },
        { id: "resolution", label: "Effective resolution", passed: false, detail: "96 DPI equivalent after de-blur" },
        { id: "relevance", label: "Business document check", passed: true, detail: "Invoice-like layout detected" },
        { id: "tables", label: "Table structure", passed: false, detail: "No reliable line-item grid found" },
      ],
    },
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: [],
  },
  {
    id: "inv-0821",
    number: "—",
    documentType: "invoice",
    vendor: "Unidentified",
    vendorGstin: "—",
    project: "Unassigned",
    cityId: "delhi",
    uploadedBy: "Priya Nair",
    uploadedAt: "2026-08-02T12:26:00+05:30",
    status: "rejected",
    fileName: "team-offsite-photo.png",
    fileSizeKb: 1420,
    pageCount: 1,
    quality: {
      passed: false,
      score: 0.08,
      rejectionReason:
        "This file does not appear to be a vendor invoice or quotation. Upload a tax invoice, quotation, or work order in PDF or image form.",
      checks: [
        { id: "readable", label: "Text legibility", passed: true, detail: "Minimal text content detected" },
        { id: "skew", label: "Page skew & orientation", passed: true, detail: "Not applicable" },
        { id: "resolution", label: "Effective resolution", passed: true, detail: "Sufficient" },
        {
          id: "relevance",
          label: "Business document check",
          passed: false,
          detail: "No invoice header, GSTIN, tax fields or line-item table found — classified as out of scope",
        },
        { id: "tables", label: "Table structure", passed: false, detail: "No tabular structure found" },
      ],
    },
    subtotal: 0,
    taxPct: 18,
    total: 0,
    lineItems: [],
  },
];

/** Totals are derived from the line items so the fixtures can never disagree. */
function withTotals(inv: Invoice): Invoice {
  const subtotal = round2(inv.lineItems.reduce((sum, l) => sum + l.amount, 0));
  return {
    ...inv,
    subtotal,
    total: round2(subtotal * (1 + inv.taxPct / 100)),
  };
}

// Fixtures have no uploaded original behind them, so none offers a download.
export const INVOICES: Invoice[] = rawInvoices.map((invoice) =>
  withTotals({ ...invoice, hasOriginal: false }),
);

export function analyse(invoice: Invoice): AnalysedInvoice {
  const lineItems = analyseLines(invoice.lineItems);
  return {
    ...invoice,
    lineItems,
    summary: summarise(lineItems),
    city: getCity(invoice.cityId),
  };
}

export const ANALYSED_INVOICES: AnalysedInvoice[] = INVOICES.map(analyse);

export function getInvoice(id: string): AnalysedInvoice | undefined {
  return ANALYSED_INVOICES.find((i) => i.id === id);
}

/** Invoices that actually carry a variance verdict. */
export const REPORTED_INVOICES = ANALYSED_INVOICES.filter(
  (i) => i.status === "analysed" || i.status === "needs_review",
);

export { CITIES };
