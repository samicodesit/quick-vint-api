import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const scenario = process.env.PHOTO_FIRST_CASE || "email";
const control = scenario === "control" || scenario === "baseline";
process.env.DRAFT_BROWSER_SIGNED_OUT = "1";
process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney: fixture } =
  await import("./test-local-browser-drafts.mjs");
const { browser, context, page, saved, snapshot, stats } = fixture;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4342";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-local-drafts";
const browserId = `123e4567-e89b-42d3-a456-42661417400${control ? "0" : "8"}`;
const userId = "123e4567-e89b-42d3-a456-426614174000";
const encoding = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const email = "fixture@example.test";
const provider = scenario === "google" ? "google" : "email";
const user = {
  id: userId,
  email,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
const accessToken = `${encoding({ alg: "HS256", typ: "JWT" })}.${encoding({
  sub: userId,
  exp: Math.floor(Date.now() / 1000) + 36000,
  role: "authenticated",
})}.fixture`;
const session = {
  access_token: accessToken,
  refresh_token: "fixture-refresh",
  expires_in: 36000,
  token_type: "bearer",
  user,
};
const callback =
  base +
  "/app/auth/callback#" +
  new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
await context.addInitScript((id) => {
  const key = "autolister.web-client.v1";
  if (!localStorage.getItem(key)) localStorage.setItem(key, id);
}, browserId);

const events = [];
await context.route("**/api/events/track", (route) => {
  const payload = route.request().postDataJSON().events || [];
  events.push(...payload);
  return route.fulfill({
    json: { acknowledgedIds: payload.map((event) => event.id) },
  });
});
await context.route("https://drafts-test.supabase.co/auth/v1/user", (route) =>
  route.fulfill({ json: user }),
);
await context.route(
  "https://drafts-test.supabase.co/auth/v1/authorize?*",
  (route) => {
    assert.equal(
      new URL(route.request().url()).searchParams.get("provider"),
      "google",
    );
    return route.fulfill({ status: 302, headers: { location: callback } });
  },
);
let verifyAttempts = 0;
let emailCalls = 0;
await context.route(
  "https://drafts-test.supabase.co/auth/v1/verify",
  (route) => {
    const payload = route.request().postDataJSON();
    assert.equal(payload.email, email);
    verifyAttempts++;
    return route.fulfill(
      verifyAttempts === 1
        ? { status: 403, json: { msg: "Invalid code" } }
        : { json: session },
    );
  },
);
await context.route("**/api/auth/magic-link", (route) => {
  emailCalls++;
  return route.fulfill(
    emailCalls === 1
      ? { status: 503, json: { error: "Fixture unavailable" } }
      : { json: { success: true } },
  );
});

const guest = (tab = page) => tab.locator("[data-photo-first-entry]");
const auth = (tab = page) => tab.locator('[data-mobile-web="auth-card"]');
const action = (name, tab = page) =>
  tab.locator(`[data-draft-action="${name}"]`);
const ready = (tab = page) =>
  action("done", tab).and(tab.locator("button:enabled:visible")).waitFor();
const generationRequests = () =>
  stats().requests.filter(
    (r) => r.path === "/api/phone-upload" || r.path === "/api/generate",
  );
async function capture(tab, name) {
  if (process.env.PHOTO_FIRST_CAPTURE !== "1") return;
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: `${output}/${name}.png` });
}

