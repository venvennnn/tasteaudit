import { isSupportedAgeBand } from "@/lib/audit/age";
import type { Poster } from "@/lib/audit/orchestrate";
import { sensitivityPoints, type SensitivityPoint, type SensitivityRun } from "@/lib/audit/sensitivity";
import type { CaseRecord, SessionState } from "@/lib/session/state";

type ScoreData = {
  entities: { entityId: string; affinity: number | null }[];
};

export async function executeSensitivity(options: {
  state: SessionState;
  city: string;
  post: Poster;
  signal: AbortSignal;
  onUpdate: (sensitivity: SensitivityRun) => void;
}): Promise<void> {
  const item = options.state.cases[options.city];
  if (!item) return;
  const seeds = item.resolvedSeeds.filter((seed) => seed.entityId);
  const candidates = item.scores.map((row) => row.entityId);
  if (seeds.length < 2 || candidates.length === 0) {
    options.onUpdate({
      status: "unsupported",
      points: [],
      calls: 0,
      error: null,
      note: "Leave-one-interest-out needs at least two resolved interests and a fixed candidate pool. Removing the only interest would change the request into an unsupported empty-seed score.",
    });
    return;
  }
  const ageValue = item.signals?.qloo.find((row) => row.name === "signal.demographics.age")?.value.split(" ")[0] ?? "";
  const ageBand = isSupportedAgeBand(ageValue) ? ageValue : undefined;
  const location = options.state.domain === "place"
    ? item.signals?.qloo.find((row) => row.name === "filter.location.query")?.value
    : undefined;
  options.onUpdate({
    status: "running",
    points: [],
    calls: seeds.length,
    error: null,
    note: `This adds ${seeds.length} scoring requests. Each request keeps the same candidates and removes one interest. The plotted difference is the full-context score minus the score without that interest.`,
  });
  const fullByEntity = new Map(item.scores.map((row) => [row.entityId.toLowerCase(), row.affinity]));
  const withoutByInterest = new Map<string, Map<string, number | null>>();
  const failures: string[] = [];
  for (const dropped of seeds) {
    if (options.signal.aborted) return;
    const seedIds = seeds.map((seed) => seed.entityId).filter((id): id is string => Boolean(id) && id !== dropped.entityId);
    try {
      const response = await options.post<ScoreData>("/api/qloo/score", {
        domain: options.state.domain,
        seedIds,
        candidateIds: candidates,
        locationQuery: location,
        ageBand,
      }, options.signal);
      const map = new Map(response.data.entities.map((entity) => [entity.entityId.toLowerCase(), entity.affinity]));
      withoutByInterest.set((dropped.entityId ?? "").toLowerCase(), map);
    } catch (error) {
      failures.push(error && typeof error === "object" && "message" in error ? String((error as { message: string }).message) : "A sensitivity request failed.");
    }
  }
  const recommendations = recommendationRows(item);
  const points: SensitivityPoint[] = sensitivityPoints({
    interests: seeds.map((seed) => ({ name: seed.name || seed.query, entityId: seed.entityId ?? "" })),
    recommendations,
    fullByEntity,
    withoutByInterest,
  });
  options.onUpdate({
    status: failures.length > 0 && points.every((point) => point.delta === null) ? "failed" : "complete",
    points,
    calls: seeds.length,
    error: failures[0] ?? null,
    note: "Leave-one-interest-out sensitivity. The difference is the full-context affinity minus the affinity without that interest. It is not a Qloo explanation score, a causal effect, or SHAP.",
  });
}

function recommendationRows(item: CaseRecord): { entityId: string; name: string }[] {
  const revised = item.revisedSelections.map((selection) => ({ entityId: selection.id, name: selection.name }));
  if (revised.length > 0) return revised;
  return item.extracted
    .filter((pick) => pick.entityId)
    .map((pick) => ({ entityId: pick.entityId as string, name: pick.name }));
}
