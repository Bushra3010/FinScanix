import type { City } from "../types";

/* ------------------------------------------------------------------ *
 * GCC city cost-index factors (Delhi = 1.00 baseline) — FR-3.3.
 *
 * Factors are initial estimates calibrated against Gulf construction
 * market premiums. They are admin-editable in production via the rate
 * library, just like the India cities.
 *
 * Official index references the app surfaces alongside these factors
 * are in GCC_INDEX_REFERENCES below.
 * ------------------------------------------------------------------ */

export const GCC_CITIES: City[] = [
  {
    id: "riyadh",
    name: "Riyadh",
    state: "Riyadh Province",
    pin: "11564",
    indexFactor: 1.22,
    country: "SA",
    currency: "SAR",
    vatPct: 15,
    region: "gcc",
  },
  {
    id: "jeddah",
    name: "Jeddah",
    state: "Makkah Province",
    pin: "21589",
    indexFactor: 1.19,
    country: "SA",
    currency: "SAR",
    vatPct: 15,
    region: "gcc",
  },
  {
    id: "dubai",
    name: "Dubai",
    state: "Dubai",
    pin: "00000",
    indexFactor: 1.35,
    country: "AE",
    currency: "AED",
    vatPct: 5,
    region: "gcc",
  },
  {
    id: "abu-dhabi",
    name: "Abu Dhabi",
    state: "Abu Dhabi",
    pin: "00000",
    indexFactor: 1.32,
    country: "AE",
    currency: "AED",
    vatPct: 5,
    region: "gcc",
  },
  {
    id: "muscat",
    name: "Muscat",
    state: "Muscat Governorate",
    pin: "00000",
    indexFactor: 1.15,
    country: "OM",
    currency: "OMR",
    vatPct: 5,
    region: "gcc",
  },
  {
    id: "manama",
    name: "Manama",
    state: "Capital Governorate",
    pin: "00000",
    indexFactor: 1.18,
    country: "BH",
    currency: "BHD",
    vatPct: 10,
    region: "gcc",
  },
  {
    id: "kuwait-city",
    name: "Kuwait City",
    state: "Capital Governorate",
    pin: "00000",
    indexFactor: 1.28,
    country: "KW",
    currency: "KWD",
    vatPct: 0,
    region: "gcc",
  },
];

/* ------------------------------------------------------------------ *
 * Official construction cost index references by GCC country.
 *
 * The app surfaces these as benchmark sources so users can cross-check
 * the localised rates FinScanix produces.
 * ------------------------------------------------------------------ */

export interface IndexReference {
  country: string;
  countryName: string;
  name: string;
  url: string;
  description: string;
}

export const GCC_INDEX_REFERENCES: IndexReference[] = [
  {
    country: "SA",
    countryName: "Saudi Arabia",
    name: "KAPSARC Construction Price Index",
    url: "https://datasource.kapsarc.org/indicator/construction-price-index",
    description:
      "King Abdullah Petroleum Studies and Research Center — monthly construction material and labour cost index covering cement, steel, aggregates and MEP materials.",
  },
  {
    country: "AE",
    countryName: "UAE",
    name: "Dubai Statistics Centre — Building Materials Price Index",
    url: "https://www.dsc.gov.ae/en-us/Pages/Building-Materials-Price-Index.aspx",
    description:
      "Monthly building materials price index for Dubai, tracking cement, steel, timber, aggregates and finishing materials.",
  },
  {
    country: "OM",
    countryName: "Oman",
    name: "NCSI Oman Construction Cost Index",
    url: "https://www.ncsi.gov.om/Pages/Construction-Cost-Index.aspx",
    description:
      "National Centre for Statistics and Information — quarterly construction cost index for Oman, covering structural and MEP materials.",
  },
  {
    country: "BH",
    countryName: "Bahrain",
    name: "Bahrain Open Data — Construction Materials Prices",
    url: "https://www.data.gov.bh/en/",
    description:
      "Open data portal with monthly construction material price tracking for cement, steel and aggregates.",
  },
  {
    country: "KW",
    countryName: "Kuwait",
    name: "Kuwait Central Statistical Bureau — Construction Prices",
    url: "https://csb.gov.kw/",
    description:
      "Construction material price data and cost indices published by the Central Statistical Bureau.",
  },
];

/* ------------------------------------------------------------------ *
 * Convenience lookups
 * ------------------------------------------------------------------ */

export const getGccCity = (id: string): City | undefined =>
  GCC_CITIES.find((c) => c.id === id);

export const GCC_CITY_IDS = new Set(GCC_CITIES.map((c) => c.id));

