import { geographyApplied } from "@/lib/audit/geography";
import { formatAffinity3 } from "@/lib/audit/metrics";
import { describeDiff } from "@/lib/audit/select";
import { toCsv } from "@/lib/exports/csv";
import { SCHEMA_VERSION } from "@/lib/schemas/limits";
import { createSession, emptyCase, withHash, type CaseRecord, type ScoreRow, type SessionState } from "@/lib/session/state";

function membership(item: CaseRecord, entityId: string, arm: "original" | "revised"): string {
  const diff = item.diagnostic?.diff ?? describeDiff({
    original: item.extracted.filter((pick) => pick.entityId).map((pick) => ({ entityId: pick.entityId as string, name: pick.name })),
    selected: item.revisedSelections.map((selection) => ({ entityId: selection.id, name: selection.name })),
    newCandidateCount: item.diagnostic?.newCandidateCount ?? item.discovered.length,
    comparable: true,
  });
  const key = entityId.toLowerCase();
  if (arm === "original") {
    if (diff.removed.some((row) => row.entityId.toLowerCase() === key)) return "removed";
    if (diff.reordered && diff.retained.some((row) => row.entityId.toLowerCase() === key && row.fromRank !== row.toRank)) return "reordered";
    if (diff.retained.some((row) => row.entityId.toLowerCase() === key)) return "retained";
    return "original";
  }
  if (diff.added.some((row) => row.entityId.toLowerCase() === key)) return "added";
  if (diff.reordered && diff.retained.some((row) => row.entityId.toLowerCase() === key && row.fromRank !== row.toRank)) return "reordered";
  if (diff.retained.some((row) => row.entityId.toLowerCase() === key)) return "retained";
  return "selected";
}

function rankChanged(item: CaseRecord, entityId: string): boolean {
  const row = item.diagnostic?.diff.retained.find((itemRow) => itemRow.entityId.toLowerCase() === entityId.toLowerCase());
  return Boolean(row && row.fromRank !== row.toRank);
}

function arms(item: CaseRecord, domain: SessionState["domain"]): { arm: string; rank: number; entityId: string; name: string; affinity: number | null; identity: string; membership: string; rankChanged: boolean; explanation: string; verification: string }[] {
  const rows: { arm: string; rank: number; entityId: string; name: string; affinity: number | null; identity: string; membership: string; rankChanged: boolean; explanation: string; verification: string }[] = [];
  item.extracted.forEach((pick, index) => {
    const score = item.scores.find((row) => row.entityId === pick.entityId);
    const entityId = pick.entityId ?? "";
    rows.push({
      arm: "Original Gemini",
      rank: index + 1,
      entityId,
      name: pick.name,
      affinity: score?.affinity ?? null,
      identity: pick.matchStatus,
      membership: entityId ? membership(item, entityId, "original") : "unresolved",
      rankChanged: entityId ? rankChanged(item, entityId) : false,
      explanation: explain(score),
      verification: verdict(item, pick.entityId),
    });
  });
  item.revisedSelections.forEach((selection, index) => {
    const score = item.scores.find((row) => row.entityId === selection.id);
    rows.push({
      arm: "Qloo-assisted Gemini",
      rank: index + 1,
      entityId: selection.id,
      name: selection.name,
      affinity: score?.affinity ?? null,
      identity: "selected",
      membership: membership(item, selection.id, "revised"),
      rankChanged: rankChanged(item, selection.id),
      explanation: selection.reason,
      verification: verdict(item, selection.id),
    });
  });
  void domain;
  return rows;
}

function explain(score: ScoreRow | undefined): string {
  if (!score) return "";
  if (score.explainability.status !== "available") return "Unavailable";
  return score.explainability.contributions.map((item) => `${item.name ?? item.entityId ?? "signal"} ${item.value}`).join("; ");
}

