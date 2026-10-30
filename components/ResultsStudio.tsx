"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import { AffinityChart, CoverageChart } from "@/components/Charts";
import { formatAffinity, formatRatio, meanObserved } from "@/lib/audit/metrics";
import { ageBandLabel, ageToSupportedBand } from "@/lib/audit/age";
import { parseAge } from "@/lib/audit/orchestrate";
import { resultsReady, type CaseRecord, type ScoreRow } from "@/lib/session/state";

export function ResultsBody({ showEmpty = true }: { showEmpty?: boolean }) {
  const { state, compare, vote, record, download, importText, correctSeed } = useSession();
  const cases = Object.values(state.cases);
  if (!resultsReady(state) || cases.length === 0) {
    if (!showEmpty) return null;
    return (
      <section className="card" data-testid="results-empty">
        <h2>No active session</h2>
        <p>Refreshing or closing the tab clears the run. Start a demo or company audit to keep a result in memory, then download it if you want a copy on your device.</p>
        <div className="row-actions">
          <Link className="btn cyan" href="/demo">Try the demo</Link>
          <Link className="btn ghost" href="/audit">Audit your company</Link>
        </div>
        <ImportControl importText={importText} />
      </section>
    );
  }
  const points = cases.map((item) => ({
    city: item.city,
    original: meanObserved(item.extracted.map((pick) => scoreFor(item, pick.entityId)?.affinity ?? null)).value,
    revised: meanObserved(item.revisedSelections.map((pick) => scoreFor(item, pick.id)?.affinity ?? null)).value,
  }));
  return (
    <div className="stack" data-testid="results-ready">
      {state.source === "imported" ? <p className="memory" data-testid="imported-label">Imported. Scores in this file are imported evidence, not a new provider verification.</p> : null}
      <section className="card">
        <h2>Customer context</h2>
        <p>{state.company.name || "Unnamed company"} · {state.domain === "book" ? "Books" : "Places"} · {state.profile.label}</p>
        <p>{state.taskQuestion}</p>
        <p>Interests: {state.profile.favorites.map((favorite) => favorite.name).filter(Boolean).join(", ")}. Age: {state.profile.age || "not stated"}. Language: {state.profile.language || "not stated"}. Budget: {state.profile.budget || "not stated"} {state.profile.currency}.</p>
        <SeedList onCorrect={correctSeed} />
      </section>
      {cases.map((item) => <CaseView key={item.city} item={item} compareAll={state.compareAll} onVote={(choice) => vote(item.city, choice)} vote={state.votes[item.city]} onRecord={() => record(item.city)} canRecord={state.source !== "imported"} />)}
      <section className="card">
        <h2>Session charts</h2>
        <p className="muted">Descriptive results for this session. Affinity is not customer preference accuracy or a purchase probability. Missing affinity is omitted, not plotted as zero.</p>
        <AffinityChart points={points} />
        <CoverageChart coverage={cases.map((item) => ({ city: item.city, numerator: item.metrics?.scoreCoverage.numerator ?? 0, denominator: item.metrics?.scoreCoverage.denominator ?? 0 }))} />
      </section>
      <section className="card">
        <h2>Download this session</h2>
        <div className="row-actions">
          <button type="button" className="btn cyan" data-testid="export-json" onClick={() => download("json")}>Download JSON</button>
          <button type="button" className="btn ghost" data-testid="export-csv" onClick={() => download("csv")}>Download CSV</button>
          <button type="button" className="btn ghost" data-testid="export-answers" onClick={() => download("answers")}>Download answers</button>
          {!state.compareAll && state.assistantMode === "simulate" ? <button type="button" className="btn ghost" data-testid="compare-all" onClick={() => void compare()}>Compare all approaches</button> : null}
        </div>
        <ImportControl importText={importText} />
      </section>
    </div>
  );
}

function scoreFor(item: CaseRecord, id: string | null): ScoreRow | undefined {
  if (!id) return undefined;
  return item.scores.find((row) => row.entityId.toLowerCase() === id.toLowerCase());
}

