import { CITIES } from "@/lib/data/reference";

/**
 * Works out which city's cost index a document should be priced against —
 * SoW section 3, location-wise mapping.
 *
 * The city drives the index factor applied to every benchmark rate, so getting
 * it wrong shifts every verdict on the document. Leaving it entirely to a
 * dropdown means it is wrong whenever someone forgets to change it, which on a
 * bill for a site in Guwahati priced against Delhi is a 14% error running
 * silently through the whole report.
 *
 * The document usually says where it is. A PIN code is the strongest signal —
 * its first three digits identify a sorting district — and the city or state
 * named in the address is a reasonable second. Neither is asserted over the
 * user: this returns a suggestion with its evidence, and the caller decides.
 */

export interface LocationGuess {
  cityId: string;
  /** What in the document led here, quoted so the user can judge it. */
  evidence: string;
  /** "pin" is near-certain; "name" can be a vendor's own address rather than the site. */
  basis: "pin" | "name";
}

/**
 * First three digits of a PIN identify the sorting district, which is what
 * makes this reliable: 400 is Mumbai whatever the last three digits say.
 */
const PIN_PREFIX = new Map(CITIES.map((city) => [city.pin.slice(0, 3), city.id]));

const PIN_RE = /\b([1-9]\d{5})\b/g;

export function detectLocation(text: string): LocationGuess | null {
  // A PIN is unambiguous where it appears, so it is tried first.
  for (const match of text.matchAll(PIN_RE)) {
    const pin = match[1];
    const cityId = PIN_PREFIX.get(pin.slice(0, 3));
    if (cityId) {
      return { cityId, evidence: `PIN ${pin}`, basis: "pin" };
    }
  }

  // Otherwise the city name, matched on a word boundary so "Puner" or a
  // description containing "Kochi" as part of a longer word does not count.
  const haystack = text.toLowerCase();
  for (const city of CITIES) {
    const name = city.name.toLowerCase();
    const pattern = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`);
    if (pattern.test(haystack)) {
      return { cityId: city.id, evidence: city.name, basis: "name" };
    }
  }

  return null;
}
