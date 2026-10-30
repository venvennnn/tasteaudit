export const SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  companyName: 120,
  industry: 120,
  purpose: 400,
  question: 1000,
  requirements: 800,
  favoriteName: 120,
  favorites: 8,
  cities: 3,
  city: 80,
  country: 80,
  budget: 40,
  currency: 8,
  language: 40,
  pastedAnswer: 8000,
  profileLabel: 80,
  recommendationsMin: 1,
  recommendationsMax: 5,
  recommendationsDefault: 3,
  discoverTake: 15,
  scorePoolMax: 20,
  searchTake: 6,
  textField: 800,
  reason: 400,
  payloadBytes: 80_000,
} as const;

export const DOMAINS = ["book", "place"] as const;
export type Domain = (typeof DOMAINS)[number];

export const FAVORITE_KINDS = ["movie", "artist", "book", "any"] as const;
export type FavoriteKind = (typeof FAVORITE_KINDS)[number];

export const AGE_BANDS = [
  "24_and_younger",
  "25_to_29",
  "30_to_34",
  "35_to_44",
  "45_to_54",
  "55_and_older",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const QLOO_TYPES = {
  movie: "urn:entity:movie",
  tv: "urn:entity:tv_show",
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  person: "urn:entity:person",
  place: "urn:entity:place",
} as const;

export const SYSTEM_PROMPT_VERSION = "tasteaudit-prompts-2026-10-30";

export const FROZEN_GENERATION = {
  temperature: 0.4,
  topP: 0.9,
} as const;

export const ENTITY_ID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

export function domainFilterType(domain: Domain): string {
  return domain === "book" ? QLOO_TYPES.book : QLOO_TYPES.place;
}

export function searchTypesForKind(kind: FavoriteKind): string[] {
  switch (kind) {
    case "movie":
      return [QLOO_TYPES.movie, QLOO_TYPES.tv];
    case "artist":
      return [QLOO_TYPES.artist];
    case "book":
      return [QLOO_TYPES.book];
    default:
      return [QLOO_TYPES.movie, QLOO_TYPES.tv, QLOO_TYPES.artist, QLOO_TYPES.book, QLOO_TYPES.person];
  }
}

export function searchTypesForDomain(domain: Domain): string[] {
  return [domainFilterType(domain)];
}

export function maxCities(): number {
  const raw = Number(process.env.TASTEAUDIT_MAX_CITIES ?? LIMITS.cities);
  if (!Number.isFinite(raw) || raw < 1) return LIMITS.cities;
  return Math.min(LIMITS.cities, Math.floor(raw));
}
