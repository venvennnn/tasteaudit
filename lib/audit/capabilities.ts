import type { Domain } from "@/lib/schemas/limits";

export const CAPABILITY_CHECKED_ON = "2026-10-31";

export const DIRECT_REGIONAL_STATUS = "unsupported" as const;

export const DIRECT_REGIONAL_REASON =
  "The book and place entity-type tables omit signal.location and signal.location.query. The parameter dictionary lists both for Book and Place. Those scoring signals are not sent. filter.location.query limits place candidates. It does not condition affinity.";

export const DERIVED_REGIONAL_LABEL = "Derived from regional taste profile";

export const DIRECT_REGIONAL_LABEL = "Direct regional Qloo signal";

export const REGIONAL_UNAVAILABLE = "Regional evidence unavailable for this domain and market.";

export const DERIVED_REGIONAL_REASON =
  "Taste Analysis documents filter.type=urn:tag with signal.location.query. A returned tag is sent to a domain only when its types include that domain's entity URN. Scores from this two-step path are a proxy. They are not directly measured preferences of local residents.";

export const AUDIENCE_NOT_SENT =
  "signal.demographics.audiences is listed for Book and Place. No audience id was validated for this market, so none was sent. Home market, language, and nationality were not inferred.";

export function domainEntityUrn(domain: Domain): string {
  return domain === "book" ? "urn:entity:book" : "urn:entity:place";
}

export function tagCompatible(types: string[], domain: Domain): boolean {
  const urn = domainEntityUrn(domain);
  return types.some((type) => type === urn);
}

export type DerivedProbe = {
  derivedStatus: "returned" | "unavailable" | "failed";
  localityResolved: boolean;
  scoresNumeric: boolean;
  explainabilityReturned: boolean;
  demographicApplied: "not_sent" | "sent_unconfirmed" | "echoed";
  audienceApplied: "not_sent";
  compatibleTagCount: number;
  returnedTagCount: number;
  warnings: string[];
  parameters: { name: string; value: string }[];
};

export function probeSummary(probe: DerivedProbe): string {
  if (probe.derivedStatus === "failed") return probe.warnings[0] ?? "The regional taste request failed.";
  if (probe.derivedStatus === "unavailable") return REGIONAL_UNAVAILABLE;
  const parts = [
    DERIVED_REGIONAL_LABEL,
    probe.localityResolved ? "Locality echo returned." : "Locality echo was not in the response.",
    probe.scoresNumeric ? "At least one tag score was numeric." : "Tag scores were not numeric. Ranks are the order returned.",
    probe.explainabilityReturned ? "Tag explainability returned." : "Tag explainability was not returned.",
    probe.demographicApplied === "not_sent"
      ? "No age band was sent."
      : probe.demographicApplied === "echoed"
        ? "The age band was echoed by the response."
        : "An age band was sent. The response did not confirm it was applied.",
    AUDIENCE_NOT_SENT,
  ];
  return parts.join(" ");
}
