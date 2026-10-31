import { describe, expect, it } from "vitest";
import { artworkQuery, choosePages, filmBias, sanitizeImageUrl, titleScore } from "@/lib/catalog/rank";

describe("catalog artwork ranking", () => {
  it("prefers the exact title and a film page for movies", () => {
    const pages = [
      { title: "Dune", index: 1 },
      { title: "Dune (2021 film)", index: 2 },
      { title: "Children of Dune", index: 3 },
    ];
    expect(choosePages("Dune", pages, "movie").map((page) => page.title)).toEqual(["Dune (2021 film)"]);
    expect(choosePages("Spirited Away", [
      { title: "Music of Spirited Away", index: 2 },
      { title: "Spirited Away", index: 1 },
      { title: "List of accolades received by Spirited Away", index: 3 },
    ], "movie").map((page) => page.title)).toEqual(["Spirited Away"]);
    expect(choosePages("Inception", [
      { title: "Inception (soundtrack)", index: 2 },
      { title: "Inception", index: 1 },
    ], "movie").map((page) => page.title)).toEqual(["Inception"]);
  });

  it("scores titles and rejects non-catalog image hosts", () => {
    expect(titleScore("Radiohead", "Radiohead")).toBe(0);
    expect(artworkQuery("The Ivory Grin (Lew Archer, #4)")).toBe("The Ivory Grin");
    expect(artworkQuery("Kill Anything That Moves: The Real American War in Vietnam (American Empire Project)")).toBe("Kill Anything That Moves");
    expect(titleScore("Kill Anything That Moves: The Real American War in Vietnam", "Kill anything that moves")).toBe(1);
    expect(filmBias("Music of Spirited Away")).toBe(3);
    expect(sanitizeImageUrl("https://upload.wikimedia.org/wikipedia/en/d/db/Spirited_Away_Japanese_poster.png?utm_source=en.wikipedia.org")).toBe("https://upload.wikimedia.org/wikipedia/en/d/db/Spirited_Away_Japanese_poster.png");
    expect(sanitizeImageUrl("https://covers.openlibrary.org/b/id/11481354-L.jpg")).toMatch(/openlibrary/);
    expect(sanitizeImageUrl("http://covers.openlibrary.org/b/id/1-L.jpg")).toBeNull();
    expect(sanitizeImageUrl("https://evil.example/poster.jpg")).toBeNull();
  });
});
