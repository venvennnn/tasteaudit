import { describe, expect, it } from "vitest";
import { affinityDelta, meanObserved } from "@/lib/audit/metrics";
import { geographyNote } from "@/lib/audit/geography";
import { selectRevised, type Selectable } from "@/lib/audit/select";
import { DEMO_BOOK_CITIES, DEMO_PLACE_CITIES } from "@/lib/session/presets";

const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const d = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function row(partial: Partial<Selectable> & Pick<Selectable, "entityId" | "name" | "affinity" | "sources">): Selectable {
  return { group: null, hardExcluded: false, exclusionReason: null, ...partial };
}

describe("selection policy", () => {
  it("keeps a reordered set as zero replacements with the same mean", () => {
    const result = selectRevised({
      count: 2,
      originalIds: [a, b],
      candidates: [
        row({ entityId: a, name: "Low", affinity: 0.2, sources: ["original"] }),
        row({ entityId: b, name: "High", affinity: 0.8, sources: ["original"] }),
      ],
    });
    expect(result.selected.map((item) => item.entityId)).toEqual([b, a]);
    expect(result.diff.replacementCount).toBe(0);
    expect(result.diff.summary).toBe("Same recommendations; order changed.");
    const before = meanObserved([0.2, 0.8]);
    const after = meanObserved(result.selected.map((item) => item.affinity));
    expect(after.value).toBe(before.value);
    expect(affinityDelta(before.value, after.value)).toBe(0);
  });

  it("replaces a lower original with a discovered candidate", () => {
    const result = selectRevised({
      count: 2,
      originalIds: [a, b],
      candidates: [
        row({ entityId: a, name: "Quiet", affinity: 0.2, sources: ["original"] }),
        row({ entityId: b, name: "Kept", affinity: 0.55, sources: ["original"] }),
        row({ entityId: c, name: "Found", affinity: 0.9, sources: ["discovered"] }),
      ],
    });
    expect(result.selected.map((item) => item.entityId)).toEqual([c, b]);
    expect(result.diff.added.map((item) => item.entityId)).toEqual([c]);
    expect(result.diff.removed.map((item) => item.entityId)).toEqual([a]);
    expect(result.diff.replacementCount).toBe(1);
    expect(result.diff.summary).toBe("Recommendations changed.");
    const before = meanObserved([0.2, 0.55]).value;
    const after = meanObserved([0.9, 0.55]).value;
    expect(affinityDelta(before, after)).toBeGreaterThan(0);
  });

  it("leaves missing affinity out of the mean and reports partial coverage", () => {
    const values = meanObserved([0.4, null]);
    expect(values).toEqual({ value: 0.4, numerator: 1, denominator: 2 });
    expect(affinityDelta(0.4, 0.4)).toBe(0);
    expect(affinityDelta(0.8, 0.2)).toBeCloseTo(-0.6);
  });

  it("drops duplicate and invalid ids and can select a new candidate", () => {
    const result = selectRevised({
      count: 1,
      originalIds: [a, a, "not-an-id"],
      candidates: [
        row({ entityId: a, name: "Original", affinity: 0.2, sources: ["original"] }),
        row({ entityId: a, name: "Original again", affinity: 0.2, sources: ["discovered"] }),
        row({ entityId: "bad", name: "Bad", affinity: 0.99, sources: ["discovered"] }),
        row({ entityId: c, name: "New", affinity: 0.7, sources: ["discovered"] }),
      ],
    });
    expect(result.eligibleIds).toEqual([c, a]);
    expect(result.selected.map((item) => item.entityId)).toEqual([c]);
    expect(result.diff.added).toHaveLength(1);
  });

  it("does not call a failed city comparable and labels book geography", () => {
    const result = selectRevised({
      count: 1,
      originalIds: [a],
      comparable: false,
      candidates: [row({ entityId: a, name: "Dune", affinity: null, sources: ["original"] })],
    });
    expect(result.diff.summary).toBe("Insufficient evidence to compare.");
    expect(geographyNote("book", false)).toBe("Interest-based affinity; city not applied to Qloo scoring.");
    expect(geographyNote("place", true)).toMatch(/Nearby venue filter/);
    expect(DEMO_PLACE_CITIES).toHaveLength(4);
    expect(DEMO_BOOK_CITIES).toHaveLength(4);
  });

  it("excludes a verified conflict without inventing a replacement", () => {
    const result = selectRevised({
      count: 1,
      originalIds: [a],
      candidates: [
        row({ entityId: a, name: "Horror", affinity: 0.95, sources: ["original"], hardExcluded: true, exclusionReason: "Tag matches horror." }),
        row({ entityId: d, name: "Essay", affinity: 0.4, sources: ["discovered"] }),
      ],
    });
    expect(result.exclusions.map((item) => item.entityId)).toEqual([a]);
    expect(result.selected.map((item) => item.entityId)).toEqual([d]);
    expect(affinityDelta(0.95, 0.4)).toBeLessThan(0);
  });
});
