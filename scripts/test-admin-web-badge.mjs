import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4351";
const output = process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-admin-web-badge";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Production rewrites /admin/users to this exact static admin document.
  const html = await readFile(new URL("../src/pages/admin.html", import.meta.url), "utf8");
  await context.route(`${base}/admin/users`, route => route.fulfill({ contentType: "text/html", body: html }));
  await context.addInitScript(() => localStorage.setItem("admin_key", btoa("fixture-admin")));
  await context.route(`${base}/api/admin*`, route => {
    const action = new URL(route.request().url()).searchParams.get("action");
    assert.equal(route.request().headers().authorization, "Bearer fixture-admin");
    const users = [
      { id: "web-fixture", email: "web-seller@example.test", acquisition_source: "google", web_app_observed: true },
      { id: "other-fixture", email: "other-seller@example.test", acquisition_source: "x", web_app_observed: false },
    ].map(user => ({ ...user, subscription_tier: "free", subscription_status: "free", account_status: "active", created_at: new Date().toISOString(), usage: { month: 1, month_remaining: 4 }, max_limits: { month: 5 } }));
    return route.fulfill({ json: action === "list-users" ? { users, pagination: { page: 1, limit: 50, total: 2, totalPages: 1 } } : { ok: true } });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin/users`);
  await page.getByText("2 users found for today", { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const list = page.locator(width >= 768 ? ".table-container tbody" : ".mobile-card-list");
    const badge = list.getByText("Web app", { exact: true });
    assert.equal(await badge.count(), 1);
    assert.equal(await badge.isVisible(), true);
    assert.match(await badge.getAttribute("title"), /last 30 days.*also use the extension/);
    assert.equal(await list.getByText("Google", { exact: true }).isVisible(), true);
    assert.equal(await list.getByText("X", { exact: true }).isVisible(), true);
    const box = await badge.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width);
    await page.screenshot({ path: `${output}/users-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: 3, widths: [1440, 390, 320], errors }));
} catch (error) {
  console.error(JSON.stringify({ errors }));
  throw error;
} finally { await browser.close(); }
