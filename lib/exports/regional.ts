import {
  AUDIENCE_NOT_SENT,
  CAPABILITY_CHECKED_ON,
  DERIVED_REGIONAL_REASON,
  DIRECT_REGIONAL_REASON,
  DIRECT_REGIONAL_STATUS,
} from "@/lib/audit/capabilities";
import { formatAffinity3 } from "@/lib/audit/metrics";
import type { RegionalCityResult, RegionalState } from "@/lib/audit/regional-types";
import { toCsv } from "@/lib/exports/csv";
import { DEFAULT_GEMINI_MODEL } from "@/lib/schemas/limits";

function affinityCell(value: number | null): string {
  return value === null ? "Unavailable" : formatAffinity3(value);
}

function rankChanged(item: RegionalCityResult["original"][number] | RegionalCityResult["revised"][number]): boolean {
  return item.rankFrom !== null && item.rankFrom !== item.rank;
}

export function regionalCsv(regional: RegionalState): string {
  const headers = [
    "run_id",
    "city",
    "audience_market",
    "destination",
    "domain",
    "evidence_method",
    "arm",
    "rank",
    "entity_id",
    "name",
    "affinity",
    "identity_status",
    "membership_status",
    "rank_changed",
    "practical_status",
  ];
  const rows: unknown[][] = [];
  for (const item of Object.values(regional.cases)) {
    const arms: { arm: string; row: RegionalCityResult["original"][number] }[] = [
      ...item.original.map((row) => ({ arm: "Original Gemini", row })),
      ...item.revised.map((row) => ({ arm: "Qloo-assisted Gemini", row })),
    ];
    for (const entry of arms) {
      rows.push([
        regional.runId ?? "",
        item.city,
        item.audienceMarket,
        item.destination ?? "",
        regional.domain,
        item.methodLabel || item.method,
        entry.arm,
        entry.row.rank,
        entry.row.entityId,
        entry.row.name,
        affinityCell(entry.row.affinity),
        entry.row.identity,
        entry.row.membership,
        rankChanged(entry.row) ? "true" : "false",
        entry.row.practical || "unverified",
      ]);
    }
  }
  return toCsv(headers, rows);
}

export function regionalDocument(regional: RegionalState) {
  return {
    kind: "tasteaudit-regional",
    exportedAt: new Date().toISOString(),
    capabilities: {
      checkedOn: CAPABILITY_CHECKED_ON,
      directRegional: DIRECT_REGIONAL_STATUS,
      directReason: DIRECT_REGIONAL_REASON,
      derivedReason: DERIVED_REGIONAL_REASON,
      audience: AUDIENCE_NOT_SENT,
    },
    model: { requested: DEFAULT_GEMINI_MODEL, temperature: null, topP: null },
    brief: {
      runId: regional.runId,
      startedAt: regional.startedAt,
      domain: regional.domain,
      placeMode: regional.placeMode,
      evidence: regional.evidence,
      question: regional.question,
      ageBand: regional.ageBand,
      language: regional.language,
      budget: regional.budget,
      currency: regional.currency,
      requirements: regional.requirements,
      companyName: regional.companyName,
      interests: regional.interests,
      destination: regional.destination,
      markets: regional.markets,
    },
    cities: Object.values(regional.cases).map((item) => ({
      city: item.city,
      audienceMarket: item.audienceMarket,
      destination: item.destination,
      evidence: item.evidence,
      method: item.method,
      methodLabel: item.methodLabel,
      phase: item.phase,
      probe: item.probe,
      tags: item.tags,
      noFavorites: item.noFavorites,
      requestKey: item.requestKey,
      scoreParameters: item.scoreParameters,
      pool: item.pool,
      scores: item.scores,
      original: item.original,
      revised: item.revised,
      originalMean: item.originalMean,
      revisedMean: item.revisedMean,
      originalCoverage: item.originalCoverage,
      revisedCoverage: item.revisedCoverage,
      replacements: item.replacements,
      limitation: item.limitation,
      warnings: item.warnings,
      error: item.error,
      observedModel: item.observedModel,
      completedAt: item.completedAt,
      sensitivity: item.sensitivity,
      originalAnswer: item.originalAnswer,
      revisedAnswer: item.revisedAnswer,
    })),
  };
}
