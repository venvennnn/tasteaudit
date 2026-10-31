"use client";

import { createContext, useContext, useMemo, useReducer, useRef } from "react";
import { executeRun } from "@/lib/audit/orchestrate";
import { executeRegional } from "@/lib/audit/regional-run";
import { executeSensitivity } from "@/lib/audit/sensitivity-run";
import type { RegionalState } from "@/lib/audit/regional-types";
import { regionalCsv, regionalDocument } from "@/lib/exports/regional";
import { answersCsv, exportDocument, importDocument, recommendationsCsv } from "@/lib/exports/run";
import { postJson } from "@/lib/http/client";
import { activeCities, createSession, reducer, type ConfigPatch, type SessionState, type VoteState } from "@/lib/session/state";

type SessionApi = {
  state: SessionState;
  update: (patch: ConfigPatch) => void;
  reset: () => void;
  run: (cities?: string[], fresh?: boolean) => Promise<void>;
  compare: () => Promise<void>;
  correctSeed: (query: string, entityId: string) => void;
  vote: (city: string, vote: VoteState) => void;
  record: (city: string) => void;
  importText: (text: string) => string | null;
  download: (kind: "json" | "csv" | "answers") => void;
  updateRegional: (patch: Partial<RegionalState>) => void;
  runRegional: (cities?: string[], fresh?: boolean) => Promise<void>;
  runSensitivity: (city: string) => Promise<void>;
  downloadRegional: (kind: "json" | "csv") => void;
};

