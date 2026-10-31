import {
  AUDIENCE_NOT_SENT,
  DERIVED_REGIONAL_LABEL,
  DERIVED_REGIONAL_REASON,
  DIRECT_REGIONAL_REASON,
  REGIONAL_UNAVAILABLE,
  type DerivedProbe,
} from "@/lib/audit/capabilities";
import { ageBandLabel, isSupportedAgeBand } from "@/lib/audit/age";
import { verifyConstraints } from "@/lib/audit/constraints";
import { evidenceNotes, evidenceStatuses, priceEditionStockChecked } from "@/lib/audit/evidence";
import { configurationHash } from "@/lib/audit/hash";
import { meanObserved } from "@/lib/audit/metrics";
import { dedupeCandidates } from "@/lib/audit/pool";
import { describeDiff, selectRevised } from "@/lib/audit/select";
import type { Poster } from "@/lib/audit/orchestrate";
import type { GroundingLine } from "@/lib/providers/gemini";
import type { Explainability } from "@/lib/providers/qloo";
import { regionalEntityParameters, tasteParameters } from "@/lib/providers/qloo";
import { ENTITY_ID_PATTERN, LIMITS, searchTypesForDomain, searchTypesForKind, type AgeBand, type Domain } from "@/lib/schemas/limits";
import type { TaskSpec } from "@/lib/schemas/api";
import type { GeminiProvenance } from "@/lib/providers/gemini";
import {
  emptyRegionalCity,
  type ConfirmedMarket,
  type EvidenceMode,
  type RegionalArmItem,
  type RegionalCityResult,
  type RegionalMethod,
  type RegionalScore,
  type RegionalState,
  type RegionalTagRecord,
} from "@/lib/audit/regional-types";

type ApiFailure = { code: string; message: string; retryable: boolean; requestId: string; stage?: string };

type SearchData = {
  candidates: { entityId: string; name: string; types: string[] }[];
  match: {
    status: "exact" | "provisional" | "unmatched";
    ambiguous: boolean;
    entity: { entityId: string; name: string; types: string[] } | null;
  };
};

type TasteData = {
  tags: {
    tagId: string;
    name: string;
    namespace: string;
    types: string[];
    score: number | null;
    compatible: boolean;
    explainabilityStatus: "available" | "unavailable";
  }[];
  locality: { name: string | null; id: string | null } | null;
  scoresNumeric: boolean;
  explainabilityReturned: boolean;
  demographicEchoed: boolean;
  parameters: { name: string; value: string }[];
};

type InsightEntity = {
  entityId: string;
  name: string;
  types: string[];
  affinity: number | null;
  explainability: Explainability;
  language: string | null;
  tags: { id: string; name: string }[];
  evidenceOrigin: "provider" | "unsigned";
  envelope: string | null;
};

type InsightData = {
  entities: InsightEntity[];
  missingIds?: string[];
  parameters?: { name: string; value: string }[];
};

type AnswerData = { answer: string };
type ExtractData = { picks: { name: string; quote: string }[] };
type RepairData = { selections: { id: string; reason: string }[]; answer: string };

type ResolvedInterest = { query: string; name: string; entityId: string; kind: RegionalState["interests"][number]["kind"] };

const COUNT = LIMITS.recommendationsDefault;

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

async function pooled<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

function destinationQuery(regional: RegionalState, market: ConfirmedMarket): string | null {
  if (regional.domain !== "place") return null;
  if (regional.placeMode === "local") return market.query;
  return regional.destination?.query ?? null;
}

