import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
process.env.DRAFT_BROWSER_SIGNED_OUT = "1";
const { reviewJourney: h } = await import("./test-local-browser-drafts.mjs");
const { browser, context, page } = h;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-direct-entry";
await mkdir(output, { recursive: true });
await context.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "astro-dev-toolbar{display:none!important}";
    document.head.append(style);
  });
});
let modelWrites = 0;
let emailCalls = 0;
let failEmail = true;
let failCode = true;
const generationInputs = [];
await context.route(`${base}/api/generate`, async (route) => {
  generationInputs.push(route.request().postDataJSON());
  await route.fallback();
});
const userId = "123e4567-e89b-42d3-a456-426614174000";
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const fixtureSession = {
  access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 36000, role: "authenticated" })}.fixture`,
  refresh_token: "fixture-refresh",
  expires_in: 36000,
  token_type: "bearer",
  user: {
    id: userId,
    email: "fixture@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
};
await context.route(`${base}/api/auth/magic-link`, (route) => {
  emailCalls++;
  assert.equal(route.request().postDataJSON().email, "fixture@example.test");
  return route.fulfill(
    failEmail
      ? { status: 503, json: { error: "Fixture unavailable" } }
      : { json: { success: true } },
  );
});
await context.route("https://drafts-test.supabase.co/auth/v1/verify", (route) =>
  route.fulfill(
    failCode
      ? { status: 403, json: { msg: "Invalid code" } }
      : { json: fixtureSession },
  ),
);
await context.route(`${base}/api/user/model`, (route) => {
  if (route.request().method() !== "GET") modelWrites++;
  return route.fulfill({
    json: {
      enabled: false,
      listingPhotosAvailable: true,
      invitationState: "unseen",
      model: null,
    },
  });
});
try {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["small", 320, 568],
    ["tablet", 768, 1024],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/app`);
    await page.locator('[data-mobile-web="auth-card"]:visible').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await h.bounds(`sign-in ${width}`);
    assert.equal(
      await page.locator("[data-style-setup]:visible,.um-preauth").count(),
      0,
    );
    assert.equal(
      await page.locator('meta[name="robots"]').getAttribute("content"),
      "noindex, nofollow",
    );
    for (const href of ["/terms", "/privacy"]) {
      assert.equal((await page.request.get(base + href)).status(), 200);
    }
    await page.screenshot({
      path: `${output}/signin-${name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/app?signin=1`);
  await page.locator('[data-mobile-web="auth-card"]:visible').waitFor();
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.className),
    "mobile-workspace-brand",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() =>
      document.activeElement?.getAttribute("data-mobile-web"),
    ),
    "google-sign-in",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "mobile-email",
  );
  await page.locator("#mobile-email").fill("fixture@example.test");
  await page.locator('[data-mobile-web="email-form"] button').click();
  await page
    .getByText("Could not send a code. Try again.", { exact: true })
    .waitFor();
  failEmail = false;
  await page.locator('[data-mobile-web="email-form"] button').click();
  await page
    .getByRole("heading", { name: "Check your email", exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "mobile-otp",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${output}/email-code-${name}.png`,
      fullPage: true,
    });
  }
  await page.locator('[data-mobile-web="change-email"]').click();
  assert.equal(
    await page.locator("#mobile-email").inputValue(),
    "fixture@example.test",
  );
  await page.locator('[data-mobile-web="email-form"] button').click();
  await page.locator('[data-mobile-web="resend-code"]').click();
  await page.waitForFunction(
    () => !document.querySelector('[data-mobile-web="resend-code"]').disabled,
  );
  assert.equal(emailCalls, 4);
  const codeUrl = page.url();
  await page.locator("#mobile-otp").fill("123");
  await page.locator("#mobile-otp").press("Enter");
  assert.equal(page.url(), codeUrl, "Enter never sends an incomplete code in a URL");
  await page.locator("#mobile-otp").fill("123456");
  await page
    .getByText(
      "That code could not be verified. Try again or request a new code.",
      { exact: true },
    )
    .waitFor();
  failCode = false;
  // Old unfinished model choices must not reopen setup after the new release.
  await page.evaluate(() =>
    localStorage.setItem(
      "autolister:pending-model:v1",
      JSON.stringify({
        preferences: {
          gender: "female",
          hair: "brown",
          heightCm: 170,
          build: "average",
          skinTone: "medium",
        },
      }),
    ),
  );
  await page.locator("#mobile-otp").fill("654321");
  await page.getByRole("heading", { name: "Add item", exact: true }).waitFor();
  assert.equal(
    await page
      .locator("[data-style-setup]:visible,.um-modal[open],.um-preauth")
      .count(),
    0,
  );
  await page.locator("[data-user-model-open]:visible").first().waitFor();
  assert.equal(
    modelWrites,
    0,
    "Entry only reads model state, never invites or configures it",
  );
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    if (width >= 768) await page.locator('[data-phone-upload="single"] [data-phone-qr] img').waitFor();
    await page.screenshot({
      path: `${output}/first-item-${name}.png`,
      fullPage: true,
    });
  }
  await page.locator("[data-user-model-open]:visible").first().click();
  await page.locator(".um-form:visible").waitFor();
  assert.equal(
    modelWrites,
    1,
    "Only an explicit model choice acknowledges the invitation",
  );
  await page.keyboard.press("Escape");
  await h.upload(2);
  await page.waitForFunction(
    () =>
      !document.querySelector(".draft-upload") &&
      !document.querySelector('[data-draft-action="generate"]').disabled,
  );
  await h.click("generate");
  await page
    .locator('[data-draft-read="title"]')
    .filter({ hasText: "Dress 1" })
    .waitFor({ state: "attached" });
  assert.equal(generationInputs.length, 1);
  assert.equal(generationInputs[0].useHashtags, true);
  assert.equal((await h.snapshot()).drafts.length, 1);
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${output}/first-draft-${name}.png`,
      fullPage: true,
    });
  }
  await page.reload();
  await page
    .locator('[data-draft-read="title"]')
    .filter({ hasText: "Dress 1" })
    .waitFor({ state: "attached" });
  assert.equal(
    (await h.snapshot()).drafts.length,
    1,
    "Reload restores the existing draft",
  );
  const savedDefaults = {
    titleLanguageCode: "nl",
    descriptionLanguageCode: "de",
    descriptionLength: "short",
    useBulletPoints: false,
    useHashtags: false,
    useEmojis: false,
    tone: "standard",
    includeSellerNote: false,
    descriptionFooterText: "",
  };
  await page.evaluate(
    ({ userId, savedDefaults }) => {
      localStorage.setItem(
        `autolister:listing-defaults:${userId}`,
        JSON.stringify(savedDefaults),
      );
      sessionStorage.setItem(
        `autolister:batch-settings:${userId}`,
        JSON.stringify({ ...savedDefaults, descriptionLength: "long" }),
      );
      history.replaceState({}, "", location.href);
    },
    { userId, savedDefaults },
  );
  await page.goto(`${base}/app?returning=1`);
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Add item", exact: true })
      .isVisible(),
    false,
    "A populated workspace stays in the library",
  );
  await h.click("new");
  await h.upload(1);
  await page.waitForFunction(
    () =>
      !document.querySelector(".draft-upload") &&
      !document.querySelector('[data-draft-action="generate"]').disabled,
  );
  await h.click("generate");
  await page
    .locator('[data-draft-read="title"]')
    .filter({ hasText: "Dress 2" })
    .waitFor({ state: "attached" });
  assert.equal(generationInputs[1].titleLanguageCode, "nl");
  assert.equal(generationInputs[1].descriptionLanguageCode, "de");
  assert.equal(generationInputs[1].descriptionLength, "short");
  assert.equal(generationInputs[1].useHashtags, false);
  await h.click("back");
  await h.click("bulk");
  assert.equal(
    await page
      .locator('[data-draft-default="descriptionLength"][value="long"]')
      .isChecked(),
    true,
    "Returning batch preferences remain separate from account defaults",
  );
  assert.equal(
    modelWrites,
    1,
    "Draft generation and restoration never configure a model",
  );
  assert.deepEqual(h.stats().errors, []);
  await page.evaluate(() =>
    localStorage.removeItem("sb-drafts-test-auth-token"),
  );
  await page.goto(`${base}/app`);
  const oauth = page.waitForRequest((request) =>
    request.url().includes("/auth/v1/authorize"),
  );
  await page.locator('[data-mobile-web="google-sign-in"]').click();
  const oauthUrl = new URL((await oauth).url());
  assert.equal(oauthUrl.searchParams.get("provider"), "google");
  assert.equal(
    oauthUrl.searchParams.get("redirect_to"),
    `${base}/app/auth/callback`,
  );
  console.log(
    "PASS: responsive sign-in, keyboard order, email failure/retry/code/resend, fresh-account upload/generation, restored draft/defaults/batch preferences, optional model setup, Google OAuth handoff",
  );
} finally {
  await writeFile(`${output}/result.json`, JSON.stringify(h.stats(), null, 2) + "\n");
  await browser.close();
}