function verdict(item: CaseRecord, id: string | null): string {
  if (!id) return "Unknown";
  const checks = item.checksById[id] ?? [];
  if (checks.length === 0) return "Unknown";
  return checks.map((check) => `${check.label}: ${check.verdict}`).join("; ");
}

export function recommendationsCsv(state: SessionState): string {
  const headers = [
    "run_id",
    "city",
    "scenario",
    "arm",
    "rank",
    "entity_id",
    "name",
    "affinity",
    "identity_status",
    "membership_status",
    "rank_changed",
    "explanation",
    "geography_applied",
    "practical_verification_status",
  ];
  const rows: unknown[][] = [];
  for (const item of Object.values(state.cases)) {
    const geography = geographyApplied(state.domain, Boolean(item.signals?.geographicSignalApplied));
    for (const row of arms(item, state.domain)) {
      rows.push([
        state.runId,
        item.city,
        state.domain,
        row.arm,
        row.rank,
        row.entityId,
        row.name,
        row.affinity === null ? "Unavailable" : formatAffinity3(row.affinity),
        row.identity,
        row.membership,
        row.rankChanged ? "true" : "false",
        row.explanation,
        geography ? "true" : "false",
        row.verification || "unverified",
      ]);
    }
  }
  return toCsv(headers, rows);
}

export function answersCsv(state: SessionState): string {
  return toCsv(
    ["Company", "City", "Question", "Original answer", "Revised answer", "Self-refined answer", "Model", "Recorded"],
    Object.values(state.cases).map((item) => [
      state.company.name,
      item.city,
      state.taskQuestion,
      item.originalAnswer ?? "",
      item.revisedAnswer ?? "",
      item.refinedAnswer ?? "",
      item.observedModel ?? "",
      item.recorded ? `Recorded ${item.recorded.at}` : "",
    ]),
  );
}

export function exportDocument(state: SessionState) {
  return {
    kind: "tasteaudit-run",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    disclaimer:
      "Downloaded from a browser session. Importing this file restores it in memory and labels scores as imported evidence, not as a new provider verification.",
    session: state,
  };
}

function stripImported(row: ScoreRow): ScoreRow {
  return { ...row, envelope: null, evidenceOrigin: "imported" };
}

export function importDocument(raw: unknown): { ok: true; state: SessionState } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") return { ok: false, message: "That file is not a TasteAudit export." };
  const record = raw as { kind?: string; schemaVersion?: number; session?: SessionState };
  if (record.kind !== "tasteaudit-run" || record.schemaVersion !== SCHEMA_VERSION || !record.session) {
    return { ok: false, message: "This file is not a version 1 TasteAudit export." };
  }
  const session = record.session;
  if (!session.company || !session.profile || !Array.isArray(session.cities) || !session.cases) {
    return { ok: false, message: "The export is missing the company, customer, or results." };
  }
  const base = createSession();
  const cases: SessionState["cases"] = {};
  for (const [city, item] of Object.entries(session.cases)) {
    if (!item || typeof item !== "object") continue;
    cases[city] = {
      ...emptyCase(city),
      ...item,
      phase: item.phase ?? (item.stages?.summarize?.status === "complete" ? "complete" : "queued"),
      diagnostic: item.diagnostic ?? null,
      originalPrompt: item.originalPrompt ?? null,
      revisedPrompt: item.revisedPrompt ?? null,
      scores: Array.isArray(item.scores)
        ? item.scores.map((row) => ({
            ...stripImported(row),
            tags: Array.isArray(row.tags) ? row.tags : [],
            language: row.language ?? null,
            imageUrl: row.imageUrl ?? null,
          }))
        : [],
    };
  }
  const next: SessionState = withHash({
    ...base,
    ...session,
    schemaVersion: SCHEMA_VERSION,
    source: "imported",
    running: false,
    comparison: session.comparison === "readers" ? "readers" : "cities",
    readers: Array.isArray(session.readers) ? session.readers : [],
    cases,
    runId: crypto.randomUUID(),
  });
  next.resultsHash = next.configHash;
  return { ok: true, state: next };
}
