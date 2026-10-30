"use client";

import { useMemo, useState } from "react";
import { useSession } from "@/components/SessionProvider";
import { Frame } from "@/components/Frame";
import { Journey } from "@/components/Journey";
import { ModeSwitch } from "@/components/ModeSwitch";
import { StartRail, WhoRail } from "@/components/Rails";
import { hasRunActivity, RunProgress } from "@/components/RunProgress";
import { BellIcon, BookIcon } from "@/components/icons";
import { ResultsBody } from "@/components/ResultsStudio";
import { estimateProviderCalls } from "@/lib/audit/estimate";
import { buildTask } from "@/lib/audit/orchestrate";
import { DEMO_PRESETS, type DemoPresetId } from "@/lib/session/presets";
import { activeCities, resultsReady, type Favorite } from "@/lib/session/state";

const KIND_TABS: Array<{ id: Favorite["kind"]; label: string }> = [
  { id: "movie", label: "Movies & TV" },
  { id: "artist", label: "Music" },
  { id: "book", label: "Books" },
  { id: "any", label: "Places" },
];

export function DemoStudio() {
  const { state, update, run } = useSession();
  const filled = state.scenario === "demo" && state.profile.favorites.some((favorite) => favorite.name.trim());
  const [preset, setPreset] = useState<DemoPresetId | null>(state.scenario === "demo" ? (state.domain === "book" ? "bookseller" : "concierge") : null);
  const [view, setView] = useState<"pick" | "customer">(filled ? "customer" : "pick");
  const [extraCity, setExtraCity] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [kindTab, setKindTab] = useState<Favorite["kind"]>("movie");
  const [search, setSearch] = useState("");
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
  const ready = resultsReady(state);
  const active = ready ? 4 : state.running ? 3 : view === "customer" ? 2 : 1;

  function applyPreset(id: DemoPresetId) {
    setPreset(id);
    setFormError(null);
    update({ ...DEMO_PRESETS[id], seedOverrides: {} });
  }

  function editFavorite(index: number, patch: Partial<Favorite>) {
    const favorites = state.profile.favorites.map((favorite, item) => (item === index ? { ...favorite, ...patch } : favorite));
    update({ profile: { ...state.profile, favorites } });
  }

  function applySearch() {
    const query = search.trim();
    if (!query) return;
    const match = state.profile.favorites.findIndex((favorite) => favorite.kind === kindTab);
    const empty = state.profile.favorites.findIndex((favorite) => !favorite.name.trim());
    const index = match >= 0 ? match : empty;
    if (index < 0) return;
    editFavorite(index, { name: query, kind: kindTab });
    setSearch("");
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
    <Frame
      word={view === "customer" || ready ? "WHO?" : "START\nHERE."}
      rail={view === "customer" || ready ? <WhoRail /> : <StartRail />}
      dock={(
        <>
          {hasRunActivity(state) ? <RunProgress compact /> : null}
          <div className="dock">
            <Journey active={active} />
            <div className="dock-actions">
              {view === "customer" ? <button type="button" className="text-btn" onClick={() => setView("pick")}>Assistant</button> : null}
              {view === "pick" ? (
                <button type="button" className="btn" data-testid="demo-continue" disabled={!preset} onClick={() => setView("customer")}>
                  Continue <span aria-hidden="true">↗</span>
                </button>
              ) : (
                <button type="button" className="btn" data-testid="run-audit" data-busy={state.running ? "true" : "false"} onClick={() => void start()} disabled={state.running || !preset}>
                  {state.running ? "Running" : "Review & run"} <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    >
      <div key={view} className="view-swap">
        {view === "pick" ? (
          <>
            <h1>Whose AI are<br />we testing?</h1>
            <p className="lede">Start with a demo, or create your company’s scenario.</p>
            <ModeSwitch current="demo" />
            <div className="pick-list">
              <button type="button" className="pick-row" aria-pressed={preset === "concierge"} data-testid="preset-concierge" onClick={() => applyPreset("concierge")}>
                <BellIcon />
                <span className="idx">01</span>
                <span><strong>The concierge</strong><small>Marriott-style assistant</small><em>Places for a customer’s evening out.</em></span>
                <span className="radio" aria-hidden="true" />
              </button>
              <button type="button" className="pick-row" aria-pressed={preset === "bookseller"} data-testid="preset-bookseller" onClick={() => applyPreset("bookseller")}>
                <BookIcon />
                <span className="idx">02</span>
                <span><strong>The bookseller</strong><small>Barnes & Noble-style assistant</small><em>Books shaped by cultural interests.</em></span>
                <span className="radio" aria-hidden="true" />
              </button>
            </div>
            <p className="muted">Note: Simulated assistants · No brand affiliation.</p>
            {state.disclaimer ? <p className="muted">{state.disclaimer}</p> : null}
          </>
        ) : (
          <>
            <h1>Meet the person.<br />Understand the context.</h1>
            <p className="lede">Every approach receives the same customer brief.</p>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">01</span><div><h2>Cultural interests</h2><p>Add a few interests to ground the brief.</p></div></div>
              <div>
                <div className="kind-tabs" role="group" aria-label="Interest kinds">
                  {KIND_TABS.map((tab) => (
                    <button key={tab.id} type="button" aria-pressed={kindTab === tab.id} onClick={() => setKindTab(tab.id)}>{tab.label}</button>
                  ))}
                </div>
                <form className="search-line" onSubmit={(event) => { event.preventDefault(); applySearch(); }}>
                  <input aria-label="Search an interest" placeholder="Search a movie, artist or book..." value={search} onChange={(event) => setSearch(event.target.value)} />
                </form>
                <div className="interest-list">
                  {state.profile.favorites.map((favorite, index) => (
                    <div className="interest-chip" key={index}>
                      <select className="chip-kind" aria-label={`Kind ${index + 1}`} value={favorite.kind} onChange={(event) => editFavorite(index, { kind: event.target.value as Favorite["kind"] })}>
                        <option value="movie">Movie</option>
                        <option value="artist">Artist</option>
                        <option value="book">Book</option>
                        <option value="any">Any</option>
                      </select>
                      <input data-testid={`favorite-name-${index}`} aria-label={`Favorite ${index + 1}`} placeholder="Name" value={favorite.name} onChange={(event) => editFavorite(index, { name: event.target.value })} />
                      <button type="button" className="chip-x" aria-label={`Clear interest ${index + 1}`} onClick={() => editFavorite(index, { name: "" })}>×</button>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">02</span><div><h2>Customer context</h2><p>Set the basic details for the scenario.</p></div></div>
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
            </section>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">03</span><div><h2>The question</h2><p>What would you like recommendations for?</p></div></div>
              <div>
                <label>Your request
                  <textarea aria-label="Question" value={state.taskQuestion} onChange={(event) => update({ taskQuestion: event.target.value })} />
                </label>
                <label>Practical requirements, optional
                  <input aria-label="Requirements" placeholder="Dietary needs, accessibility, travel distance..." value={state.profile.requirements} onChange={(event) => update({ profile: { ...state.profile, requirements: event.target.value } })} />
                </label>
              </div>
            </section>
            <details>
              <summary>Exact request</summary>
              {"error" in taskPreview ? <p>{taskPreview.error}</p> : <pre className="answer" data-testid="exact-request">{taskPreview.question}{"\n\n"}City: {taskPreview.city}{"\n"}Interests: {taskPreview.interests.map((item) => item.name).join(", ")}{"\n"}Budget: {taskPreview.budget} {taskPreview.currency}{"\n"}Language: {taskPreview.language}{"\n"}Requirements: {taskPreview.requirements}</pre>}
            </details>
            <p className="muted">Estimated provider calls if you run the current cities: {estimate.total}. That is an estimate, not a charge.</p>
          </>
        )}
      </div>
      <p className="memory" data-testid="session-memory-note">
        This run lives in browser memory only. Refreshing or closing the tab clears it. Inputs are sent to the configured Qloo and Gemini providers. TasteAudit does not promise that those providers retain nothing.
      </p>
      {formError ? <p className="error" role="alert">{formError}</p> : null}
      {ready ? (
        <section className="brief-block">
          <div className="brief-index"><span className="idx">+</span><div><h2>Add another city</h2><p>The first result is in. You can add up to three cities, one at a time.</p></div></div>
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
    </Frame>
  );
}
