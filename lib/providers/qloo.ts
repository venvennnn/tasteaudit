import { AppError } from "@/lib/providers/errors";
import { fetchWithRetry, timeoutSignal } from "@/lib/providers/retry";
import { domainFilterType, ENTITY_ID_PATTERN, LIMITS, type Domain } from "@/lib/schemas/limits";

export type Contribution = {
  entityId: string | null;
  name: string | null;
  value: number;
};

export type Explainability = {
  status: "available" | "unavailable";
  contributions: Contribution[];
  warning: string | null;
  raw: unknown;
};

export type QlooEntity = {
  entityId: string;
  name: string;
  types: string[];
  popularity: number | null;
  tags: { id: string; name: string }[];
  affinity: number | null;
  explainability: Explainability;
  language: string | null;
  description: string | null;
};

export type LocalityResolution = {
  name: string | null;
  id: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type QlooCall = {
  host: string;
  path: string;
  parameters: Record<string, string>;
  retrievedAt: string;
};

function configuredBase(): URL {
  const raw = process.env.QLOO_BASE_URL?.trim();
  if (!raw) {
    throw new AppError({
      code: "not_configured",
      message: "QLOO_BASE_URL is not configured.",
      stage: "qloo",
      retryable: false,
      status: 503,
    });
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError({
      code: "not_configured",
      message: "QLOO_BASE_URL is not a valid URL.",
      stage: "qloo",
      retryable: false,
      status: 503,
    });
  }
  if (url.protocol !== "https:") {
    throw new AppError({
      code: "not_configured",
      message: "QLOO_BASE_URL must use HTTPS.",
      stage: "qloo",
      retryable: false,
      status: 503,
    });
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new AppError({
      code: "not_configured",
      message: "QLOO_BASE_URL must be the host origin, without a path. TasteAudit does not switch hosts.",
      stage: "qloo",
      retryable: false,
      status: 503,
    });
  }
  return url;
}

function apiKey(): string {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) {
    throw new AppError({
      code: "not_configured",
      message: "QLOO_API_KEY is not configured.",
      stage: "qloo",
      retryable: false,
      status: 503,
    });
  }
  return key;
}

