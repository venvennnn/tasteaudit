"use client";

import { useEffect, useRef } from "react";

type Point = { city: string; original: number | null; revised: number | null };
type Coverage = { city: string; numerator: number; denominator: number };

function wrap(value: string): string {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 16 && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.join("<br>");
}

export function AffinityChart({ points }: { points: Point[] }) {
  return <Plot title="Case affinity" points={points} coverage={[]} mode="affinity" />;
}

export function CoverageChart({ coverage }: { coverage: Coverage[] }) {
  return <Plot title="Score coverage by city" points={[]} coverage={coverage} mode="coverage" />;
}

function Plot({ title, points, coverage, mode }: { title: string; points: Point[]; coverage: Coverage[]; mode: "affinity" | "coverage" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    let purge: ((node: HTMLElement) => void) | null = null;
    void import("plotly.js-dist-min").then((mod) => {
      if (!active || !ref.current) return;
      const Plotly = mod.default;
      purge = Plotly.purge.bind(Plotly);
      const layout = {
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        margin: { l: 72, r: 24, t: 36, b: 110 },
        showlegend: true,
        legend: { orientation: "h" as const },
        xaxis: { showgrid: false, automargin: true, tickfont: { size: 12 } },
        yaxis: { showgrid: false, automargin: true, title: mode === "affinity" ? "Affinity" : "Coverage" },
        title: { text: title, font: { size: 14, color: "#10243f" } },
      };
      const data = mode === "affinity"
        ? [
            { type: "scatter", mode: "markers", name: "Original", x: points.map((point) => wrap(point.city)), y: points.map((point) => point.original), marker: { color: "#128eae", size: 12 } },
            { type: "scatter", mode: "markers", name: "Revised", x: points.map((point) => wrap(point.city)), y: points.map((point) => point.revised), marker: { color: "#e07a62", size: 12 } },
          ]
        : [{
            type: "scatter",
            mode: "markers",
            name: "Scored entities",
            x: coverage.map((item) => wrap(item.city)),
            y: coverage.map((item) => (item.denominator === 0 ? null : item.numerator / item.denominator)),
            text: coverage.map((item) => `${item.numerator}/${item.denominator}`),
            marker: { color: "#10243f", size: 12 },
          }];
      void Plotly.newPlot(ref.current, data, layout, { displayModeBar: false, responsive: true });
    });
    return () => {
      active = false;
      if (purge && element) purge(element);
    };
  }, [title, points, coverage, mode]);
  return <div className="chart" ref={ref} data-testid={`${mode}-chart`} role="img" aria-label={title} />;
}
