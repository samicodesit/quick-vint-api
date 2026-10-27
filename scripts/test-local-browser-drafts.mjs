import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const imported = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const { chromium } = imported.default || imported;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-local-drafts";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: process.env.DRAFT_BROWSER_INTERACTIVE !== "1" || process.env.DRAFT_BROWSER_HEADLESS === "1",
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
  locale: process.env.DRAFT_BROWSER_LOCALE || "en",
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.addInitScript(
  ({ userId, createdAt }) => {
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
      created_at: createdAt,
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
  { userId,
    // The established suite exercises an existing account. Interactive review
    // also covers the first-use style setup offered to newly created accounts.
    createdAt: process.env.DRAFT_BROWSER_INTERACTIVE === "1" ? new Date().toISOString() : "2026-10-01T00:00:00Z",
  },
);
if (process.env.DRAFT_BROWSER_INTERACTIVE === "1") {
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(base).origin || ["blob:", "data:"].includes(url.protocol)
      ? route.continue() : route.abort();
  });
}
await context.route("https://drafts-test.supabase.co/**", (route) =>
  route.fulfill({ json: {} }),
);
const requests = [];
const telemetryEvents = [];
const outcomes = new Map();
let generations = 0;
let hold = false;
let release;
let loseResponse = false;
let quota = false;
let quotaTier = "free";
let quotaCode = "free_lifetime_limit";
let checkoutCalls = 0;
let portalCalls = 0;
let portalObserved;
let checkoutFail = true;
let minute = false;
let uploadCount = 0;
let rejectPhotoUpload = false;
let expectedEditedPhoto;
let editedPhotoUploaded = false;
const sessions = new Map();
await context.route(`${base}/api/**`, async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  requests.push({ path: url.pathname, method: req.method() });
  if (url.pathname === "/api/events/track") {
    const events = req.postDataJSON().events || [];
    telemetryEvents.push(...events);
    return route.fulfill({
      json: { acknowledgedIds: events.map((event) => event.id) },
    });
  }
  if (url.pathname === "/api/stripe/create-portal") {
    portalCalls++;
    portalObserved?.();
    assert.equal(req.headers()["x-autolister-client"], "mobile_web");
    assert.match(req.headers().authorization, /^Bearer /);
    return route.fulfill({
      status: 503,
      json: { error: "Fixture unavailable" },
    });
  }
  if (["/api/drafts", "/api/draft-photo"].includes(url.pathname))
    return route.abort("failed");
  if (url.pathname === "/api/stripe/create-checkout") {
    checkoutCalls++;
    const body = req.postDataJSON();
    assert.equal(req.headers()["x-autolister-client"], "mobile_web");
    assert.match(req.headers().authorization, /^Bearer /);
    assert.equal(body.source, "mobile_web");
    assert.equal("email" in body, false);
    assert.equal("userId" in body, false);
    assert.equal(body.tier, "credit_pack");
    await new Promise((resolve) => setTimeout(resolve, 300));
    return route.fulfill(
      checkoutFail
        ? { status: 503, json: { error: "Fixture unavailable" } }
        : {
            json: { url: "https://checkout.stripe.com/c/web-paywall-fixture" },
          },
    );
  }
  if (url.pathname === "/api/user/usage")
    return route.fulfill({
      json: {
        plan: {
          tier: quota ? quotaTier : "pro",
          status:
            quota && quotaCode === "account_paused"
              ? "paused"
              : quota && quotaTier === "free"
                ? "free"
                : "active",
          isPaid: !quota || quotaTier !== "free",
        },
        blockedReason: quota ? quotaCode : null,
        nextTier: quota ? "starter" : "business",
        pricing: {
          tiers: {
            starter: { monthly: 3.99, dailyLimit: 10, monthlyLimit: 75 },
            pro: { monthly: 9.99, dailyLimit: 25, monthlyLimit: 250 },
            business: { monthly: 19.99, dailyLimit: 60, monthlyLimit: 600 },
          },
          creditPack: { credits: 20, price: 5.99 },
        },
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
    if (
      rejectPhotoUpload &&
      req.method() === "POST" &&
      !url.searchParams.get("action")
    )
      return route.abort("connectionreset");
    const sessionId = url.searchParams.get("sessionId");
    const action = url.searchParams.get("action");
    if (action === "open")
      sessions.set(sessionId, { count: 0, complete: false });
    const session = sessions.get(sessionId);
    if (action === "prepare")
      session.count = Number(url.searchParams.get("expectedCount"));
    if (action === "complete") session.complete = true;
    if (!action && req.method() === "POST") {
      uploadCount++;
      if (
        expectedEditedPhoto &&
        req.postDataBuffer()?.includes(expectedEditedPhoto)
      )
        editedPhotoUploaded = true;
    }
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
    assert.equal(
      body.analyticsClientId,
      await page.evaluate(() =>
        localStorage.getItem("autolister.web-client.v1"),
      ),
      "The real generation carries the same pseudonymous browser ID",
    );
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
const assetRequests = [];
page.on("request", (request) => assetRequests.push(request.url()));
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
export const reviewJourney = { browser, context, page, click, upload, saved, snapshot, settled, bounds,
  holdNextGeneration() { hold = true; },
  finishGeneration() { release?.(); },
  loseNextResponse() { loseResponse = true; },
  stats() { return { generations, uploadCount, errors, requests }; },
};

async function checkDeletedQueueItem() {
  await page.goto(`${base}/app`);
  await page
    .locator('[data-draft-items][aria-busy="false"]')
    .waitFor({ state: "attached" });
  if (await action("back").isVisible()) await click("back");
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  await click("new");
  await page.getByRole("heading", { name: "Add item", exact: true }).waitFor();
  await upload(4);
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        "[data-draft-item-photos] .draft-photo:not(.draft-upload)",
      ).length === 4,
  );
  const before = await snapshot();
  rejectPhotoUpload = true;
  await click("generate");
  await page
    .getByText("We could not upload this photo.", { exact: true })
    .first()
    .waitFor();
  rejectPhotoUpload = false;
  const failed = await snapshot();
  assert.equal(
    failed.blobCount,
    before.blobCount,
    "Failed transport retains photos",
  );
  assert.equal(
    await action("generate").isVisible(),
    true,
    "Failed progress must leave the retained-photo retry action visible",
  );
  await page.locator(".draft-item-menu > summary").click();
  await click("delete");
  await page
    .locator('[data-draft-delete-dialog] button[value="confirm"]')
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector("[data-draft-delete-dialog][open]") &&
      document.querySelector('[data-draft-items][aria-busy="false"]'),
  );
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  const after = await snapshot();
  assert.equal(after.drafts.length, before.drafts.length - 1);
  assert.equal(after.blobCount, before.blobCount - 4);
  assert.equal(
    await page
      .getByRole("button", { name: "Open Item 1", exact: true })
      .count(),
    0,
    "Deleted failed item must leave no stale queue button",
  );
  await page.reload();
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Open Item 1", exact: true })
      .count(),
    0,
    "Deleted queue item must stay removed after reload",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
}

async function checkActiveDeletionConflict() {
  await page.goto(`${base}/app`);
  await page
    .locator('[data-draft-items][aria-busy="false"]')
    .waitFor({ state: "attached" });
  if (await action("back").isVisible()) await click("back");
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  await click("new");
  await page.getByRole("heading", { name: "Add item", exact: true }).waitFor();
  await upload(1);
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        "[data-draft-item-photos] .draft-photo:not(.draft-upload)",
      ).length === 1,
  );
  const before = await snapshot();
  const previousGenerations = generations;
  hold = true;
  release = undefined;
  await click("generate");
  for (let wait = 0; !release && wait < 100; wait++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(
    release,
    `Generation reaches the isolated provider: ${await page.locator("body").innerText()}`,
  );
  await page.locator(".draft-item-menu > summary").click();
  await click("delete");
  await page
    .locator('[data-draft-delete-dialog] button[value="confirm"]')
    .click();
  await page
    .getByText("This item changed in another tab. Reload its saved version.", {
      exact: true,
    })
    .waitFor();
  release();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-draft-action="copy-title"]')?.disabled ===
      false,
  );
  const after = await snapshot();
  assert.equal(
    after.drafts.length,
    before.drafts.length,
    "Existing version guard rejects deleting the in-flight item",
  );
  assert.equal(after.blobCount, before.blobCount);
  assert.equal(
    generations,
    previousGenerations + 1,
    "The rejected deletion starts no extra generation",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
}

