"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import { geographyNote } from "@/lib/audit/geography";
import { affinityDelta, formatAffinity3, formatRatio, formatSigned3, meanObserved } from "@/lib/audit/metrics";
import { describeDiff, type SelectionDiff } from "@/lib/audit/select";
import { activeCities, type CaseRecord, type CityPhase, type ScoreRow } from "@/lib/session/state";

export function ResultsBody({ showEmpty = true }: { showEmpty?: boolean }) {
  const { state, compare, run, download, importText } = useSession();
  const ordered = orderedCases(state.cases, activeCities(state));
  const [picked, setPicked] = useState("");
  if (ordered.length === 0) {
    if (!showEmpty) return null;
    return (
      <section id="downloads" data-testid="results-empty">
        <h2>No measured change yet</h2>
        <p>Run the four-city demo or a company audit in this tab. Refreshing clears the run.</p>
        <div className="row-actions">
          <Link className="btn" href="/demo">Try the demo</Link>
          <Link className="btn ghost" href="/audit">Audit your company</Link>
        </div>
        <ImportControl importText={importText} />
      </section>
    );
  }
  const [first, ...rest] = ordered;
  const selectedCity = ordered.some((item) => item.city === picked) ? picked : first?.city ?? "";
  const evidence = ordered.some((item) => item.stages.score.status === "failed") ? "failed" : (first?.stages.score.status ?? "idle");
  const failedCity = ordered.find((item) => item.phase === "failed" || item.stages.score.status === "failed" || item.stages.revise.status === "failed");
  const completed = ordered.filter((item) => phaseOf(item) === "complete").length;
  const failed = ordered.filter((item) => phaseOf(item) === "failed").length;
  const improved = ordered.filter((item) => {
    const outcome = cityOutcome(item);
    return outcome.change != null && outcome.change > 0;
  }).length;
  const interests = state.profile.favorites.map((favorite) => favorite.name.trim()).filter(Boolean).join(", ");
  return (
    <div className="results-board" data-testid="results-ready">
      <p className="results-kicker">{state.company.name || "Unnamed company"} · {state.domain === "book" ? "Books" : "Places"} · Age {state.profile.age || "not stated"}</p>
      <h1 className="results-title">{ordered.length === 4 ? "One customer brief. Four city comparisons." : `One customer brief. ${ordered.length === 1 ? "One city comparison." : `${ordered.length} city comparisons.`}`}</h1>
      <p className="results-brief">{state.simulatedLabel || state.company.purpose || "Customer brief"} · {interests || "No interests"} · {state.taskQuestion}</p>
      <p className="results-brief">Cities: {ordered.map((item) => item.city).join(", ")}. Budget {state.profile.budget || "not stated"} {state.profile.currency}. Language {state.profile.language || "not stated"}.</p>
      <p className="results-counts">{completed} complete · {failed} failed · {improved} with a higher revised mean. Counts come from this run.</p>
      {state.seedStage.status === "failed" && state.seedStage.error ? <p className="error" role="alert">{state.seedStage.error.message}</p> : null}
      {state.source === "imported" ? <p data-testid="imported-label">Imported. Scores in this file are imported evidence, not a new provider verification.</p> : null}
      <span className="sr-only" data-testid="stage-evidence-check">{evidence}</span>
      <section className="ta-panel" aria-label="Four city overview">
        <div className="ta-panel-head">
          <div>
            <h2>1. Four-city overview</h2>
            <p>Each card is this run’s own original mean, revised mean, and replacement count.</p>
          </div>
        </div>
        <div className="city-card-grid" role="tablist" aria-label="Cities">
          {ordered.map((item) => {
            const outcome = cityOutcome(item);
            const phase = phaseOf(item);
            return (
              <article key={item.city} className="city-score-card" data-selected={item.city === selectedCity ? "true" : "false"} data-phase={phase}>
                <button type="button" role="tab" aria-selected={item.city === selectedCity} onClick={() => setPicked(item.city)}>{item.city}</button>
                <p>{phase === "complete" ? "Complete" : phaseLabel(phase)}</p>
                <p>Original {outcome.originalText}{scoreNote(phase, outcome.original.value)}</p>
                <p>Revised {outcome.revisedText}{scoreNote(phase, outcome.revised.value)}</p>
                <p>Change {outcome.changeText}</p>
                <p>Replacements {phase === "complete" ? outcome.replacements : "—"}</p>
                <p>Coverage {phase === "complete" ? `${formatRatio(outcome.originalCoverage)} → ${formatRatio(outcome.revisedCoverage)}` : "—"}{phase === "complete" && outcome.partial ? " Partial" : ""}</p>
                {phase === "failed" ? <button type="button" className="btn ghost" data-testid={failedCity?.city === item.city ? "retry-stage" : undefined} onClick={() => void run([item.city])}>Retry</button> : null}
              </article>
            );
          })}
        </div>
        <CityDots rows={ordered.map((item) => ({ city: item.city, ...cityOutcome(item) }))} />
        <p className="results-note">Both affinity numbers come from Qloo. Gemini does not produce a separate affinity score. The dots compare the two arms inside a city. They are not a ranking of cities, and they are not proof of customer satisfaction.</p>
        <SameRequestNote cases={ordered} />
      </section>
      <CityCompare cases={ordered} domain={state.domain} city={selectedCity} />
      {rest.length >= 0 && state.assistantMode === "simulate" && !state.compareAll ? (
        <button type="button" className="text-btn" data-testid="compare-all" onClick={() => void compare()}>All four approaches</button>
      ) : null}
      {ordered.some((item) => item.refinedAnswer) ? <p>{ordered.map((item) => item.refinedAnswer).filter(Boolean).join(" ")}</p> : null}
      <section id="downloads">
        <h2>Download this session</h2>
        <div className="row-actions">
          <button type="button" className="btn" data-testid="export-json" onClick={() => download("json")}>Download evidence</button>
          <button type="button" className="btn ghost" data-testid="export-csv" onClick={() => download("csv")}>Download CSV</button>
          <button type="button" className="btn ghost" data-testid="export-answers" onClick={() => download("answers")}>Download answers</button>
        </div>
        <ImportControl importText={importText} />
      </section>
    </div>
  );
}

