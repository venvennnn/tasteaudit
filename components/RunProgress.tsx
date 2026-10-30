"use client";

import { useSession } from "@/components/SessionProvider";
import { activeCities, type SessionState } from "@/lib/session/state";

export function hasRunActivity(state: SessionState): boolean {
  if (state.running || state.seedStage.status !== "idle") return true;
  return Object.values(state.cases).some((item) => Object.values(item.stages).some((stage) => stage.status !== "idle"));
}

const WEIGHT: Record<string, number> = { idle: 0, running: 0.62, complete: 1, skipped: 1, failed: 1 };

export function RunProgress({ compact = false }: { compact?: boolean }) {
  const { state, run } = useSession();
  const city = activeCities(state)[0];
  const item = city ? state.cases[city] : undefined;
  const rows: Array<[string, string, string | null]> = [
    ["Resolve interests", state.seedStage.status, state.seedStage.error?.message ?? null],
    ["Original answer", item?.stages.original.status ?? "idle", item?.stages.original.error?.message ?? null],
    ["Evidence check", item?.stages.score.status ?? item?.stages.discover.status ?? "idle", item?.stages.score.error?.message ?? item?.stages.discover.error?.message ?? null],
    ["Revised answer", item?.stages.revise.status ?? "idle", item?.stages.revise.error?.message ?? null],
  ];
  const progress = rows.reduce((sum, [, status]) => sum + (WEIGHT[status] ?? 0), 0) / rows.length;
  const failed = rows.find(([, status]) => status === "failed");
  const summary = state.running ? "running" : failed ? "failed" : progress >= 1 ? "complete" : "idle";

  return (
    <section className={compact ? "run-panel compact" : "run-panel"} data-testid="progress" aria-live="polite">
      <div className="run-panel-head">
        <h2>Run</h2>
        <p>{state.running ? "Same brief. Each stage fills as it returns." : "The bar moves only while a stage is actually working."}</p>
      </div>
      <div className="track track-lg" data-status={summary} aria-hidden="true">
        <i style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <ol className="stage-bars">
        {rows.map(([label, status]) => (
          <li key={label}>
            <div className="stage-top">
              <span>{label}</span>
              <span className={status === "failed" ? "status bad" : "status"} data-status={status} data-testid={`stage-${label.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span>
            </div>
            <div className="track" data-status={status} aria-hidden="true"><i /></div>
          </li>
        ))}
      </ol>
      {rows.map(([label, status, message]) => message && status === "failed" ? (
        <div key={`${label}-error`}>
          <p className="error" role="alert" data-testid={label === "Resolve interests" ? "missing-key-error" : undefined}>{message}</p>
          {city && label !== "Resolve interests" ? (
            <button type="button" className="btn ghost" data-testid="retry-stage" onClick={() => void run([city])}>Retry failed stage</button>
          ) : null}
        </div>
      ) : null)}
    </section>
  );
}
