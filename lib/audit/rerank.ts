export type Rankable = {
  entityId: string;
  name: string;
  affinity: number | null;
};

export type RerankResult = {
  ordered: Rankable[];
  lengthChanged: boolean;
  note: string;
  meanBefore: number | null;
  meanAfter: number | null;
};

function mean(items: Rankable[]): number | null {
  const present = items.map((item) => item.affinity).filter((value): value is number => typeof value === "number");
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

export function rerankOriginal(items: Rankable[], selectCount?: number): RerankResult {
  const ordered = [...items].sort((a, b) => {
    if (a.affinity === null && b.affinity === null) return 0;
    if (a.affinity === null) return 1;
    if (b.affinity === null) return -1;
    return b.affinity - a.affinity;
  });
  const meanBefore = mean(items);
  const meanFull = mean(ordered);
  const limit = selectCount && selectCount > 0 && selectCount < ordered.length ? selectCount : ordered.length;
  const selected = ordered.slice(0, limit);
  const lengthChanged = selected.length !== items.length;
  const note = lengthChanged
    ? `Reranking kept the same scored set and then selected ${selected.length} of ${items.length}. The shorter list can change the mean. Reordering alone does not.`
    : "Reranking changes order only. It does not change the mean affinity of this complete set.";
  return {
    ordered: selected,
    lengthChanged,
    note,
    meanBefore,
    meanAfter: lengthChanged ? mean(selected) : meanFull,
  };
}
