import { formatAffinity } from "@/lib/audit/metrics";
import { toCsv } from "@/lib/exports/csv";
import { SCHEMA_VERSION } from "@/lib/schemas/limits";
import { createSession, withHash, type CaseRecord, type ScoreRow, type SessionState } from "@/lib/session/state";

function arms(item: CaseRecord): { arm: string; rank: number; entityId: string; name: string; match: string; affinity: number | null; explanation: string; verification: string }[] {
  const rows: { arm: string; rank: number; entityId: string; name: string; match: string; affinity: number | null; explanation: string; verification: string }[] = [];
  item.extracted.forEach((pick, index) => {
    const score = item.scores.find((row) => row.entityId === pick.entityId);
    rows.push({
      arm: "Original",
      rank: index + 1,
      entityId: pick.entityId ?? "",
      name: pick.name,
      match: pick.matchStatus,
      affinity: score?.affinity ?? null,
      explanation: explain(score),
      verification: verdict(item, pick.entityId),
    });
  });
  item.rerankIds.forEach((id, index) => {
    const score = item.scores.find((row) => row.entityId === id);
    rows.push({
      arm: "Qloo rerank",
      rank: index + 1,
      entityId: id,
      name: score?.name ?? id,
      match: "scored",
      affinity: score?.affinity ?? null,
      explanation: explain(score),
      verification: verdict(item, id),
    });
  });
  item.refinedExtracted.forEach((pick, index) => {
    const score = item.scores.find((row) => row.entityId === pick.entityId);
    rows.push({
      arm: "Self-refinement",
      rank: index + 1,
      entityId: pick.entityId ?? "",
      name: pick.name,
      match: pick.matchStatus,
      affinity: score?.affinity ?? null,
      explanation: explain(score),
      verification: verdict(item, pick.entityId),
    });
  });
  item.revisedSelections.forEach((selection, index) => {
    const score = item.scores.find((row) => row.entityId === selection.id);
    rows.push({
      arm: "Qloo revision",
      rank: index + 1,
      entityId: selection.id,
      name: selection.name,
      match: "allowlist",
      affinity: score?.affinity ?? null,
      explanation: selection.reason,
      verification: verdict(item, selection.id),
    });
  });
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
    "Company",
    "City",
    "Profile",
    "Question",
    "Arm",
    "Recommendation rank",
    "Entity id",
    "Entity name",
    "Match status",
    "Affinity",
    "Verification",
    "Explanation",
    "Model",
    "Timestamp",
    "Evidence origin",
    "Original answer",
    "Revised answer",
  ];
  const rows: unknown[][] = [];
  for (const item of Object.values(state.cases)) {
    const model = item.observedModel ?? item.originalProvenance?.model ?? (state.assistantMode === "paste" ? "Unknown pasted model" : "");
    const timestamp = item.originalProvenance?.retrievedAt ?? item.revisedProvenance?.retrievedAt ?? "";
    for (const row of arms(item)) {
      rows.push([
        state.company.name,
        item.city,
        state.profile.label,
        state.taskQuestion,
        row.arm,
        row.rank,
        row.entityId,
        row.name,
        row.match,
        row.affinity === null ? "" : formatAffinity(row.affinity),
        row.verification,
        row.explanation,
        model,
        timestamp,
        state.source === "imported" ? "imported" : "session",
        item.originalAnswer ?? "",
        item.revisedAnswer ?? "",
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
      ...item,
      scores: Array.isArray(item.scores)
        ? item.scores.map((row) => ({
            ...stripImported(row),
            tags: Array.isArray(row.tags) ? row.tags : [],
            language: row.language ?? null,
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
    cases,
    runId: crypto.randomUUID(),
  });
  next.resultsHash = next.configHash;
  return { ok: true, state: next };
}
