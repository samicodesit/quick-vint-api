import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const imported = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = imported.default || imported;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-local-drafts";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
const userId = "123e4567-e89b-42d3-a456-426614174000";
const photo = await readFile(
  new URL("../docs/qa/browser-drafts/sample-front.png", import.meta.url),
);
const detailPhoto = await readFile(
  new URL("../docs/qa/browser-drafts/sample-detail.png", import.meta.url),
);
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.addInitScript(
  ({ userId }) => {
    const encode = (v) =>
      btoa(JSON.stringify(v))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    const user = {
      id: userId,
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
        access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 36000, role: "authenticated" })}.fixture`,
        refresh_token: "fixture-refresh",
        expires_at: Math.floor(Date.now() / 1000) + 36000,
        expires_in: 36000,
        token_type: "bearer",
        user,
      }),
    );
  },
  { userId },
);
await context.route("https://drafts-test.supabase.co/**", (route) =>
  route.fulfill({ json: {} }),
);
const requests = [];
const outcomes = new Map();
let generations = 0;
let hold = false;
let release;
let loseResponse = false;
let quota = false;
let minute = false;
let uploadCount = 0;
const sessions = new Map();
await context.route(`${base}/api/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  requests.push({ path: url.pathname, method: req.method() });
  if (["/api/drafts", "/api/draft-photo"].includes(url.pathname))
    return route.abort("failed");
  if (url.pathname === "/api/user/usage")
    return route.fulfill({
      json: {
        plan: { tier: "pro", status: "active", isPaid: true },
        canGenerate: !quota,
        limits: { daily: 50, monthly: 500 },
        remaining: {
          generations: quota ? 0 : 50 - generations,
          daily: 50 - generations,
          monthly: 500 - generations,
          minute: minute ? 0 : 10,
        },
        resetsAt: { minute: new Date(Date.now() + 30000).toISOString() },
      },
    });
  if (url.pathname === "/api/phone-upload") {
    const sessionId = url.searchParams.get("sessionId");
    const action = url.searchParams.get("action");
    if (action === "open")
      sessions.set(sessionId, { count: 0, complete: false });
    const session = sessions.get(sessionId);
    if (action === "prepare")
      session.count = Number(url.searchParams.get("expectedCount"));
    if (action === "complete") session.complete = true;
    if (!action && req.method() === "POST") uploadCount++;
    if (action === "cleanup") sessions.delete(sessionId);
    return route.fulfill({
      json: {
        success: true,
        status: session?.complete ? "complete" : "open",
        complete: !!session?.complete,
        files: session?.complete
          ? Array.from({ length: session.count }, (_, order) => ({
              order,
              name: `photo-${order}.jpg`,
              url: `https://fixture.invalid/${sessionId}/${order}.jpg`,
            }))
          : [],
      },
    });
  }
  if (url.pathname === "/api/generation-result")
    return route.fulfill({
      json: outcomes.get(url.searchParams.get("requestId")) || {
        state: "missing",
      },
    });
  if (url.pathname === "/api/generate") {
    const body = req.postDataJSON();
    assert.ok(
      !body.draftId && body.imageUrls.length,
      "Generation uses existing direct images, never a cloud draft",
    );
    const id = req.headers()["x-autolister-request-id"];
    assert.match(id, /^[a-f0-9-]{36}$/);
    generations++;
    outcomes.set(id, { state: "pending" });
    if (hold) {
      hold = false;
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    const result = {
      title: `Dress ${generations}`,
      description:
        "A comfortable dress.\n\n• Soft fabric\n• Check photos for condition.\n\n#Dress",
    };
    outcomes.set(id, { state: "succeeded", result });
    if (loseResponse) {
      loseResponse = false;
      return route.abort("failed");
    }
    return route.fulfill({ json: result });
  }
  return route.fulfill({ json: { ok: true } });
});
const page = await context.newPage();
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("dialog", (dialog) => dialog.accept());
const action = (name) =>
  page.locator(`[data-draft-action="${name}"]:visible`).first();
