"use client";

import Link from "next/link";
import { Frame } from "@/components/Frame";

export function HomeStage() {
  return (
    <Frame resettable={false}>
      <section className="ta-strip">
        <span><i className="live-dot" aria-hidden="true" /> AI Recommendation Audits</span>
        <span>Session only</span>
      </section>
      <section className="ta-hero">
        <h1>Does your AI understand the market—and the customer?</h1>
        <p className="lede">Compare recommendations across regions, or investigate how individual interests shape an AI’s choices.</p>
      </section>
      <section className="option-grid" aria-label="Audit options">
        <article className="option-card">
          <p className="kicker">01 / Across markets</p>
          <h2>What should your AI recommend differently across regions?</h2>
          <p>Enter the same request across cities. Compare Gemini’s recommendations with Qloo-assisted alternatives using available regional cultural signals. No personal favorites required.</p>
          <p className="option-example">Recommend three fantasy books.</p>
          <p className="option-example">Chennai · Kuala Lumpur · London</p>
          <Link className="btn" href="/regional" data-testid="cta-regional">Compare regions →</Link>
        </article>
        <article className="option-card">
          <p className="kicker">02 / Across interests</p>
          <h2>Do the recommendations reflect this customer’s interests?</h2>
          <p>Provide a customer brief and their favorites. Compare the original answer with Qloo-assisted recommendations and inspect which interests support each choice.</p>
          <p className="option-example">Favorite books + music + films → recommendations</p>
          <Link className="btn ghost" href="/demo" data-testid="cta-demo">Audit personal fit →</Link>
        </article>
      </section>
    </Frame>
  );
}
