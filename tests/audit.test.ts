import { describe, expect, it } from "vitest";
import { ageToSupportedBand } from "@/lib/audit/age";
import { configurationHash } from "@/lib/audit/hash";
import { chooseMatch } from "@/lib/audit/match";
import { buildCaseMetrics, meanObserved } from "@/lib/audit/metrics";
import { dedupeCandidates } from "@/lib/audit/pool";
import { validateQuotes } from "@/lib/audit/quotes";
import { validateRepairSelections } from "@/lib/audit/repair";
import { rerankOriginal } from "@/lib/audit/rerank";
import { normalizeTags, parseExplainability } from "@/lib/providers/qloo";
import { escapeCsvCell, toCsv } from "@/lib/exports/csv";
import { createSession, hashInput, reducer } from "@/lib/session/state";

const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const other = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("entity resolution", () => {
  it("treats null tags as an empty array", () => {
    expect(normalizeTags(null)).toEqual([]);
    expect(normalizeTags({ name: "Horror" })).toEqual([]);
  });

  it("keeps an exact type-compatible name and marks other names provisional", () => {
    const candidates = [
      { entityId: other, name: "Dune Messiah", types: ["urn:entity:book"] },
      { entityId: id, name: "Dune", types: ["urn:entity:book"] },
    ];
    expect(chooseMatch("Dune", candidates, ["urn:entity:book"]).status).toBe("exact");
    expect(chooseMatch("Dune", candidates, ["urn:entity:book"]).entity?.entityId).toBe(id);
  });

  it("does not select a type mismatch and leaves the name unmatched", () => {
    const decision = chooseMatch("Dune", [{ entityId: id, name: "Dune", types: ["urn:entity:place"] }], ["urn:entity:book"]);
    expect(decision).toMatchObject({ status: "unmatched", entity: null });
  });

  it("provisionally selects the first type-compatible candidate", () => {
    const decision = chooseMatch("Radio Head", [
      { entityId: id, name: "Radiohead", types: ["urn:entity:artist"] },
      { entityId: other, name: "The Radioheads", types: ["urn:entity:artist"] },
    ], ["urn:entity:artist"]);
    expect(decision.status).toBe("provisional");
    expect(decision.ambiguous).toBe(true);
    expect(decision.entity?.entityId).toBe(id);
  });

  it("rejects invalid ids in repair and drops duplicates", () => {
    const result = validateRepairSelections(
      [
        { id: "not-an-id", reason: "no" },
        { id, reason: "fits the stated interests" },
        { id, reason: "again" },
        { id: other, reason: "also fits" },
      ],
      [id],
      3,
    );
    expect(result.accepted.map((item) => item.id)).toEqual([id]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("evidence and metrics", () => {
  it("marks missing explainability unavailable", () => {
    expect(parseExplainability(undefined).status).toBe("unavailable");
    expect(parseExplainability({ warning: "not computed" }).contributions).toEqual([]);
    const parsed = parseExplainability({ entities: [{ entity_id: id, name: "Dune", score: 0.42 }] });
    expect(parsed.status).toBe("available");
    expect(parsed.contributions[0]?.value).toBe(0.42);
  });

  it("does not treat a missing score as zero", () => {
    const mean = meanObserved([0.5, null]);
    expect(mean.value).toBe(0.5);
    expect(mean).toMatchObject({ numerator: 1, denominator: 2 });
  });

  it("dedupes the shared pool and keeps original picks ahead of discovery overflow", () => {
    const result = dedupeCandidates([
      { entityId: id, name: "A", types: [], sources: ["discovered"] },
      { entityId: id, name: "A", types: [], sources: ["original"] },
      { entityId: other, name: "B", types: [], sources: ["discovered"] },
    ], 1);
    expect(result.pool.map((item) => item.entityId)).toEqual([id]);
    expect(result.pool[0]?.sources).toContain("original");
    expect(result.truncated).toBe(true);
  });

  it("reports coverage denominators and does not invent a mean when scores are missing", () => {
    const metrics = buildCaseMetrics({
      favorites: 3,
      resolvedSeeds: 2,
      extracted: 3,
      resolvedPicks: 1,
      poolAffinities: [0.2, null, null],
      armAffinities: [null],
      originalIds: [id],
      revisedIds: [],
      constraintsKnown: 1,
      constraintsTotal: 6,
      comparabilityLimited: false,
    });
    expect(metrics.entityResolution).toEqual({ numerator: 2, denominator: 3 });
    expect(metrics.scoreCoverage).toEqual({ numerator: 1, denominator: 3 });
    expect(metrics.meanObservedAffinity.value).toBeNull();
    expect(metrics.retention).toEqual({ numerator: 0, denominator: 1 });
    expect(metrics.constraintCoverage).toEqual({ numerator: 1, denominator: 6 });
  });

  it("reorders without changing the mean of the complete set", () => {
    const items = [
      { entityId: id, name: "Low", affinity: 0.2 },
      { entityId: other, name: "High", affinity: 0.8 },
    ];
    const reranked = rerankOriginal(items);
    expect(reranked.ordered.map((item) => item.entityId)).toEqual([other, id]);
    expect(reranked.meanBefore).toBe(reranked.meanAfter);
    expect(reranked.lengthChanged).toBe(false);
    const shorter = rerankOriginal(items, 1);
    expect(shorter.lengthChanged).toBe(true);
    expect(shorter.note).toMatch(/shorter list/i);
  });

  it("maps only documented age bands", () => {
    expect(ageToSupportedBand(24)).toBe("24_and_younger");
    expect(ageToSupportedBand(25)).toBe("25_to_29");
    expect(ageToSupportedBand(55)).toBe("55_and_older");
    expect(ageToSupportedBand(null)).toBeNull();
    expect(ageToSupportedBand(121)).toBeNull();
  });
});

describe("quotes, invalidation, and csv", () => {
  it("accepts only exact quotations", () => {
    const answer = "I recommend Dune for the desert politics.";
    const result = validateQuotes(answer, [
      { name: "Dune", quote: "recommend Dune" },
      { name: "Foundation", quote: "Foundation" },
    ], 3);
    expect(result.accepted).toEqual([{ name: "Dune", quote: "recommend Dune" }]);
  });

  it("changes the configuration hash and clears dependent results", () => {
    let state = createSession();
    state = reducer(state, { type: "patch-case", city: "Lisbon", patch: { originalAnswer: "A night market." } });
    expect(state.cases.Lisbon?.originalAnswer).toBe("A night market.");
    const before = state.configHash;
    state = reducer(state, { type: "update", patch: { profile: { ...state.profile, requirements: "No loud nightclubs." } } });
    expect(state.configHash).not.toBe(before);
    expect(state.cases.Lisbon).toBeUndefined();
    expect(configurationHash(hashInput(state))).toBe(state.configHash);
  });

  it("escapes commas, quotes, and spreadsheet formulas", () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell("hello, \"friend\"")).toBe('"hello, ""friend"""');
    const csv = toCsv(["Note"], [["@cmd"], ["line\nbreak"]]);
    expect(csv).toContain("'@cmd");
    expect(csv).toContain('"line\nbreak"');
  });
});
