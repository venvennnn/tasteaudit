"use client";

import { useSession } from "@/components/SessionProvider";
import { hasRunActivity } from "@/components/RunProgress";

export function RunBar() {
  const { state } = useSession();
  const running = state.running
    || state.seedStage.status === "running"
    || Object.values(state.cases).some((item) => Object.values(item.stages).some((stage) => stage.status === "running"));
  const failed = state.seedStage.status === "failed"
    || Object.values(state.cases).some((item) => Object.values(item.stages).some((stage) => stage.status === "failed"));
  const status = running ? "running" : failed ? "failed" : hasRunActivity(state) ? "complete" : "idle";
  return (
    <div
      className="runline blob"
      data-running={running ? "true" : "false"}
      data-status={status}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={running ? "Audit running" : failed ? "Audit failed" : "Audit idle"}
    >
      <span />
    </div>
  );
}
