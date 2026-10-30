export function normalizeName(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export type SearchCandidate = {
  entityId: string;
  name: string;
  types: string[];
  popularity?: number | null;
};

export type MatchDecision = {
  status: "exact" | "provisional" | "unmatched";
  entity: SearchCandidate | null;
  ambiguous: boolean;
};

function typeCompatible(candidate: SearchCandidate, expectedTypes: string[]): boolean {
  if (expectedTypes.length === 0) return true;
  return candidate.types.some((type) => expectedTypes.includes(type));
}

export function chooseMatch(name: string, candidates: SearchCandidate[], expectedTypes: string[]): MatchDecision {
  const compatible = candidates.filter((candidate) => typeCompatible(candidate, expectedTypes));
  if (compatible.length === 0) {
    return { status: "unmatched", entity: null, ambiguous: false };
  }
  const wanted = normalizeName(name);
  const exact = compatible.filter((candidate) => normalizeName(candidate.name) === wanted);
  if (exact.length === 1) {
    return { status: "exact", entity: exact[0]!, ambiguous: false };
  }
  if (exact.length > 1) {
    return { status: "provisional", entity: exact[0]!, ambiguous: true };
  }
  return {
    status: "provisional",
    entity: compatible[0]!,
    ambiguous: compatible.length > 1,
  };
}
