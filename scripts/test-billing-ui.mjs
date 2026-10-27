import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.BILLING_QA_URL || "http://127.0.0.1:4331";
assert(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Billing fixtures must only run locally",
);
const output = process.env.BILLING_QA_OUTPUT || "/tmp/autolister-billing-qa";
await mkdir(output, { recursive: true });
const copy = JSON.parse(
  await readFile(
    new URL("../src/data/billingCopy.json", import.meta.url),
    "utf8",
  ),
);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const locale of ["en", "fr", "de", "nl", "pl", "es", "it", "pt"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale,
    });
    const page = await context.newPage();
    await page.route("https://autolister.app/api/**", (route) => route.abort());
    await page.goto(
      base + (locale === "en" ? "/pricing" : "/" + locale + "/pricing"),
    );
    const tabs = page.getByRole("tab");
    await tabs.first().waitFor();
    assert.equal(await page.locator("#billing-monthly article").count(), 4);
    assert.equal(await page.locator("#billing-monthly article ul").count(), 4);
    await tabs.nth(1).click();
    assert.equal(await page.locator("[data-credit-pack]:visible").count(), 3);
    assert.equal(await page.locator("#billing-monthly").isVisible(), false);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      locale + " pricing overflow",
    );
    if (["en", "de"].includes(locale))
      await page.screenshot({
        path: output + "/pricing-once-" + locale + "-390.jpg",
        fullPage: true,
      });
    await tabs.nth(1).press("ArrowLeft");
    assert.equal(await tabs.first().getAttribute("aria-selected"), "true");
    if (locale === "en")
      await page.screenshot({
        path: output + "/pricing-monthly-en-390.jpg",
        fullPage: true,
      });
    results.push("pricing:" + locale + ":tabs/features/mobile/keyboard");
    await context.close();
  }
  for (const language of Object.keys(copy)) {
    const locale = language === "cz" ? "cs" : language;
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale,
    });
    await context.addInitScript(() => {
      const encode = (value) =>
        btoa(JSON.stringify(value))
          .replace(/=/g, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
      const user = {
        id: "123e4567-e89b-42d3-a456-426614174000",
        email: "fixture@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
      };
      const expires = Math.floor(Date.now() / 1000) + 36000;
      localStorage.setItem(
        "sb-drafts-test-auth-token",
        JSON.stringify({
          access_token:
            encode({ alg: "HS256", typ: "JWT" }) +
            "." +
            encode({ sub: user.id, exp: expires, role: "authenticated" }) +
            ".fixture",
          refresh_token: "fixture",
          expires_at: expires,
          expires_in: 36000,
          token_type: "bearer",
          user,
        }),
      );
    });
    await context.route("https://drafts-test.supabase.co/**", (route) =>
      route.fulfill({ json: {} }),
    );
    await context.route("https://autolister.app/api/**", (route) =>
      route.abort(),
    );
    const purchases = [];
    await context.route(base + "/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/user/usage")
        return route.fulfill({
          json: {
            plan: { tier: "free", status: "free", isPaid: false },
            canGenerate: false,
            limits: { freeLifetime: 5 },
            remaining: { freeLifetime: 0, packCredits: 0 },
          },
        });
      if (path === "/api/drafts")
        return route.fulfill({
          json: { drafts: [], imports: [], nextCursor: null },
        });
      if (path.startsWith("/api/stripe/")) {
        purchases.push({
          path,
          body: route.request().postDataJSON(),
          headers: route.request().headers(),
        });
        return route.fulfill({
          status: 503,
          json: { error: "Fixture checkout failure" },
        });
      }
      return route.fulfill({ json: {} });
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/app/");
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await page.locator('[data-mobile-web="upgrade"]').click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(
      await dialog.getByRole("tab").first().textContent(),
      copy[language].monthly,
    );
    assert.equal(await dialog.locator(".mobile-paywall-option").count(), 3);
    if (language === "en")
      await page.screenshot({
        path: output + "/webapp-monthly-en-390.jpg",
        fullPage: true,
      });
    for (const tier of ["starter", "pro", "business"]) {
      await dialog.locator('input[value="' + tier + '"]').check();
      await dialog.locator("[data-paywall-continue]").click();
      await dialog
        .getByRole("status")
        .filter({ hasText: copy[language].checkoutError })
        .waitFor();
      assert.equal(purchases.at(-1).body.tier, tier);
    }
    await dialog.getByRole("tab").nth(1).click();
    for (const pack of ["credits_20", "credits_50", "credits_100"]) {
      await dialog.locator('input[value="' + pack + '"]').check();
      await dialog.locator("[data-paywall-continue]").click();
      await dialog
        .getByRole("status")
        .filter({ hasText: copy[language].checkoutError })
        .waitFor();
      const purchase = purchases.at(-1);
      assert.equal(purchase.body.packId, pack);
      assert.equal(purchase.body.email, undefined);
      assert.equal(purchase.headers["x-autolister-client"], "mobile_web");
      assert.ok(purchase.headers.authorization.startsWith("Bearer "));
    }
    await dialog.getByRole("tab").first().click();
    await dialog.getByRole("tab").nth(1).click();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
        true,
        language + " chooser overflow",
      );
    }
    if (["en", "de", "el"].includes(language))
      await page.screenshot({
        path: output + "/webapp-once-" + language + "-390.jpg",
        fullPage: true,
      });
    await dialog.press("Escape");
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await page.locator('[data-mobile-web="buy-credits"]').click();
    assert.equal(
      await page
        .getByRole("dialog")
        .getByRole("tab")
        .nth(1)
        .getAttribute("aria-selected"),
      "true",
    );
    assert.deepEqual(errors, []);
    results.push(
      "webapp:" + language + ":all-six-checkouts/320-390px/escape/credit-entry",
    );
    await context.close();
  }
  await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
  console.log(results.join("\n"));
} finally {
  await browser.close();
}
