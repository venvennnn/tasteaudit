import { ageBandLabel, ageToSupportedBand } from "@/lib/audit/age";
import { verifyConstraints } from "@/lib/audit/constraints";
import { evidenceNotes, evidenceStatuses, priceEditionStockChecked } from "@/lib/audit/evidence";
import { geographyNote, INTEREST_AFFINITY_NOTE } from "@/lib/audit/geography";
import { insightsParameters } from "@/lib/providers/qloo";
import { configurationHash } from "@/lib/audit/hash";
import { buildCaseMetrics, meanObserved } from "@/lib/audit/metrics";
import { dedupeCandidates } from "@/lib/audit/pool";
import { rerankOriginal } from "@/lib/audit/rerank";
import { selectRevised } from "@/lib/audit/select";
import { originalPrompt, repairPrompt, type GroundingLine } from "@/lib/providers/gemini";
import { LIMITS, searchTypesForDomain, searchTypesForKind, ENTITY_ID_PATTERN, type Domain } from "@/lib/schemas/limits";
import type { TaskSpec } from "@/lib/schemas/api";
import type { GeminiProvenance } from "@/lib/providers/gemini";
import type { Explainability } from "@/lib/providers/qloo";
import {
  activeCities,
  emptyCase,
  type CasePatch,
  type CaseRecord,
  type Favorite,
  type NamedPick,
  type ResolvedSeed,
  type ScoreRow,
  type SessionState,
  type SignalSnapshot,
  type StageName,
} from "@/lib/session/state";

export type ApiFailure = { code: string; message: string; retryable: boolean; requestId: string; stage?: string };

export type ApiOk<T> = { data: T; warnings: string[]; provenance: Record<string, unknown> };

export type Poster = <T>(path: string, body: unknown, signal: AbortSignal) => Promise<ApiOk<T>>;

type SearchData = {
  candidates: { entityId: string; name: string; types: string[]; popularity: number | null }[];
  match: {
    status: "exact" | "provisional" | "unmatched";
    ambiguous: boolean;
    entity: { entityId: string; name: string; types: string[] } | null;
  };
};

type DiscoverData = {
  entities: { entityId: string; name: string; types: string[] }[];
  geographicSignalApplied: boolean;
  locality: { name: string | null; id: string | null; latitude: number | null; longitude: number | null } | null;
};

type ScoreData = {
  entities: {
    entityId: string;
    name: string;
    types: string[];
    affinity: number | null;
    explainability: Explainability;
    language: string | null;
    description: string | null;
    tags: { id: string; name: string }[];
    envelope: string | null;
    evidenceOrigin: "provider" | "unsigned";
  }[];
  missingIds: string[];
  geographicSignalApplied: boolean;
  locality: DiscoverData["locality"];
  signing: boolean;
};

type AnswerData = { answer: string };
type ExtractData = { picks: { name: string; quote: string }[] };
type RepairData = { selections: { id: string; reason: string }[]; answer: string };

function failureOf(error: unknown): ApiFailure {
  if (error && typeof error === "object" && "message" in error) {
    const record = error as Partial<ApiFailure>;
    return {
      code: record.code ?? "upstream",
      message: record.message ?? "The request failed.",
      retryable: Boolean(record.retryable),
      requestId: record.requestId ?? "",
      stage: record.stage,
    };
  }
  return { code: "upstream", message: "The request failed.", retryable: true, requestId: "" };
}

async function pooled<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return results;
}

export function parseAge(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const age = Number(trimmed);
  if (age < 0 || age > 120) return null;
  return age;
}