const SessionContext = createContext<SessionApi | null>(null);

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, createSession);
  const stateRef = useRef(state);
  stateRef.current = state;
  const abortRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const epochRef = useRef(0);
  const cityEpoch = useRef(new Map<string, number>());
  const controllers = useRef(new Map<string, AbortController>());
  const inflight = useRef(0);
  const regionalEpoch = useRef(0);
  const regionalCityEpoch = useRef(new Map<string, number>());
  const regionalControllers = useRef(new Map<string, AbortController>());
  const regionalInflight = useRef(0);

  const api = useMemo<SessionApi>(() => {
    const abortAll = () => {
      abortRef.current?.abort();
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
      for (const controller of regionalControllers.current.values()) controller.abort();
      regionalControllers.current.clear();
    };
    const runWith = async (snapshot: SessionState, cities: string[]) => {
      const epoch = epochRef.current;
      const gen = generation.current;
      inflight.current += 1;
      const seedController = new AbortController();
      abortRef.current = seedController;
      const expected = new Map<string, number>();
      for (const city of cities) {
        controllers.current.get(city)?.abort();
        const controller = new AbortController();
        controllers.current.set(city, controller);
        const nextEpoch = (cityEpoch.current.get(city) ?? 0) + 1;
        cityEpoch.current.set(city, nextEpoch);
        expected.set(city, nextEpoch);
      }
      dispatch({ type: "running", running: true });
      try {
        await executeRun({
          state: snapshot,
          cities,
          signal: seedController.signal,
          signalFor: (city) => controllers.current.get(city)?.signal ?? seedController.signal,
          isCurrent: (city) => epochRef.current === epoch && generation.current === gen && cityEpoch.current.get(city) === expected.get(city),
          post: postJson,
          onSeeds: (seeds, stage) => {
            if (generation.current !== gen || epochRef.current !== epoch) return;
            dispatch({ type: "seeds", seeds, stage });
          },
          onCase: (city, patch) => {
            if (generation.current !== gen || epochRef.current !== epoch || cityEpoch.current.get(city) !== expected.get(city)) return;
            dispatch({ type: "patch-case", city, patch });
          },
        });
      } catch {
        // Seed failures are stored on the seed stage. Later stage failures stay on the case.
      } finally {
        inflight.current -= 1;
        if (inflight.current === 0 && epochRef.current === epoch && generation.current === gen) dispatch({ type: "running", running: false });
      }
    };

    return {
      state,
      update: (patch) => {
        const next = reducer(stateRef.current, { type: "update", patch });
        if (next.configHash !== stateRef.current.configHash) {
          abortAll();
          epochRef.current += 1;
          generation.current += 1;
        }
        stateRef.current = next;
        dispatch({ type: "update", patch });
      },
      reset: () => {
        abortAll();
        epochRef.current += 1;
        generation.current += 1;
        dispatch({ type: "reset" });
      },
      run: (cities, fresh = false) => {
        let snapshot = stateRef.current;
        const list = cities && cities.length > 0 ? cities : activeCities(snapshot).slice(0, 1);
        if (fresh) {
          abortAll();
          epochRef.current += 1;
          const runId = crypto.randomUUID();
          snapshot = reducer(snapshot, { type: "begin-run", runId, cities: list });
          stateRef.current = snapshot;
          dispatch({ type: "begin-run", runId, cities: list });
        }
        return runWith(snapshot, list);
      },
      compare: async () => {
        const next = reducer(stateRef.current, { type: "compare" });
        dispatch({ type: "replace", state: next });
        stateRef.current = next;
        await runWith(next, activeCities(next));
      },
      correctSeed: (query, entityId) => {
        const current = stateRef.current;
        const next = reducer(current, { type: "update", patch: { seedOverrides: { ...current.seedOverrides, [query]: entityId } } });
        if (next.configHash !== current.configHash) {
          abortAll();
          epochRef.current += 1;
          generation.current += 1;
        }
        stateRef.current = next;
        dispatch({ type: "update", patch: { seedOverrides: { ...current.seedOverrides, [query]: entityId } } });
      },
      vote: (city, vote) => dispatch({ type: "vote", city, vote }),
      record: (city) => {
        const current = stateRef.current;
        const item = current.cases[city];
        if (!item?.observedModel || current.source === "imported") return;
        dispatch({
          type: "record",
          city,
          mark: {
            at: new Date().toISOString(),
            model: item.observedModel,
            question: current.taskQuestion,
            city,
            configurationHash: current.configHash,
          },
        });
      },
      importText: (text) => {
        try {
          const parsed = importDocument(JSON.parse(text) as unknown);
          if (!parsed.ok) return parsed.message;
          abortAll();
          epochRef.current += 1;
          generation.current += 1;
          dispatch({ type: "replace", state: parsed.state });
          return null;
        } catch {
          return "That file could not be read as JSON.";
        }
      },
      download: (kind) => {
        const current = stateRef.current;
        if (kind === "json") download("tasteaudit-run.json", JSON.stringify(exportDocument(current), null, 2), "application/json");
        if (kind === "csv") download("tasteaudit-recommendations.csv", recommendationsCsv(current), "text/csv");
        if (kind === "answers") download("tasteaudit-answers.csv", answersCsv(current), "text/csv");
      },
      updateRegional: (patch) => {
        const current = stateRef.current;
        const regional = { ...current.regional, ...patch };
        const changed = JSON.stringify({ ...current.regional, cases: undefined, running: undefined, runId: undefined, startedAt: undefined })
          !== JSON.stringify({ ...regional, cases: undefined, running: undefined, runId: undefined, startedAt: undefined });
        if (changed) {
          for (const controller of regionalControllers.current.values()) controller.abort();
          regionalControllers.current.clear();
          regionalEpoch.current += 1;
          regional.cases = {};
          regional.runId = null;
          regional.running = false;
        }
        const next = reducer(current, { type: "regional-replace", regional });
        stateRef.current = next;
        dispatch({ type: "regional-replace", regional });
      },
      runRegional: async (cities, fresh = true) => {
        const snapshot = stateRef.current;
        const list = (cities && cities.length > 0 ? cities : snapshot.regional.markets.map((market) => market.label))
          .map((city) => city.trim())
          .filter(Boolean);
        if (fresh) {
          regionalEpoch.current += 1;
          for (const controller of regionalControllers.current.values()) controller.abort();
          regionalControllers.current.clear();
        }
        const epoch = regionalEpoch.current;
        const runId = fresh ? crypto.randomUUID() : snapshot.regional.runId ?? crypto.randomUUID();
        const startedAt = fresh ? new Date().toISOString() : snapshot.regional.startedAt ?? new Date().toISOString();
        let regional = snapshot.regional;
        if (fresh) {
          const begun = reducer(snapshot, { type: "regional-begin", runId, startedAt, cities: list });
          stateRef.current = begun;
          dispatch({ type: "regional-begin", runId, startedAt, cities: list });
          regional = begun.regional;
        } else {
          const marked = reducer(snapshot, { type: "regional-replace", regional: { ...snapshot.regional, running: true, runId, startedAt } });
          stateRef.current = marked;
          dispatch({ type: "regional-replace", regional: marked.regional });
          regional = marked.regional;
        }
        const expected = new Map<string, number>();
        for (const city of list) {
          regionalControllers.current.get(city)?.abort();
          const controller = new AbortController();
          regionalControllers.current.set(city, controller);
          const nextEpoch = (regionalCityEpoch.current.get(city) ?? 0) + 1;
          regionalCityEpoch.current.set(city, nextEpoch);
          expected.set(city, nextEpoch);
        }
        const parent = new AbortController();
        regionalInflight.current += 1;
        try {
          await executeRegional({
            regional,
            cities: list,
            post: postJson,
            signal: parent.signal,
            signalFor: (city) => regionalControllers.current.get(city)?.signal ?? parent.signal,
            isCurrent: (city) => regionalEpoch.current === epoch && regionalCityEpoch.current.get(city) === expected.get(city),
            onCase: (city, patch) => {
              if (regionalEpoch.current !== epoch || regionalCityEpoch.current.get(city) !== expected.get(city)) return;
              const next = reducer(stateRef.current, { type: "regional-case", city, patch });
              stateRef.current = next;
              dispatch({ type: "regional-case", city, patch });
            },
          });
        } finally {
          regionalInflight.current -= 1;
          if (regionalInflight.current === 0 && regionalEpoch.current === epoch) {
            const done = reducer(stateRef.current, { type: "regional-replace", regional: { ...stateRef.current.regional, running: false } });
            stateRef.current = done;
            dispatch({ type: "regional-replace", regional: done.regional });
          }
        }
      },
      runSensitivity: async (city) => {
        const current = stateRef.current;
        const controller = new AbortController();
        dispatch({
          type: "patch-case",
          city,
          patch: {
            sensitivity: {
              status: "running",
              points: [],
              calls: 0,
              error: null,
              note: "Scoring the same candidates with one interest removed at a time.",
            },
          },
        });
        await executeSensitivity({
          state: current,
          city,
          post: postJson,
          signal: controller.signal,
          onUpdate: (sensitivity) => dispatch({ type: "patch-case", city, patch: { sensitivity } }),
        });
      },
      downloadRegional: (kind) => {
        const regional = stateRef.current.regional;
        if (kind === "json") download("tasteaudit-regional.json", JSON.stringify(regionalDocument(regional), null, 2), "application/json");
        if (kind === "csv") download("tasteaudit-regional.csv", regionalCsv(regional), "text/csv");
      },
    };
  }, [state]);

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session is unavailable.");
  return value;
}
