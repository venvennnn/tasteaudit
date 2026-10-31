"use client";

import { useState } from "react";
import { Cover } from "@/components/Cover";
import { TasteFingerprint, type FingerprintColumn, type FingerprintInterest } from "@/components/Fingerprint";
import { formatAffinity3, formatRatio, formatSigned3 } from "@/lib/audit/metrics";
import { alignRegionalTags } from "@/lib/audit/regional-compare";
import { regionalChange } from "@/lib/audit/regional-run";
import type { EvidenceMode, RegionalCityResult, RegionalState } from "@/lib/audit/regional-types";
import type { Explainability } from "@/lib/providers/qloo";

const EMPTY_EXPLAIN: Explainability = { status: "unavailable", contributions: [], warning: null, raw: null };

export function RegionalResults({
  regional,
  onRetry,
  onDownload,
}: {
  regional: RegionalState;
  onRetry: (city: string) => void;
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
  return (
    <div className="results-board" data-testid="regional-results">
      <section className="ta-panel" aria-label="Regional overview">
        <div className="ta-panel-head">
          <div>
            <h2>City overview</h2>
            <p>Original and revised affinity are both Qloo scores for that city’s own evidence. Compare them inside the city. The dots are not a ranking of cities.</p>
          </div>
        </div>
        <div className="regional-table-wrap">
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
                const change = row.limitation ? null : regionalChange(row.originalMean, row.revisedMean);
                const partial = row.phase === "complete" && ((row.originalCoverage.denominator > 0 && row.originalCoverage.numerator < row.originalCoverage.denominator) || (row.revisedCoverage.denominator > 0 && row.revisedCoverage.numerator < row.revisedCoverage.denominator));
                return (
                  <tr key={row.city} data-phase={row.phase}>
                    <td><button type="button" onClick={() => setPicked(row.city)}>{row.city}</button><small>{phaseText(row.phase)}</small></td>
                    <td data-testid="regional-method">{row.methodLabel || "Waiting"}</td>
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
        <div className="dot-chart" aria-label="Original and revised affinity by city">
          {rows.map((row) => {
            const max = Math.max(1, ...rows.flatMap((item) => [item.originalMean ?? 0, item.revisedMean ?? 0]));
            return (
              <div className="dot-row" key={row.city}>
                <span>{row.city}</span>
                <div className="dot-axis">
                  {row.originalMean != null ? <i className="dot original" style={{ left: `${(row.originalMean / max) * 100}%` }} title={`${row.city} Original Gemini ${formatAffinity3(row.originalMean)}`} /> : null}
                  {row.revisedMean != null && row.method !== "unavailable" ? <i className="dot revised" style={{ left: `${(row.revisedMean / max) * 100}%` }} title={`${row.city} Qloo-assisted Gemini ${formatAffinity3(row.revisedMean)}`} /> : null}
                </div>
              </div>
            );
          })}
          <p className="dot-key"><i className="dot original" /> Original Gemini <i className="dot revised" /> Qloo-assisted Gemini</p>
        </div>
        <p className="results-note">Higher Qloo affinity means closer alignment with the scoring evidence used for selection. It does not prove improved satisfaction.</p>
      </section>
      <section className="ta-panel">
        <h2>How the regional profiles differ</h2>
        <p>Ranks are the order Qloo returned inside that city. A blank cell was not returned. It is not zero interest. Scores are not treated as comparable across cities.</p>
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
        {rows.map((row) => (
          <p key={`${row.city}-demo`} className="muted">{row.city}: {row.probe ? demographicLine(row) : row.methodLabel}</p>
        ))}
      </section>
      <section className="ta-panel">
        <div className="city-tabs" role="tablist" aria-label="Cities">
          {rows.map((row) => (
            <button key={row.city} type="button" role="tab" aria-selected={row.city === current.city} onClick={() => setPicked(row.city)}>{row.city}</button>
          ))}
        </div>
        <h2>{current.city}</h2>
        <p>{modeCopy(current.evidence, regional)}</p>
        {current.limitation ? <p className="error">{current.limitation}</p> : null}
        {current.error && current.phase === "failed" ? <p className="error" role="alert">{current.error}</p> : null}
        <div className="compare-cols">
          <div>
            <h3>Original Gemini</h3>
            {current.originalAnswer ? <p>{current.originalAnswer}</p> : null}
            {current.original.map((item) => <ArmCard key={`${item.entityId}-${item.rank}`} item={item} domain={regional.domain} />)}
          </div>
          <div>
            <h3>Qloo-assisted Gemini</h3>
            {current.revisedAnswer ? <p data-testid="regional-revised">{current.revisedAnswer}</p> : null}
            {current.revised.map((item) => <ArmCard key={`${item.entityId}-${item.rank}`} item={item} domain={regional.domain} />)}
          </div>
        </div>
        <h3>What changed?</h3>
        <WhatChanged city={current} />
        <h3>Explain the basis</h3>
        <ul>
          {current.revised.map((item) => <li key={item.entityId}><strong>{item.name}.</strong> {item.explanation}</li>)}
        </ul>
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
      <section id="downloads">
        <h2>Download this regional run</h2>
        <div className="row-actions">
          <button type="button" className="btn" data-testid="regional-export-json" onClick={() => onDownload("json")}>Download JSON</button>
          <button type="button" className="btn ghost" data-testid="regional-export-csv" onClick={() => onDownload("csv")}>Download CSV</button>
        </div>
      </section>
    </div>
  );
}

function ArmCard({ item, domain }: { item: RegionalCityResult["original"][number]; domain: "book" | "place" }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rec-card" data-domain={domain}>
      <Cover name={item.name} kind={domain === "book" ? "book" : "any"} />
      <div>
        <strong>{item.name}</strong>
        <p>Affinity {formatAffinity3(item.affinity)} · {item.membership}{item.rankFrom && item.rankFrom !== item.rank ? ` · rank ${item.rankFrom} → ${item.rank}` : ""}</p>
        <p>{item.explanation}</p>
        <button type="button" className="text-btn" onClick={() => setOpen((value) => !value)}>{open ? "Hide evidence" : "Inspect evidence"}</button>
        {open ? <p>{item.identity}. {item.practical}. Entity {item.entityId || "unresolved"}.</p> : null}
      </div>
    </article>
  );
}

function WhatChanged({ city }: { city: RegionalCityResult }) {
  const original = new Map(city.original.filter((item) => item.entityId).map((item) => [item.entityId.toLowerCase(), item]));
  const revised = new Map(city.revised.map((item) => [item.entityId.toLowerCase(), item]));
  const removed = [...original.values()].filter((item) => !revised.has(item.entityId.toLowerCase()));
  const added = [...revised.values()].filter((item) => !original.has(item.entityId.toLowerCase()));
  const kept = [...revised.values()].filter((item) => original.has(item.entityId.toLowerCase()));
  if (city.original.length === 0 && city.revised.length === 0) return <p>{city.methodLabel || "No comparison yet."}</p>;
  return (
    <div>
      <p>Removed ids: {removed.length ? removed.map((item) => `${item.name} (${item.entityId})`).join(", ") : "none"}.</p>
      <p>Added ids: {added.length ? added.map((item) => `${item.name} (${item.entityId})`).join(", ") : "none"}.</p>
      <p>Retained ids: {kept.length ? kept.map((item) => `${item.name} (${item.entityId})`).join(", ") : "none"}.</p>
    </div>
  );
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
  return `${age} Audience ids were not sent. ${probe.localityResolved ? "A locality echo came back." : "No locality echo came back."} ${probe.warnings[0] ?? ""}`;
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