function taskFor(regional: RegionalState, market: ConfirmedMarket, destination: string | null, interests: ResolvedInterest[], ageBand: AgeBand | undefined): TaskSpec {
  const lines = [regional.requirements.trim()];
  if (ageBand) lines.push(`Age band: ${ageBandLabel(ageBand)}.`);
  if (regional.domain === "place" && regional.placeMode === "local") {
    lines.push("Local discovery: this city is both the audience market and the destination. Candidate venues change by location. This is not a pure test of audience taste.");
  }
  if (regional.domain === "place" && regional.placeMode === "market") {
    lines.push("Market comparison: the audience market changes and the destination stays fixed.");
  }
  if (regional.evidence === "regional") lines.push("No personal favorites were supplied.");
  return {
    question: regional.question.trim(),
    count: COUNT,
    domain: regional.domain,
    companyName: regional.companyName.trim(),
    assistantPurpose: regional.companyName.trim() || "Regional comparison",
    age: null,
    city: market.query,
    destination: destination ?? undefined,
    country: "",
    budget: regional.budget.trim(),
    currency: regional.currency.trim() || "USD",
    language: regional.language.trim(),
    requirements: lines.filter(Boolean).join(" "),
    interests: regional.evidence === "regional"
      ? []
      : interests.map((interest) => ({
          name: interest.query,
          kind: interest.kind,
          resolvedName: interest.name,
          entityId: interest.entityId,
        })),
  };
}

function probeOf(taste: TasteData, ageBand: AgeBand | undefined, warnings: string[]): DerivedProbe {
  const compatible = taste.tags.filter((tag) => tag.compatible);
  const localityResolved = Boolean(taste.locality?.name || taste.locality?.id);
  const derivedStatus = compatible.length > 0 ? "returned" : "unavailable";
  return {
    derivedStatus,
    localityResolved,
    scoresNumeric: taste.scoresNumeric,
    explainabilityReturned: taste.explainabilityReturned,
    demographicApplied: !ageBand ? "not_sent" : taste.demographicEchoed ? "echoed" : "sent_unconfirmed",
    audienceApplied: "not_sent",
    compatibleTagCount: compatible.length,
    returnedTagCount: taste.tags.length,
    warnings,
    parameters: taste.parameters,
  };
}

function tagRecords(tags: TasteData["tags"]): RegionalTagRecord[] {
  return tags.map((tag, index) => ({
    tagId: tag.tagId,
    name: tag.name,
    namespace: tag.namespace,
    types: tag.types,
    score: tag.score,
    rank: index + 1,
    compatible: tag.compatible,
  }));
}

function membershipFor(entityId: string, arm: "original" | "revised", diff: ReturnType<typeof describeDiff>): RegionalArmItem["membership"] {
  const key = entityId.toLowerCase();
  const retained = diff.retained.find((row) => row.entityId.toLowerCase() === key);
  if (arm === "original") {
    if (!entityId) return "unresolved";
    if (diff.removed.some((row) => row.entityId.toLowerCase() === key)) return "removed";
    if (retained && retained.fromRank !== retained.toRank) return "reordered";
    if (retained) return "retained";
    return "original";
  }
  if (diff.added.some((row) => row.entityId.toLowerCase() === key)) return "added";
  if (retained && retained.fromRank !== retained.toRank) return "reordered";
  if (retained) return "retained";
  return "selected";
}

function basisText(input: {
  affinity: number | null;
  tags: RegionalTagRecord[];
  interests: ResolvedInterest[];
  mode: EvidenceMode;
  explainability: Explainability | null;
}): string {
  const used = input.tags.filter((tag) => tag.compatible).slice(0, 4).map((tag) => tag.name);
  const regional = input.mode === "interests"
    ? "No regional taste signal was sent."
    : used.length > 0
      ? `Regional evidence: ${used.join(", ")}. ${DERIVED_REGIONAL_LABEL}.`
      : "No compatible regional tags were applied.";
  const personal = input.mode === "regional" || input.interests.length === 0
    ? "No personal favorites were supplied."
    : `Explicit interests: ${input.interests.map((item) => item.name).join(", ")}.`;
  const returned = input.explainability?.status === "available"
    ? `Returned explanation names: ${input.explainability.contributions.map((item) => item.name || item.entityId || "signal").filter(Boolean).slice(0, 4).join(", ") || "none listed"}.`
    : "Interest-level explanation was not returned.";
  const affinity = input.affinity === null ? "Affinity was not returned." : `Qloo affinity ${input.affinity.toFixed(3)} under this city’s scoring setup.`;
  return `${regional} ${personal} ${affinity} ${returned} Price, hours, and stock stay unverified. This measures alignment with the scoring evidence, not satisfaction.`;
}

