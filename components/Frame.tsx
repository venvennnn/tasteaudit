"use client";

import { SiteHeader } from "@/components/SiteHeader";
import { useSession } from "@/components/SessionProvider";

export function Frame({
  word,
  rail,
  children,
  dock,
  resettable = true,
  mode = "app",
}: {
  word: string;
  rail: React.ReactNode;
  children: React.ReactNode;
  dock?: React.ReactNode;
  resettable?: boolean;
  mode?: "app" | "page";
}) {
  return (
    <div className="shell" data-mode={mode}>
      <div className="workspace-col">
        <SiteHeader />
        <div className="workspace-main">{children}</div>
        {dock ?? <SessionFoot resettable={resettable} />}
      </div>
      <aside className="blue-rail">
        <p className="rail-word">{word}</p>
        <div className="rail-body">{rail}</div>
      </aside>
    </div>
  );
}

export function SessionFoot({ resettable = true }: { resettable?: boolean }) {
  const { reset } = useSession();
  return (
    <footer className="quiet-foot">
      <span><i className="live-dot" aria-hidden="true" /> Session only — Download before leaving</span>
      {resettable ? <button type="button" className="text-btn" data-testid="reset-session" onClick={reset}>Reset session</button> : null}
    </footer>
  );
}