function orderedCases(cases: Record<string, CaseRecord>, cities: string[]): CaseRecord[] {
  const used = new Set<string>();
  const rows: CaseRecord[] = [];
  for (const city of cities) {
    const match = Object.entries(cases).find(([name]) => name.toLowerCase() === city.toLowerCase());
    if (!match) continue;
    used.add(match[0]);
    rows.push(match[1]);
  }
  for (const [name, item] of Object.entries(cases)) {
    if (!used.has(name)) rows.push(item);
  }
  return rows;
}

function phaseOf(item: CaseRecord): CityPhase {
  const stages = Object.values(item.stages);
  if (stages.some((stage) => stage.status === "running")) {
    if (item.phase === "generating" || item.phase === "discovering" || item.phase === "evaluating") return item.phase;
    return "evaluating";
  }
  if (item.phase === "failed" || stages.some((stage) => stage.status === "failed")) return "failed";
  if (item.phase === "generating" || item.phase === "discovering" || item.phase === "evaluating") return item.phase;
  if (item.stages.summarize.status === "complete") return "complete";
  return "queued";
}

function scoreNote(phase: CityPhase, value: number | null) {
  if (phase !== "complete" || value !== null) return null;
  return <small>Missing score. Excluded from the mean.</small>;
}

function phaseLabel(phase: CityPhase): string {
  if (phase === "generating") return "Generating";
  if (phase === "discovering") return "Discovering";
  if (phase === "evaluating") return "Evaluating";
  if (phase === "failed") return "Failed";
  if (phase === "complete") return "Complete";
  return "Queued";
}

function cityOutcome(item: CaseRecord) {
  const original = meanObserved(item.extracted.map((pick) => scoreFor(item, pick.entityId)?.affinity ?? null));
  const revised = meanObserved(item.revisedSelections.map((pick) => scoreFor(item, pick.id)?.affinity ?? null));
  const change = affinityDelta(original.value, revised.value);
  const diff = diffFor(item);
  const partial = (original.denominator > 0 && original.numerator < original.denominator) || (revised.denominator > 0 && revised.numerator < revised.denominator);
  const missing = phaseOf(item) === "failed" || (original.value === null && revised.value === null);
  return {
    original,
    revised,
    change,
    originalCoverage: original,
    revisedCoverage: revised,
    originalText: missing && original.value === null ? "—" : formatAffinity3(original.value),
    revisedText: missing && revised.value === null ? "—" : formatAffinity3(revised.value),
    changeText: change === null ? "—" : formatSigned3(change),
    replacements: diff.replacementCount,
    partial,
    diff,
  };
}

