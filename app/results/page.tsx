"use client";

import { SiteHeader } from "@/components/SiteHeader";
import { ResultsBody } from "@/components/ResultsStudio";
import { useSession } from "@/components/SessionProvider";
import { activeCities, resultsReady } from "@/lib/session/state";

export default function ResultsPage() {
  const { state } = useSession();
  const ready = resultsReady(state);
  const place = activeCities(state).filter(Boolean).join(", ");
  const who = [state.profile.label, place, state.simulatedLabel || state.company.name].filter(Boolean).join(" · ");
  return (
    <div className="workspace">
      <SiteHeader tone="workspace" />
      <div className="page-intro">
        <h1>See what changed. Understand why.</h1>
        <p>{ready ? who || "This session" : "Run an audit to measure how mean affinity moves from the plain model to the Qloo revision."}</p>
      </div>
      <ResultsBody />
    </div>
  );
}
