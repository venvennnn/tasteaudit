import type { ConstraintCheck } from "@/lib/audit/constraints";
import type { Domain } from "@/lib/schemas/limits";

export const QLOO_AFFINITY_RETURNED = "Qloo affinity returned";
export const EXPLAINABILITY_UNAVAILABLE = "Explainability unavailable";
export const IDENTITY_MATCH_PROVISIONAL = "Identity match provisional";
export const PRICE_EDITION_STOCK_UNVERIFIED = "Price, edition and stock unverified";

export const EVIDENCE_NOTES = [IDENTITY_MATCH_PROVISIONAL, PRICE_EDITION_STOCK_UNVERIFIED] as const;
export type EvidenceNote = (typeof EVIDENCE_NOTES)[number];

export type EvidenceOrigin = "provider" | "imported" | "unsigned";

export function returnedAffinity(affinity: number | null, origin: EvidenceOrigin | null): boolean {
  return origin !== "imported" && typeof affinity === "number" && Number.isFinite(affinity);
}

export function priceEditionStockChecked(checks: ConstraintCheck[]): boolean {
  const price = checks.find((check) => check.label === "Price");
  const edition = checks.find((check) => check.label === "Edition or stock");
  const known = (check: ConstraintCheck | undefined) => Boolean(check && check.verdict !== "unknown");
  return known(price) && known(edition);
}

export function evidenceStatuses(input: {
  domain: Domain;
  affinity: number | null;
  origin: EvidenceOrigin | null;
  explainabilityAvailable: boolean;
  identityProvisional: boolean;
  priceChecked: boolean;
}): string[] {
  const statuses: string[] = [];
  if (returnedAffinity(input.affinity, input.origin)) statuses.push(QLOO_AFFINITY_RETURNED);
  if (!input.explainabilityAvailable) statuses.push(EXPLAINABILITY_UNAVAILABLE);
  if (input.identityProvisional) statuses.push(IDENTITY_MATCH_PROVISIONAL);
  if (input.domain === "book" && !input.priceChecked) statuses.push(PRICE_EDITION_STOCK_UNVERIFIED);
  return statuses;
}

export function evidenceNotes(statuses: string[]): EvidenceNote[] {
  return statuses.filter((status): status is EvidenceNote =>
    status === IDENTITY_MATCH_PROVISIONAL || status === PRICE_EDITION_STOCK_UNVERIFIED,
  );
}
