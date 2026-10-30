"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { estimateProviderCalls } from "@/lib/audit/estimate";
import { buildTask } from "@/lib/audit/orchestrate";
import { DEMO_PRESETS, type DemoPresetId } from "@/lib/session/presets";
import { activeCities, resultsReady, type Favorite } from "@/lib/session/state";
import { ResultsBody } from "@/components/ResultsStudio";

export function DemoStudio() {
  const { state, update, run } = useSession();
  const [preset, setPreset] = useState<DemoPresetId | null>(state.scenario === "demo" ? (state.domain === "book" ? "bookseller" : "concierge") : null);
  const [extraCity, setExtraCity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
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

  return (
    <div className="workspace">
      <SiteHeader tone="workspace" />
      <div className="page-intro">
        <h1>Guided demo</h1>
        <p>Choose a simulated assistant, edit the persona, and read the exact request before it runs. These presets are inputs, not finished audits.</p>
        <p className="memory" data-testid="session-memory-note">
          This run lives in browser memory only. Refreshing or closing the tab clears it. Inputs are sent to the configured Qloo and Gemini providers. TasteAudit does not promise that those providers retain nothing.
        </p>
      </div>
      <div className="layout">
        <div className="stack">
          <section className="card">
            <h2>Simulated assistant</h2>
            <div className="choice-grid">
              <button type="button" className="choice" aria-pressed={preset === "concierge"} data-testid="preset-concierge" onClick={() => applyPreset("concierge")}>
                <strong>Simulated concierge</strong>
                <small>A Marriott-style hotel concierge. Not affiliated with Marriott.</small>
              </button>
              <button type="button" className="choice" aria-pressed={preset === "bookseller"} data-testid="preset-bookseller" onClick={() => applyPreset("bookseller")}>
                <strong>Simulated bookseller</strong>
                <small>A Barnes & Noble-style bookseller. Not affiliated with Barnes & Noble.</small>
              </button>
            </div>
            {state.disclaimer ? <p>{state.disclaimer}</p> : null}
          </section>
          <section className="card">
            <h2>Persona</h2>
            <div className="form-grid two">
              <label>Age
                <input aria-label="Age" value={state.profile.age} onChange={(event) => update({ profile: { ...state.profile, age: event.target.value } })} />
              </label>
              <label>City
                <input aria-label="City" data-testid="city-input" value={state.cities[0] ?? ""} onChange={(event) => update({ cities: [event.target.value, ...state.cities.slice(1)] })} />
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
              <label>Requirements
                <input aria-label="Requirements" value={state.profile.requirements} onChange={(event) => update({ profile: { ...state.profile, requirements: event.target.value } })} />
              </label>
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {state.profile.favorites.map((favorite, index) => (
                <div className="form-grid two" key={index}>
                  <label>Favorite {index + 1}
                    <input data-testid={`favorite-name-${index}`} value={favorite.name} onChange={(event) => editFavorite(index, { name: event.target.value })} />
                  </label>
                  <label>Kind
                    <select aria-label={`Kind ${index + 1}`} value={favorite.kind} onChange={(event) => editFavorite(index, { kind: event.target.value as Favorite["kind"] })}>
                      <option value="movie">Film or show</option>
                      <option value="artist">Artist</option>
                      <option value="book">Book</option>
                      <option value="any">Any supported type</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <h2>Exact request</h2>
            <p>The server freezes temperature, top-p, and the configured model for every arm. This preview is the customer context that will be sent to Gemini.</p>
            {"error" in taskPreview ? <p>{taskPreview.error}</p> : <pre className="answer" data-testid="exact-request">{taskPreview.question}{"\n\n"}City: {taskPreview.city}{"\n"}Interests: {taskPreview.interests.map((item) => item.name).join(", ")}{"\n"}Budget: {taskPreview.budget} {taskPreview.currency}{"\n"}Language: {taskPreview.language}{"\n"}Requirements: {taskPreview.requirements}</pre>}
            <p className="muted">Estimated provider calls if you run the current cities: {estimate.total}. That is an estimate, not a charge.</p>
            {formError ? <p className="error" role="alert">{formError}</p> : null}
            <div className="row-actions">
              <button type="button" className="btn cyan" data-testid="run-audit" onClick={() => void start()} disabled={state.running || !preset}>
                {state.running ? "Running" : "Run this case"}
              </button>
            </div>
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
          <ResultsBody showEmpty={false} />
        </div>
        <ProgressCard />
      </div>
    </div>
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
      <h2>Progress</h2>
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