try {
  const desktop =
    scenario === "google" || process.env.PHOTO_FIRST_DESKTOP === "1";
  await page.setViewportSize({
    width: desktop ? 1440 : Number(process.env.PHOTO_FIRST_WIDTH || 390),
    height: desktop ? 900 : 844,
  });
  if (control) {
    const samples = [];
    const scriptBytes = [];
    for (let i = 0; i < 7; i++) {
      const target = i === 0 ? page : await context.newPage();
      await target.setViewportSize({
        width: desktop ? 1440 : 390,
        height: desktop ? 900 : 844,
      });
      const resources = [];
      target.on("request", (req) => resources.push(req.url()));
      const started = performance.now();
      await target.goto(base + "/app", { waitUntil: "domcontentloaded" });
      await auth(target).waitFor();
      samples.push(Math.round(performance.now() - started));
      const scripts = await target.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter(
            (entry) =>
              entry.name.includes("/_astro/") &&
              new URL(entry.name).pathname.endsWith(".js"),
          )
          .reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0),
      );
      scriptBytes.push(scripts);
      assert.ok(
        !resources.some((url) =>
          /photoFirst(?:Entry|Storage)|photo-first-entry/i.test(url),
        ),
      );
      assert.equal(await guest(target).count(), 0);
      assert.equal(
        await target.locator('[data-mobile-web="direct-sign-in"]').isVisible(),
        false,
      );
      if (i > 0) await target.close();
    }
    await capture(page, "control-" + (desktop ? "desktop" : "mobile"));
    if (scenario === "control") {
      const start = Date.now();
      while (
        !events.some(
          ({ event, context }) =>
            event === "web_app_view" &&
            context.method === "photo_first_v1_control",
        ) &&
        Date.now() - start < 5000
      )
        await page.waitForTimeout(50);
      assert.ok(
        events.some(
          ({ event, context }) =>
            event === "web_app_view" &&
            context.method === "photo_first_v1_control",
        ),
      );
    }
    console.log(JSON.stringify({ scenario, samples, scriptBytes }));
  } else {
    // The explicit sign-in link remains available to anyone in either arm.
    await page.goto(base + "/app?signin=1");
    await auth().waitFor();
    assert.equal(await guest().count(), 0);
    await page.goto(base + "/app");
    await guest().waitFor();
    const headerSignIn = page
      .getByRole("banner")
      .getByRole("button", { name: "Sign in", exact: true });
    assert.equal(await headerSignIn.isVisible(), true);
    assert.equal(
      await guest()
        .getByRole("button", { name: "Sign in", exact: true })
        .count(),
      0,
    );
    await headerSignIn.click();
    await auth().waitFor();
    assert.equal(await headerSignIn.isVisible(), false);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "mobile-auth-title",
    );
    assert.equal(generationRequests().length, 0);
    await page.reload();
    await guest().waitFor();
    const choose = guest().getByLabel("Choose photos", { exact: true });
    const camera = guest().getByLabel("Take photo", { exact: true });
    const generate = guest().locator("[data-photo-first-generate]");
    const hasTouch = process.env.DRAFT_BROWSER_TOUCH === "1";
    assert.equal(await generate.isVisible(), false);
    assert.equal(await camera.isVisible(), hasTouch);
    assert.ok((await choose.boundingBox()).height >= 48);
    if (hasTouch) {
      assert.ok((await camera.boundingBox()).height >= 48);
      assert.equal(await camera.getAttribute("capture"), "environment");
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await capture(page, "picker-empty-" + (desktop ? "desktop" : "mobile"));
    const image = await readFile(
      new URL("../docs/qa/browser-drafts/sample-front.png", import.meta.url),
    );
    const detail = await readFile(
      new URL("../docs/qa/browser-drafts/sample-detail.png", import.meta.url),
    );
    const libraryChooser = page.waitForEvent("filechooser");
    await choose.click();
    const picker = await libraryChooser;
    assert.equal(picker.isMultiple(), true);
    await picker.setFiles([
      { name: "front.png", mimeType: "image/png", buffer: image },
      { name: "detail.png", mimeType: "image/png", buffer: detail },
    ]);
    await guest().locator("img").nth(1).waitFor();
    await page.reload();
    await guest().locator("img").nth(1).waitFor();
    assert.equal(await generate.isEnabled(), true);
    if (hasTouch) {
      await guest()
        .getByRole("button", { name: "Remove photo" })
        .last()
        .click();
      const cameraChooser = page.waitForEvent("filechooser");
      await camera.click();
      const captureInput = await cameraChooser;
      assert.equal(captureInput.isMultiple(), false);
      await captureInput.setFiles({
        name: "detail.png",
        mimeType: "image/png",
        buffer: detail,
      });
      await guest().locator("img").nth(1).waitFor();
    }
    assert.equal(generationRequests().length, 0);
    await capture(page, "photo-first-" + (desktop ? "desktop" : "mobile"));
    await generate.click();
    await auth().waitFor();
    await page.reload();
    await auth().waitFor();
    assert.equal(await guest().count(), 0);
    fixture.holdNextGeneration();
    let resultPage = page;
    if (scenario === "google") {
      await page.getByRole("button", { name: "Continue with Google" }).click();
    } else {
      await page.locator("#mobile-email").fill(email);
      await page.locator('[data-mobile-web="email-form"] button').click();
      await page
        .getByText("Could not send a code. Try again.", { exact: true })
        .waitFor();
      await page.locator('[data-mobile-web="email-form"] button').click();
      await page.locator("#mobile-otp").waitFor();
      assert.equal(generationRequests().length, 0);
      if (scenario === "link") {
        resultPage = await context.newPage();
        await resultPage.goto(callback);
      } else {
        await page.locator("#mobile-otp").fill("012345");
        await page.locator('[data-mobile-web="verify-code"]').click();
        await page
          .getByText("That code could not be verified.", { exact: false })
          .waitFor();
        assert.equal(generationRequests().length, 0);
        await page.locator('[data-mobile-web="verify-code"]').click();
      }
    }
    const deadline = Date.now() + 15000;
    while (stats().generations === 0 && Date.now() < deadline)
      await page.waitForTimeout(30);
    assert.equal(
      stats().generations,
      1,
      "Verified auth automatically starts the first draft",
    );
    const other = await context.newPage();
    await other.goto(base + "/app");
    await other.locator("[data-draft-workspace]:visible").waitFor();
    assert.equal(stats().generations, 1);
    fixture.finishGeneration();
    await ready(resultPage);
    await resultPage.reload();
    await ready(resultPage);
    assert.equal(stats().generations, 1);
    const state = await snapshot();
    assert.equal(state.drafts.length, 1);
    assert.equal(state.drafts[0].photos?.length ?? state.photos.length, 2);
    const timeout = Date.now() + 5000;
    while (
      !events.some(({ event }) => event === "generation_success") &&
      Date.now() < timeout
    )
      await page.waitForTimeout(50);
    const expose = events.find(
      ({ event, context }) =>
        event === "web_app_view" &&
        context.method === "photo_first_v1_photo_first",
    );
    const generated = events.find(
      ({ event }) => event === "generation_success",
    );
    const authenticated = events.find(({ event }) => event === "auth_complete");
    assert.equal(expose?.context.analyticsClientId, browserId);
    assert.equal(authenticated?.context.analyticsClientId, browserId);
    assert.equal(generated?.context.analyticsClientId, browserId);
    await capture(resultPage, "continued-" + (desktop ? "desktop" : "mobile"));
    assert.deepEqual(stats().errors, []);
    console.log(
      JSON.stringify({
        scenario,
        drafts: state.drafts.length,
        photos: state.photos.length,
        generations: stats().generations,
        attribution: "pass",
      }),
    );
  }
} finally {
  await browser.close();
}
