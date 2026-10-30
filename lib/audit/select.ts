import { ENTITY_ID_PATTERN } from "@/lib/schemas/limits";

export type Selectable = {
  entityId: string;
  name: string;
  affinity: number | null;
  sources: Array<"original" | "refined" | "discovered">;
  group?: string | null;
  hardExcluded: boolean;
  exclusionReason: string | null;
};

export type RankedName = {
  entityId: string;
  name: string;
  fromRank: number;
  toRank: number;
};

export type NamedChange = {
  entityId: string;
  name: string;
  reason: string;
};

export type RemovedName = {
  entityId: string;
  name: string;
  rank: number;
};

export type SelectionDiff = {
  retained: RankedName[];
  added: NamedChange[];
  removed: RemovedName[];
  reordered: boolean;
  sameSet: boolean;
  sameOrder: boolean;
  replacementCount: number;
  retainedCount: number;
  summary: string;
};

export type Chosen = Selectable & { policyReason: string; rank: number };

export type SelectionResult = {
  selected: Chosen[];
  eligibleIds: string[];
  exclusions: { entityId: string; name: string; reason: string }[];
  diff: SelectionDiff;
};

const VARIETY_GAP = 0.03;

function idOf(value: string): string {
  return value.trim().toLowerCase();
}

function validId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value.trim());
}

function affinityRank(value: number | null): number {
  return value === null || !Number.isFinite(value) ? Number.NEGATIVE_INFINITY : value;
}

export function selectRevised(input: {
  candidates: Selectable[];
  originalIds: string[];
  count: number;
  comparable?: boolean;
}): SelectionResult {
  const byId = new Map<string, Selectable>();
  for (const candidate of input.candidates) {
    if (!validId(candidate.entityId)) continue;
    const key = idOf(candidate.entityId);
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, { ...candidate, entityId: candidate.entityId.trim(), sources: [...candidate.sources] });
      continue;
    }
    existing.sources = [...new Set([...existing.sources, ...candidate.sources])];
    if (!existing.name && candidate.name) existing.name = candidate.name;
    if (existing.affinity === null && candidate.affinity !== null) existing.affinity = candidate.affinity;
    if (!existing.group && candidate.group) existing.group = candidate.group;
    if (candidate.hardExcluded) {
      existing.hardExcluded = true;
      existing.exclusionReason = existing.exclusionReason ?? candidate.exclusionReason;
    }
  }

  const originalOrder = input.originalIds.filter(validId).map((entityId) => entityId.trim());
  const originalIndex = new Map(originalOrder.map((entityId, index) => [idOf(entityId), index]));
  const exclusions = [...byId.values()]
    .filter((item) => item.hardExcluded)
    .map((item) => ({ entityId: item.entityId, name: item.name, reason: item.exclusionReason || "A verified constraint failed." }));
  const eligible = [...byId.values()]
    .filter((item) => !item.hardExcluded)
    .sort((a, b) => {
      const delta = affinityRank(b.affinity) - affinityRank(a.affinity);
      if (delta !== 0) return delta;
      const ao = originalIndex.get(idOf(a.entityId));
      const bo = originalIndex.get(idOf(b.entityId));
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      if (ao != null && bo == null) return -1;
      if (ao == null && bo != null) return 1;
      return a.name.localeCompare(b.name);
    });
  const limit = Math.max(0, input.count);
  let picked = eligible.slice(0, limit);
  picked = applyVariety(picked, eligible);
  const names = new Map([...byId.values()].map((item) => [idOf(item.entityId), item.name]));
  for (const entityId of originalOrder) {
    if (!names.has(idOf(entityId))) names.set(idOf(entityId), entityId);
  }
  const selected = picked.map((item, index) => ({
    ...item,
    rank: index + 1,
    policyReason: "",
  }));
  const diff = describeDiff({
    original: originalOrder.map((entityId) => ({ entityId, name: names.get(idOf(entityId)) || entityId })),
    selected: selected.map((item) => ({ entityId: item.entityId, name: item.name })),
    newCandidateCount: [...byId.values()].filter((item) => item.sources.includes("discovered") && !item.sources.includes("original") && !originalIndex.has(idOf(item.entityId))).length,
    comparable: input.comparable !== false && (selected.some((item) => item.affinity !== null) || originalOrder.some((entityId) => byId.get(idOf(entityId))?.affinity != null)),
  });
  for (const item of selected) {
    const added = diff.added.find((row) => idOf(row.entityId) === idOf(item.entityId));
    const score = item.affinity === null || !Number.isFinite(item.affinity) ? "No affinity was returned for this name." : `Observed affinity ${item.affinity.toFixed(3)}.`;
    item.policyReason = added
      ? `${added.reason} ${score}`
      : `Kept from the original list. ${score} It is rank ${item.rank} of ${selected.length} selected names.`;
  }
  for (const added of diff.added) {
    const match = selected.find((item) => idOf(item.entityId) === idOf(added.entityId));
    if (match) added.reason = match.policyReason;
  }
  return {
    selected,
    eligibleIds: eligible.map((item) => item.entityId),
    exclusions,
    diff,
  };
}

