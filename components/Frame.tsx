"use client";

import { SiteHeader } from "@/components/SiteHeader";

export function Frame({
  children,
  dock,
  resettable = true,
}: {
  word?: string;
  rail?: React.ReactNode;
  children: React.ReactNode;
  dock?: React.ReactNode;
  resettable?: boolean;
  mode?: "app" | "page";
}) {
  return (
    <div className="shell" data-mode="page">
      <SiteHeader resettable={resettable} />
      <div className="workspace-main">
        {children}
        {dock}
      </div>
      <footer className="ta-footer">
        <span><i className="live-dot" aria-hidden="true" /> This tab’s memory only. Refreshing clears the run.</span>
        <span>Qloo and Gemini</span>
      </footer>
    </div>
  );
}
