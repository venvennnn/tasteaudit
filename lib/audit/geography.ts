import type { Domain } from "@/lib/schemas/limits";

export const INTEREST_AFFINITY_NOTE =
  "Interest-based affinity. City was not applied to Qloo scoring.";

export const PLACE_FILTER_NOTE =
  "filter.location.query was sent as a locality candidate filter. It limits which venues are returned. It does not condition affinity, and it does not measure local market preferences.";

export function geographyNote(_domain: Domain, locationFilterApplied: boolean): string {
  if (!locationFilterApplied) return INTEREST_AFFINITY_NOTE;
  return PLACE_FILTER_NOTE;
}

export function geographyApplied(domain: Domain, geographicSignalApplied: boolean): boolean {
  return domain === "place" && geographicSignalApplied;
}
