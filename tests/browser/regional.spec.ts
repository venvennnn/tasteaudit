import { expect, test } from "@playwright/test";

const hobbit = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const piranesi = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function ok(data: unknown) {
  return { data, warnings: [], provenance: { provider: "gemini", requestedModel: "gemini-test", model: "gemini-test", retrievedAt: "2026-10-31T00:00:00.000Z" } };
}

test("compares two confirmed cities without personal favorites", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const body = route.request().postDataJSON() as { name?: string; task?: { interests?: unknown[]; city?: string }; tagIds?: string[]; candidateIds?: string[] } | null;
    const json = (payload: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ok(payload)) });
    if (url.includes("/api/qloo/locality")) {
      const name = body?.name ?? "Chennai";
      return json({
        candidates: [{ entityId: `loc-${name}`, name, types: ["urn:entity:locality"] }],
        match: { status: "exact", ambiguous: false, entity: { entityId: `loc-${name}`, name, types: ["urn:entity:locality"] } },
      });
    }
    if (url.includes("/api/gemini/original")) {
      expect(body?.task?.interests).toEqual([]);
      expect(body?.task?.city).toBeTruthy();
      return json({ answer: "Read The Hobbit." });
    }
    if (url.includes("/api/gemini/extract")) return json({ picks: [{ name: "The Hobbit", quote: "The Hobbit" }] });
    if (url.includes("/api/qloo/search")) {
      return json({
        candidates: [{ entityId: hobbit, name: "The Hobbit", types: ["urn:entity:book"] }],
        match: { status: "exact", ambiguous: false, entity: { entityId: hobbit, name: "The Hobbit", types: ["urn:entity:book"] } },
      });
    }
    if (url.includes("/api/qloo/taste")) {
      return json({
        tags: [
          { tagId: "urn:tag:genre:media:fantasy", name: "Fantasy", namespace: "urn:tag:genre:media", types: ["urn:entity:book"], score: null, compatible: true, explainabilityStatus: "unavailable" },
          { tagId: "urn:tag:genre:place:cafe", name: "Cafe", namespace: "urn:tag:genre:place", types: ["urn:entity:place"], score: null, compatible: false, explainabilityStatus: "unavailable" },
        ],
        locality: { name: "Chennai", id: "loc" },
        scoresNumeric: false,
        explainabilityReturned: false,
        demographicEchoed: false,
        parameters: [{ name: "signal.location.query", value: "Chennai" }],
      });
    }
    if (url.includes("/api/qloo/regional-insights")) {
      expect(body?.tagIds).toEqual(["urn:tag:genre:media:fantasy"]);
      const entities = body?.candidateIds
        ? [
            { entityId: hobbit, name: "The Hobbit", types: ["urn:entity:book"], affinity: 0.41, explainability: { status: "available", contributions: [{ entityId: null, name: "Fantasy", value: 0.2 }], warning: null, raw: null }, language: null, tags: [], evidenceOrigin: "unsigned", envelope: null },
            { entityId: piranesi, name: "Piranesi", types: ["urn:entity:book"], affinity: 0.62, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, tags: [], evidenceOrigin: "unsigned", envelope: null },
          ]
        : [{ entityId: piranesi, name: "Piranesi", types: ["urn:entity:book"], affinity: null, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, language: null, tags: [], evidenceOrigin: "unsigned", envelope: null }];
      return json({ entities, missingIds: [], locality: null, parameters: [{ name: "signal.interests.tags", value: "urn:tag:genre:media:fantasy" }] });
    }
    if (url.includes("/api/gemini/repair")) return json({ selections: [{ id: piranesi, reason: "It scored higher on the derived tags." }], answer: "Revised: Piranesi." });
    if (url.includes("/api/artwork")) return json({ hits: [] });
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "upstream", message: url, stage: "test", retryable: false, requestId: "x" }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Does your AI understand the market/ })).toBeVisible();
  await page.getByTestId("cta-regional").click();
  await expect(page.getByText("Compare the same request across markets using available regional cultural signals.")).toBeVisible();
  for (const city of ["Chennai", "London"]) {
    await page.getByTestId("regional-city-input").fill(city);
    await page.getByRole("button", { name: "Find locality" }).click();
    await page.getByTestId("locality-option").click();
  }
  await page.getByTestId("run-regional").click();
  await expect(page.getByText("Derived from regional taste profile").first()).toBeVisible();
  await expect(page.getByText("0.410").first()).toBeVisible();
  await expect(page.getByText("0.620").first()).toBeVisible();
  await expect(page.getByText("Not returned").first()).toBeVisible();
  await expect(page.getByTestId("regional-revised").first()).toContainText("Piranesi");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
});
