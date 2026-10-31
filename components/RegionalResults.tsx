"use client";

import { useState } from "react";
import { Cover } from "@/components/Cover";
import { TasteFingerprint, type FingerprintColumn, type FingerprintInterest } from "@/components/Fingerprint";
import { formatAffinity3, formatRatio, formatSigned3 } from "@/lib/audit/metrics";
import { alignRegionalTags } from "@/lib/audit/regional-compare";
import { regionalChange } from "@/lib/audit/regional-run";
import type { EvidenceMode, RegionalArmItem, RegionalCityResult, RegionalState, RegionalTagRecord } from "@/lib/audit/regional-types";
import type { Explainability } from "@/lib/providers/qloo";

const EMPTY_EXPLAIN: Explainability = { status: "unavailable", contributions: [], warning: null, raw: null };

export function RegionalResults({
  regional,
  onRetry,
  onRetryFailed,
  onDownload,
}: {
  regional: RegionalState;
  onRetry: (city: string) => void;
  onRetryFailed?: () => void;
  onDownload: (kind: "json" | "csv") => void;
}) {
  const rows = Object.values(regional.cases);
  const [picked, setPicked] = useState("");
  if (rows.length === 0) return null;
  const selected = rows.some((row) => row.city === picked) ? picked : rows[0]?.city ?? "";
  const current = rows.find((row) => row.city === selected) ?? rows[0]!;
  const failed = rows.find((row) => row.phase === "failed");
  const aligned = alignRegionalTags(rows.filter((row) => row.tags.length > 0).map((row) => ({ city: row.city, tags: row.tags })));
  const shared = aligned.filter((tag) => tag.shared);
  const distinctive = aligned.filter((tag) => tag.distinctiveCity);
  const changes = rows.map((row) => changeOf(row)).filter((value): value is number => value !== null);
  const meanChange = changes.length > 0 ? changes.reduce((sum, value) => sum + value, 0) / changes.length : null;
  const complete = rows.filter((row) => row.phase === "complete");
  const replacementTotal = complete.reduce((sum, row) => sum + row.replacements, 0);
  const revisedItems = complete.reduce((sum, row) => sum + row.revised.length, 0);
  const domainLabel = regional.domain === "book" ? "Books" : "Places";
  const evidenceLabel = regional.evidence === "joint" ? "Regional + interests" : regional.evidence === "interests" ? "Interests only" : "Regional only";
  const ageLabel = regional.ageBand ? regional.ageBand : "Unstated";
  const interestCount = regional.interests.filter((item) => item.name.trim()).length;

  return (
    <div className="rg-board" data-testid="regional-results">
      <section className="rg-card rg-hero">
        <div className="rg-hero-copy">
          <div className="rg-title-row">
            <span className="rg-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M12 4v16M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
            </span>
            <h2>Regional comparison</h2>
          </div>
          <p>The same request, scored inside each confirmed city. Original and revised affinity are both Qloo scores for that city’s evidence.</p>
        </div>
        <div className="rg-hero-meta">
          <span className="rg-pill">{rows.filter((row) => row.phase === "complete").length} of {rows.length} cities scored</span>
          {failed && onRetryFailed ? <button type="button" className="btn" onClick={onRetryFailed}>Retry failed cities</button> : null}
        </div>
      </section>

      <section className="rg-toolbar" aria-label="Run constraints">
        <div>
          <span className="rg-kicker">Domain and evidence</span>
          <div className="rg-pills">
            <span className="rg-pill strong">{domainLabel}</span>
            <span className="rg-pill accent">{evidenceLabel}</span>
          </div>
        </div>
        <div>
          <span className="rg-kicker">Cities in this run</span>
          <div className="rg-pills">
            {rows.map((row) => (
              <button key={row.city} type="button" className={row.city === current.city ? "rg-pill city on" : "rg-pill city"} onClick={() => setPicked(row.city)}>
                {row.city === current.city ? <i /> : null}
                {row.city}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="rg-kicker">Inputs</span>
          <div className="rg-pills">
            <span className="rg-pill">Age <strong>{ageLabel}</strong></span>
            <span className="rg-pill">Language <strong>{regional.language || "Unstated"}</strong></span>
            <span className="rg-pill">Favorites <strong>{interestCount}</strong></span>
          </div>
        </div>
      </section>

      <section className="rg-metrics" aria-label="Run summary">
        <article className="rg-metric">
          <div className="rg-metric-top">
            <span>Mean affinity change</span>
            <span className="rg-icon pink" aria-hidden="true">Δ</span>
          </div>
          <strong className={meanChange !== null && meanChange > 0 ? "pink" : undefined}>{meanChange === null ? "Unavailable" : formatSigned3(meanChange)}</strong>
          <p>Average of the signed differences where both arms were scored. This is not a significance test.</p>
        </article>
        <article className="rg-metric">
          <div className="rg-metric-top">
            <span>Replacements</span>
            <span className="rg-icon blue" aria-hidden="true">↔</span>
          </div>
          <strong className="blue">{complete.length === 0 ? "Unavailable" : String(replacementTotal)}</strong>
          <p>{complete.length === 0 ? "No city finished scoring." : `${replacementTotal} replacement${replacementTotal === 1 ? "" : "s"} across ${revisedItems} revised item${revisedItems === 1 ? "" : "s"}.`}</p>
        </article>
        <article className="rg-metric">
          <div className="rg-metric-top">
            <span>Cities</span>
            <span className="rg-icon" aria-hidden="true">⌖</span>
          </div>
          <strong>{rows.length}</strong>
          <p>Each city is scored on its own evidence. The dots do not rank the cities.</p>
        </article>
        <article className="rg-metric">
          <div className="rg-metric-top">
            <span>Finished</span>
            <span className="rg-icon green" aria-hidden="true">✓</span>
          </div>
          <strong className="green">{complete.length} / {rows.length}</strong>
          <p>{failed ? `${rows.filter((row) => row.phase === "failed").length} still failed. Retry scores from the tags already returned.` : rows.some((row) => row.phase !== "complete") ? "Cities finish on their own." : "Every listed city finished."}</p>
        </article>
      </section>

      <section className="rg-card">
        <div className="rg-card-head">
          <div>
            <h2>Paired affinity</h2>
            <p>Gray is Original Gemini. Cobalt is Qloo-assisted Gemini. Both numbers are Qloo affinities for that city.</p>
          </div>
          <div className="rg-legend">
            <span><i className="rg-dot gray" /> Original Gemini</span>
            <span><i className="rg-dot blue" /> Qloo-assisted Gemini</span>
          </div>
        </div>
        <Dumbbell rows={rows} selected={current.city} onPick={setPicked} />
        <ul className="rg-facts">
          {rows.map((row) => {
            const change = changeOf(row);
            const partial = row.phase === "complete" && ((row.originalCoverage.denominator > 0 && row.originalCoverage.numerator < row.originalCoverage.denominator) || (row.revisedCoverage.denominator > 0 && row.revisedCoverage.numerator < row.revisedCoverage.denominator));
            return (
              <li key={row.city}>
                <strong>{row.city}</strong>
                <small>{phaseText(row.phase)}</small>
                <span>{row.phase === "failed" ? (row.methodLabel || "Scoring did not finish.") : (row.methodLabel || "Waiting")}</span>
                <span>Original {shown(row, row.originalMean)}</span>
                <span>Revised {shown(row, row.revisedMean)}</span>
                <span>Change {row.phase === "complete" && change !== null ? formatSigned3(change) : "Unavailable"}</span>
                <span>Replacements {row.phase === "complete" ? row.replacements : "—"}</span>
                <span>{row.phase === "complete" ? `${formatRatio(row.originalCoverage)} original · ${formatRatio(row.revisedCoverage)} revised` : "—"}{partial ? " Partial coverage" : ""}</span>
                {row.phase === "failed" ? <button type="button" className="btn ghost" onClick={() => onRetry(row.city)}>Retry</button> : null}
              </li>
            );
          })}
        </ul>
        <div className="regional-table-wrap rg-overview-scroll">
          <table className="regional-table" data-testid="regional-overview">
            <thead>
              <tr>
                <th>City</th>
                <th>Evidence method</th>
                <th>Original affinity</th>
                <th>Revised affinity</th>
                <th>Change</th>
                <th>Replacements</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const change = changeOf(row);
                const partial = row.phase === "complete" && ((row.originalCoverage.denominator > 0 && row.originalCoverage.numerator < row.originalCoverage.denominator) || (row.revisedCoverage.denominator > 0 && row.revisedCoverage.numerator < row.revisedCoverage.denominator));
                return (
                  <tr key={row.city} data-phase={row.phase}>
                    <td><button type="button" className="text-btn" onClick={() => setPicked(row.city)}>{row.city}</button><small>{phaseText(row.phase)}</small></td>
                    <td data-testid="regional-method">
                      {row.phase === "failed" ? (row.methodLabel || "Scoring did not finish.") : (row.methodLabel || "Waiting")}
                      {row.phase === "failed" && row.error ? <small>{row.error}</small> : null}
                    </td>
                    <td>{shown(row, row.originalMean)}</td>
                    <td>{shown(row, row.revisedMean)}</td>
                    <td>{row.phase === "complete" && change !== null ? formatSigned3(change) : "Unavailable"}</td>
                    <td>{row.phase === "complete" ? row.replacements : "—"}</td>
                    <td>
                      {row.phase === "complete" ? `${formatRatio(row.originalCoverage)} original · ${formatRatio(row.revisedCoverage)} revised` : "—"}
                      {partial ? <strong> Partial coverage</strong> : null}
                      {row.phase === "failed" ? <button type="button" className="btn ghost" data-testid={failed?.city === row.city ? "retry-regional" : undefined} onClick={() => onRetry(row.city)}>Retry</button> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="results-note">Higher Qloo affinity means closer alignment with the scoring evidence used for selection. It does not prove improved satisfaction.</p>
      </section>

      <section className="rg-card">
        <div className="rg-card-head">
          <div>
            <h2>How the regional profiles differ</h2>
            <p>Ranks are the order Qloo returned inside that city. A blank cell was not returned. It is not zero interest. Scores are not treated as comparable across cities.</p>
          </div>
        </div>
        <div className="rg-dna">
          {rows.map((row) => (
            <article key={row.city} className={row.city === current.city ? "rg-dna-card on" : "rg-dna-card"} onClick={() => setPicked(row.city)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setPicked(row.city); } }} tabIndex={0} role="button" aria-pressed={row.city === current.city}>
              <div className="rg-dna-head">
                <strong>{row.city}</strong>
                <small>{row.methodLabel || phaseText(row.phase)}</small>
              </div>
              <TagBars tags={topTags(row.tags)} />
            </article>
          ))}
        </div>
        <details className="rg-fold">
          <summary>Full tag table and locality notes</summary>
          <div>
            {aligned.length === 0 ? <p>No regional tags were returned.</p> : (
              <div className="fp-scroll">
                <table className="regional-table">
                  <thead>
                    <tr>
                      <th>Tag</th>
                      <th>Namespace</th>
                      {rows.map((row) => <th key={row.city}>{row.city}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {aligned.map((tag) => (
                      <tr key={tag.tagId}>
                        <td>{tag.name}</td>
                        <td>{tag.namespace}</td>
                        {tag.cells.map((cell) => (
                          <td key={cell.city}>{cell.status === "returned" ? `Rank ${cell.rank}${cell.compatible === false ? " · not sent" : ""}` : "Not returned"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>{shared.length > 0 ? `Returned in every listed city: ${shared.map((tag) => tag.name).join(", ")}.` : "No tag was returned for every city in this run."}</p>
            <p>{distinctive.length > 0 ? `Returned for only one city: ${distinctive.map((tag) => `${tag.name} (${tag.distinctiveCity})`).join(", ")}.` : "No tag was unique to a single returned list."}</p>
            {rows.some((row) => row.phase === "failed" && row.tags.length > 0) ? <p>A failed city still lists tags that were returned. Those tags were not used to score recommendations.</p> : null}
            {rows.map((row) => (
              <p key={`${row.city}-demo`} className="muted">{row.city}: {row.probe ? demographicLine(row) : row.methodLabel}</p>
            ))}
          </div>
        </details>
      </section>

      <section className="rg-card">
        <div className="rg-card-head">
          <div>
            <h2>{current.city}</h2>
            <p>Query: <span className="rg-query">{regional.question.trim() || "No request recorded."}</span></p>
            <p>{modeCopy(current.evidence, regional)}</p>
          </div>
          <div className="city-tabs rg-tabs" role="tablist" aria-label="Cities">
            {rows.map((row) => (
              <button key={row.city} type="button" role="tab" aria-selected={row.city === current.city} className={row.city === current.city ? "on" : undefined} onClick={() => setPicked(row.city)}>{row.city}</button>
            ))}
          </div>
        </div>
        {current.limitation ? <p className="error">{current.limitation}</p> : null}
        {current.error && current.phase === "failed" ? <p className="error" role="alert">{current.error}</p> : null}
        <div className="rg-dive">
          <div className="rg-arm original">
            <div className="rg-arm-head">
              <span><i className="rg-dot gray" /> Original Gemini</span>
              <span>Mean {shown(current, current.originalMean)}</span>
            </div>
            {current.originalAnswer ? <p className="rg-answer">{current.originalAnswer}</p> : null}
            {current.original.length === 0 ? <p className="muted">No original titles were resolved.</p> : null}
            {current.original.map((item) => <ArmCard key={`o-${item.entityId}-${item.rank}`} item={item} domain={regional.domain} />)}
          </div>
          <div className="rg-arm revised">
            <div className="rg-arm-head">
              <span><i className="rg-dot blue" /> Qloo-assisted Gemini</span>
              <span>Mean {shown(current, current.revisedMean)}{changeOf(current) !== null ? ` · ${formatSigned3(changeOf(current))}` : ""}</span>
            </div>
            {current.revisedAnswer ? <p className="rg-answer" data-testid="regional-revised">{current.revisedAnswer}</p> : null}
            {current.phase === "failed" && current.revised.length === 0 ? <p>Scoring did not finish, so no Qloo-assisted list was selected.</p> : null}
            {current.revised.map((item) => <ArmCard key={`r-${item.entityId}-${item.rank}`} item={item} domain={regional.domain} />)}
          </div>
        </div>

        <div className="rg-split">
          <div>
            <h3>What changed?</h3>
            <Flow city={current} />
          </div>
          <aside className="rg-principles">
            <h3>How to read this</h3>
            <p><strong>Same evidence, both arms.</strong> Original and revised titles in a city are scored with that city’s returned tags. The change is their difference.</p>
            <p><strong>Not a satisfaction score.</strong> Higher Qloo affinity means closer alignment with the scoring evidence. It does not prove improved satisfaction.</p>
            <p><strong>Within the city.</strong> A tag missing from a list was not returned. It is not zero interest, and it is not a claim that one city prefers it.</p>
            <p className="rg-engine">Qloo insights · {current.observedModel || "Gemini writer"}</p>
          </aside>
        </div>

        <h3>Explain the basis</h3>
        {current.revised.length === 0 ? <p className="muted">No revised titles to explain.</p> : (
          <ul className="rg-basis">{current.revised.map((item) => <li key={item.entityId}><strong>{item.name}.</strong> {item.explanation}</li>)}</ul>
        )}
        {current.evidence !== "regional" && current.revised.length > 0 ? (
          <TasteFingerprint
            interests={interestRows(regional)}
            original={toColumns(current.original, regional.domain, current.scores)}
            revised={toColumns(current.revised, regional.domain, current.scores)}
            sensitivity={current.sensitivity}
            sensitivitySupported={false}
          />
        ) : null}
        {current.warnings.length > 0 ? <details><summary>Warnings</summary><ul>{current.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
      </section>

      <section className="rg-card rg-export" id="downloads">
        <div>
          <strong>This tab’s memory only</strong>
          <p>The download is this run. Refreshing clears it. Credentials are not included.</p>
        </div>
        <div className="row-actions">
          <button type="button" className="btn" data-testid="regional-export-json" onClick={() => onDownload("json")}>Download JSON</button>
          <button type="button" className="btn ghost" data-testid="regional-export-csv" onClick={() => onDownload("csv")}>Download CSV</button>
        </div>
      </section>
    </div>
  );
}

function Dumbbell({ rows, selected, onPick }: { rows: RegionalCityResult[]; selected: string; onPick: (city: string) => void }) {
  const values = rows.flatMap((row) => [row.originalMean, row.revisedMean]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) {
    return (
      <div className="rg-dumbbell" aria-label="Original and revised affinity by city">
        {rows.map((row) => (
          <button key={row.city} type="button" className={row.city === selected ? "rg-track-row on" : "rg-track-row"} onClick={() => onPick(row.city)}>
            <span className="rg-track-name">{row.city}</span>
            <span className="muted">Unavailable</span>
          </button>
        ))}
      </div>
    );
  }
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = Math.max(0.02, (high - low) * 0.18);
  const lo = Math.max(0, low - pad);
  const hi = Math.max(lo + 0.05, high + pad);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => lo + (hi - lo) * step);
  const place = (value: number) => `${((value - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="rg-dumbbell" aria-label="Original and revised affinity by city">
      <div className="rg-scale" aria-hidden="true">
        {ticks.map((tick) => <span key={tick}>{tick.toFixed(2)}</span>)}
      </div>
      {rows.map((row) => {
        const change = changeOf(row);
        const left = row.originalMean;
        const right = row.revisedMean;
        const hasPair = left !== null && right !== null;
        const start = hasPair ? Math.min(left, right) : null;
        const end = hasPair ? Math.max(left, right) : null;
        return (
          <button key={row.city} type="button" className={row.city === selected ? "rg-track-row on" : "rg-track-row"} onClick={() => onPick(row.city)}>
            <div className="rg-track-label">
              <span className="rg-track-name">{row.city}<small>{row.methodLabel || phaseText(row.phase)}</small></span>
              <span className="rg-track-nums">
                {left === null || right === null ? "Unavailable" : `${formatAffinity3(left)} → ${formatAffinity3(right)}`}
                {change !== null ? <em className={change > 0 ? "up" : change < 0 ? "down" : undefined}>{formatSigned3(change)}</em> : null}
              </span>
            </div>
            <div className="rg-track">
              {start !== null && end !== null ? <i className="rg-link" style={{ left: place(start), width: `calc(${place(end)} - ${place(start)})` }} /> : null}
              {left !== null ? <i className="rg-dot gray" style={{ left: place(left) }} title={`${row.city} Original Gemini ${formatAffinity3(left)}`} /> : null}
              {right !== null && row.method !== "unavailable" ? <i className="rg-dot blue" style={{ left: place(right) }} title={`${row.city} Qloo-assisted Gemini ${formatAffinity3(right)}`} /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TagBars({ tags }: { tags: RegionalTagRecord[] }) {
  if (tags.length === 0) return <p className="muted">No tags returned.</p>;
  const best = Math.min(...tags.map((tag) => tag.rank));
  const worst = Math.max(...tags.map((tag) => tag.rank));
  const span = Math.max(1, worst - best);
  return (
    <ul className="rg-bars">
      {tags.map((tag) => {
        const width = worst === best ? 100 : Math.round((1 - (tag.rank - best) / span) * 70) + 30;
        return (
          <li key={tag.tagId}>
            <span>{tag.name}{tag.compatible ? "" : " · not sent"}</span>
            <span>Rank {tag.rank}</span>
            <i aria-hidden="true"><b style={{ width: `${width}%` }} /></i>
          </li>
        );
      })}
    </ul>
  );
}

function topTags(tags: RegionalTagRecord[]): RegionalTagRecord[] {
  return [...tags].sort((a, b) => a.rank - b.rank).slice(0, 3);
}

function ArmCard({ item, domain }: { item: RegionalArmItem; domain: "book" | "place" }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rg-item" data-domain={domain}>
      <Cover name={item.name} kind={domain === "book" ? "book" : "any"} />
      <div>
        <div className="rg-item-top">
          <strong>{item.name}</strong>
          <span className={`rg-badge ${badgeClass(item.membership)}`}>{badgeLabel(item.membership)}</span>
        </div>
        <p>Affinity {formatAffinity3(item.affinity)}{item.rankFrom && item.rankFrom !== item.rank ? ` · rank ${item.rankFrom} → ${item.rank}` : ""}</p>
        <p>{item.explanation}</p>
        <button type="button" className="text-btn" onClick={() => setOpen((value) => !value)}>{open ? "Hide evidence" : "Inspect evidence"}</button>
        {open ? <p>{item.identity}. {item.practical}. Entity {item.entityId || "unresolved"}.</p> : null}
      </div>
    </article>
  );
}

function Flow({ city }: { city: RegionalCityResult }) {
  const original = new Map(city.original.filter((item) => item.entityId).map((item) => [item.entityId.toLowerCase(), item]));
  const revised = new Map(city.revised.map((item) => [item.entityId.toLowerCase(), item]));
  const removed = [...original.values()].filter((item) => !revised.has(item.entityId.toLowerCase()));
  const added = [...revised.values()].filter((item) => !original.has(item.entityId.toLowerCase()));
  const kept = [...revised.values()].filter((item) => original.has(item.entityId.toLowerCase()));
  if (city.phase === "failed") {
    return <p>{city.error || "This city did not finish."} {city.tags.length > 0 ? "Returned taste tags are listed above. They were not applied to a scored comparison." : ""}</p>;
  }
  if (city.original.length === 0 && city.revised.length === 0) return <p>{city.methodLabel || "No comparison yet."}</p>;
  return (
    <div className="rg-flow">
      <div className="rg-flow-counts">
        <span><small>Removed</small><strong>{removed.length}</strong></span>
        <span><small>Retained</small><strong>{kept.length}</strong></span>
        <span><small>Added</small><strong>{added.length}</strong></span>
      </div>
      <div className="rg-flow-cols">
        <ul>{removed.length === 0 ? <li className="muted">None removed</li> : removed.map((item) => <li key={item.entityId} className="out">{item.name}</li>)}</ul>
        <ul>{kept.length === 0 ? <li className="muted">None retained</li> : kept.map((item) => <li key={item.entityId}>{item.name}</li>)}</ul>
        <ul>{added.length === 0 ? <li className="muted">None added</li> : added.map((item) => <li key={item.entityId} className="in">{item.name}</li>)}</ul>
      </div>
      <p>Removed ids: {removed.length ? removed.map((item) => `${item.name} (${item.entityId})`).join(", ") : "none"}.</p>
      <p>Added ids: {added.length ? added.map((item) => `${item.name} (${item.entityId})`).join(", ") : "none"}.</p>
      <p>Retained ids: {kept.length ? kept.map((item) => `${item.name} (${item.entityId})`).join(", ") : "none"}.</p>
    </div>
  );
}

function badgeLabel(membership: RegionalArmItem["membership"]): string {
  if (membership === "removed") return "Removed";
  if (membership === "added") return "Added";
  if (membership === "retained") return "Retained";
  if (membership === "reordered") return "Reordered";
  if (membership === "unresolved") return "Unresolved";
  if (membership === "selected") return "Selected";
  return "Original";
}

function badgeClass(membership: RegionalArmItem["membership"]): string {
  if (membership === "removed") return "bad";
  if (membership === "added" || membership === "selected") return "good";
  return "quiet";
}

function changeOf(row: RegionalCityResult): number | null {
  if (row.phase !== "complete" || row.limitation) return null;
  return regionalChange(row.originalMean, row.revisedMean);
}

function shown(row: RegionalCityResult, value: number | null): string {
  if (row.phase !== "complete" && row.phase !== "failed") return "—";
  return formatAffinity3(value);
}

function phaseText(phase: RegionalCityResult["phase"]): string {
  if (phase === "generating") return "Writing the original answer";
  if (phase === "discovering") return "Reading regional evidence";
  if (phase === "evaluating") return "Scoring the shared pool";
  if (phase === "failed") return "Failed";
  if (phase === "complete") return "Complete";
  return "Queued";
}

function demographicLine(row: RegionalCityResult): string {
  const probe = row.probe;
  if (!probe) return row.methodLabel;
  const age = probe.demographicApplied === "not_sent"
    ? "No age band was sent."
    : probe.demographicApplied === "echoed"
      ? "The age band was echoed."
      : "An age band was sent and was not confirmed by the response.";
  return `${age} Audience ids were not sent. ${probe.localityResolved ? "A locality echo came back." : "No locality echo came back."}`;
}

function modeCopy(mode: EvidenceMode, regional: RegionalState): string {
  if (mode === "interests") return "Interests only. No regional taste signal was sent, so this column is not a regional comparison.";
  if (mode === "joint") return "Regional tags and explicit interests were sent in the same Qloo request. Regional taste is a prior, not a claim about every resident.";
  if (regional.domain === "place" && regional.placeMode === "local") return "Local discovery. Each city is also the destination, so the candidate venues change by location. This is not a pure test of audience taste.";
  if (regional.domain === "place") return `Market comparison. Destination stays ${regional.destination?.label ?? "fixed"}.`;
  return "Regional only. No personal favorites were sent.";
}

function interestRows(regional: RegionalState): FingerprintInterest[] {
  return regional.interests.filter((item) => item.name.trim()).map((item) => ({
    name: item.name.trim(),
    entityId: null,
    kind: item.kind === "any" ? "any" : item.kind,
  }));
}

function toColumns(items: RegionalCityResult["revised"], domain: "book" | "place", scores: RegionalCityResult["scores"]): FingerprintColumn[] {
  return items.filter((item) => item.entityId).map((item) => {
    const score = scores.find((row) => row.entityId.toLowerCase() === item.entityId.toLowerCase());
    const explainability: Explainability = score
      ? { status: score.explainabilityStatus, contributions: score.contributions, warning: null, raw: null }
      : EMPTY_EXPLAIN;
    return {
      entityId: item.entityId,
      name: item.name,
      affinity: item.affinity,
      membership: item.membership,
      identity: item.identity,
      practical: item.practical,
      explainability,
      kind: domain === "book" ? "book" : "any",
    };
  });
}