export async function executeRegional(options: {
  regional: RegionalState;
  cities: string[];
  post: Poster;
  signal: AbortSignal;
  signalFor?: (city: string) => AbortSignal;
  isCurrent?: (city: string) => boolean;
  onCase: (city: string, patch: Partial<RegionalCityResult>) => void;
}): Promise<void> {
  const regional = options.regional;
  const wanted = new Set(options.cities.map((city) => city.trim().toLowerCase()));
  const markets = regional.markets.filter((market) => wanted.has(market.label.trim().toLowerCase()));
  const ageBand = isSupportedAgeBand(regional.ageBand) ? regional.ageBand : undefined;
  const tasteCache = new Map<string, Promise<{ data: TasteData; warnings: string[] }>>();
  let interests: ResolvedInterest[] = [];

  if (regional.evidence !== "regional" && regional.interests.some((item) => item.name.trim())) {
    const resolved = await pooledResolve(options.post, options.signal, regional.interests);
    interests = resolved.filter((item): item is ResolvedInterest => Boolean(item));
  }

  await pooled(markets, 2, async (market) => {
    const signal = options.signalFor?.(market.label) ?? options.signal;
    if (signal.aborted || (options.isCurrent && !options.isCurrent(market.label))) return;
    const destination = destinationQuery(regional, market);
    const patch = (partial: Partial<RegionalCityResult>) => {
      if (options.isCurrent && !options.isCurrent(market.label)) return;
      options.onCase(market.label, partial);
    };
    const base = emptyRegionalCity(market.label, market.query, destination, regional.evidence);
    if (regional.domain === "place" && regional.placeMode === "market" && !destination) {
      patch({ ...base, phase: "failed", error: "Confirm a destination before a market comparison. No city was substituted." });
      return;
    }
    const warnings = [DIRECT_REGIONAL_REASON, AUDIENCE_NOT_SENT, DERIVED_REGIONAL_REASON];
    if (regional.evidence === "regional" && regional.interests.some((item) => item.name.trim())) {
      warnings.push("Regional only mode did not send the listed interests.");
    }
    let observedModel: string | null = null;
    patch({ ...base, phase: "generating", warnings, noFavorites: regional.evidence === "regional" || interests.length === 0 });
    try {
      const task = taskFor(regional, market, destination, interests, ageBand);
      const original = await options.post<AnswerData>("/api/gemini/original", { task }, signal);
      const provenance = original.provenance as Partial<GeminiProvenance>;
      observedModel = typeof provenance.requestedModel === "string" ? provenance.requestedModel : null;
      if (options.isCurrent && !options.isCurrent(market.label)) return;
      patch({ originalAnswer: original.data.answer, observedModel, phase: "discovering" });

      if (regional.evidence !== "regional" && interests.length === 0) {
        patch({
          phase: "failed",
          method: "unavailable",
          methodLabel: "Explicit interests were requested, but none resolved. No regional fallback was substituted.",
          error: "No explicit interest resolved to a Qloo id.",
          observedModel,
          warnings,
          completedAt: new Date().toISOString(),
        });
        return;
      }

      const extracted = await extractOriginal(options.post, signal, regional.domain, original.data.answer);
      if (regional.evidence === "interests") {
        await scoreInterestsOnly({
          post: options.post,
          signal,
          regional,
          market,
          destination,
          ageBand,
          interests,
          task,
          extracted,
          warnings,
          observedModel,
          patch,
        });
        return;
      }

      const tasteKey = configurationHash(tasteParameters({ domain: regional.domain, locationQuery: market.query, ageBand, take: 15 }));
      let pending = tasteCache.get(tasteKey);
      if (!pending) {
        pending = options.post<TasteData>("/api/qloo/taste", { domain: regional.domain, locationQuery: market.query, ageBand }, options.signal).then((response) => ({
          data: response.data,
          warnings: response.warnings,
        }));
        tasteCache.set(tasteKey, pending);
      }
      const taste = await pending;
      warnings.push(...taste.warnings);
      const tags = tagRecords(taste.data.tags);
      const compatible = taste.data.tags.filter((tag) => tag.compatible).slice(0, 12);
      const probe = probeOf(taste.data, ageBand, warnings);
      if (!taste.data.locality?.name && !taste.data.locality?.id && compatible.length > 0) {
        warnings.push("Locality echo was not in the taste response. Compatible tags were still used and labelled as derived.");
      }
      if (compatible.length === 0) {
        patch({
          phase: "complete",
          method: "unavailable",
          methodLabel: REGIONAL_UNAVAILABLE,
          probe: { ...probe, derivedStatus: "unavailable" },
          tags,
          error: REGIONAL_UNAVAILABLE,
          limitation: REGIONAL_UNAVAILABLE,
          warnings,
          observedModel,
          noFavorites: task.interests.length === 0,
          original: extracted.map((pick, index) => ({
            entityId: pick.entityId ?? "",
            name: pick.name,
            affinity: null,
            rank: index + 1,
            membership: "original",
            identity: pick.matchStatus,
            explanation: "Regional evidence was unavailable, so this name was not scored.",
            rankFrom: null,
            practical: "Price, hours, and stock unverified",
          })),
          completedAt: new Date().toISOString(),
        });
        return;
      }

      const dropped = taste.data.tags.filter((tag) => !tag.compatible);
      if (dropped.length > 0) warnings.push(`${dropped.length} returned tag${dropped.length === 1 ? "" : "s"} were incompatible with ${regional.domain} and were not sent.`);
      const tagIds = compatible.map((tag) => tag.tagId);
      const seedIds = regional.evidence === "joint" ? interests.map((item) => item.entityId) : [];
      patch({ phase: "discovering", method: "derived", methodLabel: DERIVED_REGIONAL_LABEL, probe, tags, warnings: [...warnings] });

      const discoverBody = {
        domain: regional.domain,
        tagIds,
        seedIds: seedIds.length > 0 ? seedIds : undefined,
        locationQuery: destination ?? undefined,
        ageBand,
      };
      const discovered = await options.post<InsightData>("/api/qloo/regional-insights", discoverBody, signal);
      warnings.push(...discovered.warnings);
      const pool = dedupeCandidates(
        [
          ...extracted.filter((pick) => pick.entityId && ENTITY_ID_PATTERN.test(pick.entityId)).map((pick) => ({
            entityId: pick.entityId as string,
            name: pick.name,
            types: pick.types,
            sources: ["original" as const],
          })),
          ...discovered.data.entities.map((entity) => ({
            entityId: entity.entityId,
            name: entity.name,
            types: entity.types,
            sources: ["discovered" as const],
          })),
        ],
        LIMITS.scorePoolMax,
      );
      if (pool.truncated) warnings.push("The shared pool was capped. Original picks were kept ahead of extra discoveries.");
      const ids = pool.pool.map((item) => item.entityId);
      if (ids.length === 0) {
        patch({
          phase: "complete",
          method: "derived",
          methodLabel: DERIVED_REGIONAL_LABEL,
          probe,
          tags,
          limitation: "Original recommendations could not be scored under the same setup.",
          warnings,
          observedModel,
          scoreParameters: parameterRows(regionalEntityParameters({ domain: regional.domain, tagIds, seedIds, locationQuery: destination ?? undefined, ageBand, take: 1 })),
          completedAt: new Date().toISOString(),
        });
        return;
      }
      const scoreParameters = regionalEntityParameters({
        domain: regional.domain,
        tagIds,
        seedIds: seedIds.length > 0 ? seedIds : undefined,
        candidateIds: ids,
        locationQuery: destination ?? undefined,
        ageBand,
        take: Math.min(50, ids.length),
      });
      const requestKey = configurationHash(scoreParameters);
      patch({ phase: "evaluating", requestKey, scoreParameters: parameterRows(scoreParameters) });
      const scored = await options.post<InsightData>("/api/qloo/regional-insights", {
        domain: regional.domain,
        tagIds,
        seedIds: seedIds.length > 0 ? seedIds : undefined,
        candidateIds: ids,
        locationQuery: destination ?? undefined,
        ageBand,
      }, signal);
      warnings.push(...scored.warnings);
      if (options.isCurrent && !options.isCurrent(market.label)) return;
      const byId = new Map(scored.data.entities.map((entity) => [entity.entityId.toLowerCase(), entity]));
      const scores = pool.pool.map((item) => toScore(item, byId.get(item.entityId.toLowerCase()), extracted));
      await finishCity({
        regional,
        task,
        tags: tagRecords(compatible.map((tag) => ({ ...tag, explainabilityStatus: "unavailable" as const }))),
        allTags: tags,
        probe,
        scores,
        extracted,
        interests,
        warnings,
        observedModel,
        requestKey,
        scoreParameters: parameterRows(scored.data.parameters && scored.data.parameters.length > 0 ? Object.fromEntries(scored.data.parameters.map((row) => [row.name, row.value])) : scoreParameters),
        post: options.post,
        signal,
        patch,
        method: "derived",
        methodLabel: regional.evidence === "joint"
          ? `${DERIVED_REGIONAL_LABEL}. Explicit interests were included in the same Qloo request.`
          : DERIVED_REGIONAL_LABEL,
      });
    } catch (error) {
      const failure = failureOf(error);
      if (failure.code === "aborted") return;
      if (options.isCurrent && !options.isCurrent(market.label)) return;
      patch({ phase: "failed", error: failure.message, warnings: [...warnings, failure.message], observedModel, completedAt: new Date().toISOString() });
    }
  });
}

