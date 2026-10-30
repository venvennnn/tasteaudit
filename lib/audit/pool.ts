export type PoolSource = "original" | "refined" | "discovered";

export type PoolCandidate = {
  entityId: string;
  name: string;
  types: string[];
  sources: PoolSource[];
  matchStatus?: "exact" | "provisional" | "unmatched";
};

export function dedupeCandidates(items: PoolCandidate[], cap: number): { pool: PoolCandidate[]; truncated: boolean } {
  const byId = new Map<string, PoolCandidate>();
  const rank: Record<PoolSource, number> = { original: 0, refined: 1, discovered: 2 };
  const sorted = [...items].sort((a, b) => {
    const as = Math.min(...a.sources.map((source) => rank[source]));
    const bs = Math.min(...b.sources.map((source) => rank[source]));
    return as - bs;
  });
  for (const item of sorted) {
    const existing = byId.get(item.entityId);
    if (!existing) {
      byId.set(item.entityId, { ...item, sources: [...new Set(item.sources)] });
      continue;
    }
    existing.sources = [...new Set([...existing.sources, ...item.sources])];
    if (!existing.name && item.name) existing.name = item.name;
    if (existing.types.length === 0) existing.types = item.types;
  }
  const pool = [...byId.values()];
  if (pool.length <= cap) return { pool, truncated: false };
  const required = pool.filter((item) => item.sources.some((source) => source !== "discovered"));
  const discovered = pool.filter((item) => item.sources.every((source) => source === "discovered"));
  const room = Math.max(0, cap - required.length);
  return { pool: [...required, ...discovered.slice(0, room)].slice(0, cap), truncated: true };
}
