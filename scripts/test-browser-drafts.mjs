import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const playwright = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = playwright.default || playwright;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4329";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-draft-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const errors = [];
let drafts = [];
let photos = [];
const objects = new Map();
let generationCalls = 0;
let saveFailure = false;
let conflict = false;
let holdGeneration = false;
let releaseGeneration;
let quota = false;
let minuteBlocked = false;
let uploadFailure = false;
let holdDetail = false;
let releaseDetail;
let generationFailure = false;
const settings = {
  titleLanguageCode: "en",
  descriptionLanguageCode: "en",
  descriptionLength: "long",
  useBulletPoints: true,
};
const draftView = (d) => ({
  ...d,
  photos: photos
    .filter((p) => p.draft_id === d.id)
    .sort((a, b) => a.position - b.position),
});
const createDraft = (input = {}) => {
  const d = {
    id: input.id || randomUUID(),
    title: "",
    description: "",
    settings: input.settings || settings,
    state: "draft",
    version: 1,
    input_version: 1,
    operation_id: null,
    operation_state: "idle",
    updated_at: new Date().toISOString(),
  };
  drafts.unshift(d);
  for (const [index, id] of (input.photoIds || []).entries()) {
    const p = photos.find((p) => p.id === id);
    p.draft_id = d.id;
    p.position = index;
  }
  return draftView(d);
};
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.addInitScript(() => {
  const encode = (v) =>
    btoa(JSON.stringify(v))
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
    created_at: new Date().toISOString(),
  };
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 36000, role: "authenticated" })}.fixture`;
  localStorage.setItem(
    "sb-drafts-test-auth-token",
    JSON.stringify({
      access_token: token,
      refresh_token: "fixture-refresh",
      expires_at: Math.floor(Date.now() / 1000) + 36000,
      expires_in: 36000,
      token_type: "bearer",
      user,
    }),
  );
});
await context.route("https://drafts-test.supabase.co/**", async (route) => {
  const url = new URL(route.request().url());
  if (route.request().method() === "PUT") {
    objects.set(
      url.pathname.split("/").pop(),
      route.request().postDataBuffer(),
    );
    return route.fulfill({ json: { Key: url.pathname } });
  }
  const image = objects.get(url.pathname.split("/").pop());
  if (image) return route.fulfill({ contentType: "image/jpeg", body: image });
  return route.fulfill({ json: {} });
});
await context.route(`${base}/api/**`, async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/api/stripe/create-portal")
    return route.fulfill({
      status: 503,
      json: {
        error: "Billing is temporarily unavailable.",
        code: "billing_unavailable",
      },
    });
  if (path === "/api/user/usage")
    return route.fulfill({
      json: {
        plan: { tier: "pro", status: "active", isPaid: true },
        canGenerate: !quota,
        limits: { daily: 50, monthly: 500 },
        remaining: {
          generations: quota ? 0 : 50 - generationCalls,
          daily: quota ? 0 : 50 - generationCalls,
          monthly: 500 - generationCalls,
          packCredits: 0,
          minute: minuteBlocked ? 0 : 10,
        },
        resetsAt: { minute: new Date(Date.now() + 30000).toISOString() },
      },
    });
  if (path === "/api/draft-photo") {
    if (uploadFailure) {
      uploadFailure = false;
      return route.fulfill({
        status: 503,
        json: {
          code: "photo_upload_failed",
          error: "Your photo could not be saved. Try again.",
        },
      });
    }
    const id = new URL(route.request().url()).searchParams.get("photoId");
    const p = photos.find((p) => p.id === id);
    objects.set(id, route.request().postDataBuffer());
    p.status = "ready";
    p.url = `https://drafts-test.supabase.co/storage/image/${p.id}`;
    if (p.draft_id) {
      const item = drafts.find((d) => d.id === p.draft_id);
      item.version++;
      item.input_version++;
    }
    return route.fulfill({ json: p });
  }
  if (path === "/api/generate") {
    const input = route.request().postDataJSON();
    const d = drafts.find((d) => d.id === input.draftId);
    generationCalls++;
    d.operation_state = "running";
    d.operation_id = route.request().headers()["x-autolister-request-id"];
    if (generationFailure) {
      generationFailure = false;
      d.operation_state = "failed";
      return route.fulfill({
        status: 400,
        json: {
          code: "invalid_image",
          error: "This photo could not be read. Try another photo.",
        },
      });
    }
    if (holdGeneration)
      await new Promise((resolve) => {
        releaseGeneration = resolve;
      });
    d.title = `Black wrap dress ${generationCalls}`;
    d.description =
      "Black wrap dress\n\n• Button front\n• Check photos for condition";
    d.operation_state = "succeeded";
    d.version++;
    d.input_version++;
    return route.fulfill({
      json: { title: d.title, description: d.description },
    });
  }
  if (path !== "/api/drafts") return route.fulfill({ json: { ok: true } });
  const { action, input } = route.request().postDataJSON();
  const d = drafts.find((d) => d.id === input.draftId);
  if (action === "list")
    return route.fulfill({
      json: {
        drafts: drafts
          .filter((d) => d.state === (input.state || "draft"))
          .map(draftView),
        imports: photos.filter((p) => !p.draft_id),
        nextCursor: null,
      },
    });
  if (action === "create") return route.fulfill({ json: createDraft(input) });
  if (action === "detail" && holdDetail) {
    holdDetail = false;
    const snapshot = draftView(d);
    await new Promise((resolve) => {
      releaseDetail = resolve;
    });
    return route.fulfill({ json: snapshot });
  }
  if (action === "detail" || action === "recover")
    return route.fulfill({ json: draftView(d) });
  if (action === "grant") {
    let p = photos.find((p) => p.id === input.photoId);
    if (!p) {
      p = {
        id: input.photoId,
        import_id: input.importId,
        draft_id: input.draftId || null,
        bytes: input.bytes,
        position: photos.filter((p) => p.draft_id === input.draftId).length,
        status: "pending",
        created_at: new Date().toISOString(),
      };
      photos.push(p);
    }
    return route.fulfill({
      json: {
        photo: p,
        uploadUrl: `/api/draft-photo?photoId=${p.id}`,
      },
    });
  }
  if (action === "completeUpload") {
    const p = photos.find((p) => p.id === input.photoId);
    p.status = "ready";
    p.url = `https://drafts-test.supabase.co/storage/image/${p.id}`;
    if (p.draft_id) {
      const item = drafts.find((d) => d.id === p.draft_id);
      item.version++;
      item.input_version++;
    }
    return route.fulfill({ json: p });
  }
  if (action === "save") {
    if (saveFailure)
      return route.fulfill({
        status: 503,
        json: {
          code: "draft_service_unavailable",
          error: "Your work could not be saved. Please try again.",
        },
      });
    if (conflict || input.expectedVersion !== d.version) {
      conflict = false;
      d.version++;
      return route.fulfill({
        status: 409,
        json: {
          code: "draft_conflict",
          error: "This draft changed elsewhere.",
        },
      });
    }
    Object.assign(d, {
      title: input.title,
      description: input.description,
      settings: input.settings,
      state: input.state,
      version: d.version + 1,
    });
    return route.fulfill({ json: draftView(d) });
  }
  if (action === "group") {
    for (const p of photos) {
      if (p.draft_id === d.id && !input.photoIds.includes(p.id))
        p.draft_id = null;
      if (input.photoIds.includes(p.id)) {
        p.draft_id = d.id;
        p.position = input.photoIds.indexOf(p.id);
      }
    }
    d.version++;
    d.input_version++;
    return route.fulfill({ json: draftView(d) });
  }
  if (action === "removePhoto") {
    photos = photos.filter((p) => p.id !== input.photoId);
    return route.fulfill({ json: { deleted: true } });
  }
  if (action === "delete") {
    drafts = drafts.filter((item) => item.id !== d.id);
    photos = photos.filter((p) => p.draft_id !== d.id);
    return route.fulfill({ json: { deleted: true } });
  }
  throw new Error(`Unhandled draft fixture action ${action}`);
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (dialog) => dialog.accept());
const click = async (name) => {
  if (
    name === "select-ready" &&
    !(await page.locator("[data-draft-batch-actions]").isVisible())
  )
    await page.locator('[data-draft-action="selection"]').click();
  await page.locator(`[data-draft-action="${name}"]:visible`).first().click();
};
async function waitForFixture(condition) {
  const deadline = Date.now() + 15000;
  while (!condition() && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(condition(), "fixture request did not arrive before the timeout");
}
const photoFixtures = [
  await readFile(
    new URL("../docs/qa/browser-drafts/sample-front.png", import.meta.url),
  ),
  await readFile(
    new URL("../docs/qa/browser-drafts/sample-detail.png", import.meta.url),
  ),
];
let fixturePhoto = 0;
const file = (name) => ({
  name: name + ".png",
  mimeType: "image/png",
  buffer: photoFixtures[fixturePhoto++ % 2],
});
async function edit(field, value) {
  if (!(await page.locator(field).isVisible())) await click("edit");
  await page.locator(field).fill(value);
}
async function screenshot(name, width = 1440, target = page) {
  await target.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  await target.evaluate(() => window.scrollTo(0, 0));
  await target.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    await target.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `horizontal overflow at ${width}`,
  );
}
async function screenshots(name) {
  for (const width of [360, 390, 768, 1440]) await screenshot(name, width);
}
async function reviewRegression(name) {
  const seed = (count) => {
    objects.set("review-photo", photoFixtures[0]);
    for (let i = 0; i < count; i++) {
      createDraft();
      const d = drafts[0];
      d.title = `Saved item ${i}`;
      d.description = "Saved description";
      photos.push({
        id: randomUUID(),
        draft_id: d.id,
        position: 0,
        status: "ready",
        url: "https://drafts-test.supabase.co/storage/image/review-photo",
      });
    }
  };
  seed(name === "pages" || name === "scroll" ? 36 : 3);
  if (name === "grouping-navigation")
    await context.addInitScript(
      ({ key, ids }) => sessionStorage.setItem(key, JSON.stringify(ids)),
      {
        key: "autolister:draft-groups:123e4567-e89b-42d3-a456-426614174000",
        ids: drafts.map((d) => d.id),
      },
    );
  if (name === "pages")
    await context.route(`${base}/api/drafts`, (route) => {
      const { action, input } = route.request().postDataJSON();
      if (action !== "list") return route.fallback();
      const all = drafts.filter((d) => d.state === input.state);
      const start = Number(input.cursor || 0);
      return route.fulfill({
        json: {
          drafts: all.slice(start, start + 30).map(draftView),
          imports: [],
          nextCursor: all.length > start + 30 ? String(start + 30) : null,
        },
      });
    });
  await page.goto(`${base}/app/`);
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  if (name === "pages") {
    await click("more");
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-item-open").length === 36,
    );
    await click("selection");
    await page.locator(".draft-item > input").nth(32).check();
    await page.locator(".draft-item > input").nth(33).check();
    await click("generate-selected");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-queue-title]")
        .textContent.startsWith("2 ready"),
    );
    const nextTitle = drafts[33].title;
    await page.locator(".draft-item-open").nth(32).click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await click("done");
    await page.waitForFunction(
      (title) =>
        !document.querySelector("[data-draft-editor]").hidden &&
        document.querySelector("#draft-title").value === title,
      nextTitle,
    );
    assert.equal(
      await page.locator("[data-draft-editor]").isVisible(),
      true,
      "Later-page batch continues to its next ready item",
    );
  } else if (name === "scroll") {
    await page.locator(".draft-item-open").nth(20).scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    assert.ok(before > 500);
    await page.locator(".draft-item-open").nth(20).click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.goBack();
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.ok(
      Math.abs((await page.evaluate(() => window.scrollY)) - before) < 2,
      "Browser Back restores the outgoing library scroll",
    );
  } else if (name === "navigation" || name === "grouping-navigation") {
    if (name === "navigation") {
      await page.locator(".draft-item-open").first().click();
      await page.locator("[data-draft-editor]:visible").waitFor();
    } else await click("bulk");
    holdDetail = true;
    if (name === "navigation") await click("next");
    else await page.locator(".draft-group-card").first().click();
    await waitForFixture(() => releaseDetail);
    if (name === "navigation") await page.goBack();
    else await click("close-import");
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/drafts") &&
        r.request().postDataJSON()?.action === "detail",
    );
    releaseDetail();
    await response;
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(
      await page.locator("[data-draft-editor]").isVisible(),
      false,
      "Delayed detail cannot override leaving the current view",
    );
  } else if (name === "listed-retry") {
    const id = drafts[0].id;
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    saveFailure = true;
    await click("done");
    await page
      .locator('[data-draft-save-status][data-status="error"]')
      .waitFor();
    saveFailure = false;
    await click("done");
    await page.waitForFunction(
      () =>
        document.querySelector("#draft-title").value !== "Saved item 2" ||
        document.querySelector("[data-draft-editor]").hidden,
    );
    assert.equal(
      drafts.find((d) => d.id === id).state,
      "done",
      "Retry retains the requested Listed transition",
    );
  } else if (name === "signout") {
    await context.route(
      "https://drafts-test.supabase.co/auth/v1/logout**",
      (route) =>
        route.fulfill({
          status: 503,
          json: { message: "Service unavailable" },
        }),
    );
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await page.locator('[data-mobile-web="sign-out"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-mobile-web="account-status"]')
        .textContent.includes("sign out"),
    );
    assert.equal(
      await page.locator("[data-draft-workspace]").isVisible(),
      true,
      "Failed sign-out keeps the workspace available",
    );
    assert.deepEqual(errors, []);
    await context.unroute("https://drafts-test.supabase.co/auth/v1/logout**");
    await page.locator('[data-mobile-web="sign-out"]').click();
    await page.locator('[data-mobile-web="auth-card"]:visible').waitFor();
  }
  assert.deepEqual(errors, []);
  console.log(`Review regression passed: ${name}`);
}
try {
  if (process.env.DRAFT_BROWSER_CASE) {
    await reviewRegression(process.env.DRAFT_BROWSER_CASE);
  } else {
    await page.goto(`${base}/app/`);
    await page.locator("[data-draft-workspace]:visible").waitFor();
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    assert.equal(
      drafts.length,
      0,
      "Opening Drafts must not create a blank item",
    );
    assert.equal(await page.locator("[data-draft-editor]").isVisible(), false);
    await screenshots("home-empty");
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    assert.equal(
      await page.locator('[data-mobile-web="usage"]').isVisible(),
      true,
    );
    await page.locator('[data-mobile-web="manage-billing"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-mobile-web="account-status"]')
        .textContent.includes("Could not open billing"),
    );
    await screenshot("account-error", 390);
    await page.locator('[data-mobile-web="close-account"]').click();
    await click("new");
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.goBack();
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await page.goForward();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const cameraChooser = page.waitForEvent("filechooser");
    await page.locator('label:has([data-draft-input="camera"])').click();
    await cameraChooser;
    assert.equal(
      await page.locator('[data-draft-input="camera"]').getAttribute("capture"),
      "environment",
    );
    await page.locator('[data-draft-input="item"]').setInputFiles([]);
    await click("back");
    assert.equal(
      drafts.length,
      0,
      "Cancelled preparation must not create a card",
    );
    await click("new");
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(
      await page.locator(".draft-heading h1").textContent(),
      "Drafts",
    );
    assert.equal(
      await page.locator("[data-draft-copy-fields]").isVisible(),
      false,
    );
    assert.equal(
      await page.locator('[data-draft-action="generate"]').isVisible(),
      false,
    );
    assert.equal(
      await page.locator('[data-draft-action="delete"]').isVisible(),
      false,
    );
    await screenshots("empty");
    await click("write");
    await page.locator("#draft-title:visible").waitFor();
    assert.equal(await page.locator("#draft-title").isVisible(), true);
    await page.locator(".draft-item-menu > summary").click();
    await click("delete");
    await page.locator('[data-draft-delete-dialog] [value="confirm"]').click();
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await click("bulk");
    assert.equal(
      await page.locator(".draft-heading h1").textContent(),
      "Add several",
    );
    assert.equal(
      await page.locator('[data-draft-action="choose-bulk"]').isVisible(),
      true,
    );
    assert.equal(
      await page.locator("[data-draft-import-controls]").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("[data-draft-import-footer]").isVisible(),
      false,
    );
    assert.equal(
      await page.locator("[data-draft-import-status]").isVisible(),
      false,
    );
    const chooser = page.waitForEvent("filechooser");
    await click("choose-bulk");
    await chooser;
    await screenshots("bulk-empty");
    await click("close-import");
    await click("new");
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(await page.locator("[data-draft-import]").isVisible(), false);
    assert.equal(await page.locator("[data-draft-editor]").isVisible(), true);
    await click("back");
    await click("new");
    assert.equal(
      drafts.length,
      0,
      "Repeated preparation leaves the library empty",
    );
    uploadFailure = true;
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles([file("front", "#7899ba"), file("back", "#7899ba")]);
    await page
      .getByRole("button", { name: "Retry photo", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-draft-action="generate"]')?.disabled ===
        false,
    );
    assert.equal(photos.length, 2);
    await page.locator('[data-draft-input="item"]').setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    });
    await page
      .locator(".draft-upload")
      .getByRole("button", { name: "Remove", exact: true })
      .waitFor();
    assert.equal(
      photos.length,
      2,
      "An undecodable photo never reaches storage",
    );
    await page
      .locator(".draft-upload")
      .getByRole("button", { name: "Remove", exact: true })
      .click();
    await page.locator(".draft-upload").waitFor({ state: "hidden" });
    const startedId = drafts[0].id;
    await click("back");
    await click("new");
    assert.equal(
      drafts.length,
      1,
      "Opening another composer preserves the saved item",
    );
    assert.equal(
      draftView(drafts.find((d) => d.id === startedId)).photos.length,
      2,
    );
    await click("back");
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await click("generate");
    await page.waitForFunction(() =>
      document.querySelector("#draft-title").value.startsWith("Black wrap"),
    );
    assert.equal(generationCalls, 1);
    assert.equal(
      await page.locator("[data-draft-editor-cover]").isVisible(),
      true,
    );
    assert.equal(
      await page.locator('[data-draft-read="title"]').isVisible(),
      true,
    );
    assert.equal(await page.locator("#draft-title").isVisible(), false);
    assert.equal(
      await page.locator('[data-draft-action="previous"]').isVisible(),
      false,
    );
    await page
      .locator("[data-draft-item-photos] .draft-photo-options summary")
      .first()
      .click();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Save photo (JPEG)", exact: true })
      .click();
    const savedPhoto = await downloadEvent;
    assert.match(savedPhoto.suggestedFilename(), /\.jpg$/);
    const downloadedBytes = await readFile(await savedPhoto.path());
    assert.equal(downloadedBytes[0], 0xff);
    assert.equal(downloadedBytes[1], 0xd8);
    await page.keyboard.press("Escape");
    await edit(
      "#draft-description",
      "My edited description\n\nExact line breaks.",
    );
    await page.locator("#draft-title").focus();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").textContent ===
        "Saved",
    );
    await click("copy-description");
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      "My edited description\n\nExact line breaks.",
    );
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => {
        throw new Error("Clipboard blocked");
      };
      document.execCommand = () => false;
    });
    await click("copy-description");
    await page.waitForFunction(
      () => document.activeElement?.id === "draft-description",
    );
    assert.equal(
      await page
        .locator("#draft-description")
        .evaluate((el) => el.selectionEnd - el.selectionStart),
      "My edited description\n\nExact line breaks.".length,
    );
    await page.reload();
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(
      await page.locator('[data-draft-read="description"]').isVisible(),
      true,
      "Reload restores review in readable mode",
    );
    assert.equal(
      await page.locator("#draft-description").inputValue(),
      "My edited description\n\nExact line breaks.",
    );
    for (const width of [360, 390, 768, 1440])
      await screenshot("editor", width);
    const settings = page.locator("[data-draft-editor-settings] > summary");
    await settings.focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-draft-editor-settings][open]").waitFor();
    await screenshots("settings");
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("[data-draft-editor-settings] [data-draft-close]")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await settings.evaluate((el) => el === document.activeElement),
      true,
    );
    const account = page.locator('[data-mobile-web="profile-menu-trigger"]');
    await account.focus();
    await page.keyboard.press("Enter");
    await screenshot("account", 390);
    await screenshot("account", 1440);
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator('[data-mobile-web="close-account"]')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await account.evaluate((el) => el === document.activeElement),
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    for (const selector of [
      '[data-draft-action="done"]',
      '[data-draft-action="copy-title"]',
      "[data-draft-editor-settings] > summary",
    ]) {
      const target = await page.locator(selector).boundingBox();
      assert.ok(
        target.width >= 44 && target.height >= 44,
        `${selector} has a 44px touch target`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => (document.documentElement.style.zoom = "2"));
    await screenshot("editor-zoom-200", 1440);
    await page.evaluate(() => (document.documentElement.style.zoom = ""));
    const luminance = (hex) => {
      const rgb = hex.match(/[a-f\d]{2}/gi).map((value) => {
        const channel = parseInt(value, 16) / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    for (const ink of ["172033", "596579", "3458DF", "237052", "B33D41"])
      assert.ok(
        1.05 / (luminance(ink) + 0.05) >= 4.5,
        `${ink} text contrasts with white`,
      );
    saveFailure = true;
    await edit("#draft-title", "Unsaved but recoverable");
    await page.locator("#draft-description").focus();
    await page.locator('[data-draft-action="save"]:visible').waitFor();
    assert.match(
      await page.locator("[data-draft-save-status]").textContent(),
      /Not saved/,
    );
    await screenshots("save-error");
    drafts[0].version++;
    drafts[0].title = "Changes from another device";
    await page.reload();
    await page.locator("[data-draft-recovery]:visible").waitFor();
    saveFailure = false;
    await click("restore");
    await page.locator("[data-draft-conflict]:visible").waitFor();
    assert.equal(
      drafts[0].title,
      "Changes from another device",
      "restoring an older recovery copy must not overwrite another device",
    );
    assert.equal(
      await page.locator("#draft-title").inputValue(),
      "Unsaved but recoverable",
    );
    await click("keep-edits");
    await page.waitForFunction(
      () => document.querySelector("[data-draft-conflict]").hidden,
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").textContent ===
        "Saved",
    );
    assert.equal(drafts[0].title, "Unsaved but recoverable");
    conflict = true;
    await edit("#draft-title", "Keep my edited title");
    await page.locator("#draft-description").focus();
    await page.locator("[data-draft-conflict]:visible").waitFor();
    await screenshots("conflict");
    await click("keep-edits");
    await page.waitForFunction(
      () => document.querySelector("[data-draft-conflict]").hidden,
    );
    assert.equal(drafts[0].title, "Keep my edited title");
    await click("back");
    await click("bulk");
    await page
      .locator('[data-draft-input="bulk"]')
      .setInputFiles([
        file("redfront", "#b87f7b"),
        file("redback", "#b87f7b"),
        file("green", "#6d957c"),
      ]);
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-pool] input:not(:disabled)")
          .length === 3,
    );
    const checks = page.locator("[data-draft-pool] input");
    assert.equal(
      await page.locator('[data-draft-action="choose-bulk"]').isVisible(),
      false,
    );
    assert.equal(
      await page.locator("[data-draft-import-controls]").isVisible(),
      true,
    );
    assert.equal(
      await page.locator("[data-draft-import-footer]").isVisible(),
      false,
    );
    await checks.nth(0).check();
    await checks.nth(0).focus();
    await page.keyboard.press("Space");
    assert.equal(await checks.nth(0).isChecked(), false);
    await page.keyboard.press("Space");
    await checks.nth(1).check();
    await screenshots("grouping");
    await click("group");
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-item").length === 2,
    );
    assert.equal(photos.filter((p) => p.draft_id === drafts[0].id).length, 2);
    assert.equal(
      await page.locator("[data-draft-import]").isVisible(),
      true,
      "Grouping stays open",
    );
    assert.equal(await page.locator(".draft-group-card").count(), 1);
    await page.reload();
    await page.locator(".draft-group-card").waitFor();
    assert.equal(
      await page.locator("[data-draft-import]").isVisible(),
      true,
      "Reload restores grouping",
    );
    await page.locator("[data-draft-pool] input").check();
    assert.equal(
      await page.locator('[data-draft-action="individual"]').isVisible(),
      false,
    );
    await click("group");
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-group-card").length === 2,
    );
    assert.equal(drafts.length, 3);
    await screenshots("grouped");
    await click("close-import");
    await screenshot("library", 1440);
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(
      await page
        .locator('[data-draft-action="done"] [data-draft-label]')
        .textContent(),
      "Mark as listed",
    );
    assert.equal(
      await page.locator("[data-draft-copy-fields]").isVisible(),
      false,
    );
    await click("done");
    await page.waitForFunction(
      () =>
        document.querySelector("#draft-title").value === "Keep my edited title",
    );
    if (await page.locator("[data-draft-editor]").isVisible()) {
      assert.equal(
        await page.locator("#draft-title").inputValue(),
        "Keep my edited title",
        "Listed advances to the next ready item",
      );
      await click("back");
    }
    await page.locator('[data-draft-tab="done"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-heading]").textContent ===
          "Listed" &&
        document.querySelectorAll(".draft-item-open").length === 1,
    );
    assert.equal(
      await page.locator(".draft-heading h1").textContent(),
      "Listed",
    );
    assert.equal(
      await page.locator(".draft-item-detail").textContent(),
      "Listed",
    );
    await screenshots("listed");
    await page.reload();
    await page.locator(".draft-item-open").first().waitFor();
    await page.locator('[data-draft-tab="done"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-heading]").textContent ===
          "Listed" &&
        document.querySelectorAll(".draft-item-open").length === 1,
    );
    await page.locator(".draft-item-open").click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(
      await page
        .locator('[data-draft-action="done"] [data-draft-label]')
        .textContent(),
      "Move to drafts",
    );
    await click("done");
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await page.locator('[data-draft-tab="draft"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-item-open").length === 3,
    );
    await click("selection");
    if (await page.locator("[data-draft-editor]").isVisible())
      await click("back");
    await click("select-ready");
    await page.locator(".draft-item>input").last().uncheck();
    holdGeneration = true;
    await click("generate-selected");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-draft-action="pause"]').hidden === false,
    );
    await screenshots("batch");
    await click("pause");
    holdGeneration = false;
    releaseGeneration();
    await page.locator('[data-draft-action="resume"]:visible').waitFor();
    assert.equal(generationCalls, 2);
    await page.reload();
    await page.locator('[data-draft-action="resume"]:visible').waitFor();
    await page.locator(".draft-item-open").last().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    const viewed = await page.locator("#draft-title").inputValue();
    minuteBlocked = true;
    await click("resume");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-message]")
        .textContent.includes("Try again in"),
    );
    assert.equal(generationCalls, 2);
    minuteBlocked = false;
    await click("resume");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-queue-title]")
        .textContent.startsWith("2 ready"),
    );
    assert.equal(
      await page.locator("#draft-title").inputValue(),
      drafts.find((d) => d.title === viewed)?.title || viewed,
    );
    assert.equal(generationCalls, 3);
    quota = true;
    await page.locator("[data-draft-editor-settings]>summary").click();
    await click("regenerate");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-message]")
        .textContent.includes("generation limit"),
    );
    assert.equal(generationCalls, 3);
    await screenshots("quota");
    quota = false;
    await page.locator(".draft-item-menu > summary").click();
    await click("delete");
    await page.locator("[data-draft-delete-dialog][open]").waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement.value),
      "cancel",
    );
    await page.keyboard.press("Enter");
    await page
      .locator("[data-draft-delete-dialog][open]")
      .waitFor({ state: "hidden" });
    assert.equal(drafts.length, 3);
    await click("done");
    await page.waitForFunction(
      () => document.querySelector("[data-draft-editor]").hidden,
    );
    await page.locator('[data-draft-tab="done"]').click();
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-item-open").length === 1,
    );
    await page.locator(".draft-item-open").click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await click("done");
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-item-open").length === 0,
    );
    assert.equal(drafts.filter((d) => d.state === "done").length, 0);
    await page.locator('[data-draft-tab="draft"]').click();
    await page.locator(".draft-item-open").nth(1).click();
    await page.locator("[data-draft-editor]:visible").waitFor();

    const rail = page.locator("[data-draft-item-photos]");
    await rail.locator(".draft-photo-options summary").last().click();
    const reorderedId = draftView(drafts[1]).photos.at(-1).id;
    holdDetail = true;
    await page
      .getByRole("button", { name: "Use as cover", exact: true })
      .click();
    await waitForFixture(() => releaseDetail);
    await edit("#draft-title", "Edits during photo refresh");
    releaseDetail();
    await page.locator("[data-draft-conflict]:visible").waitFor();
    assert.equal(
      await page.locator("#draft-title").inputValue(),
      "Edits during photo refresh",
    );
    await click("keep-edits");
    await page.waitForFunction(
      (id) =>
        document
          .querySelector("[data-draft-item-photos] img")
          ?.src.includes(id),
      reorderedId,
    );
    assert.equal(draftView(drafts[1]).photos[0].id, reorderedId);
    assert.equal(
      await page.locator("#draft-title").inputValue(),
      "Edits during photo refresh",
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").textContent ===
        "Saved",
    );
    releaseDetail = undefined;
    holdDetail = true;
    const editedId = drafts[1].id;
    await click("previous");
    await waitForFixture(() => releaseDetail);
    await edit("#draft-title", "Edits while opening another item");
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").textContent ===
        "Saved",
    );
    releaseDetail();
    await page.waitForFunction(
      () => document.activeElement?.id === "draft-editor-title",
    );
    assert.equal(
      drafts.find((d) => d.id === editedId).title,
      "Edits while opening another item",
    );
    await click("next");
    await page.waitForFunction(
      () =>
        document.querySelector("#draft-title").value ===
        "Edits while opening another item",
    );
    await rail.locator(".draft-photo-options summary").last().click();
    await rail
      .getByRole("button", { name: "Ungroup", exact: true })
      .last()
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-item-photos] .draft-photo-options",
        ).length === 1,
    );
    assert.equal(photos.filter((p) => !p.draft_id).length, 1);
    await rail.locator(".draft-photo-options summary").click();
    await rail
      .getByLabel("Move photo to another item")
      .selectOption(drafts[0].id);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-item-photos] .draft-photo-options",
        ).length === 0,
    );
    assert.equal(draftView(drafts[0]).photos.length, 2);
    await click("back");
    await page.locator(".draft-item-open").last().click();
    await page.locator("[data-draft-editor]:visible").waitFor();

    holdGeneration = true;
    await page.locator("[data-draft-editor-settings]>summary").click();
    await click("regenerate");
    await page.locator('[data-draft-action="pause"]:visible').waitFor();
    await waitForFixture(() => generationCalls === 4);
    await page.reload();
    holdGeneration = false;
    releaseGeneration();
    await page.locator('[data-draft-action="resume"]:visible').waitFor();
    await click("resume");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-queue-title]")
        .textContent.startsWith("1 ready"),
    );
    assert.equal(
      generationCalls,
      4,
      "accepted generation is recovered after reload without another provider call",
    );
    await click("back");
    await click("select-ready");
    generationFailure = true;
    await click("generate-selected");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-queue-title]")
        .textContent.includes("1 need attention"),
    );
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-queue-title]")
        .textContent.startsWith("1 ready"),
    );
    assert.equal(generationCalls, 6);
    await screenshots("partial-failure");
    const countBeforeIndividual = drafts.length;
    const ungroupedBeforeIndividual = photos.filter((p) => !p.draft_id).length;
    if (await page.locator("[data-draft-editor]").isVisible())
      await click("back");
    await click("bulk");
    await page
      .locator('[data-draft-input="bulk"]')
      .setInputFiles([file("one", "#6d957c"), file("two", "#7899ba")]);
    await page.waitForFunction(
      (count) =>
        document.querySelectorAll("[data-draft-pool] input:not(:disabled)")
          .length === count,
      ungroupedBeforeIndividual + 2,
    );
    await page
      .locator("[data-draft-pool] input")
      .nth(ungroupedBeforeIndividual)
      .check();
    await page
      .locator("[data-draft-pool] input")
      .nth(ungroupedBeforeIndividual + 1)
      .check();
    await click("individual");
    await waitForFixture(() => drafts.length === countBeforeIndividual + 2);
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-pool] input:checked").length ===
        0,
    );
    assert.equal(drafts.length, countBeforeIndividual + 2);
    assert.equal(photos.filter((p) => p.draft_id === drafts[0].id).length, 1);
    assert.equal(photos.filter((p) => p.draft_id === drafts[1].id).length, 1);
    await click("close-import");
    const batchPhoto = photos.find((p) => p.status === "ready");
    const batchIds = [];
    for (let index = 0; index < 23; index++) {
      const draft = createDraft();
      const photoId = randomUUID();
      photos.push({
        ...batchPhoto,
        id: photoId,
        draft_id: draft.id,
        position: 0,
        url: batchPhoto.url,
      });
      batchIds.push(draft.id);
    }
    await page.reload();
    await page.locator(".draft-item-open").first().waitFor();
    await click("selection");
    for (const id of batchIds)
      await page.locator(`[data-focus-key="select-${id}"]`).check();
    assert.match(
      await page
        .locator('[data-draft-action="generate-selected"] [data-draft-label]')
        .textContent(),
      /Generate 20 of 23/,
    );
    const callsBeforeBounded = generationCalls;
    await click("generate-selected");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-queue-title]")
        .textContent.startsWith("20 ready"),
    );
    assert.equal(
      generationCalls - callsBeforeBounded,
      20,
      "A large selection stays bounded to 20 generations",
    );
    assert.equal(
      batchIds
        .slice(20)
        .filter((id) => !drafts.find((d) => d.id === id).description).length,
      3,
    );
    await page.locator(`[data-focus-key="open-${batchIds[0]}"]`).click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await click("next");
    await page.waitForFunction(
      (title) => document.querySelector("#draft-title").value === title,
      drafts.find((d) => d.id === batchIds[1]).title,
    );
    assert.equal(
      drafts.find((d) => d.id === batchIds[0]).state,
      "draft",
      "Next skips without listing",
    );
    await click("done");
    await page.waitForFunction(
      (title) => document.querySelector("#draft-title").value === title,
      drafts.find((d) => d.id === batchIds[2]).title,
    );
    assert.equal(drafts.find((d) => d.id === batchIds[1]).state, "done");
    await page.reload();
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(
      await page.locator("#draft-title").inputValue(),
      drafts.find((d) => d.id === batchIds[2]).title,
      "Reload preserves batch order and selected item",
    );

    const fixtureSession = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("sb-drafts-test-auth-token")),
    );
    const authContext = await browser.newContext();
    const authPage = await authContext.newPage();
    authPage.on("pageerror", (e) => errors.push(e.message));
    let otpAccepted = false;
    await authContext.route("https://drafts-test.supabase.co/**", (route) => {
      if (route.request().url().includes("/auth/v1/verify"))
        return otpAccepted
          ? route.fulfill({ json: fixtureSession })
          : route.fulfill({
              status: 403,
              json: {
                error_code: "otp_expired",
                message: "That code has expired.",
              },
            });
      return route.fulfill({ json: {} });
    });
    await authContext.route(`${base}/api/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/drafts")
        return route.fulfill({
          json: { drafts: [], imports: [], nextCursor: null },
        });
      if (path === "/api/user/usage")
        return route.fulfill({
          json: {
            canGenerate: true,
            plan: { tier: "free" },
            remaining: { generations: 2 },
          },
        });
      return route.fulfill({ json: { sent: true } });
    });
    await authPage.goto(`${base}/app/`);
    await authPage.locator('[data-mobile-web="auth-card"]:visible').waitFor();
    assert.equal(
      await authPage.locator("#mobile-auth-title").textContent(),
      "Sign in",
    );
    assert.equal(
      await authPage
        .locator(".mobile-google-mark")
        .evaluate((el) => el.complete && el.naturalWidth > 0),
      true,
    );
    await screenshot("auth", 390, authPage);
    await screenshot("auth", 1440, authPage);
    await authPage.locator("#mobile-email").fill("seller@example.test");
    await authPage.locator('[data-mobile-web="email-form"] button').click();
    await authPage.locator('[data-mobile-web="otp-form"]:visible').waitFor();
    assert.equal(
      await authPage.locator('[data-mobile-web="auth-choices"]').isVisible(),
      false,
    );
    assert.equal(
      await authPage.locator('[data-mobile-web="auth-email"]').textContent(),
      "seller@example.test",
    );
    assert.equal(
      await authPage
        .locator('[data-mobile-web="auth-status"]')
        .getAttribute("data-tone"),
      "neutral",
    );
    await screenshot("otp", 390, authPage);
    await authPage.locator("#mobile-otp").fill("123456");
    await authPage.waitForFunction(
      () =>
        document.querySelector('[data-mobile-web="auth-status"]').dataset
          .tone === "error",
    );
    await screenshot("otp-error", 390, authPage);
    await authPage.locator('[data-mobile-web="change-email"]').click();
    assert.equal(
      await authPage.locator('[data-mobile-web="otp-form"]').isVisible(),
      false,
    );
    assert.equal(await authPage.locator("#mobile-otp").inputValue(), "");
    assert.equal(
      await authPage.locator('[data-mobile-web="auth-choices"]').isVisible(),
      true,
    );
    await authPage.locator('[data-mobile-web="email-form"] button').click();
    await authPage.locator('[data-mobile-web="otp-form"]:visible').waitFor();
    otpAccepted = true;
    await authPage.locator("#mobile-otp").fill("654321");
    await authPage.locator("[data-draft-workspace]:visible").waitFor();
    assert.equal(
      await authPage.locator('[data-mobile-web="auth-card"]').isVisible(),
      false,
    );
    await authContext.close();
    saveFailure = true;
    await edit("#draft-title", "Edits before session expiry");
    await page.locator('[data-draft-action="save"]:visible').waitFor();
    const recoveryKey = `autolister:draft:${fixtureSession.user.id}:${batchIds[2]}`;
    assert.ok(
      await page.evaluate((key) => sessionStorage.getItem(key), recoveryKey),
    );
    await context.route(`${base}/api/user/usage`, (route) =>
      route.fulfill({
        status: 401,
        json: { error: "Sign in again.", code: "auth_required" },
      }),
    );
    await page.reload();
    await page.locator('[data-mobile-web="auth-card"]:visible').waitFor();
    assert.ok(
      await page.evaluate((key) => sessionStorage.getItem(key), recoveryKey),
      "Expired authentication preserves unsaved recovery",
    );
    await context.unroute(`${base}/api/user/usage`);
    saveFailure = false;
    await page.reload();
    await page.locator("[data-draft-recovery]:visible").waitFor();
    await click("restore");
    await page.waitForFunction(
      () =>
        document.querySelector("#draft-title").value ===
        "Edits before session expiry",
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").textContent ===
        "Saved",
    );
    assert.deepEqual(errors, []);
    await writeFile(
      `${output}/result.json`,
      JSON.stringify(
        {
          passed: true,
          generationCalls,
          viewports: [360, 390, 768, 1440],
          checks: [
            "bulk upload starts with one working chooser and hides grouping controls until photos arrive",
            "selection reveals grouping actions and hides the redundant single-photo alternative",
            "empty home and cancelled preparation do not create blank drafts",
            "single upload",
            "immutable photo upload",
            "generation",
            "autosave",
            "exact copy",
            "clipboard fallback",
            "reload",
            "save failure",
            "unsaved edits recovered after reload",
            "save conflict",
            "bulk grouping stays open and restores created groups after reload",
            "review keeps photos and defaults to readable content",
            "manual Listed advances to the next ready draft",
            "single-photo item",
            "one item per photo creates separate drafts for multiple selected photos",
            "photo-only item moves to Listed, survives reload and restores to Drafts",
            "pause and resume",
            "minute reset checked before resume",
            "keyboard photo selection and safe deletion cancellation",
            "mark generated item as listed and restore",
            "cover, ungroup and move correction",
            "edits survive an in-flight photo refresh",
            "edits made during navigation are saved before opening the next item",
            "accepted generation recovered after reload without redispatch",
            "partial provider failure leaves other items ready",
            "quota stop",
            "browser Back and Forward preserve preparation without creating a draft",
            "Save photo downloads a JPEG from the existing signed image",
            "account allowance and actionable billing failure",
            "23 selected items produce a bounded 20-item run and keep the remaining 3 saved",
            "review follows the selected batch; Next skips and Listed advances",
            "batch selected item survives reload",
            "sign-in choices, official Google mark, destination code entry, neutral success, error and Change email",
            "successful code sign-in enters the draft library",
            "invalid photo decoding is recoverable without reaching storage",
            "expired authentication preserves unsaved edits for the same owner",
            "settings and account keyboard opening, Tab order, Escape and focus return",
            "primary and copy controls have 44px phone touch targets",
            "200% CSS zoom remains within viewport",
            "text palette contrast on white is at least 4.5:1",
            "horizontal overflow",
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(`Browser draft journeys passed. Evidence: ${output}`);
  }
} catch (error) {
  console.error(
    "Browser state:",
    errors,
    await page.locator("body").innerText(),
  );
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  throw error;
} finally {
  await browser.close();
}
