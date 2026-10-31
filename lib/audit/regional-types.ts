import type { DerivedProbe } from "@/lib/audit/capabilities";
import type { SensitivityRun } from "@/lib/audit/sensitivity";
import type { Domain, FavoriteKind } from "@/lib/schemas/limits";

export type RegionalPhase = "queued" | "generating" | "discovering" | "evaluating" | "complete" | "failed";

export type PlaceMode = "market" | "local";
export type EvidenceMode = "regional" | "joint" | "interests";
export type RegionalMethod = "derived" | "unavailable" | "direct" | "interests";

export type ConfirmedMarket = {
  label: string;
  query: string;
  entityId: string | null;
};

export type RegionalFavorite = { name: string; kind: FavoriteKind };

export type RegionalScore = {
  entityId: string;
  name: string;
  affinity: number | null;
  explainabilityStatus: "available" | "unavailable";
  contributions: { entityId: string | null; name: string | null; value: number }[];
  sources: string[];
  tags: string[];
  language: string | null;
  matchStatus: string | null;
};

export type LocalityCandidate = {
  entityId: string;
  name: string;
  types: string[];
};

export type RegionalTagRecord = {
  tagId: string;
  name: string;
  namespace: string;
  types: string[];
  score: number | null;
  rank: number;
  compatible: boolean;
};

export type RegionalArmItem = {
  entityId: string;
  name: string;
  affinity: number | null;
  rank: number;
  membership: "added" | "removed" | "retained" | "reordered" | "original" | "selected" | "unresolved";
  identity: string;
  explanation: string;
  rankFrom: number | null;
  practical: string;
};

export type RegionalCityResult = {
  city: string;
  audienceMarket: string;
  destination: string | null;
  evidence: EvidenceMode;
  phase: RegionalPhase;
  method: RegionalMethod;
  methodLabel: string;
  probe: DerivedProbe | null;
  tags: RegionalTagRecord[];
  originalAnswer: string | null;
  revisedAnswer: string | null;
  original: RegionalArmItem[];
  revised: RegionalArmItem[];
  scores: RegionalScore[];
  pool: { entityId: string; name: string }[];
  replacements: number;
  originalCoverage: { numerator: number; denominator: number };
  revisedCoverage: { numerator: number; denominator: number };
  originalMean: number | null;
  revisedMean: number | null;
  limitation: string | null;
  noFavorites: boolean;
  error: string | null;
  requestKey: string | null;
  scoreParameters: { name: string; value: string }[];
  warnings: string[];
  observedModel: string | null;
  completedAt: string | null;
  sensitivity: SensitivityRun | null;
};

export type RegionalState = {
  runId: string | null;
  startedAt: string | null;
  domain: Domain;
  placeMode: PlaceMode;
  evidence: EvidenceMode;
  destination: ConfirmedMarket | null;
  question: string;
  ageBand: string;
  language: string;
  budget: string;
  currency: string;
  requirements: string;
  companyName: string;
  interests: RegionalFavorite[];
  markets: ConfirmedMarket[];
  cases: Record<string, RegionalCityResult>;
  running: boolean;
};

export function emptyRegionalCity(city: string, audienceMarket: string, destination: string | null, evidence: EvidenceMode): RegionalCityResult {
  return {
    city,
    audienceMarket,
    destination,
    evidence,
    phase: "queued",
    method: "unavailable",
    methodLabel: "",
    probe: null,
    tags: [],
    originalAnswer: null,
    revisedAnswer: null,
    original: [],
    revised: [],
    scores: [],
    pool: [],
    replacements: 0,
    originalCoverage: { numerator: 0, denominator: 0 },
    revisedCoverage: { numerator: 0, denominator: 0 },
    originalMean: null,
    revisedMean: null,
    limitation: null,
    noFavorites: true,
    error: null,
    requestKey: null,
    scoreParameters: [],
    warnings: [],
    observedModel: null,
    completedAt: null,
    sensitivity: null,
  };
}

export function emptyRegional(): RegionalState {
  return {
    runId: null,
    startedAt: null,
    domain: "book",
    placeMode: "local",
    evidence: "regional",
    destination: null,
    question: "Recommend three fantasy books.",
    ageBand: "",
    language: "English",
    budget: "",
    currency: "USD",
    requirements: "",
    companyName: "",
    interests: [],
    markets: [],
    cases: {},
    running: false,
  };
}

export function sanitizeRegional(value: unknown): RegionalState {
  const base = emptyRegional();
  if (!value || typeof value !== "object") return base;
  const record = value as Partial<RegionalState>;
  return {
    ...base,
    ...record,
    running: false,
    domain: record.domain === "place" ? "place" : "book",
    placeMode: record.placeMode === "market" ? "market" : "local",
    evidence: record.evidence === "joint" || record.evidence === "interests" ? record.evidence : "regional",
    destination: record.destination ?? null,
    markets: Array.isArray(record.markets) ? record.markets : [],
    interests: Array.isArray(record.interests) ? record.interests : [],
    cases: record.cases && typeof record.cases === "object" ? record.cases : {},
    question: typeof record.question === "string" ? record.question : base.question,
    companyName: typeof record.companyName === "string" ? record.companyName : "",
  };
}