function diffFor(item: CaseRecord): SelectionDiff {
  if (item.diagnostic?.diff) return item.diagnostic.diff;
  return describeDiff({
    original: item.extracted.filter((pick) => pick.entityId).map((pick) => ({ entityId: pick.entityId as string, name: pick.name })),
    selected: item.revisedSelections.map((selection) => ({ entityId: selection.id, name: selection.name })),
    newCandidateCount: item.discovered.length,
    comparable: item.scores.some((row) => row.affinity !== null),
  });
}

function formatFull(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return String(value);
}

function SameRequestNote({ cases }: { cases: CaseRecord[] }) {
  const keys = cases.map((item) => item.diagnostic?.requestKey).filter((key): key is string => Boolean(key));
  if (keys.length < 2 || keys.length !== cases.length) return null;
  if (new Set(keys).size !== 1) return null;
  return <p className="results-note">These cities sent the same Qloo scoring request. A matching revised affinity is the same measurement. It does not measure local market preferences.</p>;
}

function geographyCopy(item: CaseRecord, domain: "book" | "place"): string {
  if (!item.signals) return "Qloo scoring has not run for this city.";
  const applied = item.signals.geographicSignalApplied;
  const note = item.diagnostic?.geographyNote || geographyNote(domain, applied);
  if (!applied) return note;
  const locality = item.signals?.localityName ? ` Locality returned: ${item.signals.localityName}.` : " No locality name was returned.";
  const coordinates = item.signals?.coordinatesReturned
    ? ` Coordinates ${item.signals.localityLatitude ?? "—"}, ${item.signals.localityLongitude ?? "—"} came back from Qloo and were not checked against a separate gazetteer.`
    : " Coordinates were not returned, so they were not checked against the requested area.";
  return `${note}${locality}${coordinates}`;
}

function scoreFor(item: CaseRecord, id: string | null): ScoreRow | undefined {
  if (!id) return undefined;
  return item.scores.find((row) => row.entityId.toLowerCase() === id.toLowerCase());
}

function CityDots({ rows }: { rows: Array<{ city: string; original: { value: number | null; numerator: number; denominator: number }; revised: { value: number | null; numerator: number; denominator: number }; changeText: string }> }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.original.value ?? 0, row.revised.value ?? 0]));
  return (
    <div className="dot-chart" aria-label="Affinity comparison by city">
      {rows.map((row) => (
        <div className="dot-row" key={row.city}>
          <span>{row.city}</span>
          <div className="dot-axis">
            {row.original.value != null ? <i className="dot original" style={{ left: `${(row.original.value / max) * 100}%` }} title={`${row.city} original ${formatAffinity3(row.original.value)}, coverage ${formatRatio(row.original)}, change ${row.changeText}`} /> : null}
            {row.revised.value != null ? <i className="dot revised" style={{ left: `${(row.revised.value / max) * 100}%` }} title={`${row.city} revised ${formatAffinity3(row.revised.value)}, coverage ${formatRatio(row.revised)}, change ${row.changeText}`} /> : null}
          </div>
        </div>
      ))}
      <p className="dot-key"><i className="dot original" /> Original Gemini <i className="dot revised" /> Qloo-assisted Gemini</p>
    </div>
  );
}

