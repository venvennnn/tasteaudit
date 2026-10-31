"use client";

import { useState } from "react";
import { Cover } from "@/components/Cover";
import { cobaltMix, explanationValue, scaleDomain, strongestConnection } from "@/lib/audit/attribution";
import { formatAffinity3 } from "@/lib/audit/metrics";
import type { SensitivityRun } from "@/lib/audit/sensitivity";
import type { Explainability } from "@/lib/providers/qloo";
import type { ArtworkKind } from "@/lib/catalog/rank";

export type FingerprintInterest = { name: string; entityId: string | null; kind: ArtworkKind };
export type FingerprintColumn = {
  entityId: string;
  name: string;
  affinity: number | null;
  membership: string;
  identity: string;
  practical: string;
  explainability: Explainability;
  kind: ArtworkKind;
};

const TIP = "Qloo explanation score. This is the contribution Qloo returned for that interest on this entity when feature.explainability was requested. It is not a percentage, a causal effect, or an input weight.";

export function TasteFingerprint({
  interests,
  original,
  revised,
  sensitivity,
  onSensitivity,
  sensitivitySupported,
}: {
  interests: FingerprintInterest[];
  original: FingerprintColumn[];
  revised: FingerprintColumn[];
  sensitivity: SensitivityRun | null;
  onSensitivity?: () => void;
  sensitivitySupported: boolean;
}) {
  const [arm, setArm] = useState<"original" | "revised" | "compare">("revised");
  const [view, setView] = useState<"explain" | "sensitivity">("explain");
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<{ interest: string; recommendation: string; value: number | null; available: boolean } | null>(null);
  const [col, setCol] = useState<number | null>(null);
  const visible = arm === "original" ? [original] : arm === "revised" ? [revised] : [original, revised];
  const titles = arm === "compare" ? ["Original Gemini", "Qloo-assisted Gemini"] : [arm === "original" ? "Original Gemini" : "Qloo-assisted Gemini"];
  const domain = scaleDomain(visible.flatMap((columns) => columns.flatMap((column) => interests.map((interest) => explanationValue(interest, column.explainability)))));
  const anyValue = domain !== null;
  const activeColumns = arm === "original" ? original : revised;
  const active = activeColumns.find((column) => column.entityId === picked) ?? null;

  function downloadSvg() {
    const svg = matrixSvg(interests, arm === "compare" ? revised : activeColumns, domain);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "taste-fingerprint.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadPng() {
    const columns = arm === "compare" ? revised : activeColumns;
    const canvas = document.createElement("canvas");
    const cell = 72;
    const label = 160;
    canvas.width = label + columns.length * cell + 24;
    canvas.height = 88 + interests.length * cell + 24;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a";
    ctx.font = "14px sans-serif";
    columns.forEach((column, index) => {
      ctx.fillText(column.name.slice(0, 12), label + index * cell + 8, 28);
      ctx.fillStyle = "#64748b";
      ctx.fillText(formatAffinity3(column.affinity), label + index * cell + 8, 48);
      ctx.fillStyle = "#0f172a";
    });
    interests.forEach((interest, row) => {
      ctx.fillText(interest.name.slice(0, 18), 12, 88 + row * cell + 28);
      columns.forEach((column, index) => {
        const value = explanationValue(interest, column.explainability);
        const x = label + index * cell + 8;
        const y = 64 + row * cell;
        ctx.fillStyle = value === null || !domain ? "#ffffff" : cobaltMix(value, domain) ?? "#ffffff";
        ctx.strokeStyle = "#dbe3ef";
        ctx.lineWidth = 1;
        roundRect(ctx, x, y, 56, 56, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#0f172a";
        ctx.fillText(value === null ? "—" : value.toFixed(3), x + 8, y + 32);
      });
    });
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "taste-fingerprint.png";
    link.click();
  }

  return (
    <section className="fp" data-testid="fingerprint" aria-label="Taste fingerprint">
      <div className="ta-panel-head">
        <div>
          <p className="kicker">Taste fingerprint</p>
          <h2>Which interests support each choice?</h2>
          <p>Each cell is a Qloo explanation score for one explicit interest and one recommendation. Missing attribution stays blank.</p>
        </div>
      </div>
      <div className="fp-controls">
        <div className="seg" role="group" aria-label="Which recommendations">
          {(["original", "revised", "compare"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={arm === value} onClick={() => { setArm(value); setPicked(null); }}>{value === "original" ? "Original" : value === "revised" ? "Revised" : "Compare"}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Explanation source">
          <button type="button" aria-pressed={view === "explain"} onClick={() => setView("explain")}>Qloo explanations</button>
          <button type="button" aria-pressed={view === "sensitivity"} onClick={() => setView("sensitivity")}>Input sensitivity</button>
        </div>
      </div>
      {view === "sensitivity" ? (
                <SensitivityBoard sensitivity={sensitivity} interests={interests} columns={revised.length > 0 ? revised : original} supported={sensitivitySupported} />
      ) : !anyValue ? (
        <p className="fp-empty" data-testid="fingerprint-empty">Qloo did not return interest-level explanations for this result.</p>
      ) : (
        <>
          <p className="fp-tip" title={TIP}><strong>Qloo explanation score.</strong> {TIP}</p>
          {domain ? <Legend domain={domain} /> : null}
          <div className={arm === "compare" ? "fp-pair" : "fp-single"}>
            {visible.map((columns, index) => (
              <Matrix
                key={titles[index]}
                title={titles[index] ?? ""}
                interests={interests}
                columns={columns}
                domain={domain}
                hoverCol={col}
                onHoverCol={setCol}
                onHover={setHover}
                onPick={(id) => setPicked(id)}
              />
            ))}
          </div>
          {hover ? (
            <p className="fp-hover" role="status">
              {hover.interest} · {hover.recommendation} · {hover.available ? hover.value?.toFixed(3) : "Explanation missing"} · Qloo explanation score · {hover.available ? "Returned" : "Not returned"}
            </p>
          ) : <p className="fp-hover">Hover a cell for the interest, recommendation, and returned score.</p>}
          {active ? <Detail column={active} interests={interests} /> : null}
        </>
      )}
      <div className="row-actions">
        <button type="button" className="btn ghost" onClick={downloadSvg}>Download SVG</button>
        <button type="button" className="btn ghost" onClick={downloadPng}>Download PNG</button>
        {sensitivitySupported && onSensitivity ? (
          <button type="button" className="btn ghost" data-testid="sensitivity-run" onClick={onSensitivity} disabled={sensitivity?.status === "running"}>
            {sensitivity?.status === "running" ? "Scoring sensitivity…" : "Run input sensitivity"}
          </button>
        ) : null}
      </div>
      {sensitivitySupported ? <p className="muted">Run input sensitivity sends one extra scoring request per interest. Candidates stay fixed. It is separate from the Qloo explanation score.</p> : null}
    </section>
  );
}

function Legend({ domain }: { domain: { min: number; max: number } }) {
  return (
    <div className="fp-legend" aria-hidden="true">
      <span>{domain.min.toFixed(3)}</span>
      <i />
      <span>{domain.max.toFixed(3)}</span>
      <span>One scale for the matrices on screen. A dash is missing, not zero.</span>
    </div>
  );
}

function Matrix({
  title,
  interests,
  columns,
  domain,
  hoverCol,
  onHoverCol,
  onHover,
  onPick,
}: {
  title: string;
  interests: FingerprintInterest[];
  columns: FingerprintColumn[];
  domain: { min: number; max: number } | null;
  hoverCol: number | null;
  onHoverCol: (index: number | null) => void;
  onHover: (value: { interest: string; recommendation: string; value: number | null; available: boolean } | null) => void;
  onPick: (id: string) => void;
}) {
  return (
    <div className="fp-scroll">
      <table className="fp-matrix">
        <caption>{title}. Interest rows, recommendation columns, Qloo explanation scores.</caption>
        <thead>
          <tr>
            <th className="fp-corner" scope="col">Interest</th>
            {columns.map((column, index) => (
              <th key={column.entityId} scope="col" data-hot={hoverCol === index ? "true" : "false"}>
                <button type="button" className="fp-col" onClick={() => onPick(column.entityId)} onMouseEnter={() => onHoverCol(index)} onMouseLeave={() => onHoverCol(null)}>
                  <Cover name={column.name} kind={column.kind} />
                  <span className="fp-title">{column.name}</span>
                  <span className={`fp-flag flag-${column.membership}`}>{column.membership}</span>
                  <span className="fp-affinity">Affinity {formatAffinity3(column.affinity)}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {interests.map((interest) => (
            <tr key={interest.entityId ?? interest.name}>
              <th scope="row">
                <span className="fp-interest">
                  <Cover name={interest.name} kind={interest.kind} />
                  <span>{interest.name}</span>
                </span>
              </th>
              {columns.map((column, index) => {
                const value = explanationValue(interest, column.explainability);
                const available = column.explainability.status === "available" && value !== null;
                return (
                  <td key={column.entityId} data-hot={hoverCol === index ? "true" : "false"}>
                    <button
                      type="button"
                      className={value === null ? "fp-cell missing" : "fp-cell"}
                      style={value === null ? undefined : { background: cobaltMix(value, domain) ?? undefined }}
                      aria-label={`${interest.name}, ${column.name}, ${available ? value?.toFixed(3) : "explanation missing"}`}
                      onMouseEnter={() => { onHoverCol(index); onHover({ interest: interest.name, recommendation: column.name, value, available }); }}
                      onFocus={() => onHover({ interest: interest.name, recommendation: column.name, value, available })}
                      onMouseLeave={() => onHover(null)}
                      onClick={() => onPick(column.entityId)}
                    >
                      {value === null ? "—" : value.toFixed(3)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ column, interests }: { column: FingerprintColumn; interests: FingerprintInterest[] }) {
  const rows = interests.map((interest) => ({ name: interest.name, value: explanationValue(interest, column.explainability) }));
  const strongest = strongestConnection(rows);
  const max = Math.max(0.0001, ...rows.map((row) => Math.abs(row.value ?? 0)));
  return (
    <aside className="fp-detail" aria-label={`Why ${column.name}`}>
      <h3>{column.name}</h3>
      <p>Overall affinity {formatAffinity3(column.affinity)}. This is separate from the per-interest explanation scores.</p>
      <p>Identity: {column.identity}. {column.practical}</p>
      <ul>
        {rows.map((row) => (
          <li key={row.name}>
            <span>{row.name}</span>
            <i style={row.value === null ? undefined : { width: `${(Math.abs(row.value) / max) * 100}%` }} data-missing={row.value === null ? "true" : "false"} />
            <b>{row.value === null ? "—" : row.value.toFixed(3)}</b>
          </li>
        ))}
      </ul>
      {strongest ? <p><strong>Strongest reported connection.</strong> {strongest.name} at {strongest.value.toFixed(3)}. Omitted interests are not treated as zero.</p> : <p>No interest-level explanation was returned for this recommendation.</p>}
      <p>{grounded(column.name, rows)}</p>
    </aside>
  );
}

function grounded(name: string, rows: { name: string; value: number | null }[]): string {
  const present = rows.filter((row) => row.value !== null);
  if (present.length === 0) return `${name} has an affinity, and Qloo did not return interest-level explanations to describe it.`;
  const lead = [...present].sort((a, b) => (b.value as number) - (a.value as number))[0];
  return `${name} has a returned Qloo explanation score of ${lead?.value?.toFixed(3)} for ${lead?.name}. Other listed interests are shown only when a contribution came back.`;
}

function SensitivityBoard({
  sensitivity,
  interests,
  columns,
  supported,
}: {
  sensitivity: SensitivityRun | null;
  interests: FingerprintInterest[];
  columns: FingerprintColumn[];
  supported: boolean;
}) {
  if (!supported) return <p>Input sensitivity needs at least two resolved interests and a fixed candidate pool.</p>;
  if (!sensitivity || sensitivity.status === "idle" || sensitivity.points.length === 0) {
    return (
      <div>
        <p>Leave-one-interest-out sensitivity is computed only after you run it. The difference is the full-context score minus the score without that interest.</p>
      </div>
    );
  }
  const max = Math.max(0.0001, ...sensitivity.points.map((point) => Math.abs(point.delta ?? 0)));
  return (
    <div data-testid="sensitivity-board">
      <p>{sensitivity.note}</p>
      {sensitivity.error ? <p className="error">{sensitivity.error}</p> : null}
      {columns.map((column) => (
        <article key={column.entityId} className="sens-card">
          <h3>{column.name}</h3>
          <p className="muted">Change when this interest is removed</p>
          <ul>
            {interests.map((interest) => {
              const point = sensitivity.points.find((item) => item.entityId.toLowerCase() === column.entityId.toLowerCase() && item.interest.toLowerCase() === interest.name.toLowerCase());
              const delta = point?.delta ?? null;
              const width = delta === null ? 0 : (Math.abs(delta) / max) * 50;
              return (
                <li key={interest.name}>
                  <span>{interest.name}</span>
                  <span className="sens-track" title={delta === null ? "Unavailable" : `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`}>
                    <i className="sens-zero" />
                    {delta === null ? <i className="sens-missing">—</i> : <i className={delta >= 0 ? "sens-pos" : "sens-neg"} style={delta >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />}
                  </span>
                  <b>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(3)}`}</b>
                </li>
              );
            })}
          </ul>
        </article>
      ))}
    </div>
  );
}

function matrixSvg(interests: FingerprintInterest[], columns: FingerprintColumn[], domain: { min: number; max: number } | null): string {
  const cell = 64;
  const label = 140;
  const width = label + columns.length * cell + 16;
  const height = 72 + interests.length * cell + 16;
  const bodies = interests.map((interest, row) => columns.map((column, index) => {
    const value = explanationValue(interest, column.explainability);
    const fill = value === null || !domain ? "#ffffff" : cobaltMix(value, domain);
    const x = label + index * cell;
    const y = 56 + row * cell;
    return `<rect x="${x}" y="${y}" width="52" height="52" rx="8" fill="${fill ?? "#ffffff"}" stroke="#dbe3ef"/><text x="${x + 8}" y="${y + 30}" font-size="12" fill="#0f172a">${value === null ? "—" : value.toFixed(3)}</text>`;
  }).join("")).join("");
  const heads = columns.map((column, index) => `<text x="${label + index * cell}" y="24" font-size="12" fill="#0f172a">${escapeXml(column.name.slice(0, 16))}</text><text x="${label + index * cell}" y="42" font-size="11" fill="#64748b">${formatAffinity3(column.affinity)}</text>`).join("");
  const labels = interests.map((interest, row) => `<text x="8" y="${88 + row * cell}" font-size="12" fill="#0f172a">${escapeXml(interest.name.slice(0, 18))}</text>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/>${heads}${labels}${bodies}</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