export function buildTask(state: SessionState, city: string, seeds: ResolvedSeed[]): TaskSpec | { error: string } {
  const age = parseAge(state.profile.age);
  if (state.profile.age.trim() && age === null) return { error: "Age must be a whole number from 0 to 120, or left blank." };
  const reader = state.comparison === "readers"
    ? state.readers.find((item) => item.label.toLowerCase() === city.trim().toLowerCase())
    : undefined;
  const favorites = (reader?.favorites ?? state.profile.favorites).map((favorite) => favorite.name.trim()).filter(Boolean);
  if (favorites.length === 0) return { error: "Add at least one explicit interest." };
  if (!state.taskQuestion.trim()) return { error: "Write the question the assistant should answer." };
  if (!reader && !city.trim()) return { error: "Add a city before running." };
  return {
    question: state.taskQuestion.trim(),
    count: state.recommendationCount,
    domain: state.domain,
    companyName: state.company.name.trim(),
    assistantPurpose: state.company.purpose.trim(),
    age,
    city: reader ? "" : city.trim(),
    country: state.profile.country.trim(),
    budget: state.profile.budget.trim(),
    currency: state.profile.currency.trim(),
    language: state.profile.language.trim(),
    requirements: state.profile.requirements.trim(),
    interests: (reader?.favorites ?? state.profile.favorites)
      .filter((favorite) => favorite.name.trim())
      .map((favorite) => {
        const seed = seeds.find((item) => item.query === favorite.name.trim());
        return {
          name: favorite.name.trim(),
          kind: favorite.kind,
          resolvedName: seed?.name ?? undefined,
          entityId: seed?.entityId ?? undefined,
        };
      }),
  };
}

function signalSnapshot(input: {
  domain: Domain;
  city: string;
  seedIds: string[];
  ageBand: ReturnType<typeof ageToSupportedBand>;
  geographic: boolean;
  locality: DiscoverData["locality"];
  unmatched: string[];
}): SignalSnapshot {
  const qloo: { name: string; value: string }[] = [
    { name: "filter.type", value: input.domain === "book" ? "urn:entity:book" : "urn:entity:place" },
    { name: "signal.interests.entities", value: input.seedIds.join(", ") },
    { name: "feature.explainability", value: "true" },
  ];
  const withheld: { name: string; reason: string }[] = [];
  if (input.domain === "place") {
    qloo.push({ name: "filter.location.query", value: input.city });
    withheld.push({
      name: "Location scoring signal",
      reason: "filter.location.query is a locality candidate filter. The parameter dictionary lists it for Place. The place entity-type table lists filter.location and does not list signal.location.query. signal.location.query was not sent, so affinity is not a local-market score.",
    });
  } else {
    withheld.push({
      name: "Location scoring signal",
      reason: `${INTEREST_AFFINITY_NOTE} The book entity-type guide does not list filter.location, filter.location.query, signal.location, or signal.location.query. The parameter dictionary lists signal.location and signal.location.query for Book, and lists filter.location.query for Destination and Place only. None of those location parameters were sent.`,
    });
  }
  if (input.ageBand) {
    qloo.push({ name: "signal.demographics.age", value: `${input.ageBand} (${ageBandLabel(input.ageBand)})` });
  } else {
    withheld.push({ name: "Age band", reason: "No explicit age was mapped to a documented Qloo age band." });
  }
  withheld.push({ name: "Gender", reason: "Gender is never inferred or sent." });
  withheld.push({ name: "Audiences", reason: "Audience ids are not sent unless a supported audience value was validated. None was selected." });
  if (input.unmatched.length > 0) {
    withheld.push({
      name: "Unmatched interests",
      reason: `${input.unmatched.join(", ")} stayed unmatched and were not sent as invented ids.`,
    });
  }
  const coordinatesReturned = input.locality?.latitude != null && input.locality.longitude != null;
  return {
    qloo,
    withheld,
    gemini: ["age", "city", "country", "interests", "budget", "currency", "language", "requirements", "question", "recommendation count"],
    geographicSignalApplied: input.geographic,
    localityName: input.locality?.name ?? null,
    coordinatesReturned,
    localityLatitude: input.locality?.latitude ?? null,
    localityLongitude: input.locality?.longitude ?? null,
  };
}

function parameterRows(parameters: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(parameters)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => ({ name, value }));
}

async function resolveName(
  post: Poster,
  signal: AbortSignal,
  name: string,
  expectedTypes: string[],
): Promise<SearchData> {
  const response = await post<SearchData>("/api/qloo/search", { name, expectedTypes }, signal);
  return response.data;
}

