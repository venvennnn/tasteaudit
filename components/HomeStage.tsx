"use client";

import Link from "next/link";
import { Frame } from "@/components/Frame";

const PREVIEW = [
  {
    city: "Chennai",
    place: "India",
    tone: "warm" as const,
    chips: ["Mythology", "Epic storytelling", "South Asian culture"],
  },
  {
    city: "Kuala Lumpur",
    place: "Malaysia",
    tone: "teal" as const,
    chips: ["Multicultural themes", "Adventure", "Southeast Asian culture"],
  },
  {
    city: "London",
    place: "United Kingdom",
    tone: "navy" as const,
    chips: ["Classic fantasy", "World-building", "European literature"],
  },
];

export function HomeStage() {
  return (
    <Frame resettable={false}>
      <section className="home-top">
        <div className="home-copy">
          <p className="home-kicker">Recommendation intelligence</p>
          <h1>Same request.<br />Different worlds.</h1>
          <p className="lede">Audit how AI recommendations respond to regional culture and individual taste.</p>
        </div>
        <aside className="home-preview">
          <p className="home-request">Request</p>
          <p className="home-quote">“Recommend three fantasy books.”</p>
          <div className="home-cities">
            {PREVIEW.map((column) => (
              <div key={column.city}>
                <strong>{column.city}</strong>
                <small>{column.place}</small>
                <div className="home-covers" aria-hidden="true">
                  <Scene tone={column.tone} variant={0} />
                  <Scene tone={column.tone} variant={1} />
                  <Scene tone={column.tone} variant={2} />
                </div>
                <p className="home-evidence">Illustration</p>
                <ul>
                  {column.chips.map((chip) => <li key={chip}>{chip}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p className="home-caption">Illustrative preview. Not a measured run.</p>
        </aside>
      </section>

      <h2 className="home-ask">What would you like to investigate?</h2>
      <section className="home-choices" aria-label="Audit options">
        <article>
          <div>
            <p className="home-index">01</p>
            <h3>Regional audit</h3>
            <p>Compare one request across regions.</p>
            <Link className="btn" href="/regional" data-testid="cta-regional">Compare regions →</Link>
          </div>
          <GlobeSketch />
        </article>
        <article>
          <div>
            <p className="home-index">02</p>
            <h3>Personal fit</h3>
            <p>Trace recommendations back to individual interests.</p>
            <Link className="btn" href="/demo" data-testid="cta-demo">Audit personal fit →</Link>
          </div>
          <InterestSketch />
        </article>
      </section>

      <ol className="home-steps">
        <li><b>01</b><span><strong>Set the context</strong>Define your request, region, or interests.</span></li>
        <li><b>02</b><span><strong>Compare recommendations</strong>See how results change across contexts.</span></li>
        <li><b>03</b><span><strong>Inspect the evidence</strong>Read the signals Qloo actually returned.</span></li>
        <li><span><strong>Qloo and Gemini</strong>Scores come from Qloo. Gemini writes.</span></li>
      </ol>
    </Frame>
  );
}

function Scene({ tone, variant }: { tone: "warm" | "teal" | "navy"; variant: number }) {
  const sky = tone === "warm" ? ["#f4a261", "#e76f51"] : tone === "teal" ? ["#2a9d8f", "#1d4e89"] : ["#1e3a5f", "#0f172a"];
  const shift = 12 * variant;
  return (
    <svg viewBox="0 0 64 88" className="home-scene">
      <rect width="64" height="88" rx="6" fill={sky[variant % 2]} />
      <circle cx={20 + shift} cy={24} r="7" fill="#fff6d8" opacity="0.9" />
      <path d={`M6 70 L${22 + variant * 6} 42 L${40 + variant * 4} 70 Z`} fill="rgba(255,255,255,0.28)" />
      <rect x="8" y="62" width="48" height="16" rx="2" fill="rgba(15,23,42,0.18)" />
    </svg>
  );
}

function GlobeSketch() {
  return (
    <svg className="home-sketch" viewBox="0 0 240 150" aria-hidden="true">
      <ellipse cx="108" cy="74" rx="46" ry="46" fill="none" stroke="#0d47ff" strokeWidth="1.4" />
      <ellipse cx="108" cy="74" rx="20" ry="46" fill="none" stroke="#0d47ff" strokeWidth="1.2" />
      <path d="M62 74h92M70 54h76M70 94h76" fill="none" stroke="#0d47ff" strokeWidth="1.1" />
      <circle cx="76" cy="98" r="4" fill="#0d47ff" />
      <circle cx="148" cy="46" r="4" fill="#0d47ff" />
      <circle cx="166" cy="88" r="4" fill="#ff007a" />
      <path d="M76 98 C108 72 128 58 148 46" fill="none" stroke="#0d47ff" strokeDasharray="3 3" />
      <path d="M148 46 C168 58 174 74 166 88" fill="none" stroke="#ff007a" strokeDasharray="3 3" />
      <text x="8" y="128" fill="#475569" fontSize="11">Chennai</text>
      <text x="158" y="28" fill="#475569" fontSize="11">London</text>
      <text x="128" y="142" fill="#475569" fontSize="11">Kuala Lumpur</text>
    </svg>
  );
}

function InterestSketch() {
  return (
    <div className="home-interests" aria-hidden="true">
      <span>Books</span>
      <span>Music</span>
      <span>Films</span>
      <i />
    </div>
  );
}
