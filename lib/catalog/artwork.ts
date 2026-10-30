import { choosePages, sanitizeImageUrl, titleScore, type ArtworkKind } from "@/lib/catalog/rank";

export type ArtworkHit = {
  name: string;
  imageUrl: string;
  source: "Wikipedia" | "Open Library" | "Deezer" | "Apple";
};

const UA = "TasteAudit/1.0 (catalog artwork; https://github.com/venvennnn/tasteaudit)";
const cache = new Map<string, ArtworkHit[]>();
const CACHE_LIMIT = 200;

export async function lookupArtwork(input: {
  query: string;
  kind: ArtworkKind;
  take: number;
  signal?: AbortSignal;
}): Promise<ArtworkHit[]> {
  const query = input.query.trim();
  const take = Math.min(6, Math.max(1, input.take));
  if (query.length < 2) return [];
  const key = `${input.kind}:${query.toLowerCase()}:${take}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const hits = await fetchHits(query, input.kind, take, input.signal);
  cache.set(key, hits);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return hits;
}

async function fetchHits(query: string, kind: ArtworkKind, take: number, signal?: AbortSignal): Promise<ArtworkHit[]> {
  try {
    if (kind === "book") {
      const books = await openLibrary(query, take, signal);
      if (books.length > 0) return books;
      return wikipedia(query, "book", take, signal);
    }
    if (kind === "artist") {
      const artists = await deezer(query, take, signal);
      if (artists.length > 0) return artists;
      const albums = await appleMusic(query, take, signal);
      if (albums.length > 0) return albums;
      return wikipedia(query, "artist", take, signal);
    }
    if (kind === "movie") {
      const films = await wikipedia(`${query} film`, "movie", take, signal);
      if (films.length > 0) return films;
      return wikipedia(query, "movie", take, signal);
    }
    const broad = await wikipedia(query, "any", take, signal);
    if (broad.length > 0) return broad;
    return openLibrary(query, take, signal);
  } catch {
    return [];
  }
}

async function wikipedia(query: string, kind: ArtworkKind, take: number, signal?: AbortSignal): Promise<ArtworkHit[]> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", String(Math.min(8, take + 4)));
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "640");
  url.searchParams.set("pilicense", "any");
  url.searchParams.set("format", "json");
  const body = await readJson(url, signal);
  const pages = Object.values((body?.query as { pages?: Record<string, unknown> } | undefined)?.pages ?? {}) as Array<{
    title?: string;
    index?: number;
    thumbnail?: { source?: string };
  }>;
  const ranked = choosePages(
    query.replace(/\s+film$/i, ""),
    pages.map((page) => ({
      title: page.title ?? "",
      index: page.index ?? 99,
      imageUrl: sanitizeImageUrl(page.thumbnail?.source ?? ""),
    })).filter((page) => page.title && page.imageUrl),
    kind,
  );
  return ranked.slice(0, take).map((page) => ({
    name: cleanTitle(page.title),
    imageUrl: page.imageUrl!,
    source: "Wikipedia" as const,
  }));
}

function cleanTitle(title: string): string {
  return title.replace(/\s+\((?:\d{4}\s+)?(?:film|novel|album|song|band)\)$/i, "").trim();
}

async function openLibrary(query: string, take: number, signal?: AbortSignal): Promise<ArtworkHit[]> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("fields", "title,cover_i");
  const body = await readJson(url, signal);
  const docs = Array.isArray(body?.docs) ? body.docs as Array<{ title?: string; cover_i?: number }> : [];
  return rankNamed(query, docs.map((doc) => {
    if (!doc.title || typeof doc.cover_i !== "number") return null;
    const imageUrl = sanitizeImageUrl(`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`);
    if (!imageUrl) return null;
    return { name: doc.title, imageUrl, source: "Open Library" as const };
  }), take);
}

async function deezer(query: string, take: number, signal?: AbortSignal): Promise<ArtworkHit[]> {
  const url = new URL("https://api.deezer.com/search/artist");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  const body = await readJson(url, signal);
  const rows = Array.isArray(body?.data) ? body.data as Array<{ name?: string; picture_big?: string; picture_xl?: string }> : [];
  return rankNamed(query, rows.map((row) => {
    if (!row.name) return null;
    const imageUrl = sanitizeImageUrl(row.picture_xl || row.picture_big || "");
    if (!imageUrl) return null;
    return { name: row.name, imageUrl, source: "Deezer" as const };
  }), take);
}

async function appleMusic(query: string, take: number, signal?: AbortSignal): Promise<ArtworkHit[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("entity", "album");
  url.searchParams.set("limit", "8");
  const body = await readJson(url, signal);
  const rows = Array.isArray(body?.results) ? body.results as Array<{ artistName?: string; collectionName?: string; artworkUrl100?: string }> : [];
  return rankNamed(query, rows.map((row) => {
    const name = row.artistName || row.collectionName;
    if (!name || !row.artworkUrl100) return null;
    const larger = row.artworkUrl100.replace(/100x100bb\.jpg$/, "600x600bb.jpg");
    const imageUrl = sanitizeImageUrl(larger);
    if (!imageUrl) return null;
    return { name, imageUrl, source: "Apple" as const };
  }), take);
}

function rankNamed(query: string, rows: Array<ArtworkHit | null>, take: number): ArtworkHit[] {
  return rows
    .flatMap((row, index) => row ? [{ row, index, score: titleScore(query, row.name) }] : [])
    .filter((item) => item.score <= 2)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, take)
    .map((item) => item.row);
}

async function readJson(url: URL, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  const timeout = AbortSignal.timeout(7000);
  const response = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!response.ok) return null;
  return await response.json() as Record<string, unknown>;
}
