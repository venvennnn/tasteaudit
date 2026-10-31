import type { Explainability } from "@/lib/providers/qloo";

export type InterestRef = { name: string; entityId: string | null };

export function explanationValue(interest: InterestRef, explainability: Explainability | null | undefined): number | null {
  if (!explainability || explainability.status !== "available") return null;
  const id = interest.entityId?.trim().toLowerCase();
  const named = interest.name.trim().toLowerCase();
  const byId = id
    ? explainability.contributions.find((item) => item.entityId?.trim().toLowerCase() === id && Number.isFinite(item.value))
    : undefined;
  if (byId) return byId.value;
  const byName = explainability.contributions.find((item) => item.name?.trim().toLowerCase() === named && Number.isFinite(item.value));
  return byName ? byName.value : null;
}

export function scaleDomain(values: Array<number | null | undefined>): { min: number; max: number } | null {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

export function strongestConnection(values: Array<{ name: string; value: number | null }>): { name: string; value: number } | null {
  const present = values.filter((item): item is { name: string; value: number } => typeof item.value === "number" && Number.isFinite(item.value));
  if (present.length === 0) return null;
  return present.reduce((best, item) => (item.value > best.value ? item : best));
}

export function cobaltMix(value: number | null, domain: { min: number; max: number } | null): string | null {
  if (value === null || !domain || !Number.isFinite(value)) return null;
  const span = domain.max - domain.min;
  const t = span <= 0.000001 ? 1 : (value - domain.min) / span;
  const alpha = 0.18 + Math.min(1, Math.max(0, t)) * 0.82;
  return `rgba(13, 71, 255, ${alpha.toFixed(3)})`;
}
