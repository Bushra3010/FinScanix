import type { City, SorEntry } from "../types";
import { GCC_CITIES, getGccCity } from "./reference-gcc";

/**
 * City cost-index factors (CPWD-style, Delhi = 1.00) used to localise SoR base
 * rates — FR-3.3. In production these are admin-maintained rows in the DB.
 *
 * GCC cities live in reference-gcc.ts and are included in ALL_CITIES for
 * validation and lookup. getCity() below searches both arrays so the pipeline
 * and pricing adapters resolve either region transparently.
 */
export const CITIES: City[] = [
  { id: "delhi", name: "New Delhi", state: "Delhi", pin: "110001", indexFactor: 1.0 },
  { id: "mumbai", name: "Mumbai", state: "Maharashtra", pin: "400001", indexFactor: 1.18 },
  { id: "pune", name: "Pune", state: "Maharashtra", pin: "411001", indexFactor: 1.11 },
  { id: "bengaluru", name: "Bengaluru", state: "Karnataka", pin: "560001", indexFactor: 1.09 },
  { id: "hyderabad", name: "Hyderabad", state: "Telangana", pin: "500001", indexFactor: 1.04 },
  { id: "chennai", name: "Chennai", state: "Tamil Nadu", pin: "600001", indexFactor: 1.05 },
  { id: "kolkata", name: "Kolkata", state: "West Bengal", pin: "700001", indexFactor: 1.02 },
  { id: "noida", name: "Noida", state: "Uttar Pradesh", pin: "201301", indexFactor: 1.03 },
  { id: "gurugram", name: "Gurugram", state: "Haryana", pin: "122001", indexFactor: 1.06 },
  { id: "ahmedabad", name: "Ahmedabad", state: "Gujarat", pin: "380001", indexFactor: 0.98 },
  { id: "jaipur", name: "Jaipur", state: "Rajasthan", pin: "302001", indexFactor: 0.96 },
  { id: "lucknow", name: "Lucknow", state: "Uttar Pradesh", pin: "226001", indexFactor: 0.94 },
  { id: "kochi", name: "Kochi", state: "Kerala", pin: "682001", indexFactor: 1.03 },
  { id: "guwahati", name: "Guwahati", state: "Assam", pin: "781001", indexFactor: 1.14 },
  { id: "bhubaneswar", name: "Bhubaneswar", state: "Odisha", pin: "751001", indexFactor: 0.97 },
];

export function getCity(id: string): City {
  return CITIES.find((c) => c.id === id) ?? GCC_CITIES.find((c) => c.id === id) ?? CITIES[0];
}

/**
 * Seeded Schedule of Rates baseline — FR-3.1.
 *
 * Rates are illustrative figures at the Delhi baseline for prototype purposes.
 * The production seed is loaded from the licensed CPWD DSR / State PWD books
 * (see open question 2 in the PRD) and versioned by effective date.
 */