async function scoreInterestsOnly(input: {
  post: Poster;
  signal: AbortSignal;
  regional: RegionalState;
  market: ConfirmedMarket;
  destination: string | null;
  ageBand: AgeBand | undefined;
  interests: ResolvedInterest[];
  task: TaskSpec;
  extracted: ExtractedPick[];
  warnings: string[];
  observedModel: string | null;
  patch: (partial: Partial<RegionalCityResult>) => void;
}) {
  const seedIds = input.interests.map((item) => item.entityId);
  input.warnings.push("Interests only. No regional taste signal was sent. This comparison is not a regional result.");
  const discovered = await input.post<{ entities: { entityId: string; name: string; types: string[] }[] }>("/api/qloo/discover", {
    domain: input.regional.domain,
    seedIds,
    locationQuery: input.destination ?? undefined,
    ageBand: input.ageBand,
  }, input.signal);
  input.warnings.push(...discovered.warnings);
  const pool = dedupeCandidates(
    [
      ...input.extracted.filter((pick) => pick.entityId && ENTITY_ID_PATTERN.test(pick.entityId)).map((pick) => ({
        entityId: pick.entityId as string,
        name: pick.name,
        types: pick.types,
        sources: ["original" as const],
      })),
      ...discovered.data.entities.map((entity) => ({
        entityId: entity.entityId,
        name: entity.name,
        types: entity.types,
        sources: ["discovered" as const],
      })),
    ],
    LIMITS.scorePoolMax,
  );
  const ids = pool.pool.map((item) => item.entityId);
  if (ids.length === 0) {
    input.patch({
      phase: "complete",
      method: "interests",
      methodLabel: "Interests only. No regional signal was sent.",
      limitation: "Original recommendations could not be scored under the same setup.",
      warnings: input.warnings,
      observedModel: input.observedModel,
      completedAt: new Date().toISOString(),
    });
    return;
  }
  const scored = await input.post<InsightData>("/api/qloo/score", {
    domain: input.regional.domain,
    seedIds,
    candidateIds: ids,
    locationQuery: input.destination ?? undefined,
    ageBand: input.ageBand,
  }, input.signal);
  input.warnings.push(...scored.warnings);
  const byId = new Map(scored.data.entities.map((entity) => [entity.entityId.toLowerCase(), entity]));
  const scores = pool.pool.map((item) => toScore(item, byId.get(item.entityId.toLowerCase()), input.extracted));
  await finishCity({
    regional: input.regional,
    task: input.task,
    tags: [],
    allTags: [],
    probe: null,
    scores,
    extracted: input.extracted,
    interests: input.interests,
    warnings: input.warnings,
    observedModel: input.observedModel,
    requestKey: configurationHash({ mode: "interests", seedIds, ids, destination: input.destination, ageBand: input.ageBand ?? "" }),
    scoreParameters: scored.data.parameters ?? [],
    post: input.post,
    signal: input.signal,
    patch: input.patch,
    method: "interests",
    methodLabel: "Interests only. No regional signal was sent.",
  });
}

