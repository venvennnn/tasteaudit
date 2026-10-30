"use client";

import { SiteHeader } from "@/components/SiteHeader";
import { ResultsBody } from "@/components/ResultsStudio";

export default function ResultsPage() {
  return (
    <div className="workspace">
      <SiteHeader tone="workspace" />
      <div className="page-intro">
        <h1>Results</h1>
        <p>Original and revised answers stay side by side with the evidence that was actually returned.</p>
      </div>
      <ResultsBody />
    </div>
  );
}