if (process.env.DRAFT_BROWSER_PAYWALL_ONLY === "1") {
  try {
    await page.goto(`${base}/app`);
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    for (let item = 0; item < 2; item++) {
      await click("new");
      await upload(1);
      await click("back");
    }
    const before = await snapshot();
    const ids = before.drafts.map((draft) => draft.id);
    const queueKey = `autolister:draft-queue:${userId}`;
    await page.evaluate(
      ({ queueKey, ids }) => {
        sessionStorage.setItem(
          queueKey,
          JSON.stringify({
            remaining: ids,
            completed: [],
            failed: [],
            attempts: [],
            total: 2,
          }),
        );
      },
      { queueKey, ids },
    );
    quota = true;
    await page.reload();
    await click("resume");
    const dialog = page.locator("dialog.mobile-paywall[open]");
    await dialog.waitFor({ timeout: 5000 });
    const billingCopy = JSON.parse(await readFile(new URL("../src/data/billingCopy.json", import.meta.url), "utf8"));
    const locale = (process.env.DRAFT_BROWSER_LOCALE || "en").split("-")[0];
    const copy = billingCopy[locale === "cs" ? "cz" : locale] || billingCopy.en;
    assert.equal(await dialog.locator("h2").textContent(), copy.freeLimitTitle.replace("{limit}", "5"));
    assert.equal(await dialog.locator("[data-paywall-copy]").textContent(), copy.freeLimitMessage);
    assert.equal(await dialog.locator("[data-paywall-continue]").textContent(), copy.continueWith.replace("{plan}", "Starter"));
    assert.equal(generations, 0, "Blocked Resume consumes no generation");
    assert.deepEqual((await snapshot()).drafts, before.drafts);
    assert.deepEqual(
      await page.evaluate(
        (queueKey) => JSON.parse(sessionStorage.getItem(queueKey)).remaining,
        queueKey,
      ),
      ids,
    );
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await page.screenshot({ path: `${output}/resume-free-limit-${width}.png` });
    }
    await dialog.getByRole("tab").nth(1).click();
    assert.equal(await dialog.locator("[data-paywall-continue]").textContent(), copy.buy.replace("{credits}", "20"));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${output}/resume-free-limit-once-390.png` });
    await dialog.locator(".mobile-paywall-heading button").click();

    quotaCode = "burst_limit";
    minute = true;
    await click("resume");
    await page.getByText(/Please wait before generating more items/).waitFor();
    assert.equal(await page.locator("dialog.mobile-paywall[open]").count(), 0);
    assert.equal(
      generations,
      0,
      "A temporary limit never consumes quota or sells access",
    );

    quota = false;
    minute = false;
    await click("resume");
    await page.waitForFunction(() => {
      const items = [...document.querySelectorAll(".draft-item")];
      return (
        items.length === 2 &&
        items.every((item) => item.textContent.includes("Ready to copy"))
      );
    });
    assert.equal(
      generations,
      2,
      "Resume continues the saved items after access returns",
    );
    assert.equal(
      (await snapshot()).drafts.filter((draft) => draft.description).length,
      2,
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(
      JSON.stringify({
        checks: [
          "Blocked Resume opens paid options and preserves drafts and queue",
          "Temporary limits do not sell access",
          "Restored allowance resumes saved items",
        ],
        generations,
        errors,
      }),
    );
  } catch (error) {
    console.error(await page.locator("body").innerText());
    console.error(
      JSON.stringify({ generations, errors, requests: requests.slice(-8) }),
    );
    throw error;
  } finally {
    await browser.close();
  }
} else if (process.env.DRAFT_BROWSER_DELETION_ONLY === "1") {
  try {
    for (let round = 0; round < 3; round++) {
      await checkDeletedQueueItem();
      await checkActiveDeletionConflict();
    }
    console.log(JSON.stringify({ deletionRounds: 3, generations, errors }));
  } catch (error) {
    console.error(await page.locator("body").innerText());
    throw error;
  } finally {
    await browser.close();
  }
} else if (process.env.DRAFT_BROWSER_INTERACTIVE === "1") {
  await page.goto(`${base}/app`);
} else {
try {
  await page.goto(`${base}/app`);
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  assert.equal(
    await page.locator(".mobile-workspace-brand").getAttribute("href"),
    "/app",
    "The app logo stays inside the web app",
  );
  await click("new");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const mode of ["new", "bulk"]) {
      await click(mode);
      const tab = page.locator(
        '.draft-mode:visible [data-draft-action="bulk"]',
      );
      const badge = tab.locator(".draft-new-badge");
      assert.equal(await badge.textContent(), "New");
      const tabBox = await tab.boundingBox();
      const badgeBox = await badge.boundingBox();
      assert.ok(
        badgeBox.y < tabBox.y,
        "New badge sits above the multiple-items tab",
      );
      assert.ok(
        badgeBox.y >= 0 &&
          badgeBox.x >= 0 &&
          badgeBox.x + badgeBox.width <= width,
        "Badge stays visible inside the screen",
      );
      assert.ok(
        tabBox.height >= 44,
        "Badge does not reduce the tab click target",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await click("new");
  await settled();
  await page.screenshot({ path: `${output}/new-badge-phone.png` });
  checks.push(
    "New badge stays above the batch tab in both entry modes at phone/tablet/desktop widths",
  );
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
  assert.equal(
    assetRequests.some((url) =>
      /photoEditor|cropperjs|element-selection/.test(url),
    ),
    false,
    "Editor and cropper do not load with the workspace",
  );
  const samplePoints = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.75, 0.75],
    [0.25, 0.75],
  ];
  const photoData = async (index, points = samplePoints) =>
    page
      .locator("[data-draft-item-photos] .draft-photo img")
      .nth(index)
      .evaluate(
        async (image, { userId, points }) => {
          const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open(`autolister:drafts:v1:${userId}`);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          const id = image
            .closest(".draft-photo")
            .querySelector("[data-photo-options]").dataset.photoOptions;
          const row = await new Promise((resolve, reject) => {
            const r = db
              .transaction("blobs", "readonly")
              .objectStore("blobs")
              .get(id);
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
          });
          db.close();
          const blob = row.blob;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0);
          const samples = points.map(([x, y]) => {
            const pixels = ctx.getImageData(
              Math.round(x * canvas.width) - 10,
              Math.round(y * canvas.height) - 10,
              20,
              20,
            ).data;
            return [0, 1, 2].map((channel) => {
              let total = 0;
              for (let i = channel; i < pixels.length; i += 4)
                total += pixels[i];
              return total / 400;
            });
          });
          return {
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
            width: image.naturalWidth,
            height: image.naturalHeight,
            samples,
          };
        },
        { userId, points },
      );
  const originalTarget = await photoData(1);
  const untouchedPhoto = await photoData(0);
  const openEditor = async () => {
    const target = page.locator("[data-draft-item-photos] .draft-photo").nth(1);
    if ((await target.locator("details").getAttribute("open")) === null)
      await target.locator("summary").click();
    await target
      .getByRole("button", { name: "Edit photo", exact: true })
      .click();
    await page.locator('.photo-editor[data-ready="true"]').waitFor();
  };
  await openEditor();
  const editor = page.getByRole("dialog", { name: "Edit photo", exact: true });
  const rotate = async () => {
    await editor.getByRole("button", { name: "Rotate", exact: true }).click();
    await editor
      .getByRole("button", { name: "Rotate 90°", exact: true })
      .click();
  };
  const shape = async (value) => {
    await editor.getByRole("button", { name: "Crop", exact: true }).click();
    await editor
      .getByRole("combobox", { name: "Crop shape", exact: true })
      .selectOption(value);
  };
  const hide = async (point, touch = false) => {
    await editor
      .getByRole("button", { name: "Hide area", exact: true })
      .click();
    await page.waitForTimeout(100);
    const paintBox = await editor.locator("cropper-selection").boundingBox();
    const from = {
      x: paintBox.x + (point[0] - 0.01) * paintBox.width,
      y: paintBox.y + (point[1] - 0.01) * paintBox.height,
    };
    const to = {
      x: paintBox.x + (point[0] + 0.01) * paintBox.width,
      y: paintBox.y + (point[1] + 0.01) * paintBox.height,
    };
    if (touch) {
      const touchSession = await context.newCDPSession(page);
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [from],
      });
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [to],
      });
      await touchSession.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await touchSession.detach();
    } else {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 5 });
      await page.mouse.up();
    }
    await page.waitForTimeout(30);
    await editor.getByRole("button", { name: "Crop", exact: true }).click();
    await page.waitForTimeout(100);
  };
  const privacyPoints = [
    [0.15, 0.25],
    [0.85, 0.25],
    [0.85, 0.75],
    [0.15, 0.75],
  ];
  const privacyOriginal = await photoData(1, privacyPoints);
  const lightest = privacyOriginal.samples.reduce(
    (best, rgb, index, rows) =>
      rgb.reduce((a, b) => a + b, 0) > rows[best].reduce((a, b) => a + b, 0)
        ? index
        : best,
    0,
  );
  assert.ok(
    Math.max(...privacyOriginal.samples[lightest]) > 100,
    "Privacy negative control starts with visibly unmasked bright pixels",
  );
  await hide(privacyPoints[lightest]);
  assert.equal(await editor.locator("[data-photo-masks] path").count(), 1);
  const defaultStrokeWidth = Number(
    await editor
      .locator("[data-photo-masks] path")
      .getAttribute("stroke-width"),
  );
  assert.equal(
    await editor
      .getByRole("slider", { name: "Straighten", exact: true })
      .isVisible(),
    false,
    "Optional angle adjustment is tucked away by default",
  );
  await editor.getByRole("button", { name: "Undo hide", exact: true }).click();
  assert.equal(await editor.locator("[data-photo-masks] path").count(), 0);
  assert.equal(
    await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .isDisabled(),
    true,
    "Undoing the only hide leaves no unsaved change",
  );
  await editor.getByRole("button", { name: "Hide area", exact: true }).click();
  for (let step = 0; step < 3; step++)
    await editor
      .getByRole("slider", { name: "Brush size", exact: true })
      .press("ArrowRight");
  assert.equal(
    await editor.locator("[data-photo-panel]:visible").count(),
    1,
    "The editor shows only the selected tool's controls",
  );
  await page.waitForTimeout(100);
  const tapBox = await editor.locator("cropper-selection").boundingBox();
  await page.mouse.click(
    tapBox.x + privacyPoints[lightest][0] * tapBox.width,
    tapBox.y + privacyPoints[lightest][1] * tapBox.height,
  );
  assert.ok(
    Number(
      await editor
        .locator("[data-photo-masks] path")
        .getAttribute("stroke-width"),
    ) > defaultStrokeWidth,
    "Brush size changes the actual stroke",
  );
  await page.screenshot({ path: `${output}/photo-brush-390.png` });
  await editor.getByRole("button", { name: "Save photo", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  const tapSaved = await photoData(1, privacyPoints);
  assert.ok(
    tapSaved.samples[lightest].every((value) => value < 8),
    "A single tap produces an opaque round mark in the JPEG",
  );
  for (let sample = 0; sample < 4; sample++) {
    if (sample !== lightest)
      assert.ok(
        tapSaved.samples[sample].every(
          (value, channel) =>
            Math.abs(value - privacyOriginal.samples[sample][channel]) < 15,
        ),
        "Unpainted regions retain their original pixels within JPEG tolerance",
      );
  }
  const restoredTarget = page
    .locator("[data-draft-item-photos] .draft-photo")
    .nth(1);
  await restoredTarget.locator("summary").click();
  await restoredTarget
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-draft-item-photos] [data-photo-options][open]",
      ),
  );
  assert.deepEqual((await photoData(1)).bytes, originalTarget.bytes);
  await openEditor();
  await hide(privacyPoints[lightest], true);
  await hide(privacyPoints[(lightest + 2) % 4]);
  assert.equal(
    await editor.locator("[data-photo-masks] path").count(),
    2,
    "A user can paint over multiple private details",
  );
  await editor.getByRole("button", { name: "Undo hide", exact: true }).click();
  assert.equal(
    await editor.locator("[data-photo-masks] path").count(),
    1,
    "Undo removes only the last stroke",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(
    (await photoData(1)).bytes,
    originalTarget.bytes,
    "Cancel discards private-area edits without touching the saved JPEG",
  );
  await openEditor();
  await hide(privacyPoints[lightest]);
  await editor.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(
    await editor.locator("[data-photo-masks] path").count(),
    0,
    "Reset clears all unsaved brush marks",
  );
  assert.equal(
    await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .isDisabled(),
    true,
  );
  await hide(privacyPoints[lightest]);
  await rotate();
  await editor
    .getByRole("slider", { name: "Straighten", exact: true })
    .press("ArrowRight");
  await shape("square");
  let maskPoint;
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.waitForTimeout(100);
    const cropBox = await editor.locator("cropper-selection").boundingBox();
    const maskBox = await editor
      .locator("[data-photo-masks] path")
      .boundingBox();
    maskPoint = [
      (maskBox.x + maskBox.width / 2 - cropBox.x) / cropBox.width,
      (maskBox.y + maskBox.height / 2 - cropBox.y) / cropBox.height,
    ];
    assert.ok(
      maskPoint.every((value) => value > 0.03 && value < 0.97),
      "Cover remains anchored to the visible photo after rotation, crop and viewport changes",
    );
    const footer = await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .boundingBox();
    assert.ok(
      footer.y + footer.height <= (width === 320 ? 568 : 844),
      "Save remains visible with privacy and angle controls",
    );
    await page.screenshot({ path: `${output}/photo-privacy-${width}.png` });
  }
  await editor.getByRole("button", { name: "Save photo", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  const concealed = await photoData(1, [maskPoint]);
  assert.ok(
    concealed.samples[0].every((channel) => channel < 8),
    "Exported JPEG is opaque black at the exact previewed private area, including crop, rotation and straighten",
  );
  assert.deepEqual(
    (await photoData(0)).bytes,
    untouchedPhoto.bytes,
    "Concealing photo two leaves photo one untouched",
  );
  const maskedTarget = page
    .locator("[data-draft-item-photos] .draft-photo")
    .nth(1);
  await maskedTarget.locator("summary").click();
  await maskedTarget
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-draft-item-photos] [data-photo-options][open]",
      ),
  );
  assert.deepEqual(
    (await photoData(1)).bytes,
    originalTarget.bytes,
    "Restore recovers the original pixels after privacy masking",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  checks.push(
    "Manual privacy brush works with mouse and touch, Undo/Cancel, crop/rotation/straighten, viewport changes, opaque exported pixels and exact original restore",
  );
  await openEditor();
  assert.equal(
    await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .isDisabled(),
    true,
  );
  const initialSelection = await editor
    .locator("cropper-selection")
    .boundingBox();
  const corner = await editor
    .locator('cropper-handle[action="se-resize"]')
    .boundingBox();
  const dot = await editor
    .locator('cropper-handle[action="se-resize"] span')
    .boundingBox();
  assert.ok(
    corner.width >= 44 && corner.height >= 44,
    "Crop handle keeps a generous invisible touch target",
  );
  assert.ok(
    dot.width <= 15 && dot.height <= 15,
    "Visible crop handle stays small",
  );
  await page.mouse.move(
    corner.x + corner.width / 2,
    corner.y + corner.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(corner.x - 28, corner.y - 28, { steps: 5 });
  await page.mouse.up();
  assert.ok(
    (await editor.locator("cropper-selection").boundingBox()).width <
      initialSelection.width,
    "Real pointer gesture resizes the crop",
  );
  await editor.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(
    await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .isDisabled(),
    true,
  );
  const cdp = await context.newCDPSession(page);
  const touchCorner = await editor
    .locator('cropper-handle[action="se-resize"]')
    .boundingBox();
  const tx = touchCorner.x + touchCorner.width / 2,
    ty = touchCorner.y + touchCorner.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tx, y: ty }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: tx - 30, y: ty - 30 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.ok(
    (await editor.locator("cropper-selection").boundingBox()).width <
      initialSelection.width,
    "Real touch gesture resizes the crop",
  );
  await editor.getByRole("button", { name: "Reset", exact: true }).click();
  await shape("square");
  await rotate();
  for (let step = 0; step < 3; step++)
    await editor
      .getByRole("slider", { name: "Straighten", exact: true })
      .press("ArrowRight");
  assert.equal(
    await editor
      .getByRole("slider", { name: "Straighten", exact: true })
      .inputValue(),
    "3",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.waitForTimeout(100);
    const box = await editor.boundingBox();
    assert.ok(
      (await editor.locator(".photo-editor-stage").boundingBox()).height >= 220,
      "Photo preview has useful space on desktop as well as phones",
    );
    const saveBox = await editor
      .getByRole("button", { name: "Save photo", exact: true })
      .boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y >= 0 &&
        box.y + box.height <= (width === 320 ? 568 : 844) + 1,
      "Editor fits the viewport",
    );
    assert.ok(
      saveBox.height >= 44 &&
        saveBox.y + saveBox.height <= (width === 320 ? 568 : 844),
      "Save stays visible with a full touch target",
    );
    await page.screenshot({ path: `${output}/photo-editor-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.getByRole("button", { name: "Save photo", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  const changedPhoto = await photoData(1);
  assert.equal(
    changedPhoto.width,
    changedPhoto.height,
    "Square crop remains square after rotation and straighten",
  );
  assert.ok(
    changedPhoto.width > 600,
    "Export keeps source resolution rather than a tiny on-screen crop",
  );
  assert.notDeepEqual(changedPhoto.bytes, originalTarget.bytes);
  assert.deepEqual(
    (await photoData(0)).bytes,
    untouchedPhoto.bytes,
    "Editing photo two leaves photo one untouched",
  );
  await openEditor();
  await rotate();
  await page.keyboard.press("Escape");
  assert.deepEqual(
    (await photoData(1)).bytes,
    changedPhoto.bytes,
    "Escape discards unsaved transformations",
  );
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  const editedTarget = page
    .locator("[data-draft-item-photos] .draft-photo")
    .nth(1);
  await editedTarget.locator("summary").click();
  await editedTarget
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-draft-item-photos] [data-photo-options][open]",
      ),
  );
  assert.deepEqual(
    (await photoData(1)).bytes,
    originalTarget.bytes,
    "Restore recovers the exact original JPEG",
  );
  await openEditor();
  await rotate();
  await editor.getByRole("button", { name: "Save photo", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  const rotated = await photoData(1);
  assert.equal(
    rotated.width,
    originalTarget.height,
    "Full photo rotation preserves source height as width",
  );
  assert.equal(
    rotated.height,
    originalTarget.width,
    "Full photo rotation preserves source width as height",
  );
  for (let sample = 0; sample < 4; sample++) {
    const expected = originalTarget.samples[(sample + 3) % 4];
    assert.ok(
      rotated.samples[sample].every(
        (value, channel) => Math.abs(value - expected[channel]) < 15,
      ),
      "Actual exported pixels rotate clockwise without blank corners or a wrong source photo",
    );
  }
  await editedTarget.locator("summary").click();
  await editedTarget
    .getByRole("button", { name: "Restore original", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-draft-item-photos] [data-photo-options][open]",
      ),
  );
  assert.deepEqual((await photoData(1)).bytes, originalTarget.bytes);
  for (let cycle = 0; cycle < 3; cycle++) {
    await openEditor();
    await hide(privacyPoints[lightest]);
    await editor
      .getByRole("button", { name: "Close photo editor", exact: true })
      .click();
    assert.equal(
      await page.locator(".photo-editor, cropper-canvas").count(),
      0,
      "Close releases the editor and cropper elements immediately",
    );
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.deepEqual(
      (await photoData(1)).bytes,
      originalTarget.bytes,
      "Repeated close discards brush strokes and keeps the original saved photo",
    );
    assert.match(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
      /Photo 2 options/,
    );
  }
  await openEditor();
  await shape("square");
  await hide(privacyPoints[lightest]);
  await editor.getByRole("button", { name: "Save photo", exact: true }).click();
  await editor.waitFor({ state: "detached" });
  expectedEditedPhoto = Buffer.from((await photoData(1)).bytes);
  await editedTarget.locator("summary").click();
  const downloaded = page.waitForEvent("download");
  await editedTarget
    .getByRole("button", { name: "Save photo (JPEG)", exact: true })
    .click();
  const download = await downloaded;
  assert.equal(download.suggestedFilename(), "autolister-2.jpg");
  assert.deepEqual(
    await readFile(await download.path()),
    expectedEditedPhoto,
    "Download uses the exact edited JPEG without a blocked blob fetch",
  );
  await page.keyboard.press("Escape");
  checks.push(
    "Lazy photo editor handles real mouse/touch crops, rotation, straighten, source-size export, Cancel and exact original restore",
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
  assert.equal(
    editedPhotoUploaded,
    true,
    "The generation uploads the edited local JPEG, not its original or thumbnail",
  );
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
  const documentMarker = crypto.randomUUID();
  await page.evaluate((marker) => {
    document.documentElement.dataset.logoNavigationTest = marker;
  }, documentMarker);
  await page
    .locator('[data-draft-field="title"]')
    .fill("Saved before returning through the logo");
  await page.locator(".mobile-workspace-brand").click();
  await waitForDrafts(1);
  assert.equal(new URL(page.url()).pathname, "/app");
  assert.equal(
    await page.locator("html").getAttribute("data-logo-navigation-test"),
    documentMarker,
    "Logo navigation keeps the same document mounted",
  );
  assert.equal(
    (await snapshot()).drafts[0].title,
    "Saved before returning through the logo",
  );
  await page.evaluate(() => {
    delete document.documentElement.dataset.logoNavigationTest;
  });
  checks.push(
    "App logo returns to drafts without reloading and saves pending edits",
  );
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
  await page.getByRole("dialog", { name: "You’ve used all 5 free listings" }).waitFor();
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    "mobile-paywall-title",
    "Opening the paywall focuses its heading, never the dismiss button",
  );
  assert.equal(
    await page.getByRole("radio", { name: /Starter/ }).isVisible(),
    true,
  );
  assert.equal(
    await page.getByRole("radio", { name: /Starter/ }).isChecked(),
    true,
  );
  await page.getByRole("radio", { name: /Starter/ }).focus();
  await page.getByRole("radio", { name: /Starter/ }).press("ArrowDown");
  assert.equal(
    await page.getByRole("radio", { name: /Pro,/ }).isChecked(),
    true,
  );
  assert.equal(checkoutCalls, 0, "Selecting a plan never creates checkout");
  assert.equal(
    await page
      .getByRole("button", { name: "Continue with Pro", exact: true })
      .isVisible(),
    true,
  );
  assert.equal(generations, callsBeforeQuota);
  await page.screenshot({ path: `${output}/quota-paywall.png` });
  for (const [tier, code, title, targets] of [
    ["starter", "daily_limit", "Daily limit reached", ["Pro", "Business"]],
    ["starter", "monthly_limit", "Monthly limit reached", ["Pro", "Business"]],
    ["pro", "monthly_limit", "Monthly limit reached", ["Business"]],
    ["business", "monthly_limit", "Limit reached", []],
    [
      "free",
      "account_paused",
      "Continue with a paid option",
      ["Starter", "Pro", "Business"],
    ],
  ]) {
    await page.getByRole("button", { name: "Close paid options" }).click();
    quotaTier = tier;
    quotaCode = code;
    await click("generate");
    const dialog = page.getByRole("dialog", { name: title });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("radio").count(), targets.length + 1);
    for (const target of targets)
      assert.equal(
        await dialog
          .getByRole("radio", { name: new RegExp(target) })
          .isVisible(),
        true,
      );
    assert.equal(
      await dialog.getByRole("radio", { name: /One-time credits/ }).isVisible(),
      true,
    );
    assert.equal(generations, callsBeforeQuota);
    const box = await dialog.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 390);
    assert(box.y >= 0 && box.y + box.height <= 844);
  }
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    const dialog = page.getByRole("dialog", {
      name: "Continue with a paid option",
    });
    const box = await dialog.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width);
    assert(box.y >= 0 && box.y + box.height <= height);
    const primary = await dialog
      .locator(".mobile-paywall-option")
      .first()
      .boundingBox();
    assert(
      primary.y >= 0 && primary.y + primary.height <= height,
      "The first payment choice stays visible on short phones",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    const continueBox = await dialog
      .locator("[data-paywall-continue]")
      .boundingBox();
    assert(
      continueBox.y >= 0 && continueBox.y + continueBox.height <= height,
      "Checkout CTA stays visible without scrolling on short phones",
    );
    const badge = await dialog.locator(".mobile-paywall-badge").boundingBox();
    const side = await dialog
      .locator(".mobile-paywall-option")
      .filter({ has: page.locator(".mobile-paywall-badge") })
      .locator(".mobile-paywall-option-side")
      .boundingBox();
    await page.screenshot({ path: `${output}/paused-paywall-${width}.png` });
    assert(
      badge.x + badge.width + 5 <= side.x,
      `Plan badges do not collide with prices or limits on narrow phones: ${JSON.stringify({ width, badge, side })}`,
    );
  }
  await page.getByRole("button", { name: "Close paid options" }).click();
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  quotaCode = "payment_required";
  await click("generate");
  const paymentDialog = page.getByRole("dialog", {
    name: "Update your payment",
  });
  await paymentDialog.waitFor();
  assert.equal(await paymentDialog.getByRole("radio").count(), 0);
  assert.equal(
    await paymentDialog.locator("[data-paywall-continue]").isVisible(),
    false,
  );
  await paymentDialog
    .getByRole("button", { name: "Update payment", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("[data-paywall-status]")?.hidden === false,
  );
  assert.equal(portalCalls, 1);
  assert.equal(
    checkoutCalls,
    0,
    "Payment recovery uses the portal, not a new subscription",
  );
  await page.getByRole("button", { name: "Close paid options" }).click();
  quotaTier = "free";
  quotaCode = "burst_limit";
  await click("generate");
  await page.locator("[data-draft-message]:visible").waitFor();
  assert.equal(await page.locator("dialog.mobile-paywall[open]").count(), 0);
  assert.equal(generations, callsBeforeQuota);
  quotaCode = "free_lifetime_limit";
  await click("generate");
  await page.getByRole("radio", { name: /One-time credits/ }).check();
  assert.equal(checkoutCalls, 0);
  await page
    .getByRole("button", {
      name: "Continue with one-time credits",
      exact: true,
    })
    .dblclick();
  await page.waitForFunction(
    () => document.querySelector("[data-paywall-status]")?.hidden === false,
  );
  assert.equal(
    checkoutCalls,
    1,
    "A double tap creates only one checkout request",
  );
  assert.equal(
    await page
      .getByRole("button", {
        name: "Continue with one-time credits",
        exact: true,
      })
      .isEnabled(),
    true,
  );
  checkoutFail = false;
  await context.route(
    "https://checkout.stripe.com/c/web-paywall-fixture",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<a href="${base}/app?checkout=cancel">Back to AutoLister</a>`,
      }),
  );
  assert.equal(
    await page.getByRole("radio", { name: /One-time credits/ }).isChecked(),
    true,
  );
  await page
    .getByRole("button", {
      name: "Continue with one-time credits",
      exact: true,
    })
    .click();
  await page.waitForURL("https://checkout.stripe.com/c/web-paywall-fixture");
  assert.equal(checkoutCalls, 2);
  await page.getByRole("link", { name: "Back to AutoLister" }).click();
  await page.waitForURL(`${base}/app*`);
  await action("generate").waitFor();
  assert.equal((await snapshot()).drafts.length, 5);
  assert.equal(generations, callsBeforeQuota);
  checks.push(
    "Tailored trial, daily, monthly and pause paywalls preserve drafts; burst limits never sell access; bearer checkout retries and cancellation work",
  );
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
    if (width < 768) {
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute("data-mobile-web"),
        ),
        "profile-menu",
      );
      await page.keyboard.press("Shift+Tab");
      assert.equal(
        await page
          .locator('[data-mobile-web="profile-menu"]')
          .evaluate((el) => el.contains(document.activeElement)),
        true,
      );
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute("data-mobile-web"),
        ),
        "close-account",
        "Keyboard focus remains trapped after neutral initial sheet focus",
      );
      await page.locator('[data-mobile-web="close-account"]').click();
      await settled();
      assert.equal(
        await page
          .locator('[data-mobile-web="profile-menu-trigger"]')
          .evaluate((el) => getComputedStyle(el).outlineStyle),
        "none",
        "Touch/pointer dismissal does not outline the profile trigger",
      );
      await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
      await page.locator('[data-mobile-web="profile-menu"]').waitFor();
    }
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
    assert.notEqual(
      await page
        .locator('[data-mobile-web="profile-menu-trigger"]')
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      "none",
      "Keyboard dismissal retains a visible focus indicator",
    );
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
  await click("copy-title");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-draft-copy-status]")?.textContent ===
      "Title copied.",
  );
  assert.equal(
    await page.locator("dialog.mobile-extension-suggestion[open]").count(),
    0,
  );
  await page.setViewportSize({ width: 1200, height: 900 });
  await click("copy-description");
  const suggestion = page.getByRole("dialog", {
    name: "Prefer to work directly inside Vinted?",
  });
  await suggestion.waitFor();
  const install = suggestion.getByRole("link", {
    name: "Install Chrome extension",
  });
  const installUrl = new URL(await install.getAttribute("href"));
  assert.equal(installUrl.hostname, "chromewebstore.google.com");
  assert.match(installUrl.pathname, /mommklhpammnlojjobejddmidmdcalcl$/);
  assert.equal(await install.getAttribute("target"), "_blank");
  await page.screenshot({ path: `${output}/extension-suggestion.png` });
  await suggestion.getByRole("button", { name: "Not now" }).click();
  assert.equal(await suggestion.count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  await click("copy-title");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-draft-copy-status]")?.textContent ===
      "Title copied.",
  );
  assert.equal(await suggestion.count(), 0);
  await page.reload();
  await action("done").waitFor();
  await click("copy-title");
  await page.waitForFunction(
    () =>
      document.querySelector("[data-draft-copy-status]")?.textContent ===
      "Title copied.",
  );
  assert.equal(await suggestion.count(), 0);
  // A known installed extension must not be promoted again after cooldown.
  await page.evaluate(
    ({ userId }) => {
      localStorage.setItem(
        `autolister.mobile.extension-suggestion.${userId}`,
        String(Date.now() - 1),
      );
      window.__fixturePingCount = 0;
      window.chrome ||= {};
      window.chrome.runtime = {
        sendMessage: (_id, _message, reply) => {
          window.__fixturePingCount++;
          reply({ installed: true });
        },
      };
    },
    { userId },
  );
  await click("copy-title");
  await page.waitForFunction(() => window.__fixturePingCount === 1);
  assert.equal(await suggestion.count(), 0);
  await page.evaluate(() => {
    delete window.chrome.runtime;
  });
  await click("copy-title");
  await suggestion.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await suggestion.count(), 0);
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  checks.push(
    "Desktop copy offers the real Chrome extension; phones and installed users are skipped; dismissal survives reload for seven days; Escape removes the backdrop immediately",
  );
  await page.setViewportSize({ width: 390, height: 844 });
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
  await page.evaluate(() => {
    const runtime = globalThis.AutoListerWebsiteTelemetry;
    const original = runtime.track;
    runtime.track = (event, properties, immediate) => {
      if (event === "billing_portal_start" && properties.context.target === "manage")
        return new Promise((resolve) => {
          globalThis.releaseFixtureTelemetry = () => {
            runtime.track = original;
            resolve({ queued: false });
          };
        });
      return original(event, properties, immediate);
    };
  });
  const portalReached = new Promise((resolve) => {
    portalObserved = () => resolve(true);
  });
  await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
  await page.locator('[data-mobile-web="manage-billing"]').click();
  try {
    assert.equal(
      await Promise.race([
        portalReached,
        new Promise((resolve) => setTimeout(() => resolve(false), 1500)),
      ]),
      true,
      "Billing must not wait for a stalled telemetry request",
    );
    assert.equal(portalCalls, 2);
  } finally {
    await page.evaluate(() => {
      globalThis.releaseFixtureTelemetry?.();
      delete globalThis.releaseFixtureTelemetry;
    });
  }
  await page.keyboard.press("Escape");
  checks.push(
    "Manage plan reaches bearer billing without waiting for stalled background telemetry",
  );
  await page.evaluate(() => globalThis.AutoListerWebsiteTelemetry.flush());
  assert.ok(
    telemetryEvents.some(
      (event) =>
        event.event === "web_generation_run" &&
        event.context.method === "batch" &&
        event.context.count === 3,
    ),
  );
  assert.ok(
    telemetryEvents.some(
      (event) =>
        event.event === "web_paywall_view" &&
        event.context.reason === "free_lifetime_limit",
    ),
  );
  assert.ok(telemetryEvents.some((event) => event.event === "copy"));
  checks.push(
    "Existing durable telemetry records batch size, quota paywalls and copies without blocking the UI",
  );
  await checkDeletedQueueItem();
  await checkActiveDeletionConflict();
  checks.push(
    "Deleting a failed item removes its queue link across reload and preserves other saved drafts and photos",
  );
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
  console.error(
    await page.evaluate(
      ({ userId }) => ({
        ua: navigator.userAgent,
        width: innerWidth,
        hidden: document.hidden,
        active: document.activeElement?.outerHTML.slice(0, 200),
        overlays: Array.from(
          document.querySelectorAll(
            'dialog[open], [aria-modal="true"], details[data-draft-popover][open], [data-mobile-web="profile-menu"]:not([hidden])',
          ),
        ).map((el) => el.outerHTML.slice(0, 200)),
        cooldown: localStorage.getItem(
          `autolister.mobile.extension-suggestion.${userId}`,
        ),
        copyStatus: document.querySelector("[data-draft-copy-status]")
          ?.textContent,
      }),
      { userId },
    ),
  );
  console.error(JSON.stringify({ errors, requests: requests.slice(-12) }));
  throw error;
} finally {
  await browser.close();
}
}
