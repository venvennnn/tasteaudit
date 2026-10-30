import type { Domain } from "@/lib/schemas/limits";

export function estimateProviderCalls(input: {
  favoriteCount: number;
  cityCount: number;
  recommendationCount: number;
  domain: Domain;
  mode: "simulate" | "paste";
  compare: boolean;
  distinctInterestSets?: number;
}): { total: number; lines: { label: string; count: number }[] } {
  const cities = Math.max(1, input.cityCount);
  const lines: { label: string; count: number }[] = [
    { label: "Resolve favorite names", count: input.favoriteCount },
  ];
  const original = input.mode === "simulate" ? cities : 0;
  const refine = input.compare && input.mode === "simulate" ? cities : 0;
  lines.push({ label: "Original answer", count: original });
  lines.push({ label: "Self-refinement", count: refine });
  lines.push({ label: "Extract recommendations", count: cities + (refine > 0 ? cities : 0) });
  lines.push({
    label: "Resolve recommendation names",
    count: cities * input.recommendationCount * (refine > 0 ? 2 : 1),
  });
  lines.push({
    label: "Discover candidates",
    count: input.domain === "place" ? cities : Math.max(1, input.distinctInterestSets ?? 1),
  });
  lines.push({ label: "Score the shared pool", count: cities });
  lines.push({ label: "Grounded revision", count: cities });
  lines.push({ label: "Optional metadata lookup", count: cities });
  const total = lines.reduce((sum, line) => sum + line.count, 0);
  return { total, lines: lines.filter((line) => line.count > 0) };
}