function CityCompare({ cases, domain, city }: { cases: CaseRecord[]; domain: "book" | "place"; city: string }) {
  const item = cases.find((entry) => entry.city === city);
  if (!item) return null;
  const diff = diffFor(item);
  const showLists = diff.added.length > 0 || diff.removed.length > 0;
  return (
    <section className="ta-panel">
      <div className="ta-panel-head">
        <div>
          <h2>2. Selected city: {item.city}</h2>
          <p>{geographyCopy(item, domain)}</p>
        </div>
      </div>
      {item.recorded ? <p data-testid="recorded-label">Recorded {item.recorded.at} · {item.recorded.model}</p> : null}
      <div className="compare-cols">
        <div className="ta-arm">
          <h3>Original Gemini</h3>
          {item.extracted.length === 0 ? <p>Waiting for the original recommendations.</p> : item.extracted.map((pick) => (
            <RecommendationCard key={`${pick.name}-${pick.entityId ?? "none"}`} item={item} name={pick.name} entityId={pick.entityId} badge={badgeFor(diff, pick.entityId, "original")} detail={pick.matchStatus} />
          ))}
        </div>
        <div className="ta-arm ta-arm-hot">
          <h3>Qloo-assisted Gemini</h3>
          {item.revisedSelections.length === 0 ? <p>{phaseOf(item) === "failed" ? "This city failed before a revision was selected." : "The revised list appears after scoring."}</p> : item.revisedSelections.map((pick) => (
            <RecommendationCard key={pick.id} item={item} name={pick.name} entityId={pick.id} badge={badgeFor(diff, pick.id, "revised")} detail={pick.reason} openEvidence />
          ))}
        </div>
      </div>
      <section className="what-changed">
        <h2>3. What changed</h2>
        {showLists ? (
          <>
            <p>{diff.retainedCount} retained · {diff.replacementCount} replaced.</p>
            {diff.removed.length > 0 ? <p>Removed: {diff.removed.map((row) => row.name).join(", ")}.</p> : null}
            {diff.added.length > 0 ? <p>Added: {diff.added.map((row) => `${row.name}. ${row.reason}`).join(" ")}</p> : null}
            {diff.retained.some((row) => row.fromRank !== row.toRank) ? <p>Rank changes: {diff.retained.filter((row) => row.fromRank !== row.toRank).map((row) => `${row.name} moved from ${row.fromRank} to ${row.toRank}`).join("; ")}.</p> : null}
          </>
        ) : <p>{diff.summary}</p>}
        {diff.summary === "Insufficient evidence to compare." && showLists ? <p>Insufficient evidence to compare.</p> : null}
      </section>
      <ol className="short-answer">
        {item.revisedSelections.map((pick, index) => (
          <li key={pick.id}><strong>{index + 1}. {pick.name}</strong> {pick.reason} Practical facts for this name stay unverified unless a constraint check recorded a pass or fail.</li>
        ))}
      </ol>
      <details>
        <summary>Full answers</summary>
        <h3>Original</h3>
        <div className="answer">{item.originalAnswer}</div>
        <h3>Revised</h3>
        <div className="answer" data-testid="revised-answer">{item.revisedAnswer}</div>
      </details>
      <section className="inspect-block">
        <h2>4. Inspect evidence</h2>
        <p>{item.diagnostic?.summary ?? diff.summary}</p>
        <p>{item.diagnostic?.geographyNote}</p>
        <p>Original ids: {item.diagnostic?.originalIds.join(", ") || "none"}.</p>
        <p>Discovered ids: {item.diagnostic?.discoveredIds.join(", ") || "none"}.</p>
        <p>Eligible ids: {item.diagnostic?.eligibleIds.join(", ") || "none"}.</p>
        <p>Selected ids: {item.diagnostic?.selectedIds.join(", ") || "none"}.</p>
        <p>New candidates {item.diagnostic?.newCandidateCount ?? "—"}. Retained {diff.retainedCount}. Replaced {diff.replacementCount}.</p>
        <p>Unrounded original mean {formatFull(item.diagnostic?.unroundedOriginalMean ?? cityOutcome(item).original.value)}. Unrounded revised mean {formatFull(item.diagnostic?.unroundedRevisedMean ?? cityOutcome(item).revised.value)}.</p>
        <ul>{(item.diagnostic?.revisedAffinities ?? item.revisedSelections.map((pick) => ({ entityId: pick.id, affinity: scoreFor(item, pick.id)?.affinity ?? null }))).map((row) => <li key={row.entityId}>{row.entityId}: {formatFull(row.affinity)}</li>)}</ul>
        <p>{item.diagnostic?.locationAccounting?.gemini}</p>
        <p>{item.diagnostic?.locationAccounting?.candidateFilter}</p>
        <p>{item.diagnostic?.locationAccounting?.scoringSignal}</p>
        <p>Scoring request key {item.diagnostic?.requestKey ?? "unavailable"}.</p>
        <ul>{(item.diagnostic?.scoreParameters ?? []).map((row) => <li key={row.name}>{row.name}: {row.value}</li>)}</ul>
        <ul>{(item.diagnostic?.scoringSignals ?? item.signals?.qloo ?? []).map((signal) => <li key={signal.name}>{signal.name}: {signal.value}</li>)}</ul>
        <p>Candidate pool</p>
        <ul>{item.scores.map((row) => <li key={row.entityId}>{row.name} · {row.entityId} · {formatAffinity3(row.affinity)} · {row.sources.join(", ") || "unspecified"}</li>)}</ul>
        <ul>{item.diagnostic?.exclusions.map((row) => <li key={row.entityId}>{row.name}: {row.reason}</li>)}</ul>
        <ul>{(item.signals?.withheld ?? []).map((row) => <li key={row.name}>{row.name}: {row.reason}</li>)}</ul>
        {item.originalPrompt ? <pre className="answer">{item.originalPrompt}</pre> : null}
        {item.revisedPrompt ? <pre className="answer">{item.revisedPrompt}</pre> : null}
      </section>
    </section>
  );
}

