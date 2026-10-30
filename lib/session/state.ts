import type { SelectionDiff } from "@/lib/audit/select";
import { configurationHash } from "@/lib/audit/hash";
import type { CaseMetrics } from "@/lib/audit/metrics";
import type { ConstraintCheck } from "@/lib/audit/constraints";
import type { Explainability } from "@/lib/providers/qloo";
import type { GeminiProvenance } from "@/lib/providers/gemini";
import {
  FROZEN_GENERATION,
  LIMITS,
  SCHEMA_VERSION,
  SYSTEM_PROMPT_VERSION,
  type Domain,
  type FavoriteKind,
} from "@/lib/schemas/limits";

export const STAGE_NAMES = [
  "original",
  "refine",
  "extract",
  "resolvePicks",
  "discover",
  "score",
  "rerank",
  "revise",
  "summarize",
] as const;

export type StageName = (typeof STAGE_NAMES)[number];
export type StageStatus = "idle" | "running" | "complete" | "failed" | "skipped";

export type StageState = {
  status: StageStatus;
  error: { code: string; message: string; retryable: boolean; requestId: string } | null;
};

export type Favorite = { name: string; kind: FavoriteKind };

export type ReaderProfile = { label: string; favorites: Favorite[] };

export type Comparison = "cities" | "readers";

export type ResolvedSeed = {
  query: string;
  kind: FavoriteKind;
  status: "exact" | "provisional" | "unmatched" | "corrected";
  ambiguous: boolean;
  entityId: string | null;
  name: string | null;
  types: string[];
  alternatives: { entityId: string; name: string; types: string[] }[];
};

export type ScoreRow = {
  entityId: string;
  name: string;
  types: string[];
  affinity: number | null;
  explainability: Explainability;
  evidenceOrigin: "provider" | "imported" | "unsigned";
  retrievedAt: string | null;
  sources: Array<"original" | "refined" | "discovered">;
  envelope: string | null;
  tags: string[];
  language: string | null;
  imageUrl: string | null;
};

export type NamedPick = {
  name: string;
  quote: string;
  entityId: string | null;
  matchStatus: "exact" | "provisional" | "unmatched" | "corrected";
  ambiguous: boolean;
  types: string[];
};

export type RevisedSelection = {
  id: string;
  name: string;
  reason: string;
  policyReason?: string;
};

export type CityPhase = "queued" | "generating" | "discovering" | "evaluating" | "complete" | "failed";

export type SelectionDiagnostic = {
  originalIds: string[];
  discoveredIds: string[];
  eligibleIds: string[];
  selectedIds: string[];
  newCandidateCount: number;
  retainedCount: number;
  replacementCount: number;
  scoringSignals: { name: string; value: string }[];
  exclusions: { entityId: string; name: string; reason: string }[];
  geographyNote: string;
  summary: string;
  diff: SelectionDiff;
  revisedAffinities?: { entityId: string; affinity: number | null }[];
  unroundedOriginalMean?: number | null;
  unroundedRevisedMean?: number | null;
  requestKey?: string;
  discoverParameters?: { name: string; value: string }[];
  scoreParameters?: { name: string; value: string }[];
  locationAccounting?: { gemini: string; candidateFilter: string; scoringSignal: string };
};

export type SignalSnapshot = {
  qloo: { name: string; value: string }[];
  withheld: { name: string; reason: string }[];
  gemini: string[];
  geographicSignalApplied: boolean;
  localityName: string | null;
  coordinatesReturned: boolean;
  localityLatitude?: number | null;
  localityLongitude?: number | null;
};

export type RecordedMark = {
  at: string;
  model: string;
  question: string;
  city: string;
  configurationHash: string;
};

export type CaseRecord = {
  city: string;
  phase: CityPhase;
  stages: Record<StageName, StageState>;
  originalAnswer: string | null;
  refinedAnswer: string | null;
  revisedAnswer: string | null;
  originalProvenance: GeminiProvenance | null;
  refinedProvenance: GeminiProvenance | null;
  revisedProvenance: GeminiProvenance | null;
  extracted: NamedPick[];
  refinedExtracted: NamedPick[];
  discovered: { entityId: string; name: string; types: string[] }[];
  scores: ScoreRow[];
  scoreFingerprint: string | null;
  rerankIds: string[];
  rerankNote: string | null;
  revisedSelections: RevisedSelection[];
  diagnostic: SelectionDiagnostic | null;
  originalPrompt: string | null;
  revisedPrompt: string | null;
  metrics: CaseMetrics | null;
  warnings: string[];
  signals: SignalSnapshot | null;
  checksById: Record<string, ConstraintCheck[]>;
  recorded: RecordedMark | null;
  observedModel: string | null;
};

