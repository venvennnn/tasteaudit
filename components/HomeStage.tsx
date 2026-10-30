"use client";

import Link from "next/link";
import { Cover } from "@/components/Cover";
import { Frame } from "@/components/Frame";
import { DEFAULT_GEMINI_MODEL } from "@/lib/schemas/limits";
import { DEMO_BOOK_READERS, DEMO_PLACE_CITIES } from "@/lib/session/presets";

const SEEDS = [
  { name: "Spirited Away", kind: "movie" as const, label: "Movie" },
  { name: "Radiohead", kind: "artist" as const, label: "Music" },
  { name: "Dune", kind: "book" as const, label: "Book" },
];

export function HomeStage() {
  return (
    <Frame resettable={false}>
      <section className="ta-strip">
        <span><i className="live-dot" aria-hidden="true" /> AI Recommendation Audits</span>
        <span className="ta-model">{DEFAULT_GEMINI_MODEL}</span>
      </section>
      <section className="ta-hero">
        <p className="ta-badge">Qloo cultural graph · explicit interests</p>
        <h1>Your AI knows the words.<br /><span>Does it know the customer?</span></h1>
        <p className="lede">Audit a recommendation against the interests and constraints a customer actually stated. Scores appear after a live run.</p>
        <div className="ta-cta-row">
          <Link className="btn" href="/demo" data-testid="cta-demo">Try interactive demo</Link>
          <Link className="btn ghost" href="/audit">Audit your company</Link>
        </div>
        <div className="ta-pills">
          <span>Session only</span>
          <span>No database</span>
          <span>Places by city, books by interest</span>
        </div>
      </section>
      <section className="ta-panel" aria-label="How the two arms differ">
        <div className="ta-panel-head">
          <div>
            <h2>See what changes with Qloo</h2>
            <p>Original Gemini and a revision written from the names TasteAudit already selected.</p>
          </div>
          <span className="ta-chip">Filled by your session</span>
        </div>
        <div className="ta-arm-grid">
          <article className="ta-arm">
            <header>
              <strong>Original Gemini</strong>
              <span>Ungrounded</span>
            </header>
            <p>The model answers the brief with no Qloo candidates and no affinity score of its own.</p>
            <Metric label="Mean taste affinity" value="After a live run" width="0%" />
            <Metric label="Replacements" value="Not counted yet" width="0%" />
          </article>
          <article className="ta-arm ta-arm-hot">
            <header>
              <strong>Qloo-assisted revision</strong>
              <span>Selected, then written</span>
            </header>
            <p>Discovery and scoring use the interests you named. Gemini writes the list TasteAudit selected. It does not invent the affinity.</p>
            <Metric label="Mean taste affinity" value="After a live run" width="0%" tone="blue" />
            <Metric label="Replacements" value="Only when a new name is eligible" width="0%" tone="blue" />
          </article>
        </div>
        <div className="ta-seed-row">
          {SEEDS.map((seed) => (
            <span key={seed.name} className="ta-seed">
              <Cover name={seed.name} kind={seed.kind} />
              <span>{seed.name}<small>{seed.label}</small></span>
            </span>
          ))}
        </div>
        <p className="muted">Pictures are the first catalog image for that name. They are not a score. This bench does not show a sample size, a significance test, or a measured lift.</p>
      </section>
      <section className="ta-cities">
        <div className="ta-panel-head">
          <div>
            <p className="kicker">Place experiment</p>
            <h2>One brief. Four cities.</h2>
          </div>
          <p>The concierge demo keeps the same interests and sends each city as filter.location.query. That is a locality candidate filter. It does not condition affinity.</p>
        </div>
        <div className="city-card-grid">
          {DEMO_PLACE_CITIES.map((city) => (
            <article key={city} className="city-score-card">
              <strong>{city}</strong>
              <p>Compared when you run the place demo. The page shows that city’s own ids, affinities, and request.</p>
              <Link href="/demo">Open the demo</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="ta-cities">
        <div className="ta-panel-head">
          <div>
            <p className="kicker">Book experiment</p>
            <h2>Four readers. Different interests.</h2>
          </div>
          <p>The bookseller demo compares explicitly supplied interest lists. Interest-based affinity. City was not applied to Qloo scoring.</p>
        </div>
        <div className="city-card-grid">
          {DEMO_BOOK_READERS.map((reader) => (
            <article key={reader.label} className="city-score-card">
              <strong>{reader.label}</strong>
              <p>{reader.favorites.map((favorite) => favorite.name).join(", ")}</p>
              <Link href="/demo">Open the demo</Link>
            </article>
          ))}
        </div>
      </section>
      <section className="ta-panel">
        <p className="kicker">Audit pipeline</p>
        <h2>How a run moves</h2>
        <div className="ta-steps">
          <article>
            <span>01 / Resolve</span>
            <h3>Name the interests</h3>
            <p>Favorite names are searched on Qloo. An unmatched name stays unmatched.</p>
          </article>
          <article>
            <span>02 / Measure</span>
            <h3>Score the pool</h3>
            <p>Original names and discovered candidates share one scoring request. Missing affinity is not zero.</p>
          </article>
          <article>
            <span>03 / Repair</span>
            <h3>Write the selected list</h3>
            <p>TasteAudit chooses the revised names. Gemini writes those names and does not put the originals back.</p>
          </article>
        </div>
      </section>
      <section className="ta-metrics">
        <div>
          <span>Architecture</span>
          <strong>Browser session</strong>
          <small>No database in this app</small>
        </div>
        <div>
          <span>Geography</span>
          <strong>Shown per request</strong>
          <small>Filter, signal, and Gemini are listed apart</small>
        </div>
        <div>
          <span>Evidence</span>
          <strong>Qloo affinity</strong>
          <small>Both arms use the same score</small>
        </div>
        <div>
          <span>Downloads</span>
          <strong>JSON and CSV</strong>
          <small>The file stays on your device</small>
        </div>
      </section>
    </Frame>
  );
}

function Metric({ label, value, width, tone = "slate" }: { label: string; value: string; width: string; tone?: "slate" | "blue" }) {
  return (
    <div className="ta-metric">
      <div><span>{label}</span><strong>{value}</strong></div>
      <span className="ta-track"><i data-tone={tone} style={{ width }} /></span>
    </div>
  );
}