async function resolveFavoriteList(
  post: Poster,
  signal: AbortSignal,
  favorites: Favorite[],
  overrides: Record<string, string>,
  searchCache: Map<string, Promise<SearchData>>,
): Promise<ResolvedSeed[]> {
  return pooled(favorites.filter((favorite) => favorite.name.trim()), 2, async (favorite) => {
    const query = favorite.name.trim();
    const types = searchTypesForKind(favorite.kind);
    const cacheKey = `${types.join("|")}\n${query.toLowerCase()}`;
    let pending = searchCache.get(cacheKey);
    if (!pending) {
      pending = resolveName(post, signal, query, types);
      searchCache.set(cacheKey, pending);
    }
    const data = await pending;
    const override = overrides[query];
    const corrected = override ? data.candidates.find((candidate) => candidate.entityId === override) : undefined;
    if (corrected) {
      return {
        query,
        kind: favorite.kind,
        status: "corrected" as const,
        ambiguous: false,
        entityId: corrected.entityId,
        name: corrected.name,
        types: corrected.types,
        alternatives: data.candidates.map((candidate) => ({
          entityId: candidate.entityId,
          name: candidate.name,
          types: candidate.types,
        })),
      };
    }
    return {
      query,
      kind: favorite.kind,
      status: data.match.status,
      ambiguous: data.match.ambiguous,
      entityId: data.match.entity?.entityId ?? null,
      name: data.match.entity?.name ?? null,
      types: data.match.entity?.types ?? [],
      alternatives: data.candidates.map((candidate) => ({
        entityId: candidate.entityId,
        name: candidate.name,
        types: candidate.types,
      })),
    };
  });
}

