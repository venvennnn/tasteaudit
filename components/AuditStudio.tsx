"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { Journey } from "@/components/Journey";
import { ModeSwitch } from "@/components/ModeSwitch";
import { ProofRail, StartRail, WhoRail, WhyRail } from "@/components/Rails";
import { useSession } from "@/components/SessionProvider";
import { estimateProviderCalls } from "@/lib/audit/estimate";
import { buildTask } from "@/lib/audit/orchestrate";
import { DEFAULT_GEMINI_MODEL, FROZEN_GENERATION, LIMITS, SYSTEM_PROMPT_VERSION } from "@/lib/schemas/limits";
import { activeCities, type Favorite } from "@/lib/session/state";

const STEPS = ["Company", "Customer", "Task", "Review"] as const;
const TITLES = [
  "Whose AI are we testing?",
  "Meet the person. Understand the context.",
  "What should the assistant answer?",
  "Review the request.",
];
const SUBS = [
  "Start with your company, or try a familiar assistant first.",
  "Every approach receives the same customer brief.",
  "This question is sent to every approach unchanged.",
  "The server freezes the model settings before the first call.",
];
const WORDS = ["START\nHERE.", "WHO?", "WHY?", "PROOF?"];

export function AuditStudio() {
  const { state, update, run } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cities = activeCities(state);
  const estimate = estimateProviderCalls({
    favoriteCount: state.profile.favorites.filter((favorite) => favorite.name.trim()).length,
    cityCount: Math.max(1, cities.length),
    recommendationCount: state.recommendationCount,
    domain: state.domain,
    mode: state.assistantMode,
    compare: state.compareAll,
  });

  function next() {
    if (step === 0 && !state.company.name.trim()) {
      setError("Enter a company name. It labels the session and does not connect that company’s own assistant.");
      return;
    }
    if (step === 1) {
      const task = buildTask(state, cities[0] ?? "City", []);
      if ("error" in task && task.error.includes("interest")) {
        setError(task.error);
        return;
      }
    }
    if (step === 2 && !state.taskQuestion.trim()) {
      setError("Write the question.");
      return;
    }
    setError(null);
    setStep((value) => Math.min(3, value + 1));
  }

  const rail = step === 1 ? <WhoRail /> : step === 2 ? <WhyRail cta={false} /> : step === 3 ? <ProofRail /> : <StartRail action="demo" />;

  return (
    <Frame
      word={WORDS[step]}
      rail={rail}
      dock={(
        <div className="dock">
          <Journey active={step + 1} />
          <div className="dock-actions">
            {step > 0 ? <button type="button" className="text-btn" onClick={() => setStep((value) => value - 1)}>Back</button> : null}
            {step < 3 ? (
              <button type="button" className="btn" data-testid="step-next" onClick={next}>Continue <span aria-hidden="true">↗</span></button>
            ) : (
              <button type="button" className="btn" data-testid="audit-start" data-busy={state.running ? "true" : "false"} onClick={() => {
                const task = buildTask(state, cities[0] ?? "", []);
                if ("error" in task) { setError(task.error); return; }
                void run([cities[0]]);
                router.push("/results");
              }}>Review & run <span aria-hidden="true">↗</span></button>
            )}
          </div>
        </div>
      )}
    >
      <p className="kicker">{String(step + 1).padStart(2, "0")} / {STEPS[step]}</p>
      <h1>{TITLES[step]}</h1>
      <p className="lede">{SUBS[step]}</p>
      {step === 0 ? <ModeSwitch current="audit" /> : null}
      <p className="memory" data-testid="session-memory-note">The audit stays in this tab’s memory. Download the result before you refresh. Provider requests leave this browser.</p>
      <div key={step} className="view-swap">
        {step === 0 ? <CompanyStep /> : null}
        {step === 1 ? <CustomerStep /> : null}
        {step === 2 ? <TaskStep /> : null}
        {step === 3 ? <ReviewStep estimate={estimate.total} lines={estimate.lines} /> : null}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </Frame>
  );
}

function CompanyStep() {
  const { state, update } = useSession();
  return (
    <div className="form-grid">
      <label>Company name
        <input data-testid="company-name" value={state.company.name} onChange={(event) => update({ company: { ...state.company, name: event.target.value }, scenario: "company" })} />
      </label>
      <label>Industry
        <input aria-label="Industry" value={state.company.industry} onChange={(event) => update({ company: { ...state.company, industry: event.target.value } })} />
      </label>
      <label>What the assistant is for
        <textarea aria-label="Assistant purpose" value={state.company.purpose} onChange={(event) => update({ company: { ...state.company, purpose: event.target.value } })} />
      </label>
      <label>Recommendation domain
        <select aria-label="Domain" value={state.domain} onChange={(event) => update({ domain: event.target.value as "book" | "place", taskQuestion: event.target.value === "book" ? "Recommend three books for my interests, preferred language and budget." : "Recommend three places for my evening in this city, considering my interests, budget and practical needs." })}>
          <option value="place">Places</option>
          <option value="book">Books</option>
        </select>
      </label>
      <div className="choice-grid">
        <button type="button" className="choice" aria-pressed={state.assistantMode === "simulate"} onClick={() => update({ assistantMode: "simulate" })}>Simulate with Gemini</button>
        <button type="button" className="choice" aria-pressed={state.assistantMode === "paste"} onClick={() => update({ assistantMode: "paste" })}>Paste existing answer</button>
      </div>
      {state.assistantMode === "paste" ? <label>Existing answer
        <textarea aria-label="Existing answer" value={state.pastedAnswer} onChange={(event) => update({ pastedAnswer: event.target.value })} />
      </label> : <p className="muted">Simulate with Gemini uses the server’s configured model. Paste mode can be audited and revised, but the original model is unknown and cannot support a controlled comparison.</p>}
    </div>
  );
}

