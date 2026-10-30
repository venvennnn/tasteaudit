"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { Frame } from "@/components/Frame";
import { Journey } from "@/components/Journey";
import { ModeSwitch } from "@/components/ModeSwitch";
import { StartRail, WhoRail } from "@/components/Rails";
import { ArtworkSearch, Cover } from "@/components/Cover";
import { BellIcon, BookIcon } from "@/components/icons";
import { estimateProviderCalls } from "@/lib/audit/estimate";
import { buildTask } from "@/lib/audit/orchestrate";
import { DEMO_PRESETS, runLabels, type DemoPresetId } from "@/lib/session/presets";
import { type Favorite } from "@/lib/session/state";

const KIND_TABS: Array<{ id: Favorite["kind"]; label: string }> = [
  { id: "movie", label: "Movies & TV" },
  { id: "artist", label: "Music" },
  { id: "book", label: "Books" },
  { id: "any", label: "Places" },
];

export function DemoStudio() {
  const router = useRouter();
  const { state, update, run } = useSession();
  const filled = state.scenario === "demo" && state.profile.favorites.some((favorite) => favorite.name.trim());
  const [preset, setPreset] = useState<DemoPresetId | null>(state.scenario === "demo" ? (state.domain === "book" ? "bookseller" : "concierge") : null);
  const [view, setView] = useState<"pick" | "customer">(filled ? "customer" : "pick");
  const [formError, setFormError] = useState<string | null>(null);
  const [kindTab, setKindTab] = useState<Favorite["kind"]>("movie");
  const labels = runLabels(state);
  const readers = state.comparison === "readers";
  const taskPreview = useMemo(() => buildTask(state, labels[0] ?? "", state.seeds), [state, labels]);
  const favoriteCount = readers
    ? state.readers.reduce((sum, reader) => sum + reader.favorites.filter((favorite) => favorite.name.trim()).length, 0)
    : state.profile.favorites.filter((favorite) => favorite.name.trim()).length;
  const estimate = estimateProviderCalls({
    favoriteCount,
    cityCount: labels.length,
    recommendationCount: state.recommendationCount,
    domain: state.domain,
    mode: "simulate",
    compare: state.compareAll,
    distinctInterestSets: readers ? state.readers.length : 1,
  });
  const active = state.running ? 3 : view === "customer" ? 2 : 1;

  function applyPreset(id: DemoPresetId) {
    setPreset(id);
    setFormError(null);
    update({ ...DEMO_PRESETS[id], seedOverrides: {} });
  }

  function editReaderFavorite(readerIndex: number, favoriteIndex: number, patch: Partial<Favorite>) {
    const readers = state.readers.map((reader, index) => index === readerIndex
      ? { ...reader, favorites: reader.favorites.map((favorite, item) => item === favoriteIndex ? { ...favorite, ...patch } : favorite) }
      : reader);
    const profile = readerIndex === 0
      ? { ...state.profile, favorites: readers[0]?.favorites.map((favorite) => ({ ...favorite })) ?? state.profile.favorites }
      : state.profile;
    update({ readers, profile });
  }

  function editFavorite(index: number, patch: Partial<Favorite>) {
    const favorites = state.profile.favorites.map((favorite, item) => (item === index ? { ...favorite, ...patch } : favorite));
    update({ profile: { ...state.profile, favorites } });
  }

  function pickInterest(name: string) {
    const query = name.trim();
    if (!query) return;
    const match = state.profile.favorites.findIndex((favorite) => favorite.kind === kindTab);
    const empty = state.profile.favorites.findIndex((favorite) => !favorite.name.trim());
    const index = match >= 0 ? match : empty;
    if (index < 0) return;
    editFavorite(index, { name: query, kind: kindTab });
  }

  async function start() {
    const cities = runLabels(state);
    const task = buildTask(state, cities[0] ?? "", []);
    if ("error" in task) {
      setFormError(task.error);
      return;
    }
    setFormError(null);
    update({ cities });
    const pending = run(cities, true);
    router.push("/results");
    await pending;
  }

  return (
    <Frame
      word={view === "customer" ? "WHO?" : "START\nHERE."}
      rail={view === "customer" ? <WhoRail /> : <StartRail />}
      dock={(
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
                {state.running ? "Running" : readers ? "Run reader-interest comparison" : "Run four-city audit"} <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>
        </div>
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
                <span><strong>The bookseller</strong><small>Barnes & Noble-style assistant</small><em>Four readers, different explicit interests.</em></span>
                <span className="radio" aria-hidden="true" />
              </button>
            </div>
            <p className="muted">Note: Simulated assistants · No brand affiliation.</p>
            {state.disclaimer ? <p className="muted">{state.disclaimer}</p> : null}
          </>
        ) : (
          <div className="demo-split">
            <div>
            <h1>Meet the person.<br />Understand the context.</h1>
            <p className="lede">{readers ? "Each reader has a different explicit interest list. The city is not sent to Qloo." : "Every approach receives the same customer brief."}</p>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">01</span><div><h2>{readers ? "Reader interests" : "Cultural interests"}</h2><p>{readers ? "These lists are signal.interests.entities. They are not cities." : "Add a few interests to ground the brief."}</p></div></div>
              <div>
                {readers ? (
                  <div className="reader-lists">
                    {state.readers.map((reader, readerIndex) => (
                      <article key={reader.label} className="reader-card">
                        <h3>{reader.label}</h3>
                        {reader.favorites.map((favorite, index) => (
                          <div className="interest-chip" key={`${reader.label}-${index}`}>
                            {favorite.name.trim() ? <Cover name={favorite.name} kind={favorite.kind} /> : null}
                            <select className="chip-kind" aria-label={`${reader.label} kind ${index + 1}`} value={favorite.kind} onChange={(event) => editReaderFavorite(readerIndex, index, { kind: event.target.value as Favorite["kind"] })}>
                              <option value="movie">Movie</option>
                              <option value="artist">Artist</option>
                              <option value="book">Book</option>
                              <option value="any">Any</option>
                            </select>
                            <input aria-label={`${reader.label} interest ${index + 1}`} placeholder="Name" value={favorite.name} onChange={(event) => editReaderFavorite(readerIndex, index, { name: event.target.value })} />
                          </div>
                        ))}
                      </article>
                    ))}
                    <p className="muted">Book experiment: compare these interest lists. Interest-based affinity. City was not applied to Qloo scoring.</p>
                  </div>
                ) : null}
                {readers ? null : (
                  <>
                    <div className="kind-tabs" role="group" aria-label="Interest kinds">
                      {KIND_TABS.map((tab) => (
                        <button key={tab.id} type="button" aria-pressed={kindTab === tab.id} onClick={() => setKindTab(tab.id)}>{tab.label}</button>
                      ))}
                    </div>
                    <ArtworkSearch kind={kindTab} onPick={pickInterest} />
                    <div className="interest-list">
                      {state.profile.favorites.map((favorite, index) => (
                        <div className="interest-chip" key={index}>
                          {favorite.name.trim() ? <Cover name={favorite.name} kind={favorite.kind} /> : null}
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
                    <p className="muted">Pictures come from Wikipedia, Open Library, or Deezer. They are the first matching catalog image, not a score.</p>
                  </>
                )}
              </div>
            </section>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">02</span><div><h2>Customer context</h2><p>Set the basic details for the scenario.</p></div></div>
              <div className="context-grid">
                <label>Name
                  <input aria-label="Customer name" value={state.profile.label} onChange={(event) => update({ profile: { ...state.profile, label: event.target.value } })} />
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
            </div>
            <div>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">03</span><div><h2>{readers ? "Four readers" : "Four cities"}</h2><p>{readers ? "One comparison runs every reader. Age, budget, and language stay the same. The interests do not." : "One audit runs every configured city. Interests, age, budget, and language stay the same."}</p></div></div>
              <div>
                <ul className="city-pills">
                  {labels.map((label) => <li key={label}>{label}</li>)}
                </ul>
                <p className="muted">{readers
                  ? `Place experiment is separate: Lisbon, New York, Kuala Lumpur, and Osaka use filter.location.query. This book experiment does not. Budget ${state.profile.budget || "not stated"} ${state.profile.currency}.`
                  : `Place experiment: each city is sent as filter.location.query, a candidate filter. It does not condition affinity. Budget ${state.profile.budget || "not stated"} ${state.profile.currency}. Language ${state.profile.language || "not stated"}.`}</p>
              </div>
            </section>
            <section className="brief-block">
              <div className="brief-index"><span className="idx">04</span><div><h2>The question</h2><p>What would you like recommendations for?</p></div></div>
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
              {"error" in taskPreview ? <p>{taskPreview.error}</p> : <pre className="answer" data-testid="exact-request">{taskPreview.question}{"\n\n"}{readers ? "City: Not applied" : `City: ${taskPreview.city}`}{"\n"}Interests: {readers ? state.readers.map((reader) => `${reader.label}: ${reader.favorites.map((favorite) => favorite.name).filter(Boolean).join(", ")}`).join(" | ") : taskPreview.interests.map((item) => item.name).join(", ")}{"\n"}Budget: {taskPreview.budget} {taskPreview.currency}{"\n"}Language: {taskPreview.language}{"\n"}Requirements: {taskPreview.requirements}</pre>}
            </details>
            <p className="muted">Estimated provider calls for {readers ? "the four readers" : "the four cities"}: {estimate.total}. That is an estimate, not a charge.</p>
            </div>
          </div>
        )}
      </div>
      <p className="memory" data-testid="session-memory-note">
        This run lives in browser memory only. Refreshing or closing the tab clears it. Inputs are sent to the configured Qloo and Gemini providers. TasteAudit does not promise that those providers retain nothing.
      </p>
      {formError ? <p className="error" role="alert">{formError}</p> : null}
    </Frame>
  );
}
