export type ArtworkKind = "movie" | "artist" | "book" | "any";

export function titleScore(query: string, title: string): number {
  const q = normalize(query);
  const t = normalize(title);
  if (!q || !t) return 9;
  if (t === q) return 0;
  if (t.startsWith(`${q} `)) return 1;
  if (t.includes(q)) return 2;
  return 5;
}

export function filmBias(title: string): number {
  const t = normalize(title);
  if (/\bfilm\b/.test(t)) return 0;
  if (/\b(novel|album|song|discography|soundtrack)\b/.test(t) || t.startsWith("music of ")) return 3;
  return 1;
}

export function choosePages<T extends { title: string; index: number }>(query: string, pages: T[], kind: ArtworkKind): T[] {
  const ranked = pages
    .map((page) => ({ page, score: titleScore(query, page.title), bias: filmBias(page.title) }))
    .sort((a, b) => a.score - b.score || a.bias - b.bias || a.page.index - b.page.index);
  if (kind === "movie") {
    const films = ranked.filter((item) => item.bias === 0 && item.score <= 2);
    if (films.length > 0) return films.map((item) => item.page);
    const pictured = ranked.filter((item) => item.bias < 3 && item.score <= 1);
    if (pictured.length > 0) return pictured.map((item) => item.page);
  }
  const close = ranked.filter((item) => item.score <= 1);
  if (close.length > 0) return close.map((item) => item.page);
  return ranked.filter((item) => item.score <= 2).map((item) => item.page);
}

export function sanitizeImageUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const allowed = host === "upload.wikimedia.org"
    || host === "thumb.wikimedia.org"
    || host === "covers.openlibrary.org"
    || host === "cdn-images.dzcdn.net"
    || host.endsWith(".mzstatic.com");
  if (!allowed) return null;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
