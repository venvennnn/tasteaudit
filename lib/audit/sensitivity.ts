export type SensitivityRun = {
  status: "idle" | "running" | "complete" | "failed" | "unsupported";
  points: SensitivityPoint[];
  note: string;
  calls: number;
  error: string | null;
};

export type SensitivityPoint = {
  interest: string;
  entityId: string;
  recommendation: string;
  full: number | null;
  without: number | null;
  delta: number | null;
};

export function leaveOneOutDelta(full: number | null, without: number | null): number | null {
  if (typeof full !== "number" || typeof without !== "number") return null;
  if (!Number.isFinite(full) || !Number.isFinite(without)) return null;
  return full - without;
}

export function sensitivityPoints(input: {
  interests: { name: string; entityId: string }[];
  recommendations: { entityId: string; name: string }[];
  fullByEntity: Map<string, number | null>;
  withoutByInterest: Map<string, Map<string, number | null>>;
}): SensitivityPoint[] {
  const points: SensitivityPoint[] = [];
  for (const interest of input.interests) {
    const without = input.withoutByInterest.get(interest.entityId.toLowerCase());
    for (const recommendation of input.recommendations) {
      const full = input.fullByEntity.get(recommendation.entityId.toLowerCase()) ?? null;
      const dropped = without?.get(recommendation.entityId.toLowerCase()) ?? null;
      points.push({
        interest: interest.name,
        entityId: recommendation.entityId,
        recommendation: recommendation.name,
        full,
        without: dropped,
        delta: leaveOneOutDelta(full, dropped),
      });
    }
  }
  return points;
}