function badgeFor(diff: SelectionDiff, entityId: string | null, arm: "original" | "revised"): string {
  if (!entityId) return "Unresolved";
  const key = entityId.toLowerCase();
  if (arm === "original" && diff.removed.some((row) => row.entityId.toLowerCase() === key)) return "Removed";
  if (arm === "revised" && diff.added.some((row) => row.entityId.toLowerCase() === key)) return "Added";
  const retained = diff.retained.find((row) => row.entityId.toLowerCase() === key);
  if (retained && retained.fromRank !== retained.toRank) return "Reordered";
  if (retained) return "Retained";
  return arm === "original" ? "Original" : "Selected";
}

function RecommendationCard({ item, name, entityId, badge, detail, openEvidence = false }: { item: CaseRecord; name: string; entityId: string | null; badge: string; detail: string; openEvidence?: boolean }) {
  const { state } = useSession();
  const score = scoreFor(item, entityId);
  const category = score?.tags[0] || score?.types[0]?.replace("urn:entity:", "").replaceAll("_", " ") || (state.domain === "book" ? "Book" : "Place");
  const [open, setOpen] = useState(false);
  return (
    <article className="rec-card" data-domain={state.domain}>
      {score?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rec-thumb" src={score.imageUrl} alt="" />
      ) : <span className="rec-thumb placeholder" aria-hidden="true" />}
      <div>
        <strong>{name}</strong>
        <p>{category}</p>
        <p>Affinity {formatAffinity3(score?.affinity ?? null)} <span className="badge">{badge}</span></p>
        <p>{detail}</p>
        {openEvidence ? <button type="button" className="text-btn" data-testid="evidence-open" onClick={() => setOpen(true)}>Inspect evidence</button> : null}
      </div>
      {open && entityId ? <EvidenceDialog item={item} entityId={entityId} onClose={() => setOpen(false)} /> : null}
    </article>
  );
}

function EvidenceDialog({ item, entityId, onClose }: { item: CaseRecord; entityId: string; onClose: () => void }) {
  const { state } = useSession();
  const score = scoreFor(item, entityId);
  const checks = item.checksById[entityId] ?? [];
  return (
    <div className="evidence-dialog" role="dialog" aria-label="Evidence">
      {state.source === "imported" ? <p>Imported evidence</p> : null}
      <h3>{score?.name ?? entityId}</h3>
      <p>Identity {item.extracted.find((pick) => pick.entityId === entityId)?.matchStatus ?? "selected"}. {item.extracted.find((pick) => pick.entityId === entityId)?.ambiguous ? "The match was ambiguous and was not treated as confirmed." : "Ambiguous matches stay labeled."}</p>
      <p>Affinity {formatAffinity3(score?.affinity ?? null)}. Explainability {score?.explainability.status ?? "unavailable"}.</p>
      <ul>{score?.explainability.contributions.map((part, index) => <li key={`${part.entityId}-${index}`}>{part.name ?? part.entityId ?? "signal"} {part.value}</li>)}</ul>
      <ul>{checks.map((check) => <li key={check.label}>{check.label}: {check.verdict}. {check.reason}</li>)}</ul>
      <p>Hours, price, stock, and accessibility stay unverified unless a check above says otherwise.</p>
      <button type="button" className="btn" onClick={onClose}>Close</button>
    </div>
  );
}

function ImportControl({ importText }: { importText: (text: string) => string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <label>
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
