import { expect, test } from "@playwright/test";

const seed = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const place = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const gemini = {
  provider: "gemini",
  model: "gemini-test",
  requestedModel: "gemini-test",
  systemPromptVersion: "tasteaudit-prompts-2026-10-30",
  temperature: 0.4,
  topP: 0.9,
  latencyMs: 5,
  usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  retrievedAt: "2026-10-30T12:00:00.000Z",
};

function ok(data: unknown, warnings: string[] = []) {
  return { data, warnings, provenance: { ...gemini, retrievedAt: "2026-10-30T12:00:00.000Z" } };
}

test.describe("acceptance", () => {
  test("walks the demo, keeps state, and clears it on refresh", async ({ page }) => {
    let scoreCalls = 0;
    await page.route("**/api/**", async (route) => {
      const url = route.request().url();
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.includes("/api/qloo/search")) {
        return json(ok({
          candidates: [{ entityId: seed, name: "Dune", types: ["urn:entity:book"], popularity: 0.5 }],
          match: { status: "provisional", ambiguous: true, entity: { entityId: seed, name: "Dune", types: ["urn:entity:book"] } },
        }));
      }
      if (url.includes("/api/gemini/original")) return json(ok({ answer: "Visit Miradouro da Senhora do Monte for a long quiet view." }));
      if (url.includes("/api/gemini/refine")) return json(ok({ answer: "A quieter revision still names Miradouro da Senhora do Monte." }));
      if (url.includes("/api/gemini/extract")) {
        return json(ok({ picks: [{ name: "Miradouro da Senhora do Monte", quote: "Miradouro da Senhora do Monte" }] }));
      }
      if (url.includes("/api/qloo/discover")) {
        return json(ok({
          entities: [{ entityId: place, name: "Miradouro da Senhora do Monte", types: ["urn:entity:place"] }],
          geographicSignalApplied: true,
          locality: { name: "Lisbon", id: null, latitude: 38.72, longitude: -9.14 },
        }));
      }
      if (url.includes("/api/qloo/score")) {
        scoreCalls += 1;
        if (scoreCalls === 1) {
          return json({ code: "upstream", message: "The provider request failed.", stage: "qloo.score", retryable: true, requestId: "score-1" }, 502);
        }
        return json(ok({
          entities: [{
            entityId: place,
            name: "Miradouro da Senhora do Monte",
            types: ["urn:entity:place"],
            affinity: 0.42,
            explainability: { status: "unavailable", contributions: [], warning: null, raw: null },
            language: null,
            description: null,
            tags: [],
            evidenceOrigin: "unsigned",
            envelope: null,
          }],
          missingIds: [],
          geographicSignalApplied: true,
          locality: { name: "Lisbon", id: null, latitude: 38.72, longitude: -9.14 },
          signing: false,
        }, ["Missing explainability is unavailable."]));
      }
      if (url.includes("/api/gemini/repair")) {
        return json(ok({ selections: [{ id: place, reason: "It fits a quiet evening." }], answer: "Revised answer: Miradouro da Senhora do Monte." }));
      }
      return json({ code: "upstream", message: "Unexpected route", stage: "test", retryable: false, requestId: "x" }, 500);
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Change the context/ })).toBeVisible();
    await expect(page.locator(".rail-word").first()).toBeVisible();
    await page.getByTestId("cta-demo").click();
    await page.getByTestId("preset-concierge").click();
    await page.getByTestId("demo-continue").click();
    await page.getByTestId("favorite-name-0").fill("Spirited Away");
    await page.getByTestId("run-audit").click();
    await expect(page.getByTestId("stage-evidence-check")).toHaveText("failed");
    await page.getByTestId("retry-stage").click();
    await expect(page.getByTestId("revised-answer")).toContainText("Revised answer");
    await page.getByTestId("compare-all").click();
    await expect(page.getByText("A quieter revision")).toBeVisible();
    await expect(page.getByText("0.4200").first()).toBeVisible();

    await page.getByTestId("nav-methodology").click();
    await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
    await page.getByTestId("nav-demo").click();
    await expect(page.getByTestId("favorite-name-0")).toHaveValue("Spirited Away");

    await page.getByTestId("favorite-name-0").fill("Princess Mononoke");
    await expect(page.getByTestId("revised-answer")).toHaveCount(0);
    await page.getByTestId("nav-results").click();
    await expect(page.getByTestId("results-empty")).toBeVisible();
    await page.goto("/demo");
    await page.reload();
    await expect(page.getByTestId("favorite-name-0")).toHaveCount(0);
    await expect(page.getByTestId("preset-concierge")).toHaveAttribute("aria-pressed", "false");
  });

  test("resets a cancelled run and imports a downloaded file as imported evidence", async ({ page }) => {
    await page.route("**/api/qloo/search", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "not_configured", message: "QLOO_API_KEY is not configured.", stage: "qloo.search", retryable: false, requestId: "missing" }) });
    });
    await page.goto("/audit");
    await page.getByTestId("company-name").fill("Harbor House");
    await page.getByTestId("step-next").click();
    await page.getByTestId("favorite-name-0").fill("Dune");
    await page.getByTestId("city-input").fill("Lisbon");
    await page.getByTestId("step-next").click();
    await page.getByTestId("step-next").click();
    await page.getByTestId("audit-start").click();
    await page.waitForURL("**/results");
    await page.getByTestId("reset-session").click();
    await page.goto("/audit");
    await expect(page.getByTestId("company-name")).toHaveValue("");

    const exported = {
      kind: "tasteaudit-run",
      schemaVersion: 1,
      exportedAt: "2026-10-30T12:00:00.000Z",
      disclaimer: "software test fixture, not a measured result",
      session: {
        schemaVersion: 1,
        runId: "11111111-1111-1111-1111-111111111111",
        source: "session",
        scenario: "company",
        simulatedLabel: "",
        disclaimer: "",
        company: { name: "Imported House", industry: "Hospitality", purpose: "Evening" },
        domain: "place",
        assistantMode: "simulate",
        pastedAnswer: "",
        profile: { label: "Guest", age: "34", country: "Portugal", budget: "80", currency: "EUR", language: "English", requirements: "Quiet", favorites: [{ name: "Dune", kind: "book" }] },
        cities: ["Lisbon"],
        taskQuestion: "Recommend three places for my evening in this city, considering my interests, budget and practical needs.",
        recommendationCount: 3,
        compareAll: false,
        seedOverrides: {},
        seeds: [],
        seedStage: { status: "complete", error: null },
        cases: {
          Lisbon: {
            city: "Lisbon",
            stages: { original: { status: "complete", error: null }, refine: { status: "skipped", error: null }, extract: { status: "complete", error: null }, resolvePicks: { status: "complete", error: null }, discover: { status: "complete", error: null }, score: { status: "complete", error: null }, rerank: { status: "complete", error: null }, revise: { status: "complete", error: null }, summarize: { status: "complete", error: null } },
            originalAnswer: "Original imported answer.",
            refinedAnswer: null,
            revisedAnswer: "Revised imported answer.",
            originalProvenance: null,
            refinedProvenance: null,
            revisedProvenance: null,
            extracted: [],
            refinedExtracted: [],
            discovered: [],
            scores: [{ entityId: place, name: "A very long recommendation label that should wrap instead of clipping the chart or the page layout", types: ["urn:entity:place"], affinity: 0.42, explainability: { status: "unavailable", contributions: [], warning: null, raw: null }, evidenceOrigin: "provider", retrievedAt: "2026-10-30T12:00:00.000Z", sources: ["discovered"], envelope: "tampered", tags: [], language: null }],
            scoreFingerprint: "abc",
            rerankIds: [],
            rerankNote: null,
            revisedSelections: [{ id: place, name: "A very long recommendation label that should wrap instead of clipping the chart or the page layout", reason: "Quiet view" }],
            metrics: { entityResolution: { numerator: 1, denominator: 1 }, pickResolution: { numerator: 1, denominator: 1 }, scoreCoverage: { numerator: 1, denominator: 1 }, meanObservedAffinity: { value: 0.42, numerator: 1, denominator: 1 }, retention: { numerator: 0, denominator: 0 }, constraintCoverage: { numerator: 0, denominator: 6 }, comparabilityLimited: false },
            warnings: [],
            signals: { qloo: [], withheld: [{ name: "City", reason: "fixture" }], gemini: [], geographicSignalApplied: true, localityName: "Lisbon", coordinatesReturned: true },
            checksById: {},
            recorded: { at: "2026-10-30T12:00:00.000Z", model: "gemini-test", question: "Recommend three places", city: "Lisbon", configurationHash: "fixture" },
            observedModel: "gemini-test",
          },
        },
        running: false,
        votes: {},
        configHash: "",
        resultsHash: null,
      },
    };
    await page.goto("/results");
    await page.getByTestId("import-json").setInputFiles({ name: "run.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exported)) });
    await expect(page.getByTestId("imported-label")).toBeVisible();
    await expect(page.getByTestId("recorded-label")).toContainText("Recorded");
    await page.getByTestId("evidence-open").click();
    await expect(page.getByRole("dialog", { name: "Evidence" }).getByText("Imported evidence")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(overflow).toBe(true);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-json").click(),
    ]);
    expect(download.suggestedFilename()).toBe("tasteaudit-run.json");
  });

  test("keyboard, reduced motion, and mobile width", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const animation = await page.locator(".blob").first().evaluate((element) => getComputedStyle(element).animationName);
    expect(animation).toBe("none");
    for (let step = 0; step < 6; step += 1) {
      if (await page.getByRole("link", { name: "Skip to content" }).evaluate((element) => element === document.activeElement).catch(() => false)) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
  });
});
