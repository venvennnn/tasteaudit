"use client";

import Link from "next/link";
import { useSession } from "@/components/SessionProvider";
import type { Favorite } from "@/lib/session/state";

function Icon({ name }: { name: "doc" | "gear" | "people" | "db" | "search" | "music" | "film" | "book" | "info" | "bars" }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "doc" ? <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.8V8h4.2" /> : null}
      {name === "gear" ? <path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zM12 3.5v2.2M12 18.3V20.5M4.8 6.6l1.8 1.2M17.4 16.2l1.8 1.2M3.5 12h2.2M18.3 12h2.2M4.8 17.4l1.8-1.2M17.4 7.8l1.8-1.2" /> : null}
      {name === "people" ? <path d="M8.2 11a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM15.8 11.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM3.8 19.2c.6-2.6 2.4-4 4.4-4s3.8 1.4 4.4 4M13.2 15.4c1.6-.2 3.2.8 4 3.6" /> : null}
      {name === "db" ? <path d="M5 7c0-1.8 3.1-3.2 7-3.2S19 5.2 19 7v10c0 1.8-3.1 3.2-7 3.2S5 18.8 5 17V7zM5 7c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2M5 12c0 1.8 3.1 3.2 7 3.2s7-1.4 7-3.2" /> : null}
      {name === "search" ? <path d="M10.5 5.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM15 15l4 4" /> : null}
      {name === "music" ? <path d="M9 17.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM11.2 15.2V6.2l7-1.4v8.2M18.2 11a2.2 2.2 0 1 0 0-4.4" /> : null}
      {name === "film" ? <path d="M4 7.5h16v9H4v-9zM8 7.5v9M16 7.5v9M4 10.5h4M16 10.5h4M4 13.5h4M16 13.5h4" /> : null}
      {name === "book" ? <path d="M5 6.2c3.2-1.6 5.2-1.4 7 .4 1.8-1.8 3.8-2 7-.4V18c-3.2-1.6-5.2-1.4-7 .4-1.8-1.8-3.8-2-7-.4V6.2z" /> : null}
      {name === "info" ? <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 11v5M12 8h.01" /> : null}
      {name === "bars" ? <path d="M5 16v3M10 12v7M15 8v11M20 5v14" /> : null}
    </svg>
  );
}

const KIND_ICON: Record<Favorite["kind"], "film" | "music" | "book" | "search"> = {
  movie: "film",
  artist: "music",
  book: "book",
  any: "search",
};

const KIND_LABEL: Record<Favorite["kind"], string> = {
  movie: "Film",
  artist: "Music",
  book: "Book",
  any: "Place",
};

function RailItem({ icon, title, detail }: { icon: "doc" | "gear" | "people" | "db" | "search" | "music" | "film" | "book" | "info" | "bars"; title: string; detail: string }) {
  return (
    <li>
      <Icon name={icon} />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </li>
  );
}

export function WhyRail({ cta = true }: { cta?: boolean }) {
  return (
    <>
      <ul className="rail-list">
        <RailItem icon="doc" title="Same customer brief" detail="Identical question and context." />
        <RailItem icon="gear" title="Same model settings" detail="Model, prompt, and tools stay fixed." />
        <RailItem icon="people" title="Identity matching" detail="Cultural and interest signals applied." />
        <RailItem icon="db" title="Qloo evidence" detail="Affinity from the interests you named." />
        <RailItem icon="search" title="Practical checks" detail="Feasibility stays visible when unknown." />
      </ul>
      <div className="rail-foot">
        <p className="rail-note">Affinity appears after a live run. Missing evidence stays visible.</p>
        {cta ? <Link className="rail-cta" href="/audit" data-testid="cta-audit">Run your own audit <span aria-hidden="true">↗</span></Link> : null}
      </div>
    </>
  );
}

export function StartRail({ action = "company" }: { action?: "company" | "demo" }) {
  return (
    <>
      <ul className="rail-list">
        <RailItem icon="doc" title="Choose an assistant" detail="Select a demo or bring your own scenario." />
        <RailItem icon="people" title="Define the customer" detail="Set the customer brief and cultural context." />
        <RailItem icon="search" title="Inspect the evidence" detail="See how the model reasons and what it draws on." />
      </ul>
      <div className="rail-foot">
        {action === "company" ? (
          <Link className="rail-cta" href="/audit">Use your company <span aria-hidden="true">↗</span></Link>
        ) : (
          <Link className="rail-cta" href="/demo">Try a demo <span aria-hidden="true">↗</span></Link>
        )}
        <p className="rail-note">No login · Session only.</p>
      </div>
    </>
  );
}

export function WhoRail() {
  const { state } = useSession();
  const name = state.profile.label.trim() || "Customer";
  const initial = name.charAt(0).toUpperCase();
  const interests = state.profile.favorites.filter((favorite) => favorite.name.trim());
  return (
    <>
      <div className="who">
        <span className="avatar" aria-hidden="true">{initial}</span>
        <div>
          <strong>{name}</strong>
          <span>{state.cities[0]?.trim() || "City not set"}</span>
        </div>
      </div>
      <ul className="rail-list">
        {interests.length === 0 ? <RailItem icon="search" title="No interests yet" detail="Add a few to ground the brief." /> : null}
        {interests.map((favorite) => (
          <RailItem key={`${favorite.kind}-${favorite.name}`} icon={KIND_ICON[favorite.kind]} title={KIND_LABEL[favorite.kind]} detail={favorite.name} />
        ))}
      </ul>
      <div className="rail-foot">
        <p className="rail-note"><Icon name="info" /> Context is explicit. Gemini receives the full brief. Qloo uses supported signals only.</p>
        <Link className="rail-link" href="/methodology">Inspect signal settings <span aria-hidden="true">↗</span></Link>
        <p className="rail-note">Session only · No login.</p>
      </div>
    </>
  );
}

export function ProofRail() {
  return (
    <>
      <ul className="rail-list">
        <RailItem icon="doc" title="Identity" detail="Confirm which entity was matched." />
        <RailItem icon="bars" title="Cultural evidence" detail="Inspect available affinity and contributions." />
      </ul>
      <div className="proof-checks">
        <p><Icon name="info" /> Practical checks</p>
        <dl>
          <div><dt>Hours</dt><dd>Unverified</dd></div>
          <div><dt>Price</dt><dd>Unverified</dd></div>
          <div><dt>Accessibility</dt><dd>Unverified</dd></div>
        </dl>
      </div>
      <div className="rail-foot">
        <Link className="rail-cta" href="/demo">Try another customer <span aria-hidden="true">↗</span></Link>
        <p className="rail-note">Session only · Download before leaving.</p>
      </div>
    </>
  );
}
