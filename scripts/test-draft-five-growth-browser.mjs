import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney } = await import("./test-local-browser-drafts.mjs");
const { page, browser, click, upload, saved, settled, stats } = reviewJourney;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-local-drafts";
const checkoutUrl = "https://checkout.stripe.com/c/fixture-draft-five";
await mkdir(output, { recursive: true });

let exhaustAt = 1;
let allowOffer;
let offerRequests = 0;
let checkoutBody;
const expiry = new Date(Date.now() + 71 * 60 * 60 * 1000).toISOString();
await page.route("**/api/user/usage", (route) => {
  const exhausted = stats().generations >= exhaustAt;
  return route.fulfill({
    json: {
      plan: { tier: "free", status: "free", isPaid: false },
      canGenerate: !exhausted,
      blockedReason: exhausted ? "free_lifetime_limit" : null,
      limits: { freeLifetime: 5 },
      remaining: {
        freeLifetime: exhausted ? 0 : 1,
        generations: exhausted ? 0 : 1,
        packCredits: 0,
      },
    },
  });
});
await page.route(
  "**/api/user/limit-followup-offer?surface=web",
  async (route) => {
    offerRequests++;
    await new Promise((resolve) => {
      allowOffer = resolve;
    });
    return route.fulfill({
      json: { eligible: true, expiresAt: expiry, offerToken: "fixture-token" },
    });
  },
);
await page.route("**/api/stripe/create-checkout", (route) => {
  checkoutBody = route.request().postDataJSON();
  return route.fulfill({ json: { url: checkoutUrl } });
});
await page.route(checkoutUrl, (route) =>
  route.fulfill({ body: "Stripe fixture" }),
);

try {
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    exhaustAt = stats().generations + 1;
    allowOffer = undefined;
    const previousRequests = offerRequests;
    await page.setViewportSize(viewport);
    await page.goto(`${base}/app`);
    await page.addStyleTag({
      content: "astro-dev-toolbar { display: none !important; }",
    });
    await page
      .locator('[data-draft-items][aria-busy="false"]')
      .waitFor({ state: "attached" });
    if (await page.locator('[data-draft-action="back"]').isVisible())
      await click("back");
    await click("new");
    await upload(1);
    const meter = page.locator("[data-draft-free-meter]");
    await meter.getByText("1 of 5 free drafts left").waitFor();
    assert.equal(await meter.locator("i[data-available]").count(), 1);
    await meter.getByRole("button", { name: "Get more" }).click();
    const paidOptions = page.locator("dialog[open]");
    await paidOptions
      .getByRole("button", { name: "Close paid options" })
      .click();
    await settled();
    await page
      .locator("[data-draft-editor]")
      .screenshot({ path: `${output}/meter-${device}-available.png` });
    assert.equal(offerRequests, previousRequests);
    await click("generate");
    const offer = page.locator("[data-draft-five-offer]");
    const limit = meter.getByText("No free drafts left", { exact: true });
    const offerButton = offer.getByRole("button", { name: "Get offer" });
    const copyTitle = page.locator('[data-draft-action="copy-title"]');
    const copyDescription = page.locator(
      '[data-draft-action="copy-description"]',
    );
    try {
      await copyDescription.waitFor({ timeout: 12000 });
    } catch (error) {
      console.error(
        await page.locator("[data-draft-editor]").innerText(),
        stats(),
      );
      throw error;
    }
    await saved();
    await settled();
    await limit.waitFor();
    assert.equal(await meter.locator("i[data-available]").count(), 0);
    assert.equal(await offerButton.isVisible(), false);
    await page
      .locator(".draft-text-panel")
      .screenshot({ path: `${output}/offer-${device}-before.png` });
    for (let attempt = 0; !allowOffer && attempt < 40; attempt++)
      await page.waitForTimeout(50);
    assert.equal(offerRequests, previousRequests + 1);
    allowOffer();
    await offerButton.waitFor();
    assert.match(await offer.innerText(), /20% off your first month of Pro/);
    assert.match(await offer.innerText(), /€9\.99\/month/);
    assert.equal(await copyTitle.isEnabled(), true);
    assert.equal(await copyDescription.isEnabled(), true);
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page
      .locator("[data-draft-editor]")
      .screenshot({ path: `${output}/offer-${device}-after.png` });
    await copyTitle.click();
    await copyDescription.click();
    await offerButton.click();
    await page.waitForURL(checkoutUrl);
    assert.equal(checkoutBody.tier, "pro");
    assert.equal(checkoutBody.offerToken, "fixture-token");

    await page.goto(`${base}/welcome/en`);
    await page.addStyleTag({
      content: "astro-dev-toolbar { display: none !important; }",
    });
    const sample = page.locator("[data-welcome-sample]");
    assert.equal(await page.locator(".first-listing .tour-note").count(), 0);
    await sample.locator("summary").click();
    const image = sample.locator("img");
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((el) => el.decode());
    await settled();
    assert.match(
      await sample.innerText(),
      /Black wrap-style dress with puff sleeves/,
    );
    assert.match(
      await page.locator("#welcome-primary-cta").getAttribute("href"),
      /vinted\..*\/items\/new/,
    );
    await page
      .locator(".first-listing")
      .screenshot({ path: `${output}/sample-${device}-after.png` });
  }
  assert.deepEqual(stats().errors, []);
  console.log(
    "Desktop and mobile verified: fifth-draft offer, both Copy buttons, discounted Stripe handoff, and instant sample.",
  );
} finally {
  await browser.close();
}
