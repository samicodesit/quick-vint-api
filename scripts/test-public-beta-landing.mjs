import assert from "node:assert/strict";
const imported = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = imported.default || imported;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4351";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [];
try {
  for (const [width, height, path] of [
    [360, 800, "/"],
    [390, 844, "/"],
    [768, 1024, "/"],
    [1024, 900, "/"],
    [1440, 1000, "/"],
    [390, 844, "/fr/"],
    [390, 844, "/de/"],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.route("**/api/public-stats", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ json: { totalGenerations: 123456 } });
    });
    await context.route("**/api/events/track", (route) =>
      route.fulfill({
        json: {
          schemaVersion: 2,
          acknowledgedIds: route
            .request()
            .postDataJSON()
            .events.map((e) => e.id),
          duplicateIds: [],
          rejections: [],
        },
      }),
    );
    const page = await context.newPage();
    await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    const headerBefore = await page.locator("#navbar").boundingBox();
    const video = await page.locator("[data-hero-video]").boundingBox();
    const appLink = page.locator(
      '[data-track-event="web_app_click"][data-track-context="home_hero_web"]',
    );
    assert.equal(await appLink.getAttribute("href"), "/app?ref=home_hero");
    const appBox = await appLink.boundingBox();
    const extensionBox = await page
      .locator('[data-track-context="home_hero_primary"]')
      .boundingBox();
    if (width < 640 && path === "/") {
      assert(video.y < appBox.y, "The demo precedes the actions on mobile");
      assert(
        extensionBox.y + extensionBox.height < height,
        "Both actions are above the fold",
      );
      assert(
        headerBefore.height <= 65,
        "The header stays compact, including its 1px separator",
      );
    }
    await page.locator('[data-public-stats][aria-busy="false"]').waitFor();
    assert.deepEqual(
      await page.locator("#navbar").boundingBox(),
      headerBefore,
      "Counter loading must not resize the header",
    );
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
      text: document.querySelector("h1").textContent.trim(),
      counter: getComputedStyle(document.querySelector("[data-public-stats]")),
    }));
    assert(
      layout.width <= layout.viewport,
      `No horizontal overflow at ${width} ${path}`,
    );
    const decoration = await page
      .locator("[data-public-stats]")
      .evaluate((e) => {
        const s = getComputedStyle(e);
        return [s.borderTopWidth, s.backgroundColor, s.boxShadow];
      });
    assert.deepEqual(
      decoration,
      ["0px", "rgba(0, 0, 0, 0)", "none"],
      "Counter is plain text",
    );
    if (path === "/")
      assert.equal(
        layout.text,
        "AI listing assistant for titles and descriptions",
      );
    await page.locator('[data-track-event="demo_video_open"]').click();
    await page.waitForFunction(() =>
      document.fullscreenElement?.matches("[data-hero-video]"),
    );
    await page.evaluate(() => document.exitFullscreen());
    await page.waitForFunction(() => document.fullscreenElement === null);
    checks.push(`${width}x${height} ${path}`);
    await context.close();
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
} finally {
  await browser.close();
}
