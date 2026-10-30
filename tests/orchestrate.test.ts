import { describe, expect, it } from "vitest";
import { executeRun } from "@/lib/audit/orchestrate";
import { recommendationsCsv } from "@/lib/exports/run";
import { createSession, reducer, type SessionState } from "@/lib/session/state";
import { DEMO_PRESETS } from "@/lib/session/presets";

const seed = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const place = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function readyState(): SessionState {
  let state = createSession();
  state = reducer(state, { type: "update", patch: { ...DEMO_PRESETS.concierge, seedOverrides: {} } });
  return state;
}

describe("orchestration", () => {
  it("retries the failed score without repeating the original answer", async () => {
    const calls: string[] = [];
    let scores = 0;
    const post = async <T,>(path: string): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      calls.push(path);
      if (path.endsWith("/search")) {
        return { data: { candidates: [{ entityId: seed, name: "Dune", types: ["urn:entity:book"] }], match: { status: "exact", ambiguous: false, entity: { entityId: seed, name: "Dune", types: ["urn:entity:book"] } } } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/original")) {
        return { data: { answer: "Visit Miradouro da Senhora do Monte tonight." } as T, warnings: [], provenance: { requestedModel: "gemini-test", model: "gemini-test", temperature: 0.4, topP: 0.9, systemPromptVersion: "test" } };
      }
      if (path.endsWith("/extract")) {
        return { data: { picks: [{ name: "Miradouro da Senhora do Monte", quote: "Miradouro da Senhora do Monte" }] } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      }
      if (path.endsWith("/discover")) {
        return { data: { entities: [{ entityId: place, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"] }], geographicSignalApplied: true, locality: { name: "Lisbon", id: null, latitude: 38.7, longitude: -9.1 } } as T, warnings: [], provenance: { retrievedAt: "2026-10-30T00:00:00.000Z" } };
      }
      if (path.endsWith("/score")) {
        scores += 1;
        if (scores === 1) throw { code: "upstream", message: "The provider request failed.", retryable: true, requestId: "r", stage: "qloo.score" };
        return { data: { entities: [{ entityId: place, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"], affinity: 0.5, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" }], missingIds: [], geographicSignalApplied: true, locality: null, signing: false } as T, warnings: [], provenance: { retrievedAt: "2026-10-30T00:00:00.000Z" } };
      }
      return { data: { selections: [{ id: place, reason: "It fits the evening plan." }], answer: "Revised: Miradouro da Senhora do Monte." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
    };
    let state = readyState();
    const signal = new AbortController().signal;
    await executeRun({
      state,
      cities: ["Lisbon"],
      signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(state.cases.Lisbon?.stages.score.status).toBe("failed");
    expect(state.cases.Lisbon?.originalAnswer).toMatch(/Miradouro/);
    const before = calls.filter((path) => path.endsWith("/original")).length;
    await executeRun({
      state,
      cities: ["Lisbon"],
      signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(calls.filter((path) => path.endsWith("/original")).length).toBe(before);
    expect(state.cases.Lisbon?.revisedAnswer).toMatch(/Revised/);
  });

  it("stops when the run is cancelled", async () => {
    const controller = new AbortController();
    const post = async () => {
      controller.abort();
      throw { code: "aborted", message: "The run was cancelled.", retryable: true, requestId: "" };
    };
    let state = readyState();
    await executeRun({
      state,
      cities: ["Lisbon"],
      signal: controller.signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: () => undefined,
    });
    expect(state.seeds).toEqual([]);
  });

  it("selects a higher-affinity discovery when the writer returns the original id", async () => {
    const garden = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    let state = reducer(readyState(), { type: "update", patch: { recommendationCount: 1 } });
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      if (path.endsWith("/search")) {
        const name = (body as { name?: string }).name ?? "";
        const entity = name === "Miradouro da Senhora do Monte"
          ? { entityId: seed, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"] }
          : { entityId: seed, name: "Dune", types: ["urn:entity:book"] };
        return { data: { candidates: [entity], match: { status: "exact", ambiguous: false, entity } } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/original")) {
        return { data: { answer: "Visit Miradouro da Senhora do Monte tonight." } as T, warnings: [], provenance: { requestedModel: "gemini-test", model: "gemini-test", temperature: null, topP: null, systemPromptVersion: "test" } };
      }
      if (path.endsWith("/extract")) {
        return { data: { picks: [{ name: "Miradouro da Senhora do Monte", quote: "Miradouro da Senhora do Monte" }] } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/discover")) {
        return { data: { entities: [{ entityId: garden, name: "Quiet Garden", types: ["urn:entity:place"] }], geographicSignalApplied: true, locality: { name: "Lisbon", id: null, latitude: 38.7, longitude: -9.1 } } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/score")) {
        return { data: { entities: [
          { entityId: seed, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"], affinity: 0.2, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" },
          { entityId: garden, name: "Quiet Garden", types: ["urn:entity:place"], affinity: 0.9, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" },
        ], missingIds: [], geographicSignalApplied: true, locality: null, signing: false } as T, warnings: [], provenance: {} };
      }
      return { data: { selections: [{ id: seed, reason: "Keep the original name." }], answer: "Revised around the original." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
    };
    await executeRun({
      state,
      cities: ["Lisbon"],
      signal: new AbortController().signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(state.cases.Lisbon?.diagnostic?.selectedIds).toEqual([garden]);
    expect(state.cases.Lisbon?.diagnostic?.newCandidateCount).toBe(1);
    expect(state.cases.Lisbon?.diagnostic?.replacementCount).toBe(1);
    expect(state.cases.Lisbon?.revisedSelections.map((item) => item.id)).toEqual([garden]);
    expect(state.cases.Lisbon?.warnings.join(" ")).toMatch(/different set/);
    const csv = recommendationsCsv(state);
    expect(csv.split("\n")[0]?.replace("\r", "")).toBe("run_id,city,scenario,arm,rank,entity_id,name,affinity,identity_status,membership_status,rank_changed,explanation,geography_applied,practical_verification_status");
    expect(csv).toContain("Original Gemini");
    expect(csv).toContain("Qloo-assisted Gemini");
    expect(csv).toContain(seed);
    expect(csv).toContain(garden);
    expect(csv).toContain("true");
  });

  it("lets one city fail while another completes", async () => {
    let state = readyState();
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      if (path.endsWith("/score") && (body as { locationQuery?: string }).locationQuery === "Osaka") {
        throw { code: "upstream", message: "The provider request failed.", retryable: true, requestId: "osaka", stage: "qloo.score" };
      }
      return sharedOk<T>(path);
    };
    await executeRun({
      state,
      cities: ["Lisbon", "Osaka"],
      signal: new AbortController().signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(state.cases.Lisbon?.phase).toBe("complete");
    expect(state.cases.Osaka?.phase).toBe("failed");
    expect(state.cases.Lisbon?.revisedAnswer).toMatch(/Revised/);
  });

  it("ignores a stale city from an older run", async () => {
    let state = reducer(readyState(), { type: "begin-run", runId: "run-a", cities: ["Lisbon", "Osaka"] });
    await executeRun({
      state,
      cities: ["Lisbon", "Osaka"],
      signal: new AbortController().signal,
      post: async <T,>(path: string) => sharedOk<T>(path),
      isCurrent: (city) => city === "Lisbon",
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(state.cases.Lisbon?.phase).toBe("complete");
    expect(state.cases.Osaka?.phase).toBe("queued");
    expect(state.cases.Osaka?.originalAnswer).toBeNull();
  });
});

function sharedOk<T>(path: string): { data: T; warnings: string[]; provenance: Record<string, unknown> } {
  if (path.endsWith("/search")) {
    return { data: { candidates: [{ entityId: seed, name: "Dune", types: ["urn:entity:book"] }], match: { status: "exact", ambiguous: false, entity: { entityId: seed, name: "Dune", types: ["urn:entity:book"] } } } as T, warnings: [], provenance: {} };
  }
  if (path.endsWith("/original")) {
    return { data: { answer: "Visit Miradouro da Senhora do Monte tonight." } as T, warnings: [], provenance: { requestedModel: "gemini-test", model: "gemini-test", temperature: 0.4, topP: 0.9, systemPromptVersion: "test" } };
  }
  if (path.endsWith("/extract")) {
    return { data: { picks: [{ name: "Miradouro da Senhora do Monte", quote: "Miradouro da Senhora do Monte" }] } as T, warnings: [], provenance: {} };
  }
  if (path.endsWith("/discover")) {
    return { data: { entities: [{ entityId: place, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"] }], geographicSignalApplied: true, locality: { name: "Lisbon", id: null, latitude: 38.7, longitude: -9.1 } } as T, warnings: [], provenance: {} };
  }
  if (path.endsWith("/score")) {
    return { data: { entities: [{ entityId: place, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"], affinity: 0.5, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" }], missingIds: [], geographicSignalApplied: true, locality: null, signing: false } as T, warnings: [], provenance: {} };
  }
  return { data: { selections: [{ id: place, reason: "It fits the evening plan." }], answer: "Revised: Miradouro da Senhora do Monte." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
}