const click = async (name) => {
  if (["new", "bulk"].includes(name) && !(await action(name).count()))
    await page.getByRole("button", { name: "Add new", exact: true }).click();
  await action(name).click();
};
async function settled() {
  await page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some(
          (a) =>
            a.playState === "running" &&
            a.effect?.getTiming().iterations !== Infinity,
        ),
  );
}
async function saved() {
  await page.waitForFunction(
    () =>
      document.querySelector("[data-draft-save-status]")?.textContent ===
      "Saved",
  );
}
async function snapshot() {
  return page.evaluate(
    async ({ userId }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(`autolister:drafts:v1:${userId}`);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const tx = db.transaction(["drafts", "photos", "blobs"], "readonly");
      const read = (store) =>
        new Promise((resolve, reject) => {
          const r = tx.objectStore(store).getAll();
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      const [drafts, photos, blobs] = await Promise.all([
        read("drafts"),
        read("photos"),
        read("blobs"),
      ]);
      db.close();
      return { drafts, photos, blobCount: blobs.length };
    },
    { userId },
  );
}
async function waitForDrafts(count) {
  await page.waitForFunction(
    (count) => document.querySelectorAll(".draft-item").length === count,
    count,
  );
}
async function upload(count, batch = false) {
  const files = Array.from({ length: count }, (_, i) => ({
    name: `photo-${i}.png`,
    mimeType: "image/png",
    buffer: i % 2 ? detailPhoto : photo,
  }));
  await page
    .locator(`[data-draft-input="${batch ? "bulk" : "item"}"]`)
    .first()
    .setInputFiles(files);
  await page.waitForFunction(() => !document.querySelector(".draft-upload"));
  if (!batch)
    await page.waitForFunction(
      () =>
        document.querySelector('[data-draft-action="generate"]')?.disabled ===
        false,
    );
}
async function bounds(label) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `${label}: no horizontal overflow`,
  );
  checks.push(label);
}
try {
  await page.goto(`${base}/app`);
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  await click("new");
  await page
    .locator('[data-draft-action="generate"]')
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight + 1,
    ),
    false,
    "Empty preparation does not introduce a scrollbar",
  );
  await upload(10);
  await bounds("Ten photos fit the mobile photo grid");
  assert.equal(
    await page.locator("[data-draft-item-photos] .draft-photo").count(),
    10,
  );
  const before = await action("generate").boundingBox();
  const panelBefore = await page
    .locator("[data-draft-generation-actions]")
    .boundingBox();
  hold = true;
  await click("generate");
  await page.waitForFunction(
    () =>
      document.querySelector('[data-draft-action="generate"]')?.disabled &&
      document
        .querySelector('[data-draft-action="generate"]')
        ?.textContent.includes("Generating"),
  );
  const working = await action("generate").boundingBox();
  assert.deepEqual(
    working,
    before,
    "Generating button does not move or resize",
  );
  const deadline = Date.now() + 10000;
  while (!release && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(release, "Generation request reaches the existing endpoint");
  release();
  await action("done").waitFor();
  const after = await action("done").boundingBox();
  assert.equal(
    after.y,
    before.y,
    "Generate and Mark as listed keep the same position",
  );
  assert.equal(
    after.height,
    before.height,
    "Generate and Mark as listed keep the same height",
  );
  checks.push("Generation stays in place and saves its result locally");
  await page
    .locator('[data-draft-field="description"]')
    .fill(
      Array.from(
        { length: 60 },
        (_, i) =>
          `Detail ${i + 1}: soft fabric and condition visible in the photos.`,
      ).join("\n\n"),
    );
  await saved();
  await page
    .locator('[data-draft-field="description"]')
    .evaluate((el) => el.scrollIntoView({ block: "end" }));
  await bounds(
    "Long descriptions scroll naturally with a stable bottom action",
  );
  await page.screenshot({
    path: `${output}/review-390.png`,
    animations: "disabled",
  });
  await click("back");
  await waitForDrafts(1);
  await page.reload();
  await waitForDrafts(1);
  await page.locator(".draft-item-open").first().click();
  await page.waitForFunction(() =>
    document
      .querySelector('[data-draft-field="description"]')
      ?.value.includes("Detail 60"),
  );
  assert.ok(
    (
      await page.locator('[data-draft-field="description"]').inputValue()
    ).includes("Detail 60"),
  );
  assert.equal(
    await page.locator("[data-draft-item-photos] .draft-photo").count(),
    10,
  );
  checks.push(
    "Reload preserves text and ten local JPEGs without downloading cloud drafts",
  );

  // Editing needs no server round-trip once the app has loaded.
  await context.setOffline(true);
  await page.locator('[data-draft-field="title"]').fill("Edited offline");
  await saved();
  assert.equal((await snapshot()).drafts[0].title, "Edited offline");
  await context.setOffline(false);
  checks.push("Offline edits save durably in the browser");
  const target = page.locator("[data-draft-item-photos] .draft-photo").nth(5);
  const thumbnail = await target.locator("img").getAttribute("src");
  await target.locator("summary").click();
  await target
    .getByRole("button", { name: "Delete photo", exact: true })
    .click();
  await page.locator("[data-draft-delete-dialog][open]").waitFor();
  assert.equal(
    await page.locator("[data-draft-delete-cover]").getAttribute("src"),
    thumbnail,
  );
  await page
    .locator('[data-draft-delete-dialog] button[value="confirm"]')
    .click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-draft-item-photos] .draft-photo")
        .length === 9,
  );
  checks.push(
    "Photo deletion previews the selected JPEG and releases its local blob",
  );
  await click("back");
  await waitForDrafts(1);

  // Selection mode turns the entire card into a selection target.
  await click("selection");
  await page.locator(".draft-item-open").first().click();
  assert.equal(
    await page.locator(".draft-item > input").first().isChecked(),
    true,
  );
  await click("selection");
  checks.push("Whole-card selection and Cancel behave consistently");
  await click("bulk");
  await upload(3, true);
  await page.locator("[data-draft-pool] input").first().check();
  await click("group");
  await page.locator(".draft-group-card").waitFor();
  await page.locator("[data-draft-pool] input").first().check();
  await page.locator("[data-draft-pool] input").nth(1).check();
  await click("individual");
  await page.waitForFunction(
    () => document.querySelectorAll(".draft-group-card").length === 3,
  );
  assert.equal((await snapshot()).drafts.length, 4);
  await page.locator(".draft-group-settings").first().click();
  await page.locator("#draft-item-dialog").waitFor();
  assert.equal(
    await page.locator("[data-draft-import]").isVisible(),
    true,
    "Item settings leave grouping open",
  );
  await page.keyboard.press("Escape");
  await settled();
  await click("generate-groups");
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".draft-group-card small")].length === 3 &&
      [...document.querySelectorAll(".draft-group-card small")].every(
        (el) => el.textContent === "Ready to copy",
      ),
  );
  assert.equal(
    (await snapshot()).drafts.filter((d) => d.description).length,
    4,
  );
  checks.push("Grouping and sequential batch generation use local drafts");
  await click("close-import");
  await waitForDrafts(4);

  // Both limits remain authoritative backend rules, with a preflight UX check.
  const callsBeforeQuota = generations;
  await click("new");
  await upload(1);
  quota = true;
  await click("generate");
  await page.locator("[data-draft-message]:visible").waitFor();
  assert.equal(generations, callsBeforeQuota);
  quota = false;
  await page.reload();
  await action("generate").waitFor();
  checks.push("Existing generation limits prevent new generation requests");
  await click("back");
  await waitForDrafts(5);

  // Review the shared menus and sheets on each supported responsive width.
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await page.getByRole("button", { name: "Add new", exact: true }).click();
    await page
      .locator(".draft-library .draft-add-menu[open] .draft-popover-panel")
      .waitFor();
    assert.equal(
      await page
        .locator(".draft-library .draft-add-menu[open] .draft-popover-panel")
        .evaluate((el) => getComputedStyle(el).opacity),
      "1",
    );
    await page.keyboard.press("Escape");
    await settled();
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await page.locator('[data-mobile-web="profile-menu"]').waitFor();
    assert.equal(
      await page
        .locator(".mobile-workspace-brand")
        .evaluate(
          (el) =>
            getComputedStyle(el).visibility !== "hidden" &&
            getComputedStyle(el).opacity !== "0",
        ),
      true,
    );
    await page.keyboard.press("Escape");
    await settled();
    assert.equal(await page.locator(".mobile-sheet-backdrop").count(), 0);
    await bounds(
      `Dropdowns and account sheet open and close cleanly at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".draft-item-open").first().click();
  await action("generate").waitFor();
  const callsBeforeLoss = generations;
  loseResponse = true;
  await click("generate");
  await action("done").waitFor();
  assert.equal(generations, callsBeforeLoss + 1);
  checks.push(
    "A lost response recovers via a read-only lookup without another generation",
  );
  await click("done");
  await page.locator('[data-draft-tab="done"]').click();
  await waitForDrafts(1);
  checks.push(
    "Listed status remains local and survives returning to the library",
  );
  await page.locator('[data-draft-tab="draft"]').click();
  await waitForDrafts(4);
  await click("selection");
  await page.locator(".draft-item-open").nth(0).click();
  await page.locator(".draft-item-open").nth(1).click();
  await click("delete-selected");
  await page
    .locator('[data-draft-delete-dialog] button[value="confirm"]')
    .click();
  await waitForDrafts(2);
  checks.push(
    "Bulk deletion removes only selected items and their local photos",
  );
  await settled();
  await page.screenshot({
    path: `${output}/library-390.png`,
    animations: "disabled",
  });
  assert.equal(
    requests.filter((r) => ["/api/drafts", "/api/draft-photo"].includes(r.path))
      .length,
    0,
  );
  assert.equal((await snapshot()).blobCount, 11);
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    `${output}/result.json`,
    JSON.stringify(
      {
        checks,
        generations,
        uploadCount,
        noCloudDraftRequests: true,
        errors,
        panelBefore,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: checks.length,
      checks,
      generations,
      uploadCount,
      errors,
    }),
  );
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error(JSON.stringify({ errors, requests: requests.slice(-12) }));
  throw error;
} finally {
  await browser.close();
}
