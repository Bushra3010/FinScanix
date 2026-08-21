import type { City } from "../types";
import { CITIES } from "./reference";
import { GCC_CITIES } from "./reference-gcc";

/**
 * The full set of cities the app knows about — India plus GCC. Building it
 * here keeps reference.ts and reference-gcc.ts from importing each other.
 */
export const ALL_CITIES: City[] = [...CITIES, ...GCC_CITIES];

export function getAllCities(): City[] {
  return ALL_CITIES;
}

export function getCityAny(id: string): City | undefined {
  return ALL_CITIES.find((c) => c.id === id);
}
