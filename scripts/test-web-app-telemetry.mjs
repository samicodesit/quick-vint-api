import assert from "node:assert/strict";
const imported = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = imported.default || imported;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4351";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const received = [],
  stored = new Map();
let responseLost = false,
  duplicates = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("https://drafts-test.supabase.co/**", (route) =>
    route.fulfill({ json: {} }),
  );
  await context.route(`${base}/api/user/usage`, (route) =>
    route.fulfill({
      json: {
        plan: { tier: "free", status: "free", isPaid: false },
        canGenerate: true,
        limits: {},
        remaining: { generations: 5 },
      },
    }),
  );
  await context.route(`${base}/api/attribution/claim`, (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await context.route(`${base}/api/public-stats`, (route) =>
    route.fulfill({ json: { totalGenerations: 12345 } }),
  );
  await context.route(`${base}/api/events/track`, async (route) => {
    const body = route.request().postDataJSON();
    assert.equal(body.schemaVersion, 2);
    const acknowledgedIds = [],
      duplicateIds = [];
    for (const event of body.events) {
      received.push({
        event,
        authorization: route.request().headers().authorization,
      });
      if (stored.has(event.id)) {
        duplicateIds.push(event.id);
        duplicates++;
      } else {
        stored.set(event.id, event);
        acknowledgedIds.push(event.id);
      }
    }
    if (!responseLost && body.events.some((e) => e.event === "web_app_view")) {
      responseLost = true;
      return route.abort("failed");
    }
    return route.fulfill({
      json: { schemaVersion: 2, acknowledgedIds, duplicateIds, rejections: [] },
    });
  });
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page
    .locator('[data-track-context="home_hero_web"][data-track-bound="true"]')
    .click();
  await page.waitForURL("**/app?ref=home_hero");
  await page.waitForFunction(() => !!globalThis.AutoListerWebsiteTelemetry);
  await page.evaluate(() => globalThis.AutoListerWebsiteTelemetry.flush());
  assert(responseLost, "An actual app event response was lost");
  const firstView = [...stored.values()].find(
    (e) => e.event === "web_app_view",
  );
  assert(firstView.context.analyticsClientId && firstView.context.webSessionId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.clock.fastForward(65000);
  await page.evaluate(() => globalThis.AutoListerWebsiteTelemetry.flush());
  assert(duplicates > 0, "Reload retries the persisted event ID");
  const viewCopies = received.filter((r) => r.event.id === firstView.id);
  assert(viewCopies.length >= 2);
  assert.equal(stored.get(firstView.id).id, firstView.id);
  assert(
    [...stored.values()].some((e) => e.event === "web_app_click"),
    "Landing click survives navigation",
  );
  assert(
    [...stored.values()]
      .filter((e) => e.event === "web_app_view")
      .every(
        (e) =>
          e.context.analyticsClientId === firstView.context.analyticsClientId &&
          e.context.webSessionId === firstView.context.webSessionId,
      ),
  );
  await page.evaluate(() => {
    const encode = (value) =>
      btoa(JSON.stringify(value))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const id = "123e4567-e89b-42d3-a456-426614174000";
    localStorage.setItem(
      "sb-drafts-test-auth-token",
      JSON.stringify({
        access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })}.fixture`,
        refresh_token: "fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id,
          email: "fixture@example.test",
          aud: "authenticated",
          role: "authenticated",
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      }),
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Your drafts" }).waitFor();
  await page.evaluate(() => globalThis.AutoListerWebsiteTelemetry.flush());
  const auth = received.find((r) => r.event.event === "auth_complete");
  assert(
    auth?.authorization?.startsWith("Bearer "),
    "Verified events use bearer ownership",
  );
  assert.equal(auth.event.accountId, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(
    auth.event.context.analyticsClientId,
    firstView.context.analyticsClientId,
  );
  assert(
    !JSON.stringify([...stored.values()]).includes("fixture@example.test"),
  );
  console.log(
    JSON.stringify(
      {
        passed: [
          "anonymous app views",
          "landing click persists before navigation",
          "response-loss retry after reload",
          "same session across reloads",
          "verified ownership after sign-in",
          "no email or tokens in payload",
        ],
        uniqueEvents: stored.size,
        retriedEvents: duplicates,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
