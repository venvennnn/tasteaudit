"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cover } from "@/components/Cover";
import { Frame } from "@/components/Frame";
import { WhyRail } from "@/components/Rails";
import type { ArtworkKind } from "@/lib/catalog/rank";

const CITIES = ["New York", "Kuala Lumpur", "Osaka"] as const;
type City = (typeof CITIES)[number];
type Assistant = "concierge" | "bookseller";

const INTERESTS: Array<{ name: string; kind: ArtworkKind; label: string }> = [
  { name: "Radiohead", kind: "artist", label: "Music" },
  { name: "Spirited Away", kind: "movie", label: "Movie" },
  { name: "Dune", kind: "book", label: "Book" },
];

const PALETTES: Record<City, string[][]> = {
  "New York": [["#241c16", "#d9c3a2", "#8e877c"], ["#16181d", "#e6d3a4", "#6d5848"], ["#d7d2cb", "#8f979c", "#2b3136"]],
  "Kuala Lumpur": [["#1c2420", "#ead7b0", "#6d8a72"], ["#121820", "#f2e4c6", "#c4552e"], ["#243028", "#d7e2d4", "#89a184"]],
  Osaka: [["#171a24", "#8fd0cb", "#e6e2d8"], ["#121722", "#3c69ff", "#d5dcea"], ["#292623", "#cbb89a", "#6c7b69"]],
};

export function HomeStage() {
  const [assistant, setAssistant] = useState<Assistant>("concierge");
  const [city, setCity] = useState<City>("Kuala Lumpur");
  const [open, setOpen] = useState<string | null>(null);
  const staged = useStagedKey(`${assistant}:${city}`);
  const places = assistant === "concierge";
  const shownCity = (staged.current.split(":")[1] ?? city) as City;

  return (
    <Frame word={"WHY?"} rail={<WhyRail />} resettable={false} mode="page">
      <h1>Change the context.<br />Challenge the answer.</h1>
      <p className="lede">Cultural intelligence testing for AI recommendations.</p>
      <section className="live" aria-label="Illustrative preview">
        <div className="live-toolbar">
          <p className="kicker">Live demo / Simulated assistant</p>
          <label className="assistant-select">
            <span className="sr-only">Assistant</span>
            <select value={assistant} onChange={(event) => { setAssistant(event.target.value as Assistant); setOpen(null); }}>
              <option value="concierge">Concierge</option>
              <option value="bookseller">Bookseller</option>
            </select>
          </label>
          <div className="city-tabs" role="tablist" aria-label="Illustrative cities">
            {CITIES.map((item) => (
              <button key={item} type="button" role="tab" aria-selected={city === item} onClick={() => { setCity(item); setOpen(null); }}>{item}</button>
            ))}
          </div>
        </div>
        <div className="swap-line" data-busy={staged.busy ? "true" : "false"} aria-hidden="true"><span /></div>
        <div className="live-grid" data-busy={staged.busy ? "true" : "false"}>
          <aside className="persona">
            <span className="avatar" aria-hidden="true">A</span>
            <strong>Alex</strong>
            <span>{shownCity}</span>
            <Link href="/demo">Edit profile <span aria-hidden="true">→</span></Link>
            <p className="section-label">Interests</p>
            <ul className="thumb-list">
              {INTERESTS.map((interest) => (
                <li key={interest.name}>
                  <Cover name={interest.name} kind={interest.kind} />
                  <span>{interest.name}<br />{interest.label}</span>
                </li>
              ))}
            </ul>
            <p className="section-label">Question</p>
            <p className="question-line">{places ? "Three places for an evening out." : "Three books for a quiet week."}</p>
            <Link href="/demo">Edit question</Link>
          </aside>
          <div className="live-rows">
            <PreviewRow
              index="01"
              title="Original assistant"
              copy="A general recommendation based on the original prompt."
              colors={PALETTES[shownCity]}
              photos={places ? undefined : INTERESTS}
              open={open === "original"}
              onToggle={() => setOpen(open === "original" ? null : "original")}
              evidence={open === "original-evidence"}
              onEvidence={() => setOpen(open === "original-evidence" ? null : "original-evidence")}
              answer="Illustrative copy only. A live run writes the model’s real answer here. This preview has no affinity score."
            />
            <PreviewRow
              index="02"
              title="Qloo-assisted revision"
              copy="A more culturally grounded result using Qloo evidence."
              colors={[PALETTES[shownCity][2], PALETTES[shownCity][0], PALETTES[shownCity][1]]}
              photos={places ? undefined : INTERESTS}
              open={open === "revised"}
              onToggle={() => setOpen(open === "revised" ? null : "revised")}
              evidence={open === "revised-evidence"}
              onEvidence={() => setOpen(open === "revised-evidence" ? null : "revised-evidence")}
              answer="Illustrative revision. Affinity appears after a live run. Missing evidence stays visible."
            />
          </div>
        </div>
        <p className="muted">Illustrative candidates. Pictures are the first catalog image for that name. Not a measured result. No brand affiliation.</p>
      </section>
    </Frame>
  );
}

function PreviewRow({
  index,
  title,
  copy,
  colors,
  photos,
  open,
  onToggle,
  evidence,
  onEvidence,
  answer,
}: {
  index: string;
  title: string;
  copy: string;
  colors: string[][];
  photos?: Array<{ name: string; kind: ArtworkKind }>;
  open: boolean;
  onToggle: () => void;
  evidence: boolean;
  onEvidence: () => void;
  answer: string;
}) {
  return (
    <article className="live-row">
      <div className="rec-head">
        <span className="idx">{index}</span>
        <div>
          <h2>{title}</h2>
          <p>{copy}</p>
        </div>
        <p className="illus-label">Illustrative candidates</p>
      </div>
      <div className="shot-row">
        {photos ? photos.map((photo) => (
          <span className="shot shot-photo" key={photo.name}>
            <Cover name={photo.name} kind={photo.kind} fill />
            <span className="shot-caption">{photo.name}</span>
          </span>
        )) : colors.map((palette, item) => <Shot key={item} motif={item} colors={palette} />)}
      </div>
      <div className="text-actions">
        <button type="button" onClick={onToggle}>→ Read answer</button>
        <button type="button" onClick={onEvidence}>Inspect evidence</button>
      </div>
      <div className="reveal" data-open={open || evidence ? "true" : "false"}>
        <div>
          {open ? <p className="answer">{answer}</p> : null}
          {evidence ? (
            <div className="mini-proof">
              <p>Entity identity <span>Not a live match</span></p>
              <p>Qloo affinity <span>Available after a live run</span></p>
              <p>Input contributions <span>Shown when returned</span></p>
              <p>Practical checks <span>Unverified</span></p>
              <p className="muted">Affinity appears after a live run. Missing evidence stays visible.</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Shot({ motif, colors }: { motif: number; colors: string[] }) {
  return <span className="shot" data-motif={motif} style={{ "--c1": colors[0], "--c2": colors[1], "--c3": colors[2] } as React.CSSProperties} />;
}

function useStagedKey(key: string) {
  const [current, setCurrent] = useState(key);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (key === current) return;
    setBusy(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setCurrent(key);
      setBusy(false);
    }, reduce ? 0 : 480);
    return () => window.clearTimeout(timer);
  }, [key, current]);
  return { current, busy };
}
