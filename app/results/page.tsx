"use client";

import { Frame, SessionFoot } from "@/components/Frame";
import { ProofRail } from "@/components/Rails";
import { hasRunActivity, RunProgress } from "@/components/RunProgress";
import { ResultsBody } from "@/components/ResultsStudio";
import { useSession } from "@/components/SessionProvider";
import { activeCities, resultsReady } from "@/lib/session/state";

export default function ResultsPage() {
  const { state } = useSession();
  const ready = resultsReady(state);
  const place = activeCities(state).filter(Boolean).join(", ");
  return (
    <Frame word="PROOF?" rail={<ProofRail />} dock={<SessionFoot />}>
      <p className="crumb">Results{place ? ` / ${place}` : ""}{ready ? " / Candidate" : ""}</p>
      <h1>Look beyond<br />the recommendation.</h1>
      <p className="lede">{ready ? "Inspect the match, the signals and the missing information." : "Run an audit to measure how mean affinity moves from the plain model to the Qloo revision."}</p>
      {hasRunActivity(state) ? <RunProgress /> : null}
      <ResultsBody />
    </Frame>
  );
}
