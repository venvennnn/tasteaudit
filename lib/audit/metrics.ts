export type ScoredRef = {
  entityId: string;
  affinity: number | null;
};

export type CaseMetrics = {
  entityResolution: { numerator: number; denominator: number };
  pickResolution: { numerator: number; denominator: number };
  scoreCoverage: { numerator: number; denominator: number };
  meanObservedAffinity: { value: number | null; numerator: number; denominator: number };
  retention: { numerator: number; denominator: number };
  constraintCoverage: { numerator: number; denominator: number };
  comparabilityLimited: boolean;
};

export function meanObserved(values: Array<number | null | undefined>): { value: number | null; numerator: number; denominator: number } {
  const present = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (present.length === 0) return { value: null, numerator: 0, denominator: values.length };
  const total = present.reduce((sum, value) => sum + value, 0);
  return { value: total / present.length, numerator: present.length, denominator: values.length };
}

export function withinPoolRank(entityId: string, pool: ScoredRef[]): number | null {
  const mine = pool.find((item) => item.entityId === entityId);
  if (!mine || mine.affinity === null || !Number.isFinite(mine.affinity)) return null;
  const ranked = pool
    .filter((item) => item.affinity !== null && Number.isFinite(item.affinity))
    .sort((a, b) => (b.affinity as number) - (a.affinity as number));
  const index = ranked.findIndex((item) => item.entityId === entityId);
  return index === -1 ? null : index + 1;
}

export function retention(originalIds: string[], revisedIds: string[]): { numerator: number; denominator: number } {
  const revised = new Set(revisedIds);
  const denominator = originalIds.length;
  const numerator = originalIds.filter((id) => revised.has(id)).length;
  return { numerator, denominator };
}

export function buildCaseMetrics(input: {
  favorites: number;
  resolvedSeeds: number;
  extracted: number;
  resolvedPicks: number;
  poolAffinities: Array<number | null>;
  armAffinities: Array<number | null>;
  originalIds: string[];
  revisedIds: string[];
  constraintsKnown: number;
  constraintsTotal: number;
  comparabilityLimited: boolean;
}): CaseMetrics {
  return {
    entityResolution: { numerator: input.resolvedSeeds, denominator: input.favorites },
    pickResolution: { numerator: input.resolvedPicks, denominator: input.extracted },
    scoreCoverage: meanCoverage(input.poolAffinities),
    meanObservedAffinity: input.comparabilityLimited
      ? { value: null, numerator: 0, denominator: input.armAffinities.length }
      : meanObserved(input.armAffinities),
    retention: retention(input.originalIds, input.revisedIds),
    constraintCoverage: { numerator: input.constraintsKnown, denominator: input.constraintsTotal },
    comparabilityLimited: input.comparabilityLimited,
  };
}

function meanCoverage(values: Array<number | null>): { numerator: number; denominator: number } {
  return {
    numerator: values.filter((value) => typeof value === "number" && Number.isFinite(value)).length,
    denominator: values.length,
  };
}

export function formatRatio(part: { numerator: number; denominator: number }): string {
  return `${part.numerator}/${part.denominator}`;
}

export function formatAffinity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "No score";
  return value.toFixed(4);
}

export function affinityDelta(original: number | null, revised: number | null): number | null {
  if (typeof original !== "number" || typeof revised !== "number") return null;
  if (!Number.isFinite(original) || !Number.isFinite(revised)) return null;
  return revised - original;
}

export function formatSigned(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "No score";
  if (Math.abs(value) < 0.00005) return "0.0000";
  const text = Math.abs(value).toFixed(4);
  return value > 0 ? `+${text}` : `-${text}`;
}