export async function executeRun(options: {
  state: SessionState;
  cities: string[];
  post: Poster;
  signal: AbortSignal;
  onSeeds: (seeds: ResolvedSeed[], stage: CaseRecord["stages"]["original"]) => void;
  onCase: (city: string, patch: CasePatch) => void;
  signalFor?: (city: string) => AbortSignal;
  isCurrent?: (city: string) => boolean;
}): Promise<void> {
  const { state, post, signal } = options;
  const cities = options.cities.map((city) => city.trim()).filter(Boolean).slice(0, LIMITS.cities);
  const searchCache = new Map<string, Promise<SearchData>>();
  const readerRun = state.comparison === "readers";
  let sharedSeeds = state.seeds;
  if (!readerRun && (sharedSeeds.length === 0 || state.seedStage.status !== "complete")) {
    options.onSeeds([], { status: "running", error: null });
    const favorites = state.profile.favorites.filter((favorite) => favorite.name.trim());
    try {
      const resolved = await resolveFavoriteList(post, signal, favorites, state.seedOverrides, searchCache);
      sharedSeeds = resolved;
      options.onSeeds(sharedSeeds, { status: "complete", error: null });
    } catch (error) {
      const failure = failureOf(error);
      if (failure.code === "aborted") return;
      options.onSeeds([], { status: "failed", error: failure });
      for (const city of cities) {
        if (options.isCurrent && !options.isCurrent(city)) continue;
        options.onCase(city, {
          phase: "failed",
          warnings: [failure.message],
          stages: { original: { status: "failed", error: failure } },
        });
      }
      throw failure;
    }
  }

  const age = parseAge(state.profile.age);
  const ageBand = ageToSupportedBand(age);
  // Identical book interest sets send one discovery request, then each case gets its own copy.
  // Different interest sets do not share that request. This is not a location cache.
  const bookDiscoveries = new Map<string, Promise<ApiOk<DiscoverData>>>();

  await pooled(cities, 2, async (city) => {
    const signal = options.signalFor?.(city) ?? options.signal;
    if (signal.aborted || (options.isCurrent && !options.isCurrent(city))) return;
    const reader = readerRun ? state.readers.find((item) => item.label.toLowerCase() === city.toLowerCase()) : undefined;
    let seeds = sharedSeeds;
    if (reader) {
      try {
        seeds = await resolveFavoriteList(post, signal, reader.favorites, state.seedOverrides, searchCache);
      } catch (error) {
        const failure = failureOf(error);
        if (failure.code === "aborted") return;
        if (options.isCurrent && !options.isCurrent(city)) return;
        options.onCase(city, {
          phase: "failed",
          warnings: [failure.message],
          stages: { original: { status: "failed", error: failure } },
        });
        return;
      }
    }
    const seedIds = seeds.map((seed) => seed.entityId).filter((id): id is string => Boolean(id));
    const task = buildTask({ ...state, seeds }, city, seeds);
    if ("error" in task) {
      options.onCase(city, {
        phase: "failed",
        stages: { ...emptyCase(city).stages, original: { status: "failed", error: { code: "invalid_request", message: task.error, retryable: false, requestId: "" } } },
        warnings: [task.error],
      });
      return;
    }
    const existing = state.cases[city] ?? emptyCase(city);
    const patch = (partial: CasePatch) => {
      if (options.isCurrent && !options.isCurrent(city)) return;
      options.onCase(city, partial);
    };
    patch({ phase: "generating" });
    let current: StageName = "original";
    const warnings = [...existing.warnings];
    let observedModel = existing.observedModel;
    const noteModel = (provenance: GeminiProvenance) => {
      if (observedModel && provenance.requestedModel !== observedModel) {
        throw {
          code: "invalid_model",
          message: "A later response named a different model. This run does not switch models.",
          retryable: false,
          requestId: "",
        } satisfies ApiFailure;
      }
      observedModel = provenance.requestedModel;
    };

    try {
      let originalAnswer = existing.originalAnswer;
      let originalProvenance = existing.originalProvenance;
      if (state.assistantMode === "paste") {
        originalAnswer = state.pastedAnswer.trim();
        originalProvenance = null;
        warnings.push("The pasted answer has an unknown model configuration, so this case cannot support a controlled model comparison.");
        patch({
          originalAnswer,
          originalProvenance: null,
          observedModel: null,
          stages: { original: { status: "complete", error: null }, refine: { status: "skipped", error: null } },
          warnings: [...warnings],
        });
      } else if (!originalAnswer) {
        current = "original";
        patch({ stages: { original: { status: "running", error: null } } });
        const response = await post<AnswerData>("/api/gemini/original", { task }, signal);
        originalAnswer = response.data.answer;
        originalProvenance = response.provenance as unknown as GeminiProvenance;
        noteModel(originalProvenance);
        patch({ originalAnswer, originalProvenance, originalPrompt: originalPrompt(task), observedModel, stages: { original: { status: "complete", error: null } } });
      }

      let refinedAnswer = existing.refinedAnswer;
      let refinedProvenance = existing.refinedProvenance;
      const wantRefine = state.compareAll && state.assistantMode === "simulate";
      if (!wantRefine) {
        patch({ stages: { refine: { status: "skipped", error: null } } });
      } else if (!refinedAnswer && originalAnswer) {
        current = "refine";
        patch({ stages: { refine: { status: "running", error: null } } });
        const response = await post<AnswerData>("/api/gemini/refine", { task, originalAnswer }, signal);
        refinedAnswer = response.data.answer;
        refinedProvenance = response.provenance as unknown as GeminiProvenance;
        noteModel(refinedProvenance);
        patch({ refinedAnswer, refinedProvenance, observedModel, stages: { refine: { status: "complete", error: null } } });
      }

      let extracted = existing.extracted;
      if (extracted.length === 0 && originalAnswer) {
        current = "extract";
        patch({ stages: { extract: { status: "running", error: null } } });
        const response = await post<ExtractData>("/api/gemini/extract", { domain: state.domain, answer: originalAnswer, count: state.recommendationCount }, signal);
        warnings.push(...response.warnings);
        extracted = await resolvePicks(post, signal, state.domain, response.data.picks);
        patch({ extracted, warnings: [...warnings], stages: { extract: { status: "complete", error: null }, resolvePicks: { status: "complete", error: null } } });
      }

      let refinedExtracted = existing.refinedExtracted;
      if (wantRefine && refinedAnswer && refinedExtracted.length === 0) {
        const response = await post<ExtractData>("/api/gemini/extract", { domain: state.domain, answer: refinedAnswer, count: state.recommendationCount }, signal);
        warnings.push(...response.warnings);
        refinedExtracted = await resolvePicks(post, signal, state.domain, response.data.picks);
        patch({ refinedExtracted, warnings: [...warnings] });
      }

      let discovered = existing.discovered;
      let signals = existing.signals;
      if (seedIds.length === 0) {
        warnings.push("No favorite resolved to a Qloo id, so discovery and scoring were not run.");
        patch({
          phase: "failed",
          warnings: [...warnings],
          stages: {
            discover: { status: "failed", error: { code: "empty_response", message: "No resolved interests to send.", retryable: false, requestId: "" } },
            score: { status: "skipped", error: null },
            revise: { status: "skipped", error: null },
          },
        });
        return;
      }

      if (discovered.length === 0) {
        current = "discover";
        patch({ phase: "discovering", stages: { discover: { status: "running", error: null } } });
        let data: DiscoverData;
        if (state.domain === "book") {
          const discoveryKey = `${[...seedIds].sort().join(",")}|${ageBand ?? ""}`;
          let pending = bookDiscoveries.get(discoveryKey);
          if (!pending) {
            pending = post<DiscoverData>("/api/qloo/discover", {
              domain: state.domain,
              seedIds,
              ageBand: ageBand ?? undefined,
            }, options.signal);
            bookDiscoveries.set(discoveryKey, pending);
          }
          const response = await pending;
          data = response.data;
          warnings.push(...response.warnings);
          warnings.push(INTEREST_AFFINITY_NOTE);
        } else {
          const response = await post<DiscoverData>("/api/qloo/discover", {
            domain: state.domain,
            seedIds,
            locationQuery: city,
            ageBand: ageBand ?? undefined,
          }, signal);
          data = response.data;
          warnings.push(...response.warnings);
        }
        discovered = data.entities.map((entity) => ({ ...entity, types: [...entity.types] }));
        signals = signalSnapshot({
          domain: state.domain,
          city,
          seedIds,
          ageBand,
          geographic: data.geographicSignalApplied,
          locality: data.locality,
          unmatched: seeds.filter((seed) => !seed.entityId).map((seed) => seed.query),
        });
        if (state.domain === "place" && !data.locality) {
          warnings.push("The location query did not return a locality resolution.");
        } else if (state.domain === "place" && data.locality && (data.locality.latitude == null || data.locality.longitude == null)) {
          warnings.push("A locality matched, but the provider did not return coordinates to inspect.");
        }
        patch({ discovered, signals, warnings: [...warnings], stages: { discover: { status: "complete", error: null } } });
      }

      const pool = dedupeCandidates(
        [
          ...extracted.filter((pick) => pick.entityId).map((pick) => ({
            entityId: pick.entityId as string,
            name: pick.name,
            types: pick.types,
            sources: ["original" as const],
          })),
          ...refinedExtracted.filter((pick) => pick.entityId).map((pick) => ({
            entityId: pick.entityId as string,
            name: pick.name,
            types: pick.types,
            sources: ["refined" as const],
          })),
          ...discovered.map((item) => ({
            entityId: item.entityId,
            name: item.name,
            types: item.types,
            sources: ["discovered" as const],
          })),
        ],
        LIMITS.scorePoolMax,
      );
      if (pool.truncated) warnings.push("The shared pool was capped so it could be scored in one request. Dropped names were extra discoveries, not the original picks.");
      const ids = pool.pool.map((item) => item.entityId);
      const discoverSpec = insightsParameters({
        domain: state.domain,
        seedIds,
        locationQuery: state.domain === "place" ? city : undefined,
        ageBand: ageBand ?? undefined,
        take: LIMITS.discoverTake,
      });
      const scoreSpec = insightsParameters({
        domain: state.domain,
        seedIds,
        candidateIds: ids,
        locationQuery: state.domain === "place" ? city : undefined,
        ageBand: ageBand ?? undefined,
        take: Math.min(50, ids.length),
      });
      const nextFingerprint = configurationHash(scoreSpec.parameters);
      let scores = existing.scores;
      if (ids.length === 0) {
        warnings.push("There were no resolved entities to score.");
        patch({ phase: "failed", warnings: [...warnings], stages: { score: { status: "failed", error: { code: "empty_response", message: "Nothing to score.", retryable: false, requestId: "" } } } });
        return;
      }
      if (existing.scoreFingerprint !== nextFingerprint || scores.length === 0) {
        current = "score";
        patch({ phase: "evaluating", stages: { score: { status: "running", error: null } } });
        const response = await post<ScoreData>("/api/qloo/score", {
          domain: state.domain,
          seedIds,
          candidateIds: ids,
          locationQuery: state.domain === "place" ? city : undefined,
          ageBand: ageBand ?? undefined,
        }, signal);
        warnings.push(...response.warnings);
        const byId = new Map(response.data.entities.map((entity) => [entity.entityId.toLowerCase(), entity]));
        scores = pool.pool.map((item) => {
          const found = byId.get(item.entityId.toLowerCase());
          return {
            entityId: item.entityId,
            name: found?.name || item.name,
            types: found?.types?.length ? found.types : item.types,
            affinity: found?.affinity ?? null,
            explainability: found?.explainability ?? { status: "unavailable", contributions: [], warning: null, raw: null },
            evidenceOrigin: found?.evidenceOrigin ?? "unsigned",
            retrievedAt: typeof response.provenance.retrievedAt === "string" ? response.provenance.retrievedAt : null,
            sources: item.sources,
            envelope: found?.envelope ?? null,
            tags: found?.tags?.map((tag) => tag.name).filter(Boolean) ?? [],
            language: found?.language ?? null,
            imageUrl: null,
          } satisfies ScoreRow;
        });
        if (!signals) {
          signals = signalSnapshot({
            domain: state.domain,
            city,
            seedIds,
            ageBand,
            geographic: response.data.geographicSignalApplied,
            locality: response.data.locality,
            unmatched: seeds.filter((seed) => !seed.entityId).map((seed) => seed.query),
          });
        }
        patch({ scores, scoreFingerprint: nextFingerprint, signals, warnings: [...warnings], stages: { score: { status: "complete", error: null } } });
      }

      const scoreById = new Map(scores.map((row) => [row.entityId.toLowerCase(), row]));
      const originalRankable = extracted.filter((pick) => pick.entityId).map((pick) => ({
        entityId: pick.entityId as string,
        name: pick.name,
        affinity: scoreById.get((pick.entityId as string).toLowerCase())?.affinity ?? null,
      }));
      const rerank = rerankOriginal(originalRankable);
      patch({
        rerankIds: rerank.ordered.map((item) => item.entityId),
        rerankNote: rerank.note,
        stages: { rerank: { status: "complete", error: null } },
      });

      const checksById: CaseRecord["checksById"] = {};
      for (const row of scores) {
        const verified = verifyConstraints({
          language: state.profile.language,
          requirements: state.profile.requirements,
          facts: { language: row.language, tags: row.tags },
        });
        checksById[row.entityId] = verified.checks;
      }
      const originalIds = extracted
        .map((pick) => pick.entityId)
        .filter((id): id is string => typeof id === "string" && ENTITY_ID_PATTERN.test(id));
      const selection = selectRevised({
        count: state.recommendationCount,
        originalIds,
        comparable: scores.some((row) => row.affinity !== null),
        candidates: scores.map((row) => {
          const failed = (checksById[row.entityId] ?? []).filter((check) => check.verdict === "fail");
          return {
            entityId: row.entityId,
            name: row.name,
            affinity: row.affinity,
            sources: row.sources,
            group: row.tags[0] ?? row.types[0] ?? null,
            hardExcluded: failed.length > 0,
            exclusionReason: failed.map((check) => check.reason).join(" ") || null,
          };
        }),
      });
      const discoveredIds = discovered.map((item) => item.entityId);
      const selectedAffinities = selection.selected.map((item) => ({
        entityId: item.entityId,
        affinity: scoreById.get(item.entityId.toLowerCase())?.affinity ?? null,
      }));
      const originalMeanNow = meanObserved(originalIds.map((id) => scoreById.get(id.toLowerCase())?.affinity ?? null));
      const revisedMeanNow = meanObserved(selectedAffinities.map((item) => item.affinity));
      const locationFilterApplied = Boolean(signals?.geographicSignalApplied) || scoreSpec.locationFilterApplied;
      const diagnostic = {
        originalIds,
        discoveredIds,
        eligibleIds: selection.eligibleIds,
        selectedIds: selection.selected.map((item) => item.entityId),
        newCandidateCount: discoveredIds.filter((id) => !originalIds.some((original) => original.toLowerCase() === id.toLowerCase())).length,
        retainedCount: selection.diff.retainedCount,
        replacementCount: selection.diff.replacementCount,
        scoringSignals: (signals?.qloo ?? []).map((item) => ({ ...item })),
        exclusions: selection.exclusions,
        geographyNote: geographyNote(state.domain, locationFilterApplied),
        summary: selection.diff.summary,
        diff: selection.diff,
        revisedAffinities: selectedAffinities,
        unroundedOriginalMean: originalMeanNow.value,
        unroundedRevisedMean: revisedMeanNow.value,
        requestKey: configurationHash(scoreSpec.parameters),
        discoverParameters: parameterRows(discoverSpec.parameters),
        scoreParameters: parameterRows(scoreSpec.parameters),
        locationAccounting: {
          gemini: reader
            ? `Reader ${reader.label}. No city was sent to Qloo.`
            : `The city ${city} is included in the Gemini brief.`,
          candidateFilter: scoreSpec.locationFilterApplied
            ? `filter.location.query=${city} on discovery and scoring.`
            : "No locality filter was sent to Qloo.",
          scoringSignal: "No geographic scoring signal was sent.",
        },
      };
      let revisedSelections = selection.selected.map((item) => ({
        id: item.entityId,
        name: item.name,
        reason: item.policyReason,
        policyReason: item.policyReason,
      }));
      let revisedAnswer = existing.revisedAnswer;
      let revisedProvenance = existing.revisedProvenance;
      const selectionChanged = existing.scoreFingerprint !== nextFingerprint
        || existing.revisedSelections.map((item) => item.id).join("|") !== revisedSelections.map((item) => item.id).join("|");
      if (revisedSelections.length === 0) {
        revisedAnswer = selection.diff.summary;
        warnings.push(selection.diff.summary);
        patch({ revisedAnswer, revisedSelections, revisedProvenance: null, diagnostic, stages: { revise: { status: "complete", error: null } } });
      } else if (!revisedAnswer || selectionChanged) {
        current = "revise";
        patch({ phase: "evaluating", diagnostic, stages: { revise: { status: "running", error: null } } });
        const chosen = new Map(selection.selected.map((item) => [item.entityId.toLowerCase(), item]));
        const lines: GroundingLine[] = revisedSelections.map((item) => {
          const row = scoreById.get(item.id.toLowerCase());
          const pick = extracted.find((entry) => entry.entityId?.toLowerCase() === item.id.toLowerCase());
          const statuses = evidenceStatuses({
            domain: state.domain,
            affinity: row?.affinity ?? null,
            origin: row?.evidenceOrigin ?? null,
            explainabilityAvailable: row?.explainability.status === "available",
            identityProvisional: Boolean(pick && (pick.matchStatus === "provisional" || pick.ambiguous)),
            priceChecked: priceEditionStockChecked(checksById[item.id] ?? []),
          });
          return {
            id: item.id,
            name: item.name,
            affinity: row?.affinity ?? null,
            statuses,
          };
        });
        const response = await post<RepairData>("/api/gemini/repair", {
          task,
          seedIds,
          candidates: revisedSelections.map((item) => {
            const row = scoreById.get(item.id.toLowerCase());
            const line = lines.find((entry) => entry.id.toLowerCase() === item.id.toLowerCase());
            return {
              entityId: item.id,
              name: item.name,
              affinity: row?.affinity ?? null,
              explainability: row?.explainability,
              envelope: row?.envelope ?? undefined,
              evidenceOrigin: row?.evidenceOrigin === "imported" ? "imported" : row?.envelope ? "provider" : "unsigned",
              notes: evidenceNotes(line?.statuses ?? []),
            };
          }),
        }, signal);
        warnings.push(...response.warnings);
        revisedProvenance = response.provenance as unknown as GeminiProvenance;
        noteModel(revisedProvenance);
        revisedAnswer = response.data.answer;
        const reasons = new Map(response.data.selections.map((item) => [item.id.toLowerCase(), item.reason]));
        revisedSelections = selection.selected.map((item) => ({
          id: item.entityId,
          name: item.name,
          reason: reasons.get(item.entityId.toLowerCase()) || item.policyReason,
          policyReason: item.policyReason,
        }));
        if (response.data.selections.some((item) => !chosen.has(item.id.toLowerCase()))) {
          warnings.push("The writer returned a different set. The displayed recommendations follow the selection policy.");
        }
        patch({
          revisedAnswer,
          revisedSelections,
          revisedProvenance,
          revisedPrompt: repairPrompt(task, lines),
          diagnostic,
          observedModel,
          warnings: [...warnings],
          stages: { revise: { status: "complete", error: null } },
        });
      }
      const revisedIds = revisedSelections.map((selection) => selection.id);
      const originalMetricIds = extracted.map((pick) => pick.entityId ?? `unresolved:${pick.name.toLowerCase()}`);
      const armIds = revisedIds;
      const constraintTotals = Object.values(checksById);
      const known = constraintTotals.reduce((sum, checks) => sum + checks.filter((check) => check.verdict !== "unknown").length, 0);
      const totalChecks = constraintTotals.reduce((sum, checks) => sum + checks.length, 0);
      const metrics = buildCaseMetrics({
        favorites: seeds.length,
        resolvedSeeds: seedIds.length,
        extracted: extracted.length,
        resolvedPicks: originalIds.length,
        poolAffinities: scores.map((row) => row.affinity),
        armAffinities: armIds.map((id) => scoreById.get(id.toLowerCase())?.affinity ?? null),
        originalIds: originalMetricIds,
        revisedIds,
        constraintsKnown: known,
        constraintsTotal: totalChecks,
        comparabilityLimited: false,
      });
      const originalMean = meanObserved(originalIds.map((id) => scoreById.get(id.toLowerCase())?.affinity ?? null));
      const revisedMean = meanObserved(revisedIds.map((id) => scoreById.get(id.toLowerCase())?.affinity ?? null));
      patch({
        phase: "complete",
        checksById,
        diagnostic,
        metrics: {
          ...metrics,
          meanObservedAffinity: revisedMean,
        },
        warnings: [...warnings, originalMean.value === null && revisedMean.value === null ? "Insufficient evidence to compare." : ""].filter(Boolean),
        observedModel,
        stages: { summarize: { status: "complete", error: null } },
      });
    } catch (error) {
      const failure = failureOf(error);
      if (options.isCurrent && !options.isCurrent(city)) return;
      if (failure.code === "aborted") return;
      patch({ phase: "failed", stages: { [current]: { status: "failed", error: failure } }, warnings: [...warnings, failure.message] });
    }
  });
}

async function resolvePicks(post: Poster, signal: AbortSignal, domain: Domain, picks: { name: string; quote: string }[]): Promise<NamedPick[]> {
  return pooled(picks, 2, async (pick) => {
    const data = await resolveName(post, signal, pick.name, searchTypesForDomain(domain));
    return {
      name: pick.name,
      quote: pick.quote,
      entityId: data.match.entity?.entityId ?? null,
      matchStatus: data.match.status,
      ambiguous: data.match.ambiguous,
      types: data.match.entity?.types ?? [],
    };
  });
}

export function citiesToRun(state: SessionState, requested?: string[]): string[] {
  const known = activeCities(state);
  if (!requested || requested.length === 0) return known.slice(0, 1);
  return requested.map((city) => city.trim()).filter((city) => known.some((item) => item.toLowerCase() === city.toLowerCase()));
}
