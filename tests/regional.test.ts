import { describe, expect, it } from "vitest";
import { explanationValue, scaleDomain } from "@/lib/audit/attribution";
import { DIRECT_REGIONAL_STATUS, REGIONAL_UNAVAILABLE, tagCompatible } from "@/lib/audit/capabilities";
import { alignRegionalTags } from "@/lib/audit/regional-compare";
import { executeRegional } from "@/lib/audit/regional-run";
import { emptyRegional, type RegionalCityResult, type RegionalState } from "@/lib/audit/regional-types";
import { leaveOneOutDelta, sensitivityPoints } from "@/lib/audit/sensitivity";
import { meanObserved } from "@/lib/audit/metrics";
import { regionalEntityParameters, tasteParameters } from "@/lib/providers/qloo";
import { regionalCsv } from "@/lib/exports/regional";
import { createSession, hashInput, reducer } from "@/lib/session/state";
import { configurationHash } from "@/lib/audit/hash";
import type { Explainability } from "@/lib/providers/qloo";

const book = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const seed = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function regionalBase(): RegionalState {
  return {
    ...emptyRegional(),
    question: "Recommend three fantasy books.",
    markets: [
      { label: "Chennai", query: "Chennai", entityId: "loc-1" },
      { label: "London", query: "London", entityId: "loc-2" },
    ],
  };
}

function explain(status: Explainability["status"], contributions: Explainability["contributions"] = []): Explainability {
  return { status, contributions, warning: null, raw: null };
}