function timeoutMs(): number {
  const raw = Number(process.env.QLOO_TIMEOUT_MS ?? 12_000);
  if (!Number.isFinite(raw) || raw < 50) return 12_000;
  return Math.min(raw, 25_000);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

export function normalizeTags(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const tags: { id: string; name: string }[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name : "";
    const id = typeof record.id === "string" ? record.id : "";
    if (!name && !id) continue;
    tags.push({ id, name });
  }
  return tags;
}

export function parseExplainability(value: unknown): Explainability {
  if (value == null) {
    return { status: "unavailable", contributions: [], warning: null, raw: null };
  }
  const contributions: Contribution[] = [];
  let warning: string | null = null;
  const seen = new Set<string>();
  const visit = (node: unknown, depth: number) => {
    if (depth > 5 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    if (typeof record.warning === "string" && record.warning.trim()) warning = record.warning.trim();
    const numeric = ["score", "affinity", "value", "weight"]
      .map((key) => record[key])
      .find((item): item is number => typeof item === "number" && Number.isFinite(item));
    const name = typeof record.name === "string" ? record.name : null;
    const entityId =
      typeof record.entity_id === "string" ? record.entity_id : typeof record.entityId === "string" ? record.entityId : null;
    if (typeof numeric === "number" && (name || entityId)) {
      const key = `${entityId ?? ""}|${name ?? ""}|${numeric}`;
      if (!seen.has(key)) {
        seen.add(key);
        contributions.push({ entityId, name, value: numeric });
      }
      return;
    }
    for (const key of ["entities", "contributions", "items", "signals", "input_entities"]) {
      if (key in record) visit(record[key], depth + 1);
    }
  };
  visit(value, 0);
  if (contributions.length === 0) {
    return { status: "unavailable", contributions: [], warning, raw: value };
  }
  return { status: "available", contributions, warning, raw: value };
}

function collectTypes(record: Record<string, unknown>): string[] {
  const types = new Set<string>();
  for (const key of ["subtype", "type"]) {
    const value = record[key];
    if (typeof value === "string" && value.startsWith("urn:")) types.add(value);
  }
  if (Array.isArray(record.types)) {
    for (const item of record.types) {
      if (typeof item === "string" && item.startsWith("urn:")) types.add(item);
    }
  }
  return [...types];
}

function readId(record: Record<string, unknown>): string {
  const value = record.entity_id ?? record.entityId ?? record.id;
  return typeof value === "string" ? value : "";
}

function readLanguage(properties: Record<string, unknown> | null): string | null {
  if (!properties) return null;
  if (typeof properties.language === "string") return properties.language;
  if (Array.isArray(properties.languages) && typeof properties.languages[0] === "string") return properties.languages[0];
  return null;
}

export function normalizeEntity(value: unknown): QlooEntity | null {
  const record = asRecord(value);
  if (!record) return null;
  const entityId = readId(record);
  const name = typeof record.name === "string" ? record.name : "";
  if (!name && !entityId) return null;
  const query = asRecord(record.query);
  const properties = asRecord(record.properties);
  const affinity = query && typeof query.affinity === "number" && Number.isFinite(query.affinity) ? query.affinity : null;
  const description =
    properties && typeof properties.short_description === "string"
      ? properties.short_description
      : properties && typeof properties.description === "string"
        ? properties.description.slice(0, 280)
        : null;
  return {
    entityId,
    name,
    types: collectTypes(record),
    popularity: typeof record.popularity === "number" ? record.popularity : null,
    tags: normalizeTags(record.tags),
    affinity,
    explainability: parseExplainability(query?.explainability),
    language: readLanguage(properties),
    description,
  };
}

function entityArray(payload: unknown): unknown[] {
  const root = asRecord(payload);
  if (!root) return [];
  if (Array.isArray(root.results)) return root.results;
  const results = asRecord(root.results);
  if (results && Array.isArray(results.entities)) return results.entities;
  if (Array.isArray(root.entities)) return root.entities;
  return [];
}

function payloadWarnings(payload: unknown): string[] {
  const root = asRecord(payload);
  if (!root) return [];
  const warnings: string[] = [];
  const collect = (value: unknown) => {
    if (typeof value === "string" && value.trim()) warnings.push(value.trim());
    else if (Array.isArray(value)) value.forEach(collect);
    else {
      const record = asRecord(value);
      if (record && typeof record.message === "string") warnings.push(record.message);
    }
  };
  collect(root.warnings);
  const query = asRecord(root.query);
  const explain = asRecord(query?.explainability);
  if (explain && typeof explain.warning === "string") warnings.push(explain.warning);
  return warnings;
}

export function parseLocality(payload: unknown): LocalityResolution | null {
  const root = asRecord(payload);
  const query = asRecord(root?.query);
  const locality = asRecord(query?.locality);
  const signal = asRecord(locality?.signal) ?? locality;
  if (!signal) return null;
  const properties = asRecord(signal.properties);
  const location = asRecord(properties?.location) ?? asRecord(signal.location);
  const latitude =
    typeof location?.lat === "number" ? location.lat : typeof location?.latitude === "number" ? location.latitude : null;
  const longitude =
    typeof location?.lon === "number"
      ? location.lon
      : typeof location?.lng === "number"
        ? location.lng
        : typeof location?.longitude === "number"
          ? location.longitude
          : null;
  const name = typeof signal.name === "string" ? signal.name : null;
  const id = typeof signal.entity_id === "string" ? signal.entity_id : typeof signal.id === "string" ? signal.id : null;
  if (!name && !id && latitude === null) return null;
  return { name, id, latitude, longitude };
}

async function qlooGet(
  path: string,
  parameters: Record<string, string>,
  stage: string,
  signal?: AbortSignal,
): Promise<{ payload: unknown; warnings: string[]; call: QlooCall; empty: boolean }> {
  const base = configuredBase();
  const key = apiKey();
  const url = new URL(path, base.origin);
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== "") search.set(name, value);
  }
  url.search = search.toString();
  const timed = timeoutSignal(timeoutMs(), signal);
  try {
    const response = await fetchWithRetry(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Api-Key": key,
        },
      },
      { stage, signal: timed.signal, retries: 2, softStatuses: [404] },
    );
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new AppError({
          code: "upstream",
          message: "The provider returned a response that was not JSON.",
          stage,
          retryable: true,
          status: 502,
        });
      }
    }
    const empty = response.status === 404 || entityArray(payload).length === 0;
    const warnings = payloadWarnings(payload);
    if (empty && !warnings.some((warning) => /no result/i.test(warning))) {
      warnings.push(response.status === 404 ? "The provider found no results." : "The provider returned no entities.");
    }
    return {
      payload,
      warnings,
      empty,
      call: {
        host: base.host,
        path,
        parameters,
        retrievedAt: new Date().toISOString(),
      },
    };
  } finally {
    timed.cancel();
  }
}

export async function searchEntities(input: {
  name: string;
  expectedTypes: string[];
  signal?: AbortSignal;
}): Promise<{ entities: QlooEntity[]; warnings: string[]; call: QlooCall; empty: boolean }> {
  const result = await qlooGet(
    "/search",
    {
      query: input.name,
      types: input.expectedTypes.join(","),
      page: "1",
      take: String(LIMITS.searchTake),
      sort_by: "match",
    },
    "qloo.search",
    input.signal,
  );
  const entities = entityArray(result.payload)
    .map(normalizeEntity)
    .filter((entity): entity is QlooEntity => entity !== null && ENTITY_ID_PATTERN.test(entity.entityId));
  return { entities, warnings: result.warnings, call: result.call, empty: entities.length === 0 };
}

