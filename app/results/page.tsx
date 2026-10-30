"use client";

import Link from "next/link";
import { Frame } from "@/components/Frame";
import { ResultsBody } from "@/components/ResultsStudio";
import { useSession } from "@/components/SessionProvider";
import { demoCitiesFor } from "@/lib/session/presets";
import { activeCities } from "@/lib/session/state";

export default function ResultsPage() {
  const { state, run } = useSession();
  const cities = state.scenario === "demo" ? demoCitiesFor(state.domain) : activeCities(state);
  const brief = state.scenario === "company" ? "/audit" : "/demo";
  return (
    <Frame>
      <div className="results-page">
        <div className="results-toolbar">
          <Link href={brief}>Edit brief</Link>
          <button type="button" className="text-btn" onClick={() => void run(cities, true)} disabled={state.running || cities.length === 0}>Run again</button>
          <a href="#downloads">Download</a>
        </div>
        <ResultsBody />
      </div>
    </Frame>
  );
}
