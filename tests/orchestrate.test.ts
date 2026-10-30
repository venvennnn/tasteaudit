import { describe, expect, it } from "vitest";
import { executeRun } from "@/lib/audit/orchestrate";
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
});