export async function discoverCandidates(input: {
  domain: Domain;
  seedIds: string[];
  locationQuery?: string;
  ageBand?: string;
  signal?: AbortSignal;
}): Promise<{
  entities: QlooEntity[];
  warnings: string[];
  call: QlooCall;
  locality: LocalityResolution | null;
  geographicSignalApplied: boolean;
}> {
  const parameters: Record<string, string> = {
    "filter.type": domainFilterType(input.domain),
    "signal.interests.entities": input.seedIds.join(","),
    "feature.explainability": "true",
    take: String(LIMITS.discoverTake),
  };
  let geographicSignalApplied = false;
  if (input.domain === "place" && input.locationQuery) {
    parameters["filter.location.query"] = input.locationQuery;
    geographicSignalApplied = true;
  }
  if (input.ageBand) parameters["signal.demographics.age"] = input.ageBand;
  const result = await qlooGet("/v2/insights", parameters, "qloo.discover", input.signal);
  const locality = parseLocality(result.payload);
  return {
    entities: entityArray(result.payload)
      .map(normalizeEntity)
      .filter((entity): entity is QlooEntity => entity !== null && ENTITY_ID_PATTERN.test(entity.entityId)),
    warnings: result.warnings,
    call: result.call,
    locality,
    geographicSignalApplied,
  };
}

export async function scoreCandidates(input: {
  domain: Domain;
  seedIds: string[];
  candidateIds: string[];
  locationQuery?: string;
  ageBand?: string;
  signal?: AbortSignal;
}): Promise<{
  entities: QlooEntity[];
  warnings: string[];
  call: QlooCall;
  locality: LocalityResolution | null;
  geographicSignalApplied: boolean;
  missingIds: string[];
}> {
  const parameters: Record<string, string> = {
    "filter.type": domainFilterType(input.domain),
    "signal.interests.entities": input.seedIds.join(","),
    "filter.results.entities": input.candidateIds.join(","),
    "feature.explainability": "true",
    take: String(Math.min(50, input.candidateIds.length)),
  };
  let geographicSignalApplied = false;
  if (input.domain === "place" && input.locationQuery) {
    parameters["filter.location.query"] = input.locationQuery;
    geographicSignalApplied = true;
  }
  if (input.ageBand) parameters["signal.demographics.age"] = input.ageBand;
  const result = await qlooGet("/v2/insights", parameters, "qloo.score", input.signal);
  const entities = entityArray(result.payload)
    .map(normalizeEntity)
    .filter((entity): entity is QlooEntity => entity !== null && ENTITY_ID_PATTERN.test(entity.entityId));
  const returned = new Set(entities.map((entity) => entity.entityId.toLowerCase()));
  const missingIds = input.candidateIds.filter((id) => !returned.has(id.toLowerCase()));
  const warnings = [...result.warnings];
  if (missingIds.length > 0) {
    warnings.push(`${missingIds.length} candidate${missingIds.length === 1 ? "" : "s"} came back without a score. Missing affinity is not treated as zero.`);
  }
  return {
    entities,
    warnings,
    call: result.call,
    locality: parseLocality(result.payload),
    geographicSignalApplied,
    missingIds,
  };
}

export async function getEntityDetails(input: { entityIds: string[]; signal?: AbortSignal }): Promise<{
  entities: QlooEntity[];
  warnings: string[];
  call: QlooCall;
}> {
  const base = configuredBase();
  const key = apiKey();
  const url = new URL("/entities", base.origin);
  const search = new URLSearchParams();
  for (const id of input.entityIds) search.append("entity_ids", id);
  url.search = search.toString();
  const timed = timeoutSignal(timeoutMs(), input.signal);
  try {
    const response = await fetchWithRetry(
      url.toString(),
      { method: "GET", headers: { Accept: "application/json", "X-Api-Key": key } },
      { stage: "qloo.entities", signal: timed.signal, retries: 2, softStatuses: [404] },
    );
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new AppError({
          code: "upstream",
          message: "The provider returned a response that was not JSON.",
          stage: "qloo.entities",
          retryable: true,
          status: 502,
        });
      }
    }
    const entities = entityArray(payload)
      .map(normalizeEntity)
      .filter((entity): entity is QlooEntity => entity !== null);
    return {
      entities,
      warnings: entities.length === 0 ? ["Metadata enrichment returned no entities."] : payloadWarnings(payload),
      call: {
        host: base.host,
        path: "/entities",
        parameters: { entity_ids: input.entityIds.join(",") },
        retrievedAt: new Date().toISOString(),
      },
    };
  } finally {
    timed.cancel();
  }
}