describe("regional capabilities", () => {
  it("does not treat direct location scoring as supported", () => {
    expect(DIRECT_REGIONAL_STATUS).toBe("unsupported");
    const bookParams = tasteParameters({ domain: "book", locationQuery: "Chennai" });
    expect(bookParams["filter.type"]).toBe("urn:tag");
    expect(bookParams["signal.location.query"]).toBe("Chennai");
    expect(bookParams["filter.parents.types"]).toBe("urn:entity:book");
    expect(bookParams["feature.explainability"]).toBeUndefined();
    const score = regionalEntityParameters({ domain: "book", tagIds: ["urn:tag:genre:media:fantasy"], take: 3 });
    expect(score["signal.location.query"]).toBeUndefined();
    expect(score["signal.location"]).toBeUndefined();
    expect(score["signal.interests.tags"]).toBe("urn:tag:genre:media:fantasy");
    const place = regionalEntityParameters({ domain: "place", tagIds: ["urn:tag:genre:place:cafe"], locationQuery: "Lisbon", take: 3 });
    expect(place["filter.location.query"]).toBe("Lisbon");
    expect(place["signal.location"]).toBeUndefined();
    expect(place["signal.location.query"]).toBeUndefined();
    expect(tagCompatible(["urn:entity:place"], "book")).toBe(false);
    expect(tagCompatible(["urn:entity:book"], "book")).toBe(true);
  });

  it("runs without personal favorites and refuses a global fallback", async () => {
    const calls: { path: string; body: Record<string, unknown> }[] = [];
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      const record = body as Record<string, unknown>;
      calls.push({ path, body: record });
      if (path.endsWith("/original")) {
        expect((record.task as { interests: unknown[] }).interests).toEqual([]);
        expect((record.task as { city: string }).city).toBeTruthy();
        return { data: { answer: "Read The Hobbit, The Left Hand of Darkness, and Piranesi." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      }
      if (path.endsWith("/extract")) return { data: { picks: [{ name: "The Hobbit", quote: "The Hobbit" }] } as T, warnings: [], provenance: {} };
      if (path.endsWith("/search")) {
        return { data: { candidates: [{ entityId: book, name: "The Hobbit", types: ["urn:entity:book"] }], match: { status: "exact", ambiguous: false, entity: { entityId: book, name: "The Hobbit", types: ["urn:entity:book"] } } } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/taste")) {
        expect(record.locationQuery).toBe(calls.filter((call) => call.path.endsWith("/taste")).length === 1 ? "Chennai" : record.locationQuery);
        return { data: { tags: [{ tagId: "urn:tag:genre:place:street_food", name: "Street food", namespace: "urn:tag:genre", types: ["urn:entity:place"], score: null, compatible: false, explainabilityStatus: "unavailable" }], locality: { name: "Chennai", id: "loc-1" }, scoresNumeric: false, explainabilityReturned: false, demographicEchoed: false, parameters: [] } as T, warnings: [], provenance: {} };
      }
      throw new Error(`unexpected ${path}`);
    };
    const cases: Record<string, RegionalCityResult> = {};
    await executeRegional({
      regional: regionalBase(),
      cities: ["Chennai", "London"],
      post,
      signal: new AbortController().signal,
      onCase: (city, patch) => {
        cases[city] = { ...(cases[city] as RegionalCityResult), ...patch, city };
      },
    });
    expect(calls.some((call) => call.path.includes("regional-insights"))).toBe(false);
    expect(calls.some((call) => call.path.endsWith("/score"))).toBe(false);
    expect(cases.Chennai?.methodLabel).toBe(REGIONAL_UNAVAILABLE);
    expect(cases.Chennai?.method).toBe("unavailable");
    expect(cases.London?.error).toBe(REGIONAL_UNAVAILABLE);
    expect(cases.Chennai?.noFavorites).toBe(true);
  });

  it("sends only compatible tags and scores originals with the alternatives", async () => {
    const seen: { path: string; body: Record<string, unknown> }[] = [];
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      const record = body as Record<string, unknown>;
      seen.push({ path, body: record });
      if (path.endsWith("/original")) return { data: { answer: "Read The Hobbit." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      if (path.endsWith("/extract")) return { data: { picks: [{ name: "The Hobbit", quote: "The Hobbit" }] } as T, warnings: [], provenance: {} };
      if (path.endsWith("/search")) return { data: { candidates: [], match: { status: "exact", ambiguous: false, entity: { entityId: book, name: record.name, types: ["urn:entity:book"] } } } as T, warnings: [], provenance: {} };
      if (path.endsWith("/taste")) {
        return {
          data: {
            tags: [
              { tagId: "urn:tag:genre:media:fantasy", name: "Fantasy", namespace: "urn:tag:genre:media", types: ["urn:entity:book"], score: null, compatible: true, explainabilityStatus: "unavailable" },
              { tagId: "urn:tag:genre:place:cafe", name: "Cafe", namespace: "urn:tag:genre:place", types: ["urn:entity:place"], score: 0.4, compatible: false, explainabilityStatus: "unavailable" },
            ],
            locality: { name: record.locationQuery, id: "loc" },
            scoresNumeric: true,
            explainabilityReturned: false,
            demographicEchoed: false,
            parameters: [{ name: "signal.location.query", value: String(record.locationQuery) }],
          } as T,
          warnings: [],
          provenance: {},
        };
      }
      if (path.endsWith("/regional-insights")) {
        const tags = record.tagIds as string[];
        expect(tags).toEqual(["urn:tag:genre:media:fantasy"]);
        expect(tags).not.toContain("urn:tag:genre:place:cafe");
        expect(record.locationQuery).toBeUndefined();
        const entities = record.candidateIds
          ? [{ entityId: book, name: "The Hobbit", types: ["urn:entity:book"], affinity: 0.5, explainability: explain("unavailable"), language: null, tags: [], evidenceOrigin: "unsigned", envelope: null }, { entityId: other, name: "Piranesi", types: ["urn:entity:book"], affinity: 0.7, explainability: explain("available", [{ entityId: seed, name: "Dune", value: 0.2 }]), language: null, tags: [], evidenceOrigin: "unsigned", envelope: null }]
          : [{ entityId: other, name: "Piranesi", types: ["urn:entity:book"], affinity: null, explainability: explain("unavailable"), language: null, tags: [], evidenceOrigin: "unsigned", envelope: null }];
        return { data: { entities, missingIds: [], parameters: [{ name: "signal.interests.tags", value: tags.join(",") }] } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/repair")) return { data: { selections: [{ id: other, reason: "Higher affinity under the derived tags." }], answer: "Revised: Piranesi." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      throw new Error(path);
    };
    const cases: Record<string, Partial<RegionalCityResult>> = {};
    await executeRegional({
      regional: regionalBase(),
      cities: ["Chennai"],
      post,
      signal: new AbortController().signal,
      onCase: (city, patch) => {
        cases[city] = { ...cases[city], ...patch };
      },
    });
    expect(cases.Chennai?.method).toBe("derived");
    expect(cases.Chennai?.methodLabel).toContain("Derived from regional taste profile");
    expect(cases.Chennai?.originalMean).toBeCloseTo(0.5);
    expect(cases.Chennai?.revisedMean).toBeCloseTo(0.6);
    const absent = alignRegionalTags([
      { city: "Chennai", tags: cases.Chennai?.tags ?? [] },
      { city: "London", tags: [] },
    ]);
    const fantasy = absent.find((tag) => tag.name === "Fantasy");
    expect(fantasy?.cells.find((cell) => cell.city === "London")?.status).toBe("not_returned");
    expect(fantasy?.cells.find((cell) => cell.city === "London")?.score).toBeNull();
  });

  it("keeps place destination filters separate from the audience taste query", async () => {
    const seen: { path: string; body: Record<string, unknown> }[] = [];
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      const record = body as Record<string, unknown>;
      seen.push({ path, body: record });
      if (path.endsWith("/original")) return { data: { answer: "Try a quiet cafe." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      if (path.endsWith("/extract")) return { data: { picks: [{ name: "Cafe", quote: "Cafe" }] } as T, warnings: [], provenance: {} };
      if (path.endsWith("/search")) return { data: { candidates: [], match: { status: "unmatched", ambiguous: false, entity: null } } as T, warnings: [], provenance: {} };
      if (path.endsWith("/taste")) return { data: { tags: [], locality: null, scoresNumeric: false, explainabilityReturned: false, demographicEchoed: false, parameters: [] } as T, warnings: [], provenance: {} };
      throw new Error(path);
    };
    await executeRegional({
      regional: {
        ...regionalBase(),
        domain: "place",
        placeMode: "market",
        destination: { label: "Lisbon", query: "Lisbon", entityId: "dest" },
        question: "Recommend three places.",
      },
      cities: ["Chennai"],
      post,
      signal: new AbortController().signal,
      onCase: () => undefined,
    });
    const taste = seen.find((call) => call.path.endsWith("/taste"));
    const task = seen.find((call) => call.path.endsWith("/original"))?.body.task as { city?: string; destination?: string; interests?: unknown[] };
    expect(taste?.body.locationQuery).toBe("Chennai");
    expect(task.city).toBe("Chennai");
    expect(task.destination).toBe("Lisbon");
    expect(task.interests).toEqual([]);
    expect(seen.some((call) => call.path.includes("regional-insights") || call.path.endsWith("/score"))).toBe(false);
  });

  it("keeps a reordered set at the same unweighted mean and isolates city patches", () => {
    expect(meanObserved([0.2, 0.4]).value).toBe(meanObserved([0.4, 0.2]).value);
    let state = createSession();
    const before = configurationHash(hashInput(state));
    state = reducer(state, { type: "regional-replace", regional: { ...state.regional, question: "Recommend three fantasy books." } });
    expect(configurationHash(hashInput(state))).toBe(before);
    state = reducer(state, {
      type: "regional-begin",
      runId: "run-a",
      startedAt: "2026-10-31T00:00:00.000Z",
      cities: ["Chennai", "London"],
    });
    state = reducer(state, { type: "regional-case", city: "Chennai", patch: { phase: "complete", originalMean: 0.4, revisedMean: 0.5 } });
    state = reducer(state, { type: "regional-case", city: "London", patch: { phase: "failed", error: "The provider request failed." } });
    expect(state.regional.cases.Chennai?.phase).toBe("complete");
    state = reducer(state, { type: "regional-case", city: "London", patch: { phase: "complete", originalMean: 0.4 } });
    expect(state.regional.cases.Chennai?.originalMean).toBe(0.4);
    expect(state.regional.cases.London?.phase).toBe("complete");
    const csv = regionalCsv(state.regional);
    expect(csv.split("\n")[0]?.replace("\r", "")).toBe("run_id,city,audience_market,destination,domain,evidence_method,arm,rank,entity_id,name,affinity,identity_status,membership_status,rank_changed,practical_status");
  });

  it("keeps omitted explanation contributions missing and allows negative sensitivity", () => {
    const available = explain("available", [{ entityId: seed, name: "Dune", value: 0.33 }]);
    expect(explanationValue({ name: "Dune", entityId: seed }, available)).toBe(0.33);
    expect(explanationValue({ name: "Radiohead", entityId: other }, available)).toBeNull();
    expect(explanationValue({ name: "Dune", entityId: seed }, explain("unavailable", [{ entityId: seed, name: "Dune", value: 0.33 }]))).toBeNull();
    expect(scaleDomain([null, undefined])).toBeNull();
    expect(leaveOneOutDelta(0.4, 0.7)).toBeCloseTo(-0.3);
    const points = sensitivityPoints({
      interests: [{ name: "Dune", entityId: seed }],
      recommendations: [{ entityId: book, name: "Piranesi" }],
      fullByEntity: new Map([[book, 0.4]]),
      withoutByInterest: new Map([[seed, new Map([[book, 0.7]])]]),
    });
    expect(points[0]?.delta).toBeCloseTo(-0.3);
    expect(leaveOneOutDelta(0.4, null)).toBeNull();
  });
});
