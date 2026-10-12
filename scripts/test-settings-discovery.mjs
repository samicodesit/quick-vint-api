import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
const imported = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = imported.default || imported;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4351";
const userId = "123e4567-e89b-42d3-a456-426614174000";
const photo = await readFile(
  new URL("../docs/qa/browser-drafts/sample-front.png", import.meta.url),
);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const checks = [];
const output = process.env.SETTINGS_BROWSER_OUTPUT;
if (output) await mkdir(output, { recursive: true });
async function fixture(
  tier,
  {
    saved,
    reducedMotion = "no-preference",
    account = userId,
    seenAccount,
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    reducedMotion,
  });
  await context.addInitScript(
    ({ account, saved, seenAccount }) => {
      const encode = (v) =>
        btoa(JSON.stringify(v))
          .replace(/=/g, "")
          .replace(/\+/g, "-")
          .replace(/\//g, "_");
      const user = {
        id: account,
        email: "fixture@example.test",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(
        "sb-drafts-test-auth-token",
        JSON.stringify({
          access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: account, exp: Math.floor(Date.now() / 1000) + 36000, role: "authenticated" })}.fixture`,
          refresh_token: "fixture-refresh",
          expires_at: Math.floor(Date.now() / 1000) + 36000,
          expires_in: 36000,
          token_type: "bearer",
          user,
        }),
      );
      if (
        saved &&
        !localStorage.getItem(`autolister:listing-defaults:${account}`)
      )
        localStorage.setItem(
          `autolister:listing-defaults:${account}`,
          JSON.stringify(saved),
        );
      if (seenAccount)
        localStorage.setItem(
          `autolister:settings-opened:${seenAccount}`,
          "true",
        );
    },
    { account, saved, seenAccount },
  );
  await context.route("https://drafts-test.supabase.co/**", (route) =>
    route.fulfill({ json: {} }),
  );
  await context.route("https://autolister.app/pricing", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Plans</title>" }),
  );
  let currentTier = tier;
  const payloads = [],
    requests = [],
    sessions = new Map();
  await context.route(`${base}/api/**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    requests.push(url.pathname);
    if (url.pathname === "/api/user/usage")
      return route.fulfill({
        json: {
          plan: {
            tier: currentTier,
            status: "active",
            isPaid: currentTier !== "free",
          },
          canGenerate: true,
          limits: { daily: 50, monthly: 500 },
          remaining: { generations: 50, daily: 50, monthly: 500, minute: 10 },
        },
      });
    if (url.pathname === "/api/phone-upload") {
      const id = url.searchParams.get("sessionId"),
        action = url.searchParams.get("action");
      if (action === "open") sessions.set(id, { count: 0, complete: false });
      const session = sessions.get(id);
      if (action === "prepare")
        session.count = Number(url.searchParams.get("expectedCount"));
      if (action === "complete") session.complete = true;
      return route.fulfill({
        json: {
          success: true,
          status: session?.complete ? "complete" : "open",
          complete: !!session?.complete,
          files: session?.complete
            ? Array.from({ length: session.count }, (_, order) => ({
                order,
                name: `photo-${order}.jpg`,
                url: `https://fixture.invalid/${id}/${order}.jpg`,
              }))
            : [],
        },
      });
    }
    if (url.pathname === "/api/generate") {
      const body = request.postDataJSON();
      payloads.push(body);
      if (
        currentTier === "basic" &&
        (body.useEmojis ||
          body.descriptionFooterText ||
          body.tone !== "standard")
      )
        return route.fulfill({
          status: 403,
          json: { error: "Unsupported plan setting" },
        });
      return route.fulfill({
        json: { title: "Dress", description: "A dress." },
      });
    }
    return route.fulfill({ json: { ok: true } });
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const usage = page.waitForResponse((response) =>
    response.url().endsWith("/api/user/usage"),
  );
  await page.goto(`${base}/app`);
  await page.addStyleTag({
    content: "astro-dev-toolbar { display: none !important; }",
  });
  const trigger = page.locator("[data-draft-global-trigger]");
  await trigger.waitFor({ state: "visible" });
  await usage;
  return {
    context,
    page,
    trigger,
    payloads,
    requests,
    errors,
    setTier: (value) => {
      currentTier = value;
    },
  };
}
async function panel(page) {
  const scope = page.locator(".draft-settings-grid:visible");
  await scope.waitFor();
  return scope;
}
async function defaults(scope, emojis) {
  assert.equal(
    await scope
      .getByRole("switch", { name: "Hashtags", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await scope.locator('input[role="switch"]').nth(1).isChecked(),
    emojis,
  );
  assert.equal(
    await scope.locator('input[role="switch"]').nth(2).isChecked(),
    false,
  );
  assert.equal(
    await scope.locator('select[aria-label="Description tone"]').inputValue(),
    "standard",
  );
}
async function close(page) {
  await page.keyboard.press("Escape");
  await page
    .locator(".draft-settings-grid:visible")
    .waitFor({ state: "hidden" });
}
async function upload(page) {
  await page.getByRole("button", { name: "Add new", exact: true }).click();
  await page.locator('[data-draft-action="new"]:visible').click();
  await page
    .locator('[data-draft-input="item"]')
    .first()
    .setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: photo });
  await page
    .locator('[data-draft-action="generate"]:visible:not(:disabled)')
    .waitFor();
}
async function pricing(page, click) {
  const popup = page.waitForEvent("popup");
  await click();
  const opened = await popup;
  await opened.waitForURL("https://autolister.app/pricing");
  assert.equal(await opened.evaluate(() => window.opener === null), true);
  await opened.close();
}
try {
  const f = await fixture("pro");
  const initial = await f.trigger.boundingBox();
  assert.equal(
    await f.trigger.evaluate((el) => el.dataset.settingsUnseen),
    "true",
    "New users get a Settings cue",
  );
  assert.equal(
    await f.trigger.evaluate(
      (el) => getComputedStyle(el).animationIterationCount,
    ),
    "3",
    "Cue pulses only three times",
  );
  await f.page.waitForFunction(
    () =>
      !document
        .querySelector("[data-draft-global-trigger]")
        .getAnimations()
        .some((animation) => animation.playState === "running"),
  );
  assert.equal(
    await f.trigger.evaluate((el) => el.dataset.settingsUnseen),
    "true",
    "Cue remains highlighted after its finite pulses",
  );
  if (output) await f.page.screenshot({ path: `${output}/discovery-360.png` });
  await f.trigger.click();
  assert.equal(
    await f.trigger.evaluate((el) => el.dataset.settingsUnseen),
    undefined,
  );
  let scope = await panel(f.page);
  await defaults(scope, true);
  await close(f.page);
  assert.deepEqual(
    await f.trigger.boundingBox(),
    initial,
    "Opening Settings does not resize or shift the header",
  );
  await f.page.reload();
  await f.page.addStyleTag({
    content: "astro-dev-toolbar { display: none !important; }",
  });
  await f.trigger.waitFor({ state: "visible" });
  assert.equal(
    await f.trigger.evaluate((el) => el.dataset.settingsUnseen),
    undefined,
    "Discovery persists across reloads",
  );
  await upload(f.page);
  await f.trigger.click();
  await defaults(await panel(f.page), true);
  await close(f.page);
  await f.page.locator('[data-draft-action="generate"]:visible').click();
  await f.page.getByRole("textbox", { name: "Title", exact: true }).waitFor();
  assert.equal(f.payloads.length, 1);
  assert.equal(f.payloads[0].useHashtags, true);
  assert.equal(f.payloads[0].useEmojis, true);
  assert.equal(f.payloads[0].descriptionFooterText, "");
  await f.page.locator('[data-draft-action="back"]:visible').click();
  await f.page.getByRole("button", { name: "Add new", exact: true }).click();
  await f.page.locator('[data-draft-action="bulk"]:visible').click();
  await f.page
    .locator('[data-draft-input="bulk"]')
    .first()
    .setInputFiles({ name: "batch.png", mimeType: "image/png", buffer: photo });
  await f.page.locator("[data-draft-pool] input").first().waitFor();
  await f.trigger.click();
  await defaults(await panel(f.page), true);
  await close(f.page);
  await f.page.locator("[data-draft-pool] input").first().check();
  await f.page.locator('[data-draft-action="group"]:visible').click();
  await f.page.locator(".draft-group-settings").first().click();
  await defaults(await panel(f.page), true);
  await close(f.page);
  await f.page.locator('[data-draft-action="generate-groups"]:visible').click();
  await f.page.waitForFunction(
    () =>
      document.querySelector(".draft-group-card small")?.textContent ===
      "Ready to copy",
  );
  assert.equal(f.payloads.length, 2);
  assert.equal(f.payloads[1].useHashtags, true);
  assert.equal(f.payloads[1].useEmojis, true);
  assert.deepEqual(f.errors, []);
  await f.context.close();
  checks.push(
    "Fresh defaults in global/item/batch settings, real local-photo generation payloads, persistent cue and stable header",
  );

  const basic = await fixture("basic");
  await basic.trigger.click();
  scope = await panel(basic.page);
  await defaults(scope, false);
  for (const name of ["Emojis", "Include seller note"]) {
    const link = scope.getByRole("link", {
      name: `${name}: locked, view plans`,
      exact: true,
    });
    await link.waitFor({ state: "visible" });
    await pricing(basic.page, () => link.click());
  }
  await scope
    .locator('[data-draft-select="tone"] [data-draft-select-trigger]')
    .click();
  for (const tone of ["friendly", "professional", "enthusiastic"]) {
    const option = scope.locator(`[data-draft-select-option="${tone}"]`);
    assert.equal(
      await option.locator("[data-draft-plan-lock]").isVisible(),
      true,
    );
    await pricing(basic.page, () => option.click());
    assert.equal(
      await scope.locator('select[aria-label="Description tone"]').inputValue(),
      "standard",
    );
  }
  if (output) await basic.page.screenshot({ path: `${output}/locks-360.png` });
  const friendly = scope.locator('[data-draft-select-option="friendly"]');
  await friendly.focus();
  await pricing(basic.page, () => basic.page.keyboard.press("Enter"));
  await basic.page.keyboard.press("Escape");
  await close(basic.page);
  await upload(basic.page);
  await basic.page.locator('[data-draft-action="generate"]:visible').click();
  await basic.page
    .getByRole("textbox", { name: "Title", exact: true })
    .waitFor();
  assert.equal(basic.payloads.length, 1);
  assert.equal(basic.payloads[0].useEmojis, false);
  assert.equal(basic.payloads[0].useHashtags, true);
  assert.equal(
    basic.requests.some((path) => /checkout|billing/.test(path)),
    false,
  );
  assert.deepEqual(basic.errors, []);
  await basic.context.close();
  checks.push(
    "Basic plan locks open pricing by pointer and keyboard without changing values or starting checkout; generation remains permitted",
  );

  const stored = {
    titleLanguageCode: "en",
    descriptionLanguageCode: "en",
    descriptionLength: "long",
    useBulletPoints: true,
    tone: "standard",
    useHashtags: false,
    useEmojis: false,
    includeSellerNote: false,
    descriptionFooterText: "",
  };
  const legacy = await fixture("pro", {
    saved: stored,
    reducedMotion: "reduce",
  });
  assert.equal(
    await legacy.trigger.evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await legacy.trigger.evaluate((el) => el.dataset.settingsUnseen),
    "true",
  );
  await legacy.trigger.click();
  scope = await panel(legacy.page);
  assert.equal(
    await scope
      .getByRole("switch", { name: "Hashtags", exact: true })
      .isChecked(),
    false,
  );
  assert.equal(
    await scope
      .getByRole("switch", { name: "Emojis", exact: true })
      .isChecked(),
    false,
  );
  await legacy.context.close();
  checks.push(
    "Saved opt-outs preserved, reduced-motion discovery stays static",
  );
  const premium = {
    ...stored,
    useHashtags: true,
    useEmojis: true,
    tone: "friendly",
    includeSellerNote: true,
    descriptionFooterText: "Smoke-free home.",
  };
  const downgrade = await fixture("basic", {
    saved: premium,
    seenAccount: "123e4567-e89b-42d3-a456-426614174111",
  });
  assert.equal(
    await downgrade.trigger.evaluate((el) => el.dataset.settingsUnseen),
    "true",
    "Another account's discovery does not hide this account's cue",
  );
  await upload(downgrade.page);
  await downgrade.page
    .locator('[data-draft-action="generate"]:visible')
    .click();
  await downgrade.page
    .getByRole("textbox", { name: "Title", exact: true })
    .waitFor();
  assert.equal(downgrade.payloads[0].tone, "standard");
  assert.equal(downgrade.payloads[0].useEmojis, false);
  assert.equal(downgrade.payloads[0].descriptionFooterText, "");
  assert.deepEqual(
    await downgrade.page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      `autolister:listing-defaults:${userId}`,
    ),
    premium,
    "Plan restrictions do not overwrite saved preferences",
  );
  downgrade.setTier("pro");
  await downgrade.page.reload();
  await downgrade.page.addStyleTag({
    content: "astro-dev-toolbar { display: none !important; }",
  });
  await downgrade.trigger.waitFor({ state: "visible" });
  await downgrade.trigger.click();
  scope = await panel(downgrade.page);
  assert.equal(
    await scope
      .getByRole("switch", { name: "Emojis", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await scope.locator('select[aria-label="Description tone"]').inputValue(),
    "friendly",
  );
  assert.equal(
    await scope
      .getByRole("switch", { name: "Include seller note", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await scope.locator("[data-draft-plan-lock]:visible").count(),
    0,
  );
  await downgrade.context.close();
  checks.push(
    "Account-scoped discovery and plan changes preserve existing draft and default preferences",
  );
  const free = await fixture("free");
  await free.trigger.click();
  scope = await panel(free.page);
  await defaults(scope, true);
  assert.equal(
    await scope.locator("a[data-draft-plan-lock]:visible").count(),
    0,
  );
  for (const width of [360, 390, 768, 1440]) {
    await free.page.setViewportSize({ width, height: 900 });
    assert.equal(
      await free.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  await free.context.close();
  checks.push(
    "Free trial retains permitted extras; settings fit mobile and desktop widths",
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally {
  await browser.close();
}