export type VoteState = { choice: "a" | "b" | null; revealed: boolean };

export type SessionState = {
  schemaVersion: typeof SCHEMA_VERSION;
  runId: string;
  source: "session" | "imported";
  scenario: "demo" | "company" | null;
  simulatedLabel: string;
  disclaimer: string;
  company: { name: string; industry: string; purpose: string };
  domain: Domain;
  assistantMode: "simulate" | "paste";
  pastedAnswer: string;
  profile: {
    label: string;
    age: string;
    country: string;
    budget: string;
    currency: string;
    language: string;
    requirements: string;
    favorites: Favorite[];
  };
  cities: string[];
  comparison: Comparison;
  readers: ReaderProfile[];
  taskQuestion: string;
  recommendationCount: number;
  compareAll: boolean;
  seedOverrides: Record<string, string>;
  seeds: ResolvedSeed[];
  seedStage: StageState;
  cases: Record<string, CaseRecord>;
  running: boolean;
  votes: Record<string, VoteState>;
  configHash: string;
  resultsHash: string | null;
};

export type ConfigPatch = Partial<
  Pick<
    SessionState,
    | "scenario"
    | "simulatedLabel"
    | "disclaimer"
    | "company"
    | "domain"
    | "assistantMode"
    | "pastedAnswer"
    | "profile"
    | "cities"
    | "comparison"
    | "readers"
    | "taskQuestion"
    | "recommendationCount"
    | "seedOverrides"
  >
>;

export function idleStage(): StageState {
  return { status: "idle", error: null };
}

export function stageMap(): Record<StageName, StageState> {
  return {
    original: idleStage(),
    refine: idleStage(),
    extract: idleStage(),
    resolvePicks: idleStage(),
    discover: idleStage(),
    score: idleStage(),
    rerank: idleStage(),
    revise: idleStage(),
    summarize: idleStage(),
  };
}

export function emptyCase(city: string): CaseRecord {
  return {
    city,
    phase: "queued",
    stages: stageMap(),
    originalAnswer: null,
    refinedAnswer: null,
    revisedAnswer: null,
    originalProvenance: null,
    refinedProvenance: null,
    revisedProvenance: null,
    extracted: [],
    refinedExtracted: [],
    discovered: [],
    scores: [],
    scoreFingerprint: null,
    rerankIds: [],
    rerankNote: null,
    revisedSelections: [],
    diagnostic: null,
    originalPrompt: null,
    revisedPrompt: null,
    metrics: null,
    warnings: [],
    signals: null,
    checksById: {},
    recorded: null,
    observedModel: null,
  };
}

export function hashInput(state: Pick<
  SessionState,
  | "scenario"
  | "company"
  | "domain"
  | "assistantMode"
  | "pastedAnswer"
  | "profile"
  | "cities"
  | "comparison"
  | "readers"
  | "taskQuestion"
  | "recommendationCount"
  | "seedOverrides"
  | "simulatedLabel"
>): unknown {
  return {
    comparison: state.comparison,
    readers: state.readers,
    assistantMode: state.assistantMode,
    company: state.company,
    domain: state.domain,
    pastedAnswer: state.pastedAnswer.trim(),
    profile: state.profile,
    recommendationCount: state.recommendationCount,
    scenario: state.scenario,
    seedOverrides: state.seedOverrides,
    simulatedLabel: state.simulatedLabel,
    taskQuestion: state.taskQuestion.trim(),
    generation: { ...FROZEN_GENERATION, systemPromptVersion: SYSTEM_PROMPT_VERSION },
  };
}

export function withHash(state: SessionState): SessionState {
  return { ...state, configHash: configurationHash(hashInput(state)) };
}

function newRunId(): string {
  return crypto.randomUUID();
}

export function createSession(): SessionState {
  return withHash({
    schemaVersion: SCHEMA_VERSION,
    runId: newRunId(),
    source: "session",
    scenario: null,
    simulatedLabel: "",
    disclaimer: "",
    company: { name: "", industry: "", purpose: "" },
    domain: "place",
    assistantMode: "simulate",
    pastedAnswer: "",
    profile: {
      label: "Customer",
      age: "",
      country: "",
      budget: "",
      currency: "USD",
      language: "English",
      requirements: "",
      favorites: [
        { name: "", kind: "movie" },
        { name: "", kind: "artist" },
        { name: "", kind: "book" },
      ],
    },
    cities: [""],
    comparison: "cities",
    readers: [],
    taskQuestion: "Recommend three places for my evening in this city, considering my interests, budget and practical needs.",
    recommendationCount: LIMITS.recommendationsDefault,
    compareAll: false,
    seedOverrides: {},
    seeds: [],
    seedStage: idleStage(),
    cases: {},
    running: false,
    votes: {},
    configHash: "",
    resultsHash: null,
  });
}

