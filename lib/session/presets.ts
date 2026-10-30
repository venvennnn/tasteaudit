import type { Comparison, ConfigPatch, Favorite, ReaderProfile } from "@/lib/session/state";

export type DemoPresetId = "concierge" | "bookseller";

export const DEMO_PLACE_CITIES = ["Lisbon", "New York", "Kuala Lumpur", "Osaka"] as const;
export const DEMO_BOOK_CITIES = ["Chicago", "London", "Toronto", "Mexico City"] as const;

function interest(name: string, kind: Favorite["kind"]): Favorite {
  return { name, kind };
}

export const DEMO_BOOK_READERS: ReaderProfile[] = [
  {
    label: "Ada",
    favorites: [interest("Spirited Away", "movie"), interest("Radiohead", "artist"), interest("Dune", "book")],
  },
  {
    label: "Ben",
    favorites: [interest("The Godfather", "movie"), interest("Miles Davis", "artist"), interest("Pride and Prejudice", "book")],
  },
  {
    label: "Chi",
    favorites: [interest("Blade Runner", "movie"), interest("Björk", "artist"), interest("Neuromancer", "book")],
  },
  {
    label: "Noor",
    favorites: [interest("Amélie", "movie"), interest("Nina Simone", "artist"), interest("The Little Prince", "book")],
  },
];

export function demoCitiesFor(domain: "book" | "place"): string[] {
  return domain === "book" ? [...DEMO_BOOK_CITIES] : [...DEMO_PLACE_CITIES];
}

export function runLabels(input: {
  scenario: "demo" | "company" | null;
  domain: "book" | "place";
  comparison: Comparison;
  readers: { label: string }[];
  cities: string[];
}): string[] {
  if (input.comparison === "readers") {
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const reader of input.readers) {
      const label = reader.label.trim();
      if (!label || seen.has(label.toLowerCase())) continue;
      seen.add(label.toLowerCase());
      labels.push(label);
      if (labels.length >= 4) break;
    }
    return labels;
  }
  if (input.scenario === "demo" && input.domain === "place") return [...DEMO_PLACE_CITIES];
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const city of input.cities) {
    const label = city.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    labels.push(label);
    if (labels.length >= 4) break;
  }
  return labels;
}

export const DEMO_PRESETS: Record<DemoPresetId, ConfigPatch & { id: DemoPresetId }> = {
  concierge: {
    id: "concierge",
    scenario: "demo",
    simulatedLabel: "Simulated concierge",
    disclaimer: "A Marriott-style hotel concierge. Simulated for this demo and not affiliated with Marriott.",
    domain: "place",
    comparison: "cities",
    readers: [],
    assistantMode: "simulate",
    company: {
      name: "Harbor House",
      industry: "Hospitality",
      purpose: "Evening plans for a guest who stated their interests directly.",
    },
    taskQuestion: "Recommend three places for my evening in this city, considering my interests, budget and practical needs.",
    recommendationCount: 3,
    cities: [...DEMO_PLACE_CITIES],
    profile: {
      label: "Guest",
      age: "34",
      country: "Portugal",
      budget: "80",
      currency: "EUR",
      language: "English",
      requirements: "Walking distance if possible. No loud nightclubs. Vegetarian-friendly food is welcome.",
      favorites: [
        { name: "Spirited Away", kind: "movie" },
        { name: "Radiohead", kind: "artist" },
        { name: "Dune", kind: "book" },
      ],
    },
  },
  bookseller: {
    id: "bookseller",
    scenario: "demo",
    simulatedLabel: "Simulated bookseller",
    disclaimer: "A Barnes & Noble-style bookseller. Simulated for this demo and not affiliated with Barnes & Noble.",
    domain: "book",
    comparison: "readers",
    readers: DEMO_BOOK_READERS.map((reader) => ({
      label: reader.label,
      favorites: reader.favorites.map((favorite) => ({ ...favorite })),
    })),
    assistantMode: "simulate",
    company: {
      name: "Lamp & Spine",
      industry: "Books",
      purpose: "Suggest books that fit stated interests, language, and budget.",
    },
    taskQuestion: "Recommend three books for my interests, preferred language and budget.",
    recommendationCount: 3,
    cities: DEMO_BOOK_READERS.map((reader) => reader.label),
    profile: {
      label: "Ada",
      age: "34",
      country: "United States",
      budget: "45",
      currency: "USD",
      language: "English",
      requirements: "Paperback or reasonably priced editions. No horror.",
      favorites: DEMO_BOOK_READERS[0]!.favorites.map((favorite) => ({ ...favorite })),
    },
  },
};
