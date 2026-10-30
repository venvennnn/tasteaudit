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

  it("preserves identical book scores when every city sends the same interest-only request", async () => {
    const garden = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    let state = reducer(readyState(), { type: "update", patch: { domain: "book", recommendationCount: 1, cities: ["Chicago", "London"] } });
    const discoverBodies: unknown[] = [];
    const scoreBodies: unknown[] = [];
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      if (path.endsWith("/discover")) discoverBodies.push(body);
      if (path.endsWith("/score")) scoreBodies.push(body);
      if (path.endsWith("/search")) {
        return { data: { candidates: [{ entityId: seed, name: "Dune", types: ["urn:entity:book"] }], match: { status: "exact", ambiguous: false, entity: { entityId: seed, name: "Dune", types: ["urn:entity:book"] } } } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/original")) {
        return { data: { answer: "Read Dune." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      }
      if (path.endsWith("/extract")) {
        return { data: { picks: [{ name: "Dune", quote: "Dune" }] } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/discover")) {
        return { data: { entities: [{ entityId: garden, name: "Quiet Book", types: ["urn:entity:book"] }], geographicSignalApplied: false, locality: null } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/score")) {
        return { data: { entities: [
          { entityId: seed, name: "Dune", types: ["urn:entity:book"], affinity: 0.2, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" },
          { entityId: garden, name: "Quiet Book", types: ["urn:entity:book"], affinity: 0.881, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" },
        ], missingIds: [], geographicSignalApplied: false, locality: null, signing: false } as T, warnings: [], provenance: {} };
      }
      return { data: { selections: [{ id: seed, reason: "Keep Dune." }], answer: "Revised around Dune." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
    };
    await executeRun({
      state,
      cities: ["Chicago", "London"],
      signal: new AbortController().signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(discoverBodies).toHaveLength(1);
    expect(discoverBodies.every((body) => !("locationQuery" in (body as object)))).toBe(true);
    expect(scoreBodies).toHaveLength(2);
    expect(scoreBodies.every((body) => (body as { locationQuery?: string }).locationQuery === undefined)).toBe(true);
    expect(state.cases.Chicago?.discovered).not.toBe(state.cases.London?.discovered);
    expect(state.cases.Chicago?.diagnostic?.requestKey).toBe(state.cases.London?.diagnostic?.requestKey);
    expect(state.cases.Chicago?.diagnostic?.selectedIds).toEqual([garden]);
    expect(state.cases.London?.diagnostic?.selectedIds).toEqual([garden]);
    expect(state.cases.Chicago?.diagnostic?.unroundedRevisedMean).toBe(0.881);
    expect(state.cases.London?.diagnostic?.unroundedRevisedMean).toBe(0.881);
    expect(state.cases.Chicago?.diagnostic?.revisedAffinities).toEqual([{ entityId: garden, affinity: 0.881 }]);
    expect(state.cases.Chicago?.diagnostic?.geographyNote).toBe("Interest-based affinity. City was not applied to Qloo scoring.");
    expect(state.cases.Chicago?.diagnostic?.scoreParameters?.some((row) => row.name === "filter.location.query")).toBe(false);
    expect(state.cases.Chicago?.diagnostic?.locationAccounting?.scoringSignal).toMatch(/No geographic scoring signal/);
  });

  it("records a different locality filter for each place without treating it as a scoring signal", async () => {
    let state = readyState();
    const scored: string[] = [];
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      if (path.endsWith("/score")) scored.push((body as { locationQuery?: string }).locationQuery ?? "");
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
    expect(scored.sort()).toEqual(["Lisbon", "Osaka"]);
    expect(state.cases.Lisbon?.diagnostic?.requestKey).not.toBe(state.cases.Osaka?.diagnostic?.requestKey);
    expect(state.cases.Lisbon?.diagnostic?.scoreParameters?.find((row) => row.name === "filter.location.query")?.value).toBe("Lisbon");
    expect(state.cases.Osaka?.diagnostic?.scoreParameters?.find((row) => row.name === "filter.location.query")?.value).toBe("Osaka");
    expect(state.cases.Lisbon?.diagnostic?.locationAccounting?.scoringSignal).toMatch(/No geographic scoring signal/);
    expect(state.cases.Lisbon?.scores).not.toBe(state.cases.Osaka?.scores);
  });

  it("shares a book request for the same interests and separates a different reader", async () => {
    const dune = "33333333-3333-3333-3333-333333333333";
    const neuro = "44444444-4444-4444-4444-444444444444";
    const found = "55555555-5555-5555-5555-555555555555";
    const base = createSession();
    let state = reducer(base, {
      type: "update",
      patch: {
        domain: "book",
        comparison: "readers",
        recommendationCount: 1,
        taskQuestion: "Recommend one book for my interests.",
        cities: ["Ada", "Ben", "Chi"],
        readers: [
          { label: "Ada", favorites: [{ name: "Dune", kind: "book" }] },
          { label: "Ben", favorites: [{ name: "Dune", kind: "book" }] },
          { label: "Chi", favorites: [{ name: "Neuromancer", kind: "book" }] },
        ],
        profile: { ...base.profile, age: "34", favorites: [{ name: "Dune", kind: "book" }] },
      },
    });
    const discoverBodies: { seedIds?: string[]; locationQuery?: string }[] = [];
    const post = async <T,>(path: string, body: unknown): Promise<{ data: T; warnings: string[]; provenance: Record<string, unknown> }> => {
      const record = body as { name?: string; seedIds?: string[]; locationQuery?: string };
      if (path.endsWith("/search")) {
        const id = record.name === "Neuromancer" ? neuro : dune;
        return { data: { candidates: [{ entityId: id, name: record.name, types: ["urn:entity:book"] }], match: { status: "exact", ambiguous: false, entity: { entityId: id, name: record.name, types: ["urn:entity:book"] } } } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/original")) return { data: { answer: "Read Dune." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
      if (path.endsWith("/extract")) return { data: { picks: [{ name: "Dune", quote: "Dune" }] } as T, warnings: [], provenance: {} };
      if (path.endsWith("/discover")) {
        discoverBodies.push({ seedIds: record.seedIds, locationQuery: record.locationQuery });
        return { data: { entities: [{ entityId: found, name: "Quiet Book", types: ["urn:entity:book"] }], geographicSignalApplied: false, locality: null } as T, warnings: [], provenance: {} };
      }
      if (path.endsWith("/score")) {
        const readerSeed = record.seedIds?.[0];
        const discoveredAffinity = readerSeed === neuro ? 0.2 : 0.7;
        return { data: { entities: [
          { entityId: dune, name: "Dune", types: ["urn:entity:book"], affinity: 0.1, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" },
          { entityId: found, name: "Quiet Book", types: ["urn:entity:book"], affinity: discoveredAffinity, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, description: null, tags: [], envelope: null, evidenceOrigin: "unsigned" },
        ], missingIds: [], geographicSignalApplied: false, locality: null, signing: false } as T, warnings: [], provenance: {} };
      }
      return { data: { selections: [{ id: found, reason: "Selected from the returned score." }], answer: "Revised around Quiet Book." } as T, warnings: [], provenance: { requestedModel: "gemini-test" } };
    };
    await executeRun({
      state,
      cities: ["Ada", "Ben", "Chi"],
      signal: new AbortController().signal,
      post,
      onSeeds: (seeds, stage) => { state = reducer(state, { type: "seeds", seeds, stage }); },
      onCase: (city, patch) => { state = reducer(state, { type: "patch-case", city, patch }); },
    });
    expect(discoverBodies).toHaveLength(2);
    expect(discoverBodies.every((body) => body.locationQuery === undefined)).toBe(true);
    expect(state.cases.Ada?.diagnostic?.requestKey).toBe(state.cases.Ben?.diagnostic?.requestKey);
    expect(state.cases.Chi?.diagnostic?.requestKey).not.toBe(state.cases.Ada?.diagnostic?.requestKey);
    expect(state.cases.Ada?.diagnostic?.unroundedRevisedMean).toBe(0.7);
    expect(state.cases.Ben?.diagnostic?.unroundedRevisedMean).toBe(0.7);
    expect(state.cases.Chi?.diagnostic?.unroundedRevisedMean).toBe(0.2);
    expect(state.cases.Ada?.diagnostic?.geographyNote).toBe("Interest-based affinity. City was not applied to Qloo scoring.");
    expect(state.cases.Ada?.diagnostic?.locationAccounting?.scoringSignal).toMatch(/No geographic scoring signal/);
    expect(state.cases.Ada?.diagnostic?.locationAccounting?.gemini).toMatch(/No city was sent to Qloo/);
    expect(state.cases.Ada?.revisedPrompt).not.toMatch(/not authenticated/i);
    expect(state.cases.Ada?.revisedPrompt).toMatch(/Qloo affinity returned/);
    expect(state.cases.Ada?.revisedPrompt).toMatch(/Price, edition and stock unverified/);
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
