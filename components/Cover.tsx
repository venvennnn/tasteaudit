"use client";

import { useEffect, useState } from "react";
import type { ArtworkHit } from "@/lib/catalog/artwork";
import { artworkQuery, titleScore, type ArtworkKind } from "@/lib/catalog/rank";

const cache = new Map<string, ArtworkHit[]>();

export function useArtwork(query: string, kind: ArtworkKind, take = 1) {
  const name = query.trim();
  const key = `${kind}:${name.toLowerCase()}:${take}`;
  const [hits, setHits] = useState<ArtworkHit[]>(() => cache.get(key) ?? []);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "empty">(() => cache.has(key) ? (cache.get(key)!.length ? "ready" : "empty") : "idle");

  useEffect(() => {
    if (name.length < 2) {
      setHits([]);
      setStatus("empty");
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setHits(cached);
      setStatus(cached.length ? "ready" : "empty");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({ q: name, kind, take: String(take) });
      fetch(`/api/artwork?${params}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((body: { data?: { hits?: ArtworkHit[] } }) => {
          const next = Array.isArray(body?.data?.hits) ? body.data.hits : [];
          cache.set(key, next);
          setHits(next);
          setStatus(next.length ? "ready" : "empty");
        })
        .catch(() => {
          if (!controller.signal.aborted) setStatus("empty");
        });
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, kind, name, take]);

  return { hits, status };
}

export function Cover({ name, kind, fill = false }: { name: string; kind: ArtworkKind; fill?: boolean }) {
  const { hits, status } = useArtwork(artworkQuery(name), kind, 3);
  const [skip, setSkip] = useState(0);
  const hit = hits[skip];
  useEffect(() => {
    setSkip(0);
  }, [name, kind]);
  return (
    <span className={fill ? "cover-frame fill" : "cover-frame"} data-state={hit ? "ready" : status}>
      {hit ? (
        // Remote catalog bytes stay on the publisher host. next/image would proxy them.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cover" src={hit.imageUrl} alt="" onError={() => setSkip((value) => value + 1)} />
      ) : null}
      {status === "loading" && !hit ? <span className="cover-bar" aria-hidden="true" /> : null}
    </span>
  );
}

export function ArtworkSearch({ kind, onPick }: { kind: ArtworkKind; onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const { hits, status } = useArtwork(query, kind, 4);
  const visible = query.trim().length >= 2 && hits.length > 0;

  function choose(name: string) {
    onPick(name);
    setQuery("");
  }

  return (
    <div className="search-pop">
      <form className="search-line" onSubmit={(event) => {
        event.preventDefault();
        const first = hits.find((hit) => titleScore(query, hit.name) <= 2);
        choose(first?.name || query.trim());
      }}>
        <input aria-label="Search an interest" placeholder="Search a movie, artist or book..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </form>
      {visible ? (
        <ul className="search-results" aria-label="Catalog images">
          {hits.map((hit) => (
            <li key={`${hit.source}-${hit.name}`}>
              <button type="button" onClick={() => choose(hit.name)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={hit.imageUrl} alt="" />
                <span><strong>{hit.name}</strong><small>{hit.source}</small></span>
              </button>
            </li>
          ))}
        </ul>
      ) : status === "loading" ? <p className="muted search-wait">Looking up a picture…</p> : null}
    </div>
  );
}
