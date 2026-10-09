import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
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
    d.title = `Blue cotton shirt ${generationCalls}`;
    d.description =
      "Blue cotton shirt\n\n• Size M\n• Check photos for condition";
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
const file = (name, color) => ({
  name: `${name}.svg`,
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#f1ede7"/><path d="M140 95 60 145 105 230 140 210 140 410 260 410 260 210 295 230 340 145 260 95 230 130 170 130Z" fill="${color}"/></svg>`,
  ),
});
async function screenshot(name, width = 1440) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
  await page.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
    animations: "disabled",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `horizontal overflow at ${width}`,
  );
}
async function screenshots(name) {
  for (const width of [360, 390, 768, 1440]) await screenshot(name, width);
}
try {
  await page.goto(`${base}/app/`);
  await page.locator("[data-draft-editor]:visible").waitFor();
  assert.equal(await page.locator(".draft-heading h1").textContent(), "Drafts");
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
  assert.equal(await page.locator("#draft-title").isVisible(), true);
  await page.locator(".draft-item-menu > summary").click();
  await click("delete");
  await page.locator('[data-draft-delete-dialog] [value="confirm"]').click();
  await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
  await click("bulk");
  assert.equal(await page.locator(".draft-heading h1").textContent(), "Bulk upload");
  assert.equal(await page.locator('[data-draft-action="choose-bulk"]').isVisible(), true);
  assert.equal(await page.locator('[data-draft-import-controls]').isVisible(), false);
  assert.equal(await page.locator('[data-draft-import-footer]').isVisible(), false);
  assert.equal(await page.locator('[data-draft-import-status]').isVisible(), false);
  const chooser = page.waitForEvent("filechooser");
  await click("choose-bulk");
  await chooser;
  await screenshots("bulk-empty");
  await click("close-import");
  await click("new");
  await page.locator("[data-draft-editor]:visible").waitFor();
  assert.equal(await page.locator("[data-draft-import]").isVisible(), false);
  assert.equal(await page.locator("[data-draft-editor]").isVisible(), true);
  await click("new");
  await page.waitForFunction(
    () => !document.querySelector('[data-draft-action="new"]').disabled,
  );
  assert.equal(
    drafts.length,
    1,
    "New draft reopens the existing unstarted item",
  );
  uploadFailure = true;
  await page
    .locator('[data-draft-input="item"]')
    .setInputFiles([file("front", "#7899ba"), file("back", "#7899ba")]);
  await page.getByRole("button", { name: "Retry photo", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-draft-action="generate"]')?.disabled ===
      false,
  );
  assert.equal(photos.length, 2);
  const startedId = drafts[0].id;
  await click("new");
  await page.waitForFunction(
    () => !document.querySelector('[data-draft-action="new"]').disabled,
  );
  assert.equal(
    drafts.length,
    2,
    "An item with photos must not be reused or cleared",
  );
  assert.equal(
    draftView(drafts.find((d) => d.id === startedId)).photos.length,
    2,
  );
  assert.equal(
    await page.locator('[data-draft-action="delete"]').isVisible(),
    false,
  );
  await page.locator(".draft-item-menu > summary").click();
  await click("delete");
  await page.locator('[data-draft-delete-dialog] [value="confirm"]').click();
  await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
  await page.locator(".draft-item-open").first().click();
  await page.locator("[data-draft-editor]:visible").waitFor();
  await click("generate");
  await page.waitForFunction(() =>
    document.querySelector("#draft-title").value.startsWith("Blue cotton"),
  );
  assert.equal(generationCalls, 1);
  await page
    .locator("#draft-description")
    .fill("My edited description\n\nExact line breaks.");
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
  await page.locator("[data-draft-items] .draft-item-open").first().click();
  await page.locator("[data-draft-editor]:visible").waitFor();
  assert.equal(
    await page.locator("#draft-description").inputValue(),
    "My edited description\n\nExact line breaks.",
  );
  for (const width of [360, 390, 768, 1440]) await screenshot("editor", width);
  saveFailure = true;
  await page.locator("#draft-title").fill("Unsaved but recoverable");
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
  await page.locator(".draft-item-open").first().click();
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
  await page.locator("#draft-title").fill("Keep my edited title");
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
  assert.equal(await page.locator('[data-draft-action="choose-bulk"]').isVisible(), false);
  assert.equal(await page.locator('[data-draft-import-controls]').isVisible(), true);
  assert.equal(await page.locator('[data-draft-import-footer]').isVisible(), false);
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
  await page.locator("[data-draft-pool] input").check();
  assert.equal(await page.locator('[data-draft-action="individual"]').isVisible(), false);
  await click("group");
  await page.waitForFunction(
    () => document.querySelectorAll(".draft-item").length === 3,
  );
  assert.equal(drafts.length, 3);
  await screenshot("library", 1440);
  await page.locator(".draft-item-open").first().click();
  await page.locator("[data-draft-editor]:visible").waitFor();
  assert.equal(await page.locator('[data-draft-action="done"]').textContent(), "Mark as listed");
  assert.equal(await page.locator('[data-draft-copy-fields]').isVisible(), false);
  await click("done");
  await page.locator("[data-draft-editor]").waitFor({state: "hidden"});
  await page.locator('[data-draft-tab="done"]').click();
  await page.waitForFunction(() => document.querySelector('[data-draft-heading]').textContent === "Listed" && document.querySelectorAll(".draft-item-open").length === 1);
  assert.equal(await page.locator(".draft-heading h1").textContent(), "Listed");
  assert.equal(await page.locator(".draft-item-detail").textContent(), "Listed");
  await screenshots("listed");
  await page.reload();
  await page.locator(".draft-item-open").first().waitFor();
  await page.locator('[data-draft-tab="done"]').click();
  await page.waitForFunction(() => document.querySelector('[data-draft-heading]').textContent === "Listed" && document.querySelectorAll(".draft-item-open").length === 1);
  await page.locator(".draft-item-open").click();
  await page.locator("[data-draft-editor]:visible").waitFor();
  assert.equal(await page.locator('[data-draft-action="done"]').textContent(), "Move back to drafts");
  await click("done");
  await page.locator("[data-draft-editor]").waitFor({state: "hidden"});
  await page.locator('[data-draft-tab="draft"]').click();
  await page.waitForFunction(() => document.querySelectorAll(".draft-item-open").length === 3);
  await click("selection");
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
      .textContent.includes("2 ready"),
  );
  assert.equal(
    await page.locator("#draft-title").inputValue(),
    drafts.find((d) => d.title === viewed)?.title || viewed,
  );
  assert.equal(generationCalls, 3);
  quota = true;
  await page.locator("[data-draft-preparation]>summary").click();
  await click("generate");
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
  await page.locator("[data-draft-preparation]>summary").click();
  const rail = page.locator("[data-draft-item-photos]");
  await rail.locator(".draft-photo-options summary").last().click();
  const reorderedId = draftView(drafts[1]).photos.at(-1).id;
  holdDetail = true;
  await page.getByRole("button", { name: "Use as cover", exact: true }).click();
  await waitForFixture(() => releaseDetail);
  await page.locator("#draft-title").fill("Edits during photo refresh");
  releaseDetail();
  await page.locator("[data-draft-conflict]:visible").waitFor();
  assert.equal(
    await page.locator("#draft-title").inputValue(),
    "Edits during photo refresh",
  );
  await click("keep-edits");
  await page.waitForFunction(
    (id) =>
      document.querySelector("[data-draft-item-photos] img")?.src.includes(id),
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
  await page.locator(".draft-item-open").nth(1).click();
  await waitForFixture(() => releaseDetail);
  await page
    .locator("#draft-title")
    .fill("Edits while reopening the same item");
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
    await page.locator("#draft-title").inputValue(),
    "Edits while reopening the same item",
  );
  await rail.locator(".draft-photo-options summary").last().click();
  await rail
    .getByRole("button", { name: "Ungroup", exact: true })
    .last()
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-draft-item-photos] .draft-photo-options")
        .length === 1,
  );
  assert.equal(photos.filter((p) => !p.draft_id).length, 1);
  await rail.locator(".draft-photo-options summary").click();
  await rail
    .getByLabel("Move photo to another item")
    .selectOption(drafts[0].id);
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-draft-item-photos] .draft-photo-options")
        .length === 0,
  );
  assert.equal(draftView(drafts[0]).photos.length, 2);
  await click("back");
  await page.locator(".draft-item-open").last().click();
  await page.locator("[data-draft-editor]:visible").waitFor();
  await page.locator("[data-draft-preparation]>summary").click();
  holdGeneration = true;
  await click("generate");
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
      .textContent.includes("1 ready"),
  );
  assert.equal(
    generationCalls,
    4,
    "accepted generation is recovered after reload without another provider call",
  );
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
      .textContent.includes("1 ready"),
  );
  assert.equal(generationCalls, 6);
  await screenshots("partial-failure");
  const countBeforeIndividual = drafts.length;
  const ungroupedBeforeIndividual = photos.filter(p => !p.draft_id).length;
  await click("bulk");
  await page.locator('[data-draft-input="bulk"]').setInputFiles([file("one", "#6d957c"), file("two", "#7899ba")]);
  await page.waitForFunction(count => document.querySelectorAll('[data-draft-pool] input:not(:disabled)').length === count, ungroupedBeforeIndividual + 2);
  await page.locator('[data-draft-pool] input').nth(ungroupedBeforeIndividual).check();
  await page.locator('[data-draft-pool] input').nth(ungroupedBeforeIndividual + 1).check();
  await click("individual");
  await waitForFixture(() => drafts.length === countBeforeIndividual + 2);
  await page.waitForFunction(() => document.querySelectorAll('[data-draft-pool] input:checked').length === 0);
  assert.equal(drafts.length, countBeforeIndividual + 2);
  assert.equal(photos.filter(p => p.draft_id === drafts[0].id).length, 1);
  assert.equal(photos.filter(p => p.draft_id === drafts[1].id).length, 1);
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
          "repeated New draft reuses an unstarted item and preserves started work",
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
          "bulk grouping",
          "single-photo item",
          "one item per photo creates separate drafts for multiple selected photos",
          "photo-only item moves to Listed, survives reload and restores to Drafts",
          "pause and resume",
          "minute reset checked before resume",
          "keyboard photo selection and safe deletion cancellation",
          "mark generated item as listed and restore",
          "cover, ungroup and move correction",
          "edits survive an in-flight photo refresh",
          "acknowledged edits survive reopening the same item",
          "accepted generation recovered after reload without redispatch",
          "partial provider failure leaves other items ready",
          "quota stop",
          "horizontal overflow",
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(`Browser draft journeys passed. Evidence: ${output}`);
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