function clearedResults(state: SessionState): SessionState {
  return {
    ...state,
    seeds: [],
    seedStage: idleStage(),
    cases: {},
    votes: {},
    resultsHash: null,
    source: state.source === "imported" ? "imported" : "session",
  };
}

export type CasePatch = Omit<Partial<CaseRecord>, "stages"> & {
  stages?: Partial<Record<StageName, StageState>>;
};

export type Action =
  | { type: "replace"; state: SessionState }
  | { type: "update"; patch: ConfigPatch }
  | { type: "reset" }
  | { type: "running"; running: boolean }
  | { type: "seeds"; seeds: ResolvedSeed[]; stage: StageState }
  | { type: "patch-case"; city: string; patch: CasePatch }
  | { type: "compare" }
  | { type: "vote"; city: string; vote: VoteState }
  | { type: "record"; city: string; mark: RecordedMark }
  | { type: "begin-run"; runId: string; cities: string[] };

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "replace":
      return withHash({ ...action.state, running: false });
    case "reset":
      return createSession();
    case "update": {
      const next = withHash({ ...state, ...action.patch, company: action.patch.company ?? state.company, profile: action.patch.profile ?? state.profile });
      if (next.configHash !== state.configHash) return clearedResults(next);
      const allowed = new Set(
        next.cities.map((city) => city.trim().toLowerCase()).filter(Boolean),
      );
      const cases = Object.fromEntries(Object.entries(state.cases).filter(([city]) => allowed.has(city.toLowerCase())));
      return { ...next, cases, resultsHash: Object.keys(cases).length > 0 ? next.configHash : null };
    }
    case "running":
      return { ...state, running: action.running };
    case "seeds":
      return { ...state, seeds: action.seeds, seedStage: action.stage };
    case "patch-case": {
      const prev = state.cases[action.city] ?? emptyCase(action.city);
      const stages = action.patch.stages ? { ...prev.stages, ...action.patch.stages } : prev.stages;
      return {
        ...state,
        resultsHash: state.configHash,
        cases: { ...state.cases, [action.city]: { ...prev, ...action.patch, city: action.city, stages } },
      };
    }
    case "compare": {
      const cases: Record<string, CaseRecord> = {};
      for (const [city, item] of Object.entries(state.cases)) {
        cases[city] = {
          ...item,
          phase: "evaluating",
          refinedAnswer: null,
          refinedProvenance: null,
          refinedExtracted: [],
          scores: [],
          scoreFingerprint: null,
          rerankIds: [],
          rerankNote: null,
          revisedAnswer: null,
          revisedSelections: [],
          revisedProvenance: null,
          metrics: null,
          stages: {
            ...item.stages,
            refine: { status: "idle", error: null },
            score: { status: "idle", error: null },
            rerank: { status: "idle", error: null },
            revise: { status: "idle", error: null },
            summarize: { status: "idle", error: null },
          },
        };
      }
      return { ...state, compareAll: true, cases };
    }
    case "vote":
      return { ...state, votes: { ...state.votes, [action.city]: action.vote } };
    case "record": {
      const item = state.cases[action.city];
      if (!item || state.source === "imported") return state;
      return {
        ...state,
        cases: { ...state.cases, [action.city]: { ...item, recorded: action.mark } },
      };
    }
    case "begin-run": {
      const cases: Record<string, CaseRecord> = {};
      for (const city of action.cities) {
        const name = city.trim();
        if (!name) continue;
        cases[name] = { ...emptyCase(name), phase: "queued" };
      }
      return { ...state, runId: action.runId, running: true, cities: action.cities, cases, resultsHash: state.configHash };
    }
    default:
      return state;
  }
}

export function activeCities(state: SessionState): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const city of state.cities) {
    const trimmed = city.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    cities.push(trimmed);
    if (cities.length >= LIMITS.cities) break;
  }
  return cities;
}

export function resultsReady(state: SessionState): boolean {
  return state.resultsHash === state.configHash && Object.keys(state.cases).length > 0;
}
