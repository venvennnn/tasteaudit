import type { Domain } from "@/lib/schemas/limits";

export function geographyNote(domain: Domain, geographicSignalApplied: boolean): string {
  if (domain === "book" || !geographicSignalApplied) {
    return "Interest-based affinity; city not applied to Qloo scoring.";
  }
  return "Nearby venue filter for the requested area. This is not a measure of local residents’ cultural preferences. Original and revised places were scored with the same location filter.";
}

export function geographyApplied(domain: Domain, geographicSignalApplied: boolean): boolean {
  return domain === "place" && geographicSignalApplied;
}