async function finishCity(input: {
  regional: RegionalState;
  task: TaskSpec;
  tags: RegionalTagRecord[];
  allTags: RegionalTagRecord[];
  probe: DerivedProbe | null;
  scores: RegionalScore[];
  extracted: ExtractedPick[];
  interests: ResolvedInterest[];
  warnings: string[];
  observedModel: string | null;
  requestKey: string;
  scoreParameters: { name: string; value: string }[];
  post: Poster;
  signal: AbortSignal;
  patch: (partial: Partial<RegionalCityResult>) => void;
  method: RegionalMethod;
  methodLabel: string;
}) {
  const scoreById = new Map(input.scores.map((row) => [row.entityId.toLowerCase(), row]));
  const checks = new Map<string, ReturnType<typeof verifyConstraints>>();
  for (const row of input.scores) {
    checks.set(row.entityId, verifyConstraints({
      language: input.regional.language,
      requirements: input.regional.requirements,
      facts: { language: row.language, tags: row.tags },
    }));
  }
  const originalIds = input.extracted.map((pick) => pick.entityId).filter((id): id is string => Boolean(id && ENTITY_ID_PATTERN.test(id)));
  const selection = selectRevised({
    count: COUNT,
    originalIds,
    comparable: input.scores.some((row) => row.affinity !== null),
    candidates: input.scores.map((row) => {
      const failed = (checks.get(row.entityId)?.checks ?? []).filter((check) => check.verdict === "fail");
      return {
        entityId: row.entityId,
        name: row.name,
        affinity: row.affinity,
        sources: row.sources as Array<"original" | "refined" | "discovered">,
        group: row.tags[0] ?? null,
        hardExcluded: failed.length > 0,
        exclusionReason: failed.map((check) => check.reason).join(" ") || null,
      };
    }),
  });
  const selectedIds = selection.selected.map((item) => item.entityId);
  const originalAffinities = originalIds.map((id) => scoreById.get(id.toLowerCase())?.affinity ?? null);
  const revisedAffinities = selectedIds.map((id) => scoreById.get(id.toLowerCase())?.affinity ?? null);
  const originalMean = meanObserved(originalAffinities);
  const revisedMean = meanObserved(revisedAffinities);
  const unresolved = input.extracted.filter((pick) => !pick.entityId).length;
  const originalCoverage = {
    numerator: originalAffinities.filter((value) => typeof value === "number").length,
    denominator: input.extracted.length,
  };
  const revisedCoverage = {
    numerator: revisedAffinities.filter((value) => typeof value === "number").length,
    denominator: selectedIds.length,
  };
  let limitation: string | null = null;
  if (input.method !== "interests" && input.extracted.length > 0 && originalCoverage.numerator === 0) {
    limitation = "Original recommendations could not be scored under the same setup.";
  }
  if (unresolved > 0) input.warnings.push(`${unresolved} original name${unresolved === 1 ? "" : "s"} did not resolve and ${unresolved === 1 ? "was" : "were"} left unscored.`);
  const diff = selection.diff;
  const explainFor = (id: string) => scoreById.get(id.toLowerCase())?.explainabilityStatus === "available"
    ? { status: "available" as const, contributions: scoreById.get(id.toLowerCase())?.contributions ?? [], warning: null, raw: null }
    : { status: "unavailable" as const, contributions: [], warning: null, raw: null };
  const original: RegionalArmItem[] = input.extracted.map((pick, index) => {
    const id = pick.entityId ?? "";
    const score = id ? scoreById.get(id.toLowerCase()) : undefined;
    return {
      entityId: id,
      name: pick.name,
      affinity: score?.affinity ?? null,
      rank: index + 1,
      membership: membershipFor(id, "original", diff),
      identity: pick.matchStatus,
      explanation: basisText({ affinity: score?.affinity ?? null, tags: input.tags, interests: input.interests, mode: input.regional.evidence, explainability: explainFor(id) }),
      rankFrom: diff.retained.find((row) => row.entityId.toLowerCase() === id.toLowerCase())?.toRank ?? null,
      practical: "Price, hours, and stock unverified",
    };
  });
  const revised: RegionalArmItem[] = selection.selected.map((item) => {
    const score = scoreById.get(item.entityId.toLowerCase());
    const kept = diff.retained.find((row) => row.entityId.toLowerCase() === item.entityId.toLowerCase());
    return {
      entityId: item.entityId,
      name: item.name,
      affinity: score?.affinity ?? null,
      rank: item.rank,
      membership: membershipFor(item.entityId, "revised", diff),
      identity: "selected",
      explanation: item.policyReason || basisText({ affinity: score?.affinity ?? null, tags: input.tags, interests: input.interests, mode: input.regional.evidence, explainability: explainFor(item.entityId) }),
      rankFrom: kept?.fromRank ?? null,
      practical: "Price, hours, and stock unverified",
    };
  });
  let revisedAnswer = diff.summary;
  if (revised.length > 0) {
    const lines: GroundingLine[] = revised.map((item) => {
      const row = scoreById.get(item.entityId.toLowerCase());
      const pick = input.extracted.find((entry) => entry.entityId?.toLowerCase() === item.entityId.toLowerCase());
      return {
        id: item.entityId,
        name: item.name,
        affinity: row?.affinity ?? null,
        statuses: evidenceStatuses({
          domain: input.regional.domain,
          affinity: row?.affinity ?? null,
          origin: "unsigned",
          explainabilityAvailable: row?.explainabilityStatus === "available",
          identityProvisional: Boolean(pick && (pick.matchStatus === "provisional" || pick.matchStatus === "ambiguous")),
          priceChecked: priceEditionStockChecked(checks.get(item.entityId)?.checks ?? []),
        }),
      };
    });
    const response = await input.post<RepairData>("/api/gemini/repair", {
      task: input.task,
      seedIds: input.interests.map((item) => item.entityId),
      candidates: revised.map((item) => {
        const row = scoreById.get(item.entityId.toLowerCase());
        const line = lines.find((entry) => entry.id.toLowerCase() === item.entityId.toLowerCase());
        return {
          entityId: item.entityId,
          name: item.name,
          affinity: row?.affinity ?? null,
          explainability: explainFor(item.entityId),
          evidenceOrigin: "unsigned" as const,
          notes: evidenceNotes(line?.statuses ?? []),
        };
      }),
    }, input.signal);
    input.warnings.push(...response.warnings);
    revisedAnswer = response.data.answer;
    const allowed = new Set(revised.map((item) => item.entityId.toLowerCase()));
    if (response.data.selections.some((item) => !allowed.has(item.id.toLowerCase()))) {
      input.warnings.push("The writer returned a different set. The displayed recommendations follow the selection policy.");
    }
  }
  input.patch({
    phase: "complete",
    method: input.method,
    methodLabel: input.methodLabel,
    probe: input.probe,
    tags: input.allTags,
    original,
    revised,
    scores: input.scores,
    pool: input.scores.map((row) => ({ entityId: row.entityId, name: row.name })),
    replacements: diff.replacementCount,
    originalCoverage,
    revisedCoverage,
    originalMean: limitation && originalMean.value === null ? null : originalMean.value,
    revisedMean: revisedMean.value,
    limitation,
    noFavorites: input.task.interests.length === 0,
    error: null,
    requestKey: input.requestKey,
    scoreParameters: input.scoreParameters,
    warnings: input.warnings,
    observedModel: input.observedModel,
    revisedAnswer,
    completedAt: new Date().toISOString(),
  });
}

