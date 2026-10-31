import { expect, test } from "@playwright/test";

test("loads the bundled font without Google Fonts", async ({ page }) => {
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
  const fontResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === "http://127.0.0.1:3000"
      && url.pathname.startsWith("/_next/static/media/")
      && url.pathname.endsWith(".woff2");
  });

  await page.goto("/");
  expect((await fontResponse).ok()).toBe(true);
  const loadedWeights = await page.evaluate(async () => {
    const family = getComputedStyle(document.body).fontFamily.split(",")[0];
    return Promise.all([300, 400, 500, 600, 700].map(async (weight) => {
      const faces = await document.fonts.load(`${weight} 16px ${family}`);
      return faces.length > 0 && faces.every((face) => face.status === "loaded");
    }));
  });
  expect(loadedWeights).toEqual([true, true, true, true, true]);
  await expect(page.getByRole("heading", { name: /Same request/ })).toBeVisible();
});
