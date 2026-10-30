import type { ConfigPatch } from "@/lib/session/state";

export type DemoPresetId = "concierge" | "bookseller";

export const DEMO_PLACE_CITIES = ["Lisbon", "New York", "Kuala Lumpur", "Osaka"] as const;
export const DEMO_BOOK_CITIES = ["Chicago", "London", "Toronto", "Mexico City"] as const;

export function demoCitiesFor(domain: "book" | "place"): string[] {
  return domain === "book" ? [...DEMO_BOOK_CITIES] : [...DEMO_PLACE_CITIES];
}

export const DEMO_PRESETS: Record<DemoPresetId, ConfigPatch & { id: DemoPresetId }> = {
  concierge: {
    id: "concierge",
    scenario: "demo",
    simulatedLabel: "Simulated concierge",
    disclaimer: "A Marriott-style hotel concierge. Simulated for this demo and not affiliated with Marriott.",
    domain: "place",
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
    assistantMode: "simulate",
    company: {
      name: "Lamp & Spine",
      industry: "Books",
      purpose: "Suggest books that fit stated interests, language, and budget.",
    },
    taskQuestion: "Recommend three books for my interests, preferred language and budget.",
    recommendationCount: 3,
    cities: [...DEMO_BOOK_CITIES],
    profile: {
      label: "Reader",
      age: "34",
      country: "United States",
      budget: "45",
      currency: "USD",
      language: "English",
      requirements: "Paperback or reasonably priced editions. No horror.",
      favorites: [
        { name: "Spirited Away", kind: "movie" },
        { name: "Radiohead", kind: "artist" },
        { name: "Dune", kind: "book" },
      ],
    },
  },
};
