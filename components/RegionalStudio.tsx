"use client";

import { useState } from "react";
import { Frame } from "@/components/Frame";
import { RegionalResults } from "@/components/RegionalResults";
import { useSession } from "@/components/SessionProvider";
import { ageBandLabel } from "@/lib/audit/age";
import type { ConfirmedMarket, LocalityCandidate } from "@/lib/audit/regional-types";
import { postJson } from "@/lib/http/client";
import { AGE_BANDS } from "@/lib/schemas/limits";

type Lookup = {
  status: "idle" | "loading" | "ambiguous" | "unmatched" | "failed";
  message: string;
  candidates: LocalityCandidate[];
};

const idleLookup: Lookup = { status: "idle", message: "", candidates: [] };

export function RegionalStudio() {
  const { state, updateRegional, runRegional, downloadRegional } = useSession();
  const regional = state.regional;
  const [draft, setDraft] = useState("");
  const [destinationDraft, setDestinationDraft] = useState("");
  const [lookup, setLookup] = useState<Lookup>(idleLookup);
  const [destinationLookup, setDestinationLookup] = useState<Lookup>(idleLookup);
  const [interestName, setInterestName] = useState("");

  async function lookupCity(target: "market" | "destination") {
    const name = (target === "market" ? draft : destinationDraft).trim();
    const set = target === "market" ? setLookup : setDestinationLookup;
    if (!name) return;
    set({ status: "loading", message: "Looking up that locality.", candidates: [] });
    try {
      const response = await postJson<{
        candidates: LocalityCandidate[];
        match: { status: string; ambiguous: boolean };
      }>("/api/qloo/locality", { name }, new AbortController().signal);
      const candidates = response.data.candidates;
      if (candidates.length === 0 || response.data.match.status === "unmatched") {
        set({ status: "unmatched", message: "Unsupported match. No locality was substituted.", candidates: [] });
        return;
      }
      set({
        status: "ambiguous",
        message: candidates.length > 1 ? "Several localities matched. Choose one. Nothing was added automatically." : "Confirm this locality. Nothing was added automatically.",
        candidates,
      });
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String((error as { message: string }).message) : "The locality lookup failed.";
      set({ status: "failed", message, candidates: [] });
    }
  }

  function addMarket(candidate: LocalityCandidate) {
    if (regional.markets.some((market) => market.label.toLowerCase() === candidate.name.toLowerCase())) return;
    if (regional.markets.length >= 4) return;
    const next: ConfirmedMarket = { label: candidate.name, query: candidate.name, entityId: candidate.entityId || null };
    updateRegional({ markets: [...regional.markets, next] });
    setDraft("");
    setLookup(idleLookup);
  }

  function addDestination(candidate: LocalityCandidate) {
    updateRegional({ destination: { label: candidate.name, query: candidate.name, entityId: candidate.entityId || null } });
    setDestinationDraft("");
    setDestinationLookup(idleLookup);
  }

  const canRun = regional.question.trim().length > 0
    && regional.markets.length >= 2
    && regional.markets.length <= 4
    && !regional.running
    && (regional.domain !== "place" || regional.placeMode === "local" || Boolean(regional.destination));

  return (
    <Frame>
      <section className="ta-strip">
        <span>Regional Audit</span>
      </section>
      <h1>What should your AI recommend differently across regions?</h1>
      <p className="lede">Compare the same request across markets using available regional cultural signals.</p>
      <form className="stack" onSubmit={(event) => { event.preventDefault(); if (canRun) void runRegional(); }}>
        <label>Assistant or company context
          <input value={regional.companyName} onChange={(event) => updateRegional({ companyName: event.target.value })} placeholder="A bookstore assistant" />
        </label>
        <label>Recommendation domain
          <select value={regional.domain} onChange={(event) => updateRegional({ domain: event.target.value === "place" ? "place" : "book" })}>
            <option value="book">Books</option>
            <option value="place">Places</option>
          </select>
        </label>
        <label>Customer request
          <textarea data-testid="regional-question" value={regional.question} onChange={(event) => updateRegional({ question: event.target.value })} rows={3} />
        </label>
        <fieldset>
          <legend>Evidence</legend>
          <label><input type="radio" name="evidence" checked={regional.evidence === "regional"} onChange={() => updateRegional({ evidence: "regional" })} /> Regional only</label>
          <label><input type="radio" name="evidence" checked={regional.evidence === "interests"} onChange={() => updateRegional({ evidence: "interests" })} /> Interests only</label>
          <label><input type="radio" name="evidence" checked={regional.evidence === "joint"} onChange={() => updateRegional({ evidence: "joint" })} /> Regional + interests</label>
        </fieldset>
        {regional.evidence === "regional" ? <p>No personal favorites are required. This run will not invent them.</p> : (
          <div>
            <p>Add explicit interests. They are sent only in Interests only and Regional + interests.</p>
            <div className="row-actions">
              <input aria-label="Interest name" value={interestName} onChange={(event) => setInterestName(event.target.value)} />
              <button type="button" className="btn ghost" onClick={() => {
                const name = interestName.trim();
                if (!name) return;
                updateRegional({ interests: [...regional.interests, { name, kind: regional.domain === "book" ? "book" : "any" }] });
                setInterestName("");
              }}>Add interest</button>
            </div>
            <ul>{regional.interests.map((interest) => <li key={interest.name}>{interest.name}</li>)}</ul>
          </div>
        )}
        {regional.domain === "place" ? (
          <fieldset>
            <legend>Place comparison</legend>
            <p>Audience market is whose regional context we study. Destination is where recommended venues must be located. Home market is not inferred from appearance or nationality.</p>
            <label><input type="radio" name="place-mode" checked={regional.placeMode === "market"} onChange={() => updateRegional({ placeMode: "market" })} /> Market comparison. The audience changes and the destination stays fixed.</label>
            <label><input type="radio" name="place-mode" checked={regional.placeMode === "local"} onChange={() => updateRegional({ placeMode: "local" })} /> Local discovery. Each city is also the destination, so candidate venues change by location. This is not a pure test of audience taste.</label>
            {regional.placeMode === "market" ? (
              <LocalityField
                label="Destination"
                value={destinationDraft}
                onChange={setDestinationDraft}
                onLookup={() => void lookupCity("destination")}
                lookup={destinationLookup}
                onChoose={addDestination}
                chosen={regional.destination?.label ?? ""}
              />
            ) : null}
          </fieldset>
        ) : null}
        <LocalityField
          label="Audience city"
          testId="regional-city-input"
          value={draft}
          onChange={setDraft}
          onLookup={() => void lookupCity("market")}
          lookup={lookup}
          onChoose={addMarket}
          chosen=""
        />
        <ul className="chip-list" aria-label="Confirmed cities">
          {regional.markets.map((market) => (
            <li key={market.label}>
              {market.label}
              <button type="button" onClick={() => updateRegional({ markets: regional.markets.filter((item) => item.label !== market.label) })}>Remove</button>
            </li>
          ))}
        </ul>
        <p>{regional.markets.length} of 2–4 confirmed cities.</p>
        <div className="form-grid">
          <label>Age band
            <select value={regional.ageBand} onChange={(event) => updateRegional({ ageBand: event.target.value })}>
              <option value="">Not stated</option>
              {AGE_BANDS.map((band) => <option key={band} value={band}>{ageBandLabel(band)}</option>)}
            </select>
          </label>
          <label>Language
            <input value={regional.language} onChange={(event) => updateRegional({ language: event.target.value })} />
          </label>
          <label>Budget
            <input value={regional.budget} onChange={(event) => updateRegional({ budget: event.target.value })} />
          </label>
          <label>Currency
            <input value={regional.currency} onChange={(event) => updateRegional({ currency: event.target.value })} />
          </label>
        </div>
        <label>Practical requirements
          <textarea value={regional.requirements} onChange={(event) => updateRegional({ requirements: event.target.value })} rows={2} />
        </label>
        <button type="submit" className="btn" data-testid="run-regional" disabled={!canRun}>Run regional comparison</button>
        {regional.running ? <p>Running. Each city finishes on its own. A failed city can be retried without repeating the others.</p> : null}
      </form>
      <RegionalResults regional={regional} onRetry={(city) => void runRegional([city], false)} onDownload={downloadRegional} />
    </Frame>
  );
}

function LocalityField({
  label,
  testId,
  value,
  onChange,
  onLookup,
  lookup,
  onChoose,
  chosen,
}: {
  label: string;
  testId?: string;
  value: string;
  onChange: (value: string) => void;
  onLookup: () => void;
  lookup: Lookup;
  onChoose: (candidate: LocalityCandidate) => void;
  chosen: string;
}) {
  return (
    <div>
      <label>{label}
        <input data-testid={testId} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Type a city" />
      </label>
      <button type="button" className="btn ghost" onClick={onLookup}>Find locality</button>
      {chosen ? <p>Confirmed: {chosen}</p> : null}
      {lookup.message ? <p data-testid={testId ? "locality-status" : undefined} role="status">{lookup.message}</p> : null}
      {lookup.candidates.length > 0 ? (
        <ul>
          {lookup.candidates.map((candidate) => (
            <li key={candidate.entityId || candidate.name}>
              <button type="button" data-testid="locality-option" onClick={() => onChoose(candidate)}>{candidate.name}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
