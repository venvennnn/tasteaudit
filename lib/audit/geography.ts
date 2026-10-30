import type { Domain } from "@/lib/schemas/limits";

export const INTEREST_AFFINITY_NOTE =
  "Affinity reflects explicit interests. Location was not applied to Qloo scoring.";

export function geographyNote(_domain: Domain, locationFilterApplied: boolean): string {
  if (!locationFilterApplied) return INTEREST_AFFINITY_NOTE;
  return `${INTEREST_AFFINITY_NOTE} filter.location.query was sent as a locality candidate filter. It limits which venues are returned. It does not measure local market preferences.`;
}

export function geographyApplied(domain: Domain, geographicSignalApplied: boolean): boolean {
  return domain === "place" && geographicSignalApplied;
}
