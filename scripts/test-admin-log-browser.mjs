import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const html = await readFile(
  new URL("../src/pages/admin.html", import.meta.url),
  "utf8",
);
const logs = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    endpoint: "/api/generate",
    generated_title: "Local photo fixture",
    response_status: 200,
    image_count: 2,
    log_client: "mobile_web",
    created_at: "2026-10-12T16:30:53Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    endpoint: "/event/subscription_started",
    response_status: 204,
    event_status: "active",
    event_tier: "starter",
    log_source: "stripe_webhook",
    created_at: "2026-10-12T16:36:41Z",
  },
];
const browser = await chromium.launch({ headless: true });
let externalRequests = 0;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.addInitScript(() =>
      localStorage.setItem("admin_key", btoa("local-fixture")),
    );
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://admin.test") {
        externalRequests++;
        return route.abort();
      }
      if (url.pathname.startsWith("/admin/"))
        return route.fulfill({ contentType: "text/html", body: html });
      if (url.pathname.startsWith("/api/")) {
        let body = { ok: true };
        if (url.searchParams.get("action") === "web-app-stats") body = { available: true, window: { start: "2026-10-12T00:00:00Z", end: "2026-10-21T00:00:00Z" }, totals: {}, daily: [], entrySources: [], completeness: {}, measurement: {}, homepageExperiment: { status: "Enrolling", definition: "Same-browser API outcomes", enrollmentEnd: "2026-11-02T00:00:00Z", end: "2026-11-09T00:00:00Z", arms: [{ label: "A: Demo first", exposed: 10, appClicks: 4, extensionClicks: 2, generated: 2, copied: 1, matureGenerated: 2, mature: 10, conversionRate: 20, confidenceInterval: [5.7, 51] }, { label: "B: App first", exposed: 12, appClicks: 7, extensionClicks: 1, generated: 3, copied: 2, matureGenerated: 0, mature: 0, conversionRate: null, confidenceInterval: null }] } };
        if (url.searchParams.get("action") === "view-logs")
          body = {
            logs,
            pagination: { page: 1, total: 2, totalPages: 1, limit: 50 },
          };
        if (url.searchParams.get("action") === "view-logs" && url.searchParams.get("search") === "web_app_view") body = { logs, pagination: { page: Number(url.searchParams.get("page") || 1), limit: 2, total: null, totalPages: null, hasMore: Number(url.searchParams.get("page") || 1) === 1 } };
        if (url.searchParams.get("action") === "log-detail") {
          const log = logs.find(
            (item) => item.id === url.searchParams.get("id"),
          );
          body = {
            log: {
              ...log,
              image_urls: "null",
              full_request_body:
                log.endpoint === "/api/generate"
                  ? { client: "mobile_web", imageCount: 2, openaiImageCount: 2 }
                  : {
                      source: "stripe_webhook",
                      context: { status: "active", tier: "starter" },
                    },
            },
          };
        }
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      }
      if (/^\/[a-z-]+\.js$/.test(url.pathname)) {
        try {
          return route.fulfill({
            contentType: "application/javascript",
            body: await readFile(
              new URL(`../public${url.pathname}`, import.meta.url),
              "utf8",
            ),
          });
        } catch {
          /* unused optional asset */
        }
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://admin.test/admin/logs?log_type=all");
    const row = page
      .locator(".activity-row")
      .filter({ hasText: "Local photo fixture" });
    await row.waitFor();
    assert.match(await row.innerText(), /2 images/);
    assert.match(
      await page.locator("#contentArea").innerText(),
      /Subscription activated/,
    );
    for (let repeat = 0; repeat < 3; repeat++) {
      await row.getByRole("button", { name: "View", exact: true }).click();
      await page.locator("#modalBackdrop.open").waitFor();
      assert.match(
        await page.locator("#modalBody").innerText(),
        /2 photos sent/,
      );
      assert.match(
        await page.locator("#modalBody").innerText(),
        /Preview not retained/,
      );
      await page
        .getByRole("button", { name: "Close details", exact: true })
        .click();
      assert.equal(await page.locator("#modalBackdrop.open").count(), 0);
    }
    assert.deepEqual(errors, []);
    await page.goto("http://admin.test/admin/logs?log_type=all&search=web_app_view");
    await page.getByText("Showing 1-2 search results", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), true);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByText("Showing 3-4 search results", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Next", exact: true }).isEnabled(), false);
    assert.equal(await page.getByRole("button", { name: "Previous", exact: true }).isEnabled(), true);
    await page.goto("http://admin.test/admin/web-app");
    await page.getByText("Mobile homepage A/B", { exact: true }).waitFor();
    assert.match(await page.locator("#contentArea").innerText(), /A: Demo first/);
    assert.match(await page.locator("#contentArea").innerText(), /B: App first/);
    assert.match(await page.locator("#contentArea").innerText(), /20.0%/);
    assert.match(await page.locator("#contentArea").innerText(), /Pending/);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        width,
        openCloseCycles: 3,
        errors,
        productionRequestsSent: 0,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