function applyVariety(picked: Selectable[], eligible: Selectable[]): Selectable[] {
  if (picked.length < 2) return picked;
  const groups = picked.map((item) => item.group?.trim().toLowerCase() || "");
  const duplicateAt = picked.findIndex((item, index) => {
    const group = groups[index];
    return Boolean(group) && groups.indexOf(group) !== index;
  });
  if (duplicateAt < 0) return picked;
  const floor = picked[picked.length - 1]?.affinity;
  if (floor === null || floor === undefined || !Number.isFinite(floor)) return picked;
  const chosen = new Set(picked.map((item) => idOf(item.entityId)));
  const alternative = eligible.find((item) => {
    if (chosen.has(idOf(item.entityId))) return false;
    const group = item.group?.trim().toLowerCase() || "";
    if (!group || groups.includes(group)) return false;
    if (item.affinity === null || !Number.isFinite(item.affinity)) return false;
    return item.affinity >= floor - VARIETY_GAP;
  });
  if (!alternative) return picked;
  const next = [...picked];
  next[duplicateAt] = alternative;
  return next;
}

export function describeDiff(input: {
  original: { entityId: string; name: string }[];
  selected: { entityId: string; name: string }[];
  newCandidateCount: number;
  comparable: boolean;
}): SelectionDiff {
  const original = dedupeNamed(input.original);
  const selected = dedupeNamed(input.selected);
  const originalRank = new Map(original.map((item, index) => [idOf(item.entityId), index + 1]));
  const selectedRank = new Map(selected.map((item, index) => [idOf(item.entityId), index + 1]));
  const retained: RankedName[] = [];
  for (const item of selected) {
    const fromRank = originalRank.get(idOf(item.entityId));
    if (fromRank == null) continue;
    retained.push({ entityId: item.entityId, name: item.name, fromRank, toRank: selectedRank.get(idOf(item.entityId)) ?? 0 });
  }
  const added: NamedChange[] = selected
    .filter((item) => !originalRank.has(idOf(item.entityId)))
    .map((item) => {
      const displaced = original.find((row) => !selectedRank.has(idOf(row.entityId)));
      const reason = displaced
        ? `Selected from discovered candidates ahead of ${displaced.name}.`
        : "Selected from discovered candidates.";
      return { entityId: item.entityId, name: item.name, reason };
    });
  const removed: RemovedName[] = original
    .filter((item) => !selectedRank.has(idOf(item.entityId)))
    .map((item) => ({ entityId: item.entityId, name: item.name, rank: originalRank.get(idOf(item.entityId)) ?? 0 }));
  const sameSet = added.length === 0 && removed.length === 0 && original.length > 0 && selected.length === original.length;
  const sameOrder = sameSet && retained.every((item) => item.fromRank === item.toRank);
  const reordered = sameSet && !sameOrder;
  let summary = "No recommendation changes.";
  if (!input.comparable) summary = "Insufficient evidence to compare.";
  else if (original.length === 0 && selected.length === 0) summary = "Insufficient evidence to compare.";
  else if (reordered) summary = "Same recommendations; order changed.";
  else if (added.length > 0 || removed.length > 0) summary = "Recommendations changed.";
  else if (input.newCandidateCount === 0) summary = "No eligible alternatives found.";
  else if (sameOrder || (added.length === 0 && removed.length === 0)) summary = "No recommendation changes.";
  return {
    retained,
    added,
    removed,
    reordered,
    sameSet,
    sameOrder,
    replacementCount: added.length,
    retainedCount: retained.length,
    summary,
  };
}

function dedupeNamed(items: { entityId: string; name: string }[]): { entityId: string; name: string }[] {
  const seen = new Set<string>();
  const rows: { entityId: string; name: string }[] = [];
  for (const item of items) {
    if (!validId(item.entityId)) continue;
    const key = idOf(item.entityId);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ entityId: item.entityId.trim(), name: item.name });
  }
  return rows;
}
