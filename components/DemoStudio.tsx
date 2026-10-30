"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { ModeSwitch } from "@/components/ModeSwitch";
import { Journey } from "@/components/Journey";
import { BellIcon, BookIcon } from "@/components/icons";
import { estimateProviderCalls } from "@/lib/audit/estimate";
import { buildTask } from "@/lib/audit/orchestrate";
import { DEMO_PRESETS, type DemoPresetId } from "@/lib/session/presets";
import { activeCities, resultsReady, type Favorite } from "@/lib/session/state";
import { ResultsBody } from "@/components/ResultsStudio";

const KIND_TABS: Array<{ id: Favorite["kind"] | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "movie", label: "Movies & TV" },
  { id: "artist", label: "Music" },
  { id: "book", label: "Books" },
  { id: "any", label: "Any" },
];

export function DemoStudio() {
  const { state, update, run } = useSession();
  const [preset, setPreset] = useState<DemoPresetId | null>(state.scenario === "demo" ? (state.domain === "book" ? "bookseller" : "concierge") : null);
  const [extraCity, setExtraCity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [kindTab, setKindTab] = useState<Favorite["kind"] | "all">("all");
  const cities = activeCities(state);
  const taskPreview = useMemo(() => buildTask(state, cities[0] ?? "", state.seeds), [state, cities]);
  const estimate = estimateProviderCalls({
    favoriteCount: state.profile.favorites.filter((favorite) => favorite.name.trim()).length,
    cityCount: Math.max(1, cities.length),
    recommendationCount: state.recommendationCount,
    domain: state.domain,
    mode: "simulate",
    compare: state.compareAll,
  });

  function applyPreset(id: DemoPresetId) {
    setPreset(id);
    setFormError(null);
    update({ ...DEMO_PRESETS[id], seedOverrides: {} });
  }

  function editFavorite(index: number, patch: Partial<Favorite>) {
    const favorites = state.profile.favorites.map((favorite, item) => (item === index ? { ...favorite, ...patch } : favorite));
    update({ profile: { ...state.profile, favorites } });
  }

  async function start() {
    const city = cities[0];
    const task = buildTask(state, city ?? "", []);
    if ("error" in task) {
      setFormError(task.error);
      return;
    }
    setFormError(null);
    await run([city]);
  }

  const active = resultsReady(state) ? 4 : state.running ? 3 : preset ? 2 : 1;

  return (
    <div className="workspace">
      <SiteHeader tone="workspace" />
      <div className="studio">
        <div className="studio-main">
          <p className="eyebrow">01 / Simulated assistant</p>
          <h1>Whose AI are we testing?</h1>
          <p className="lede">Start with a familiar assistant or build your own scenario.</p>
          <ModeSwitch current="demo" />
          <p className="memory" data-testid="session-memory-note">
            This run lives in browser memory only. Refreshing or closing the tab clears it. Inputs are sent to the configured Qloo and Gemini providers. TasteAudit does not promise that those providers retain nothing.
          </p>
          <div className="choice-grid assistant-grid">
            <button type="button" className="choice" aria-pressed={preset === "concierge"} data-testid="preset-concierge" onClick={() => applyPreset("concierge")}>
              <span className="pin" aria-hidden="true" />
              <BellIcon />
              <strong>The concierge</strong>
              <small>Marriott-style assistant</small>
              <p>Recommend places for a customer’s evening out.</p>
            </button>
            <button type="button" className="choice" aria-pressed={preset === "bookseller"} data-testid="preset-bookseller" onClick={() => applyPreset("bookseller")}>
              <span className="pin" aria-hidden="true" />
              <BookIcon />
              <strong>The bookseller</strong>
              <small>Barnes & Noble-style assistant</small>
              <p>Discover books through the customer’s cultural interests.</p>
            </button>
          </div>
          <p className="muted">Simulated assistants · No brand affiliation</p>
          {state.disclaimer ? <p>{state.disclaimer}</p> : null}

          <section className="card" style={{ marginTop: 16 }}>
            <h2>What makes your customer, them?</h2>
            <p className="lede">Give every approach the same interests, context and constraints.</p>
            <p className="section-label">What are they into?</p>
            <div className="kind-tabs" role="group" aria-label="Interest kinds">
              {KIND_TABS.map((tab) => (
                <button key={tab.id} type="button" aria-pressed={kindTab === tab.id} onClick={() => setKindTab(tab.id)}>{tab.label}</button>
              ))}
            </div>
            <div className="interest-list">
              {state.profile.favorites.map((favorite, index) => (
                <div className="interest-chip" key={index} data-dim={kindTab !== "all" && favorite.kind !== kindTab ? "true" : "false"}>
                  <select className="chip-kind" aria-label={`Kind ${index + 1}`} value={favorite.kind} onChange={(event) => editFavorite(index, { kind: event.target.value as Favorite["kind"] })}>
                    <option value="movie">Movie</option>
                    <option value="artist">Artist</option>
                    <option value="book">Book</option>
                    <option value="any">Any</option>
                  </select>
                  <input data-testid={`favorite-name-${index}`} aria-label={`Favorite ${index + 1}`} placeholder="Search a movie, artist or book..." value={favorite.name} onChange={(event) => editFavorite(index, { name: event.target.value })} />
                  <button type="button" className="chip-x" aria-label={`Clear interest ${index + 1}`} onClick={() => editFavorite(index, { name: "" })}>×</button>
                </div>
              ))}
            </div>
            <p className="section-label">A little context</p>
            <div className="context-grid">
              <label>Name
                <input aria-label="Customer name" value={state.profile.label} onChange={(event) => update({ profile: { ...state.profile, label: event.target.value } })} />
              </label>
              <label>City
                <input aria-label="City" data-testid="city-input" value={state.cities[0] ?? ""} onChange={(event) => update({ cities: [event.target.value, ...state.cities.slice(1)] })} />
              </label>
              <label>Age, optional
                <input aria-label="Age" value={state.profile.age} onChange={(event) => update({ profile: { ...state.profile, age: event.target.value } })} />
              </label>
              <label>Budget
                <input aria-label="Budget" value={state.profile.budget} onChange={(event) => update({ profile: { ...state.profile, budget: event.target.value } })} />
              </label>
              <label>Currency
                <input aria-label="Currency" value={state.profile.currency} onChange={(event) => update({ profile: { ...state.profile, currency: event.target.value } })} />
              </label>
              <label>Language
                <input aria-label="Language" value={state.profile.language} onChange={(event) => update({ profile: { ...state.profile, language: event.target.value } })} />
              </label>
            </div>
            <label>The customer’s question
              <textarea aria-label="Question" value={state.taskQuestion} onChange={(event) => update({ taskQuestion: event.target.value })} />
            </label>
            <label>Practical needs, optional
              <input aria-label="Requirements" placeholder="Dietary needs, accessibility, travel distance..." value={state.profile.requirements} onChange={(event) => update({ profile: { ...state.profile, requirements: event.target.value } })} />
            </label>
            <details>
              <summary>Exact request</summary>
              {"error" in taskPreview ? <p>{taskPreview.error}</p> : <pre className="answer" data-testid="exact-request">{taskPreview.question}{"\n\n"}City: {taskPreview.city}{"\n"}Interests: {taskPreview.interests.map((item) => item.name).join(", ")}{"\n"}Budget: {taskPreview.budget} {taskPreview.currency}{"\n"}Language: {taskPreview.language}{"\n"}Requirements: {taskPreview.requirements}</pre>}
            </details>
            <p className="muted">Estimated provider calls if you run the current cities: {estimate.total}. That is an estimate, not a charge.</p>
            {formError ? <p className="error" role="alert">{formError}</p> : null}
          </section>
          {resultsReady(state) ? (
            <section className="card">
              <h2>Add another city</h2>
              <p>The first result is in. You can add up to three cities, one at a time.</p>
              <div className="row-actions">
                <input aria-label="Another city" value={extraCity} onChange={(event) => setExtraCity(event.target.value)} />
                <button type="button" className="btn ghost" data-testid="add-city" onClick={() => {
                  const city = extraCity.trim();
                  if (!city || cities.length >= 3) return;
                  update({ cities: [...cities, city] });
                  setExtraCity("");
                  void run([city]);
                }}>Add city and run</button>
              </div>
            </section>
          ) : null}
          <div className="run-bar">
            <p className="muted">Same customer context for every approach.</p>
            <button type="button" className="btn cyan" data-testid="run-audit" onClick={() => void start()} disabled={state.running || !preset}>
              {state.running ? "Running" : "Review & run"}
            </button>
          </div>
        </div>
        <div className="stack">
          <ProgressCard />
          <CustomerRail />
        </div>
      </div>
      <Journey active={active} />
      <ResultsBody showEmpty={false} />
    </div>
  );
}

function CustomerRail() {
  const { state } = useSession();
  const interests = state.profile.favorites.filter((favorite) => favorite.name.trim());
  return (
    <aside className="card rail">
      <h2>Your customer</h2>
      <div className="mini-sky" aria-hidden="true">
        <span style={{ left: "22%", top: "40%" }} />
        <span style={{ left: "48%", top: "28%", background: "#ff4f9a" }} />
        <span style={{ left: "70%", top: "48%" }} />
        <span style={{ left: "40%", top: "62%" }} />
      </div>
      <p className="rail-name">{state.profile.label || "Customer"}</p>
      <p className="muted">{state.cities[0] || "City not set"}</p>
      <ul className="rail-tags">
        {interests.map((favorite) => <li key={`${favorite.kind}-${favorite.name}`}>{favorite.name}</li>)}
      </ul>
      <p className="muted">Same context for every approach. Gemini receives this customer brief. Qloo receives the resolved interests.</p>
    </aside>
  );
}

function ProgressCard() {
  const { state } = useSession();
  const city = activeCities(state)[0];
  const item = city ? state.cases[city] : undefined;
  const rows = [
    ["Resolve interests", state.seedStage.status],
    ["Original answer", item?.stages.original.status ?? "idle"],
    ["Evidence check", item?.stages.score.status ?? item?.stages.discover.status ?? "idle"],
    ["Revised answer", item?.stages.revise.status ?? "idle"],
  ];
  return (
    <aside className="card" data-testid="progress">
      <h2>How your audit works</h2>
      <ol className="how-list">
        <li><span>1</span><div><strong>Choose an assistant</strong><p>Test a familiar assistant or build your own scenario.</p></div></li>
        <li><span>2</span><div><strong>Add a customer</strong><p>Bring a real customer question or use one of ours.</p></div></li>
        <li><span>3</span><div><strong>Compare the evidence</strong><p>See how the plain model and the Qloo revision differ.</p></div></li>
      </ol>
      <ul className="stage-list">
        {rows.map(([label, status]) => (
          <li key={label}><span>{label}</span><span className={status === "failed" ? "pill bad" : "pill"} data-testid={`stage-${label.toLowerCase().replace(/\s+/g, "-")}`}>{status}</span></li>
        ))}
      </ul>
      {state.seedStage.error ? <p className="error" role="alert" data-testid="missing-key-error">{state.seedStage.error.message}</p> : null}
      {item?.stages.original.error ? <p className="error" role="alert">{item.stages.original.error.message}</p> : null}
      {item?.stages.score.error ? <Retry city={city!} message={item.stages.score.error.message} /> : null}
      {item?.stages.revise.error ? <Retry city={city!} message={item.stages.revise.error.message} /> : null}
    </aside>
  );
}

function Retry({ city, message }: { city: string; message: string }) {
  const { run } = useSession();
  return (
    <div>
      <p className="error" role="alert">{message}</p>
      <button type="button" className="btn ghost" data-testid="retry-stage" onClick={() => void run([city])}>Retry failed stage</button>
    </div>
  );
}