function CustomerStep() {
  const { state, update } = useSession();
  function edit(index: number, patch: Partial<Favorite>) {
    update({ profile: { ...state.profile, favorites: state.profile.favorites.map((favorite, item) => item === index ? { ...favorite, ...patch } : favorite) } });
  }
  return (
    <div className="stack">
      <p className="section-label">What are they into?</p>
      <div className="interest-list">
        {state.profile.favorites.map((favorite, index) => (
          <div className="interest-chip" key={index}>
            <select className="chip-kind" aria-label={`Kind ${index + 1}`} value={favorite.kind} onChange={(event) => edit(index, { kind: event.target.value as Favorite["kind"] })}>
              <option value="movie">Movie</option>
              <option value="artist">Artist</option>
              <option value="book">Book</option>
              <option value="any">Any</option>
            </select>
            <input data-testid={`favorite-name-${index}`} aria-label={`Interest ${index + 1}`} placeholder="Search a movie, artist or book..." value={favorite.name} onChange={(event) => edit(index, { name: event.target.value })} />
          </div>
        ))}
      </div>
      <div className="context-grid">
        <label>City
          <input data-testid="city-input" value={state.cities[0] ?? ""} onChange={(event) => update({ cities: [event.target.value] })} />
        </label>
        <label>Age, optional
          <input aria-label="Age" value={state.profile.age} onChange={(event) => update({ profile: { ...state.profile, age: event.target.value } })} />
        </label>
        <label>Country
          <input aria-label="Country" value={state.profile.country} onChange={(event) => update({ profile: { ...state.profile, country: event.target.value } })} />
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
      <label>Practical needs, optional
        <textarea aria-label="Requirements" placeholder="Dietary needs, accessibility, travel distance..." value={state.profile.requirements} onChange={(event) => update({ profile: { ...state.profile, requirements: event.target.value } })} />
      </label>
      <p className="muted">Names are not used to infer ethnicity, age, or taste. Only the interests you type, plus a documented age band when you enter an age, can be sent to Qloo. The city is a Qloo place filter. For books it is sent only to Gemini.</p>
    </div>
  );
}

function TaskStep() {
  const { state, update } = useSession();
  return (
    <div className="form-grid">
      <label>Question
        <textarea data-testid="task-question" value={state.taskQuestion} onChange={(event) => update({ taskQuestion: event.target.value })} />
      </label>
      <label>How many recommendations, up to {LIMITS.recommendationsMax}
        <input aria-label="Recommendation count" type="number" min={1} max={5} value={state.recommendationCount} onChange={(event) => update({ recommendationCount: Math.min(5, Math.max(1, Number(event.target.value) || 3)) })} />
      </label>
    </div>
  );
}

function ReviewStep({ estimate, lines }: { estimate: number; lines: { label: string; count: number }[] }) {
  const { state } = useSession();
  const task = buildTask(state, activeCities(state)[0] ?? "", []);
  return (
    <div className="stack">
      <h2>Authoritative specification</h2>
      {"error" in task ? <p className="error">{task.error}</p> : <pre className="answer">{JSON.stringify(task, null, 2)}</pre>}
      <p>Selected model: the server reads GEMINI_MODEL at call time, or uses {DEFAULT_GEMINI_MODEL} when that variable is unset, then keeps that identifier for the run. Gemini 3.8 does not accept temperature or top-p. Older models still use temperature {FROZEN_GENERATION.temperature} and top-p {FROZEN_GENERATION.topP}. Prompt {SYSTEM_PROMPT_VERSION}. Qloo calls go only to https://hackathon.api.qloo.com.</p>
      <p>Arms: original{state.assistantMode === "paste" ? " (pasted, model unknown)" : " Gemini"}{state.compareAll ? ", self-refinement, Qloo rerank" : ""}, Qloo revision. Turn on “Compare all approaches” from results after the first case if you want the extra baselines.</p>
      <p>Estimated provider calls for the first city: {estimate}.</p>
      <ul>{lines.map((line) => <li key={line.label}>{line.label}: {line.count}</li>)}</ul>
      <p className="muted">Live cases are capped at {LIMITS.cities} cities. CSV upload, external assistant connections, and multi-user review links are out of scope.</p>
    </div>
  );
}
