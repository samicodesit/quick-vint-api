import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney: h } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = h;
page.on("pageerror", (error) => console.error("Browser error:", error.message));
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-model-allowance";
await mkdir(output, { recursive: true });
let modelCreates = 0;
let exhausted = true;
await context.route(base + "/api/user/usage", (r) =>
  r.fulfill({
    json: {
      plan: { tier: "free", status: "free", isPaid: false },
      canGenerate: !exhausted,
      blockedReason: exhausted ? "free_lifetime_limit" : null,
      remaining: { generations: exhausted ? 0 : 5 },
      limits: { monthly: 5 },
      pricing: {
        tiers: {
          starter: { monthly: 3.99 },
          pro: { monthly: 9.99 },
          business: { monthly: 19.99 },
        },
        creditPack: { credits: 50, price: 9.99 },
      },
    },
  }),
);
await context.route(base + "/api/user/model", (r) => {
  if (
    r.request().method() === "POST" &&
    r.request().postDataJSON().action === "create"
  )
    modelCreates++;
  return r.fulfill({
    json: {
      enabled: false,
      listingPhotosAvailable: true,
      invitationState: "dismissed",
      model: null,
    },
  });
});
try {
  await page.goto(base + "/app");
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  // Exercise the shipped settings placement, rather than an isolated widget.
  await page.locator("[data-user-model-open]:visible").first().waitFor();
  await page.locator("[data-user-model-open]:visible").first().click();
  await page.waitForTimeout(800);
  assert.equal(
    await page.locator(".um-form:visible").count(),
    0,
    "exhausted user must not enter model setup",
  );
  assert.equal(
    (await page
      .locator(
        '[data-mobile-paywall]:visible,[data-mobile-web="paywall"]:visible, .mobile-paywall:visible',
      )
      .count()) > 0,
    true,
    "show existing paid choices before model setup",
  );
  assert.equal(modelCreates, 0);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: output + "/" + name + ".png",
      fullPage: true,
    });
  }
  exhausted = false;
  await page
    .locator(".mobile-paywall[open] .mobile-paywall-heading button")
    .click();
  await page.locator("[data-user-model-open]:visible").first().click();
  await page.locator(".um-form:visible").waitFor();
  assert.equal(
    modelCreates,
    0,
    "opening preferences does not create a paid model",
  );
  console.log(
    "PASS: exhausted allowance opens existing paid choices with zero model creation calls",
  );
} finally {
  await browser.close();
}