function toScore(
  item: { entityId: string; name: string; sources: string[] },
  found: InsightEntity | undefined,
  extracted: ExtractedPick[],
): RegionalScore {
  const pick = extracted.find((entry) => entry.entityId?.toLowerCase() === item.entityId.toLowerCase());
  return {
    entityId: item.entityId,
    name: found?.name || item.name,
    affinity: found?.affinity ?? null,
    explainabilityStatus: found?.explainability.status ?? "unavailable",
    contributions: found?.explainability.contributions ?? [],
    sources: item.sources,
    tags: found?.tags.map((tag) => tag.name).filter(Boolean) ?? [],
    language: found?.language ?? null,
    matchStatus: pick?.matchStatus ?? null,
  };
}

function parameterRows(parameters: Record<string, string>): { name: string; value: string }[] {
  return Object.entries(parameters).map(([name, value]) => ({ name, value }));
}

type ExtractedPick = { name: string; entityId: string | null; matchStatus: string; types: string[] };

async function extractOriginal(post: Poster, signal: AbortSignal, domain: Domain, answer: string): Promise<ExtractedPick[]> {
  const response = await post<ExtractData>("/api/gemini/extract", { domain, answer, count: COUNT }, signal);
  const picks: ExtractedPick[] = [];
  for (const pick of response.data.picks) {
    const search = await post<SearchData>("/api/qloo/search", { name: pick.name, expectedTypes: searchTypesForDomain(domain) }, signal);
    picks.push({
      name: pick.name,
      entityId: search.data.match.entity?.entityId ?? null,
      matchStatus: search.data.match.status,
      types: search.data.match.entity?.types ?? [],
    });
  }
  return picks;
}

async function pooledResolve(post: Poster, signal: AbortSignal, interests: RegionalState["interests"]): Promise<Array<ResolvedInterest | null>> {
  const rows: Array<ResolvedInterest | null> = [];
  await pooled(interests.filter((item) => item.name.trim()), 2, async (interest) => {
    const search = await post<SearchData>("/api/qloo/search", { name: interest.name.trim(), expectedTypes: searchTypesForKind(interest.kind) }, signal);
    const entity = search.data.match.entity;
    rows.push(entity ? { query: interest.name.trim(), name: entity.name, entityId: entity.entityId, kind: interest.kind } : null);
  });
  return rows;
}

export function regionalChange(original: number | null, revised: number | null): number | null {
  if (typeof original !== "number" || typeof revised !== "number") return null;
  if (!Number.isFinite(original) || !Number.isFinite(revised)) return null;
  return revised - original;
}