function SeedList({ onCorrect }: { onCorrect: (query: string, entityId: string) => void }) {
  const { state } = useSession();
  if (state.seeds.length === 0) return null;
  return (
    <div>
      <h3>Resolved interests</h3>
      {state.seeds.map((seed) => (
        <div key={seed.query} className="drawer">
          <strong>{seed.query}</strong>{" "}
          <span className={seed.ambiguous ? "pill warn" : "pill"}>{seed.status}{seed.ambiguous ? " · ambiguous" : ""}</span>
          <p>{seed.name ?? "Unmatched"} {seed.types[0] ? `· ${seed.types[0]}` : ""}</p>
          {seed.alternatives.length > 1 ? (
            <label>Correct the match
              <select aria-label={`Correct ${seed.query}`} defaultValue={seed.entityId ?? ""} onChange={(event) => { if (event.target.value) onCorrect(seed.query, event.target.value); }}>
                <option value="">Keep the current match</option>
                {seed.alternatives.map((item) => <option key={item.entityId} value={item.entityId}>{item.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ))}
      <p className="muted">A correction clears dependent results. Run the case again afterward.</p>
    </div>
  );
}

function CaseView({ item, compareAll, vote, onVote, onRecord, canRecord }: { item: CaseRecord; compareAll: boolean; vote?: { choice: "a" | "b" | null; revealed: boolean }; onVote: (vote: { choice: "a" | "b"; revealed: boolean }) => void; onRecord: () => void; canRecord: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const band = ageToSupportedBand(parseAge(useSession().state.profile.age));
  return (
    <section className="card" data-testid={`case-${item.city}`}>
      <h2>{item.city}</h2>
      {item.recorded ? <p className="pill" data-testid="recorded-label">Recorded {item.recorded.at} · {item.recorded.model}</p> : null}
      {item.signals && !item.signals.geographicSignalApplied ? <p className="memory">A city filter was not applied to Qloo. Book scores are not city-conditioned. The city was still sent to Gemini.</p> : null}
      {item.signals?.geographicSignalApplied ? <p>Place filter: {item.signals.localityName ?? "locality not resolved"}. {item.signals.coordinatesReturned ? "The provider returned coordinates. TasteAudit did not add a second geocoder." : "Coordinates were not returned."}</p> : null}
      <div className="vote-grid">
        <article>
          <h3>Original answer</h3>
          <div className="answer" data-testid="original-answer">{item.originalAnswer}</div>
          {item.extracted.map((pick) => (
            <button type="button" className="rec" key={pick.name} onClick={() => setOpen(pick.entityId ?? pick.name)}>
              {pick.name} · {pick.matchStatus} · {formatAffinity(scoreFor(item, pick.entityId)?.affinity ?? null)}
            </button>
          ))}
        </article>
        <article>
          <h3>Revised answer</h3>
          <div className="answer" data-testid="revised-answer">{item.revisedAnswer}</div>
          {item.revisedSelections.map((pick) => (
            <button type="button" className="rec" key={pick.id} data-testid="evidence-open" onClick={() => setOpen(pick.id)}>
              {pick.name} · {formatAffinity(scoreFor(item, pick.id)?.affinity ?? null)}
            </button>
          ))}
        </article>
      </div>
      {open ? <Evidence item={item} id={open} onClose={() => setOpen(null)} /> : null}
      {compareAll ? <Baselines item={item} /> : null}
      <Metrics item={item} />
      <Methods item={item} ageLabel={band ? ageBandLabel(band) : null} />
      <Review item={item} vote={vote} onVote={onVote} />
      {canRecord && item.stages.summarize.status === "complete" && !item.recorded ? <button type="button" className="btn ghost" onClick={onRecord}>Keep as recorded for this session</button> : null}
      {item.warnings.length > 0 ? <ul>{item.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    </section>
  );
}

function Evidence({ item, id, onClose }: { item: CaseRecord; id: string; onClose: () => void }) {
  const score = scoreFor(item, id) ?? item.scores.find((row) => row.name === id);
  const checks = score ? item.checksById[score.entityId] ?? [] : [];
  const failed = checks.some((check) => check.verdict === "fail");
  return (
    <div className="drawer" role="dialog" aria-label="Evidence">
      <div className="row-actions"><strong>{score?.name ?? id}</strong><button type="button" className="btn ghost" onClick={onClose}>Close</button></div>
      <p>Type: {score?.types.join(", ") || "Unavailable"}</p>
      <p>Affinity: {formatAffinity(score?.affinity ?? null)} {score?.evidenceOrigin === "imported" ? <span className="pill warn">Imported evidence</span> : score?.evidenceOrigin === "provider" ? <span className="pill">Provider-signed</span> : <span className="pill warn">Unsigned</span>}</p>
      <p>Explainability: {score?.explainability.status === "available" ? score.explainability.contributions.map((part) => `${part.name ?? part.entityId ?? "signal"} ${part.value}`).join(", ") : "Unavailable"}</p>
      {score?.explainability.raw && score.explainability.status === "unavailable" ? <p>A payload was returned, but it had no numeric contributions to display.</p> : null}
      <p>Retrieved: {score?.retrievedAt ?? "Unavailable"}</p>
      {failed ? <p className="error">A verified constraint failed. Affinity does not override that failure.</p> : null}
      <ul>{checks.map((check) => <li key={check.label}>{check.label}: {check.verdict}. {check.reason}</li>)}</ul>
    </div>
  );
}

function Baselines({ item }: { item: CaseRecord }) {
  return (
    <div className="stack">
      <h3>Stronger baselines</h3>
      <p>Self-refinement uses no Qloo evidence. Reranking changes order only.</p>
      {item.refinedAnswer ? <div className="answer">{item.refinedAnswer}</div> : <p>Self-refinement is unavailable for a pasted answer because the original model is unknown.</p>}
      <p>{item.rerankNote}</p>
      <ol>{item.rerankIds.map((id) => <li key={id}>{scoreFor(item, id)?.name ?? id} · {formatAffinity(scoreFor(item, id)?.affinity ?? null)}</li>)}</ol>
    </div>
  );
}

function Metrics({ item }: { item: CaseRecord }) {
  const metrics = item.metrics;
  if (!metrics) return null;
  const original = meanObserved(item.extracted.map((pick) => scoreFor(item, pick.entityId)?.affinity ?? null));
  const revised = meanObserved(item.revisedSelections.map((pick) => scoreFor(item, pick.id)?.affinity ?? null));
  return (
    <div className="table-wrap">
      <table>
        <caption>Coverage uses numerator and denominator. Means skip missing affinity.</caption>
        <tbody>
          <tr><th>Interest resolution</th><td>{formatRatio(metrics.entityResolution)}</td></tr>
          <tr><th>Recommendation resolution</th><td>{formatRatio(metrics.pickResolution)}</td></tr>
          <tr><th>Score coverage</th><td>{formatRatio(metrics.scoreCoverage)}</td></tr>
          <tr><th>Mean affinity, original</th><td>{formatAffinity(original.value)} ({formatRatio(original)})</td></tr>
          <tr><th>Mean affinity, revised</th><td>{formatAffinity(revised.value)} ({formatRatio(revised)})</td></tr>
          <tr><th>Retention</th><td>{formatRatio(metrics.retention)}</td></tr>
          <tr><th>Constraint checks with a pass or fail</th><td>{formatRatio(metrics.constraintCoverage)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Methods({ item, ageLabel }: { item: CaseRecord; ageLabel: string | null }) {
  return (
    <details>
      <summary>Methods for this case</summary>
      <p>Model: {item.observedModel ?? "Unknown for a pasted answer"}. Temperature {item.originalProvenance?.temperature ?? "frozen on the server"}. Prompt {item.originalProvenance?.systemPromptVersion ?? "server prompt"}.</p>
      {ageLabel ? <p>Explicit age was mapped to the documented band {ageLabel} and that band was eligible to send.</p> : <p>No age band was sent.</p>}
      <ul>{item.signals?.qloo.map((signal) => <li key={signal.name}>{signal.name}: {signal.value}</li>)}</ul>
      <ul>{item.signals?.withheld.map((signal) => <li key={signal.name}>{signal.name}: {signal.reason}</li>)}</ul>
    </details>
  );
}

function Review({ item, vote, onVote }: { item: CaseRecord; vote?: { choice: "a" | "b" | null; revealed: boolean }; onVote: (vote: { choice: "a" | "b"; revealed: boolean }) => void }) {
  if (!item.originalAnswer || !item.revisedAnswer) return null;
  const revealed = vote?.revealed;
  const left = vote?.choice === "b" ? item.revisedAnswer : item.originalAnswer;
  return (
    <div>
      <h3>Informal session review</h3>
      <p className="muted">This is an informal preference in this session, not statistically independent validation. No significance test is computed. Arm names and scores stay off these two cards until you vote. The labeled cards above are the audit itself.</p>
      {!revealed ? (
        <div className="vote-grid">
          <button type="button" className="choice" data-testid="vote-a" onClick={() => onVote({ choice: "a", revealed: true })}><strong>A</strong><span className="answer">{item.originalAnswer}</span></button>
          <button type="button" className="choice" data-testid="vote-b" onClick={() => onVote({ choice: "b", revealed: true })}><strong>B</strong><span className="answer">{item.revisedAnswer}</span></button>
        </div>
      ) : <p>You preferred {vote?.choice === "a" ? "the original" : "the revision"}. {left ? "" : ""}</p>}
    </div>
  );
}

function ImportControl({ importText }: { importText: (text: string) => string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <label style={{ marginTop: 12 }}>
      Import a downloaded run
      <input data-testid="import-json" type="file" accept="application/json,.json" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void file.text().then((text) => setMessage(importText(text)));
      }} />
      {message ? <span className="error" role="alert">{message}</span> : null}
    </label>
  );
}
