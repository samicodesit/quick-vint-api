import assert from "node:assert/strict";
const imported = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = imported.default || imported;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4351";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const payload = {
  available: true,
  window: { start: "2026-10-06T00:00:00Z", end: "2026-10-12T12:00:00Z" },
  totals: {
    visits: 120,
    signedInUsers: 35,
    newSignups: 14,
    activatedUsers: 23,
    generations: 87,
    copies: 41,
    returningGenerators: 8,
    currentPaidUsers: 3,
    homepageClicks: 50,
    checkoutStarts: 5,
    failedGenerations: 2,
  },
  daily: [
    {
      date: "2026-10-12",
      visits: 12,
      newSignups: 2,
      generations: 9,
      copies: 4,
      failedGenerations: 1,
    },
  ],
  entrySources: [{ source: "home_hero", visits: 100 }],
  completeness: { truncated: false },
  measurement: { unidentifiedViews: 0 },
};
const checks = [];
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    await context.addInitScript(() =>
      localStorage.setItem("admin_key", btoa("fixture-secret")),
    );
    let failed = false;
    const windows = [];
    await context.route(`${base}/api/admin**`, (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      assert.equal(
        route.request().headers().authorization,
        "Bearer fixture-secret",
      );
      if (action === "auth-check") return route.fulfill({ json: { ok: true } });
      if (action === "web-app-stats") {
        windows.push(new URL(route.request().url()).searchParams.get("days"));
        return route.fulfill({
          status: failed ? 503 : 200,
          json: failed
            ? { available: false, error: "Metrics temporarily unavailable." }
            : payload,
        });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error(error.message));
    // Astro dev does not apply Vercel rewrites, so use the existing hash router.
    await page.goto(`${base}/admin#web-app`);
    try {
      await page.getByText("Web app beta", { exact: true }).waitFor();
    } catch (error) {
      console.error(await page.locator("body").innerText());
      throw error;
    }
    for (const label of [
      "Browser visits",
      "New web signups",
      "Drafts generated",
      "Returning generators",
      "Currently paid users",
    ])
      assert(await page.getByText(label, { exact: true }).isVisible());
    assert.equal(await page.locator("#pageTitle").textContent(), "Web app");
    assert(
      await page.getByText("Retries count once", { exact: true }).isVisible(),
    );
    await page.getByLabel("Web app reporting window").selectOption("30");
    await page.getByText("Web app beta", { exact: true }).waitFor();
    assert(windows.includes("30"));
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    failed = true;
    await page.getByLabel("Web app reporting window").selectOption("7");
    await page.getByText(/Error loading view/).waitFor();
    assert.equal(
      await page.getByText("Drafts generated", { exact: true }).count(),
      0,
      "Database outage must not render fake zero cards",
    );
    checks.push(
      `${width}px metrics, window selection, error state, and no overflow`,
    );
    await context.close();
  }
  console.log(JSON.stringify({ passed: checks }, null, 2));
} finally {
  await browser.close();
}
