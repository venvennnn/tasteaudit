"use client";

import { createContext, useContext, useMemo, useReducer, useRef } from "react";
import { executeRun } from "@/lib/audit/orchestrate";
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

  const api = useMemo<SessionApi>(() => {
    const abortAll = () => {
      abortRef.current?.abort();
      for (const controller of controllers.current.values()) controller.abort();
      controllers.current.clear();
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
    };
  }, [state]);

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session is unavailable.");
  return value;
}