const SOR_SEED: Omit<SorEntry, "owned">[] = [
  {
    id: "sor-001",
    code: "DSR 2.8.1",
    description:
      "Earth work in excavation by mechanical means in foundation trenches, all kinds of soil, depth up to 1.5 m, including disposal within 50 m lead",
    unit: "cum",
    baseRate: 168,
    source: "CPWD DSR 2023",
    chapter: "2 — Earth Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-002",
    code: "DSR 4.1.3",
    description:
      "Providing and laying in position cement concrete of M15 grade (1:2:4) excluding cost of centering and shuttering, in foundation and plinth",
    unit: "cum",
    baseRate: 7850,
    source: "CPWD DSR 2023",
    chapter: "4 — Concrete Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-003",
    code: "DSR 5.1.2",
    description:
      "Providing and laying in position ready mixed M-25 grade concrete for reinforced cement concrete work, including pumping and placing",
    unit: "cum",
    baseRate: 8420,
    source: "CPWD DSR 2023",
    chapter: "5 — RCC Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-004",
    code: "DSR 5.22.6",
    description:
      "Steel reinforcement for R.C.C. work including straightening, cutting, bending, placing in position and binding — Thermo-Mechanically Treated bars of grade Fe-500D",
    unit: "kg",
    baseRate: 92.5,
    source: "CPWD DSR 2023",
    chapter: "5 — RCC Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-005",
    code: "DSR 6.1.2",
    description:
      "Brick work with common burnt clay F.P.S. (non modular) bricks of class designation 7.5 in foundation and plinth in cement mortar 1:6",
    unit: "cum",
    baseRate: 7120,
    source: "CPWD DSR 2023",
    chapter: "6 — Brick Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-006",
    code: "DSR 6.4.1",
    description:
      "Half brick masonry with common burnt clay F.P.S. bricks of class designation 7.5 in superstructure in cement mortar 1:4",
    unit: "sqm",
    baseRate: 785,
    source: "CPWD DSR 2023",
    chapter: "6 — Brick Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-007",
    code: "DSR 8.1.1",
    description:
      "Structural steel work in single sections, fixed with or without connecting plate, including cutting, hoisting, fixing in position and applying a priming coat",
    unit: "kg",
    baseRate: 108,
    source: "CPWD DSR 2023",
    chapter: "8 — Steel Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-008",
    code: "DSR 9.21.1",
    description:
      "Providing and fixing factory made uPVC door frame of size 50x47 mm with wall thickness 2.0 mm, mitred and joined at corners",
    unit: "metre",
    baseRate: 385,
    source: "CPWD DSR 2023",
    chapter: "9 — Wood & PVC Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-009",
    code: "DSR 10.25.2",
    description:
      "Providing and fixing aluminium sliding window with powder coated frame and 5 mm float glass panes, including EPDM gasket and hardware",
    unit: "sqm",
    baseRate: 4650,
    source: "CPWD DSR 2023",
    chapter: "10 — Aluminium Work",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-010",
    code: "DSR 11.3.1",
    description:
      "Cement concrete flooring 1:2:4 with stone aggregate 20 mm nominal size, 40 mm thick, finished with a floating coat of neat cement",
    unit: "sqm",
    baseRate: 452,
    source: "CPWD DSR 2023",
    chapter: "11 — Flooring",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-011",
    code: "DSR 11.41.1",
    description:
      "Providing and laying vitrified floor tiles 600x600 mm with water absorption less than 0.08%, laid on 20 mm thick cement mortar bed 1:4",
    unit: "sqm",
    baseRate: 1340,
    source: "CPWD DSR 2023",
    chapter: "11 — Flooring",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-012",
    code: "DSR 11.37.2",
    description:
      "Providing and fixing 1st quality ceramic glazed wall tiles 300x600 mm on walls, in cement mortar 1:3, jointed with white cement slurry",
    unit: "sqm",
    baseRate: 985,
    source: "CPWD DSR 2023",
    chapter: "11 — Flooring",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-013",
    code: "DSR 13.1.2",
    description: "12 mm cement plaster of mix 1:6 (1 cement : 6 fine sand) on rough side of walls",
    unit: "sqm",
    baseRate: 248,
    source: "CPWD DSR 2023",
    chapter: "13 — Finishing",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-014",
    code: "DSR 13.5.1",
    description:
      "Providing and applying white cement based putty of average thickness 2 mm over plastered surface to prepare the surface even and smooth",
    unit: "sqm",
    baseRate: 168,
    source: "CPWD DSR 2023",
    chapter: "13 — Finishing",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-015",
    code: "DSR 13.46.1",
    description:
      "Painting with premium acrylic emulsion paint of interior grade having VOC content less than 50 g/l, two coats on wall surface",
    unit: "sqm",
    baseRate: 142,
    source: "CPWD DSR 2023",
    chapter: "13 — Finishing",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-016",
    code: "DSR 13.61.1",
    description:
      "Distempering with oil bound washable distemper of approved brand and manufacture, two coats over and including one coat of primer",
    unit: "sqm",
    baseRate: 96,
    source: "CPWD DSR 2023",
    chapter: "13 — Finishing",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-017",
    code: "DSR 14.7.2",
    description:
      "Providing and fixing aluminium composite panel cladding, 4 mm thick with PVDF coating, on aluminium framework including sealant",
    unit: "sqm",
    baseRate: 3150,
    source: "CPWD DSR 2023",
    chapter: "14 — Cladding & Repairs",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-018",
    code: "DSR 17.2.3",
    description:
      "Providing and fixing CPVC pipes 25 mm nominal outer dia, concealed in wall, including all CPVC fittings, cutting and making good the walls",
    unit: "metre",
    baseRate: 486,
    source: "CPWD DSR 2023",
    chapter: "17 — Water Supply & Sanitary",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-019",
    code: "DSR 17.11.1",
    description:
      "Providing and fixing white vitreous china wash basin 550x400 mm with C.I. brackets, 32 mm C.P. brass waste and stop cock",
    unit: "each",
    baseRate: 3280,
    source: "CPWD DSR 2023",
    chapter: "17 — Water Supply & Sanitary",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-020",
    code: "DSR 18.3.1",
    description:
      "Providing and laying uPVC SWR pipe 110 mm dia (6 kg/sqcm) including fittings, jointing and clamps",
    unit: "metre",
    baseRate: 412,
    source: "CPWD DSR 2023",
    chapter: "18 — Drainage",
    effectiveFrom: "2023-10-01",
  },
  {
    id: "sor-021",
    code: "DSR(E&M) 1.4.2",
    description:
      "Wiring for light point / fan point with 1.5 sq mm FR PVC insulated copper conductor single core cable in surface / recessed PVC conduit with modular switch",
    unit: "point",
    baseRate: 1285,
    source: "CPWD DSR (E&M) 2023",
    chapter: "E&M 1 — Internal Wiring",
    effectiveFrom: "2023-07-01",
  },
  {
    id: "sor-022",
    code: "DSR(E&M) 2.1.5",
    description:
      "Supply and fixing of LED panel light 24W, recessed mounted, driver inbuilt, 4000K, conforming to IS 10322",
    unit: "each",
    baseRate: 1180,
    source: "CPWD DSR (E&M) 2023",
    chapter: "E&M 2 — Luminaires",
    effectiveFrom: "2023-07-01",
  },
  {
    id: "sor-023",
    code: "DSR(E&M) 3.6.1",
    description:
      "Supplying and fixing 6A/16A modular switch socket outlet of modular plate, suitable G.I. box and earth terminal",
    unit: "each",
    baseRate: 640,
    source: "CPWD DSR (E&M) 2023",
    chapter: "E&M 3 — Accessories",
    effectiveFrom: "2023-07-01",
  },
  {
    id: "sor-024",
    code: "DSR(E&M) 5.2.1",
    description:
      "Supply and installation of MCB distribution board 8 way, double door, sheet steel, IP-43, with tinned copper busbar",
    unit: "each",
    baseRate: 4250,
    source: "CPWD DSR (E&M) 2023",
    chapter: "E&M 5 — Distribution",
    effectiveFrom: "2023-07-01",
  },
  {
    id: "sor-025",
    code: "FM-AMC 3.2",
    description:
      "Comprehensive annual maintenance contract of split air conditioner up to 2 TR including gas top-up, spares and quarterly preventive service (per unit per annum)",
    unit: "each",
    baseRate: 4800,
    source: "State PWD FM Schedule 2024",
    chapter: "FM — HVAC Maintenance",
    effectiveFrom: "2024-04-01",
  },
  {
    id: "sor-026",
    code: "FM-HK 1.1",
    description:
      "Housekeeping — periodic deep cleaning of built-up area including machine scrubbing, consumables and manpower (per sqm per month)",
    unit: "sqm",
    baseRate: 18.5,
    source: "State PWD FM Schedule 2024",
    chapter: "FM — Housekeeping",
    effectiveFrom: "2024-04-01",
  },
  {
    id: "sor-027",
    code: "MAT-CEM 1.1",
    description:
      "Ordinary Portland Cement 53 grade conforming to IS 12269, supplied at site in 50 kg bags",
    unit: "bag",
    baseRate: 405,
    source: "CPWD Market Rate Schedule 2024",
    chapter: "Materials — Cement",
    effectiveFrom: "2024-04-01",
  },
];

/** The seed is the shared public rate book, so nothing in it is tenant-owned. */
export const SOR_CATALOG: SorEntry[] = SOR_SEED.map((entry) => ({ ...entry, owned: false }));

export function getSor(code: string): SorEntry | undefined {
  return SOR_CATALOG.find((s) => s.code === code);
}
