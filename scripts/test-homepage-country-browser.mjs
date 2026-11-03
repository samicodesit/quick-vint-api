import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.HOME_BROWSER_URL || "http://127.0.0.1:4359";
assert.equal(new URL(base).hostname, "127.0.0.1", "Keep QA traffic local");
const output =
  process.env.HOME_BROWSER_OUTPUT || "/tmp/autolister-homepage-country-qa";
await mkdir(output, { recursive: true });
const config = JSON.parse(
  await readFile(new URL("../vercel.json", import.meta.url)),
);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const country of ["US", "FR", undefined]) {
    for (const width of [320, 390, 1440]) {
      for (const variant of ["a", "b"]) {
        console.log(`Checking ${country || "unknown"} ${width}px ${variant}`);
        const context = await browser.newContext({
          viewport: { width, height: 960 },
        });
        const errors = [];
        await context.route("**/*", async (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== base) {
            if (url.hostname === "flagcdn.com") return route.continue();
            return route.abort();
          }
          // Emulate only the configured CDN rewrite. The browser still visits /.
          if (route.request().isNavigationRequest() && url.pathname === "/") {
            const rewrite = config.rewrites.find(
              (rule) =>
                rule.source === "/" &&
                (!rule.has ||
                  rule.has.every(
                    (condition) =>
                      condition.type === "header" &&
                      condition.key === "x-vercel-ip-country" &&
                      condition.value === country,
                  )),
            );
            if (rewrite) {
              const response = await context.request.get(
                `${base}${rewrite.destination}`,
              );
              assert.equal(response.status(), 200);
              return route.fulfill({ response });
            }
          }
          if (url.pathname === "/api/public-stats")
            return route.fulfill({
              json: { generations: 11739, totalGenerations: 11739 },
            });
          if (url.pathname === "/api/events/track")
            return route.fulfill({ json: { acknowledgedIds: [] } });
          return route.continue();
        });
        await context.addInitScript((variant) => {
          localStorage.setItem(
            "autolister.home-entry.v1",
            JSON.stringify({
              id: "mobile-entry-v1",
              variant,
              enrolledAt: Date.parse("2026-10-13T12:00:00Z"),
            }),
          );
          window.countryQaLayoutShift = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              if (!entry.hadRecentInput)
                window.countryQaLayoutShift += entry.value;
          }).observe({ type: "layout-shift", buffered: true });
        }, variant);
        const page = await context.newPage();
        await page.clock.setFixedTime(new Date("2026-11-03T12:00:00Z"));
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(base, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        assert.equal(new URL(page.url()).pathname, "/");
        assert.equal(
          await page.locator("html").getAttribute("data-home-entry-variant"),
          variant,
        );
        const expected =
          country === "US"
            ? "Compatible with Vinted, Depop, Poshmark and eBay*."
            : "Compatible with Vinted & eBay*.";
        const hero = page.locator("[data-home-hero]");
        assert.ok(
          (await hero.textContent()).includes(expected),
          `${country} ${width} ${variant}: expected ${expected}`,
        );
        // Check the rendered subtitle, including narrow phones, without relying on hidden copy.
        const subtitle =
          width >= 1024
            ? page.locator(".home-hero-subtitle")
            : hero.locator("p").filter({ hasText: expected }).last();
        assert.ok(await subtitle.isVisible());
        assert.ok((await subtitle.innerText()).includes(expected));
        assert.ok(
          (await page.locator("footer").innerText()).includes(
            country === "US"
              ? "* Depop, Poshmark and eBay are available with limited access."
              : "* eBay is available with limited access.",
          ),
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          "No horizontal overflow",
        );
        assert.deepEqual(errors, []);
        const cls = await page.evaluate(() => window.countryQaLayoutShift);
        assert.ok(cls < 0.1, `Unexpected layout shift: ${cls}`);
        if (country && width !== 320) {
          const prefix = `${output}/${country}-${width}-${variant}`;
          await page.screenshot({ path: `${prefix}-hero.png` });
          await page
            .locator("footer")
            .screenshot({ path: `${prefix}-footer.png` });
        }
        results.push({ country: country || "unknown", width, variant, cls });
        await context.close();
      }
    }
  }
  console.log(JSON.stringify({ passed: results.length, results }, null, 2));
} finally {
  await browser.close();
}
