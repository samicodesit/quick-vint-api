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
const generatedSettings = [];
let saveFailure = false;
let conflict = false;
let holdGeneration = false;
let releaseGeneration;
let quota = false;
let planTier = "pro";
let minuteBlocked = false;
let uploadFailure = false;
let holdList = !process.env.DRAFT_BROWSER_CASE;
let releaseList;
let listFailure = false;
let holdUpload = false;
let releaseUpload;
let holdDetail = false;
let releaseDetail;
let generationFailure = false;
let phoneOpenFailure = false;
let phoneComplete = false;
let phoneExpired = false;
let extraCredits = 0;
const phoneSessions = new Map();
const phoneRequests = [];
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
  ...(process.env.DRAFT_BROWSER_NATIVE_PHONE
    ? {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        hasTouch: true,
      }
    : {}),
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
  const url = new URL(route.request().url());
  const path = url.pathname;
  if (path === "/api/phone-upload") {
    const id = url.searchParams.get("sessionId");
    const action = url.searchParams.get("action");
    phoneRequests.push({ id, action, headers: route.request().headers() });
    if (action === "open") {
      if (phoneOpenFailure) {
        phoneOpenFailure = false;
        return route.fulfill({
          status: 503,
          json: { error: "Could not connect. Try again." },
        });
      }
      phoneSessions.set(id, {
        mode: url.searchParams.get("mode"),
        status: "open",
      });
      return route.fulfill({ json: { success: true, status: "open" } });
    }
    if (action === "cleanup") {
      phoneSessions.delete(id);
      return route.fulfill({ json: { success: true } });
    }
    if (phoneExpired) {
      phoneExpired = false;
      return route.fulfill({
        json: { status: "expired", complete: false, files: [], count: 0 },
      });
    }
    const complete = phoneComplete;
    if (complete) {
      phoneComplete = false;
      objects.set("phone-fixture", photoFixtures[0]);
    }
    return route.fulfill({
      json: {
        status: complete ? "complete" : "open",
        complete,
        count: complete ? 2 : 0,
        files: complete
          ? [0, 1].map((order) => ({
              name: `phone-${order}.jpg`,
              order,
              url: "https://drafts-test.supabase.co/storage/image/phone-fixture",
            }))
          : [],
      },
    });
  }
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
        plan: { tier: planTier, status: "active", isPaid: planTier !== "free" },
        canGenerate: !quota,
        limits: { daily: 50, monthly: 500 },
        remaining: {
          generations: quota ? 0 : 50 - generationCalls,
          daily: quota ? 0 : 50 - generationCalls - (extraCredits ? 12 : 0),
          monthly: 500 - generationCalls - (extraCredits ? 83 : 0),
          packCredits: extraCredits,
          minute: minuteBlocked ? 0 : 10,
        },
        resetsAt: { minute: new Date(Date.now() + 30000).toISOString() },
      },
    });
  if (path === "/api/draft-photo") {
    if (holdUpload) {
      holdUpload = false;
      await new Promise((resolve) => {
        releaseUpload = resolve;
      });
    }
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
    generatedSettings.push({ id: d.id, settings: { ...d.settings } });
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
    d.title = `${d.settings.titleLanguageCode === "fr" ? "Robe portefeuille noire" : "Black wrap dress"} ${generationCalls}`;
    const dutch = d.settings.descriptionLanguageCode === "nl";
    const heading = dutch ? "Zwarte wikkeljurk" : "Black wrap dress";
    const detail = dutch
      ? "Bekijk de foto's voor de staat."
      : "Check the photos for condition.";
    d.description = d.settings.useBulletPoints
      ? `${heading}\n\n• ${dutch ? "Wikkelmodel met strik in de taille" : "Wrap front with a tie at the waist"}\n• ${detail}`
      : `${heading}. ${detail}`;
    if (d.settings.useEmojis) d.description = `✨ ${d.description}`;
    if (d.settings.includeSellerNote && d.settings.descriptionFooterText)
      d.description += `\n\n${d.settings.descriptionFooterText}`;
    if (d.settings.useHashtags) d.description += "\n\n#WrapDress #BlackDress";
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
  if (action === "list" && holdList) {
    holdList = false;
    await new Promise((resolve) => {
      releaseList = resolve;
    });
  }
  if (action === "list" && listFailure) {
    listFailure = false;
    return route.fulfill({
      status: 503,
      json: {
        error: "Your drafts could not be loaded. Try again.",
        code: "drafts_unavailable",
      },
    });
  }
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
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      ...(input.settings === undefined ? {} : { settings: input.settings }),
      ...(input.state === undefined ? {} : { state: input.state }),
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
    ["new", "bulk"].includes(name) &&
    !(await page.locator(`[data-draft-action="${name}"]:visible`).count())
  )
    await page.getByRole("button", { name: "Add new", exact: true }).click();
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
  await target.setViewportSize({
    width,
    height:
      width < 768
        ? Number(process.env.DRAFT_BROWSER_MOBILE_HEIGHT || 844)
        : 1000,
  });
  await target.mouse.move(0, 0);
  const qrPane = target.locator("[data-phone-upload]:visible");
  if (
    width >= 768 &&
    (await qrPane.count()) &&
    !(await qrPane.locator("[data-phone-retry]").isVisible())
  )
    await qrPane.locator("[data-phone-qr] img").waitFor();
  await target.evaluate(() => window.scrollTo(0, 0));
  await settleAnimations(target);
  await target.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await target.locator(".draft-popover-panel:visible").evaluateAll((panels) =>
      panels.every((panel) => {
        const rect = panel.getBoundingClientRect();
        return rect.left >= 15 && rect.right <= innerWidth - 15;
      }),
    ),
    true,
    `Open menus stay within the ${width}px viewport`,
  );
  await target.screenshot({
    path: `${output}/${name}-${width}.png`,
    fullPage: true,
    animations: "disabled",
  });
  if (process.env.DRAFT_BROWSER_CAPTURE_FOLD)
    await target.screenshot({
      path: `${output}/${name}-${width}-fold.png`,
      fullPage: false,
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
async function settleAnimations(target = page) {
  await target.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const deadline = performance.now() + 1000;
        const check = () => {
          const active = document
            .getAnimations()
            .some(
              (animation) =>
                animation.playState === "running" &&
                animation.effect?.getTiming().iterations !== Infinity,
            );
          if (!active) resolve(true);
          else if (performance.now() >= deadline)
            reject(
              new Error(
                "Finite UI transitions did not settle within one second",
              ),
            );
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }),
  );
}
async function screenshots(name, target = page) {
  for (const width of [360, 390, 768, 1440])
    await screenshot(name, width, target);
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
  seed(
    name === "viewport-fit"
      ? 0
      : name === "pages" || name === "scroll" || name === "performance-overlays"
        ? 36
        : 3,
  );
  if (name === "performance-overlays")
    for (let position = 1; position < 10; position++)
      photos.push({
        id: randomUUID(),
        draft_id: drafts[0].id,
        position,
        status: "ready",
        url: "https://drafts-test.supabase.co/storage/image/review-photo",
      });
  if (name === "visual-reference") {
    const draft = drafts[0];
    draft.title = "Black wrap dress";
    draft.description =
      "Black wrap dress with a V-neck and short sleeves.\n\n• Wrap front with a tie at the waist\n• Short sleeves with gathered shoulders\n• Black textured fabric visible in the photos\n\nSmoke-free home. Happy to bundle items.\n\n#WrapDress #BlackDress";
    draft.settings = {
      ...draft.settings,
      tone: "standard",
      useHashtags: true,
      useEmojis: false,
      includeSellerNote: true,
      descriptionFooterText: "Smoke-free home. Happy to bundle items.",
    };
  }
  if (["grouping-navigation", "ui-redesign", "full-settings"].includes(name))
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
  if (name === "entry-polish") extraCredits = 17;
  await page.goto(`${base}/app/`);
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  if (name === "initial-load") {
    const results = [];
    drafts[1].title = "";
    drafts[1].description = "";
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const flow of ["single", "batch", "review", "prepare"]) {
        const view = {
          owner: "123e4567-e89b-42d3-a456-426614174000",
          composing: flow === "single",
          bulk: flow === "batch",
          draftId:
            flow === "review"
              ? drafts[0].id
              : flow === "prepare"
                ? drafts[1].id
                : undefined,
        };
        await page.evaluate(
          (draftWorkspace) => history.replaceState({ draftWorkspace }, ""),
          view,
        );
        holdList = true;
        releaseList = undefined;
        await page.reload();
        await waitForFixture(() => releaseList);
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const before = await page
          .locator("h1")
          .evaluateAll((headings) =>
            headings
              .filter(
                (h) =>
                  !h.closest("[hidden]") &&
                  getComputedStyle(h).display !== "none" &&
                  h.getBoundingClientRect().height,
              )
              .map((h) => h.textContent.trim()),
          );
        releaseList();
        holdList = false;
        const title =
          flow === "single"
            ? "Add item"
            : flow === "batch"
              ? "Add several items"
              : flow === "prepare"
                ? "Prepare item"
                : "Review and copy";
        await page.getByRole("heading", { name: title, exact: true }).waitFor();
        await settleAnimations();
        results.push({ width, flow, before, after: title });
        if (!process.env.DRAFT_BROWSER_BASELINE)
          assert.deepEqual(
            before,
            [],
            "Restoring a flow must not flash the library or another screen",
          );
      }
    }
    const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await guest.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await guest.addInitScript(() => {
      window.initialHeadings = [];
      const sample = () => {
        window.initialHeadings.push(
          Array.from(document.querySelectorAll("h1"))
            .filter(
              (h) => !h.closest("[hidden]") && h.getBoundingClientRect().height,
            )
            .map((h) => h.textContent.trim()),
        );
        if (window.initialHeadings.length < 40) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const guestPage = await guest.newPage();
    await guestPage.goto(`${base}/app/`);
    await guestPage
      .getByRole("heading", { name: "Sign in", exact: true })
      .waitFor();
    await guestPage.waitForFunction(() => window.initialHeadings.length === 40);
    const headings = await guestPage.evaluate(() => window.initialHeadings);
    assert.ok(
      headings.every((frame) => frame.every((title) => title === "Sign in")),
      "Guest startup must not flash signed-in screens",
    );
    results.push({ flow: "sign-in", width: 390, frames: headings });
    await guest.close();
    await writeFile(
      `${output}/initial-load-result.json`,
      JSON.stringify(results, null, 2),
    );
    assert.deepEqual(errors, []);
    return;
  }
  if (name === "popover-first-frame") {
    const results = [];
    const dismissals = [];
    const measureDismissal = async (panelSelector, closeSelector) => {
      await settleAnimations();
      const header = await page
        .locator(".mobile-workspace-brand")
        .evaluate((brand) => {
          const box = brand.getBoundingClientRect();
          const target = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          );
          return {
            visibility: getComputedStyle(brand).visibility,
            covered: Boolean(
              target?.classList.contains("mobile-sheet-backdrop") ||
              target?.closest(".is-mobile-sheet"),
            ),
          };
        });
      if (!process.env.DRAFT_BROWSER_BASELINE) {
        assert.equal(
          header.visibility,
          "visible",
          "Opening a sheet must preserve the header logo",
        );
        if (await page.locator(".mobile-sheet-backdrop").count())
          assert.equal(
            header.covered,
            true,
            "The backdrop must cover the visible header",
          );
      }
      const samples = await page.evaluate(
        ({ panelSelector, closeSelector }) =>
          new Promise((resolve) => {
            const panel = document.querySelector(panelSelector);
            const backdrop = document.querySelector(".mobile-sheet-backdrop");
            const frames = [];
            const start = performance.now();
            document.querySelector(closeSelector).click();
            const tick = () => {
              frames.push({
                elapsed: performance.now() - start,
                panel: Number(getComputedStyle(panel).opacity),
                backdrop: backdrop?.isConnected
                  ? Number(getComputedStyle(backdrop).opacity)
                  : null,
                visible:
                  !panel.hidden && (panel.closest("details")?.open ?? true),
                durations: panel
                  .getAnimations()
                  .map((a) => a.effect.getTiming().duration),
              });
              if (frames.length < 20) requestAnimationFrame(tick);
              else resolve(frames);
            };
            tick();
          }),
        { panelSelector, closeSelector },
      );
      dismissals.push({
        panelSelector,
        width: page.viewportSize().width,
        reducedMotion: await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
        samples,
      });
      assert.equal(await page.locator(".mobile-sheet-backdrop").count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
      assert.equal(await page.locator("[inert]").count(), 0);
      if (!process.env.DRAFT_BROWSER_BASELINE) {
        assert.ok(samples[0].durations.every((duration) => duration <= 120));
        assert.ok(
          samples.some((s) => !s.visible),
          "Dismissal must finish promptly",
        );
        assert.ok(
          samples.every(
            (s) => s.backdrop === null || Math.abs(s.panel - s.backdrop) < 0.02,
          ),
          "Backdrop must fade with its panel instead of lingering",
        );
      }
    };
    const session = await context.newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await page.emulateMedia({ reducedMotion });
      for (const width of [360, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => document.fonts.ready);
        await settleAnimations();
        const frames = await page
          .locator(".draft-library .draft-add-menu")
          .evaluate(
            (details) =>
              new Promise((resolve) => {
                const panel = details.querySelector(".draft-popover-panel");
                const samples = [];
                const sample = () => {
                  const style = getComputedStyle(panel);
                  const rect = panel.getBoundingClientRect();
                  samples.push({
                    opacity: Number(style.opacity),
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    animations: panel.getAnimations().length,
                  });
                };
                details.querySelector("summary").click();
                sample();
                const tick = () => {
                  sample();
                  if (samples.length < 24) requestAnimationFrame(tick);
                  else resolve(samples);
                };
                requestAnimationFrame(tick);
              }),
          );
        results.push({ width, reducedMotion, frames });
        await page.keyboard.press("Escape");
        await page
          .locator(".draft-library .draft-add-menu[open]")
          .waitFor({ state: "hidden" });
        const settings = await page
          .locator("[data-draft-global-trigger]")
          .evaluate((button) => {
            button.click();
            const panel = document.querySelector(
              "[data-draft-global-settings] .draft-popover-panel",
            );
            return {
              modal: panel.getAttribute("aria-modal"),
              opacity: Number(getComputedStyle(panel).opacity),
              backdrops: document.querySelectorAll(".mobile-sheet-backdrop")
                .length,
            };
          });
        results.at(-1).settings = settings;
        await settleAnimations();
        const dropdown = await page
          .locator("[data-draft-global-settings] [data-draft-select]")
          .first()
          .evaluate((widget) => {
            const trigger = widget.querySelector("[data-draft-select-trigger]");
            trigger.click();
            const menu = widget.querySelector("[data-draft-select-options]");
            const snapshot = {
              opacity: Number(getComputedStyle(menu).opacity),
              animations: menu.getAnimations().length,
            };
            trigger.click();
            return snapshot;
          });
        assert.deepEqual(
          dropdown,
          { opacity: 1, animations: 0 },
          "Settings dropdowns must open immediately",
        );
        await measureDismissal(
          "[data-draft-global-settings] .draft-popover-panel",
          "[data-draft-global-settings] [data-draft-close]",
        );
        await page.waitForFunction(
          () =>
            !document.querySelector("[data-draft-global-settings]").open &&
            !document.querySelector(".mobile-sheet-backdrop"),
        );
        assert.equal(await page.locator(".mobile-sheet-backdrop").count(), 0);
        await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
        if (width === 390 && reducedMotion === "no-preference") {
          await settleAnimations();
          await page.screenshot({ path: `${output}/account-header-390.png` });
        }
        await measureDismissal(
          '[data-mobile-web="profile-menu"]',
          '[data-mobile-web="close-account"]',
        );
        const add = page.locator(".draft-library .draft-add-menu > summary");
        await add.focus();
        await page.keyboard.press("Enter");
        assert.equal(
          await page
            .locator(".draft-library .draft-add-menu")
            .evaluate((el) => el.open),
          true,
        );
        await page.keyboard.press("Escape");
        await page.waitForFunction(
          () => !document.querySelector(".draft-library .draft-add-menu").open,
        );
        await page.mouse.click(4, 4);
      }
    }
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await measureDismissal(
      '[data-mobile-web="profile-menu"]',
      '[data-mobile-web="close-account"]',
    );
    await page.locator("[data-draft-global-trigger]").click();
    await measureDismissal(
      "[data-draft-global-settings] .draft-popover-panel",
      "[data-draft-global-settings] [data-draft-close]",
    );
    await page.locator(".draft-item-open").first().click();
    await page.locator("#draft-description:visible").waitFor();
    for (const selector of [".draft-item-menu", ".draft-photo-options"]) {
      const snapshot = await page
        .locator(selector)
        .first()
        .evaluate((details) => {
          details.querySelector("summary").click();
          const panel = details.querySelector(".draft-popover-panel");
          return {
            modal: panel.getAttribute("aria-modal"),
            opacity: Number(getComputedStyle(panel).opacity),
            backdrops: document.querySelectorAll(".mobile-sheet-backdrop")
              .length,
          };
        });
      assert.deepEqual(
        snapshot,
        { modal: "true", opacity: 0, backdrops: 1 },
        "Item/photo menus must be ready before their first paint",
      );
      await measureDismissal(
        `${selector} .draft-popover-panel`,
        `${selector} .draft-close`,
      );
    }
    await writeFile(
      `${output}/popover-first-frame-result.json`,
      JSON.stringify(results, null, 2),
    );
    await writeFile(
      `${output}/popover-dismissal-result.json`,
      JSON.stringify(dismissals, null, 2),
    );
    if (!process.env.DRAFT_BROWSER_BASELINE) {
      for (const { frames, settings, reducedMotion } of results) {
        assert.ok(
          frames.every((frame) => frame.opacity === 1),
          "Add new must not flash visible then restart its fade",
        );
        assert.ok(
          frames.every(
            (frame) =>
              frame.x === frames[0].x &&
              frame.y === frames[0].y &&
              frame.width === frames[0].width &&
              frame.height === frames[0].height,
          ),
          "Add new must retain its geometry from the first frame",
        );
        assert.ok(
          frames.every((frame) => frame.animations === 0),
          "Small add menus open immediately",
        );
        assert.equal(
          settings.modal,
          "true",
          "Settings must establish their modal in the opening event",
        );
        assert.equal(settings.backdrops, 1);
        assert.equal(
          settings.opacity,
          reducedMotion === "reduce" ? 1 : 0,
          "Settings motion must be ready before the first paint",
        );
      }
    }
    assert.deepEqual(errors, []);
    return;
  }
  if (name === "performance-overlays") {
    const results = [];
    const measureSelects = async (action) => {
      await page.evaluate(() => {
        window.selectMutations = [];
        window.selectObserver = new MutationObserver((records) => {
          window.selectMutations.push(...records);
        });
        document.querySelectorAll("[data-draft-select]").forEach((widget) => {
          window.selectObserver.observe(widget, {
            subtree: true,
            attributes: true,
            childList: true,
            characterData: true,
          });
        });
      });
      await action();
      return page.evaluate(() => {
        window.selectMutations.push(...window.selectObserver.takeRecords());
        window.selectObserver.disconnect();
        return {
          mutations: window.selectMutations.length,
          artworkReplacements: window.selectMutations.filter(
            (record) =>
              record.type === "childList" &&
              record.target.matches?.(
                "[data-draft-select-trigger] [data-draft-select-art]",
              ),
          ).length,
        };
      });
    };
    const assertReleased = async () => {
      await settleAnimations();
      const state = await page.evaluate(() => ({
        backdrops: document.querySelectorAll(".mobile-sheet-backdrop").length,
        inert: document.querySelectorAll("[inert]").length,
        overflow: document.body.style.overflow,
        selects: document.querySelectorAll(
          '[data-draft-select-trigger][aria-expanded="true"]',
        ).length,
      }));
      assert.deepEqual(state, {
        backdrops: 0,
        inert: 0,
        overflow: "",
        selects: 0,
      });
    };
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const idle = await measureSelects(() =>
        page.evaluate(() => {
          for (let i = 0; i < 20; i++) document.body.click();
        }),
      );
      const trigger = page.locator("[data-draft-global-trigger]");
      await trigger.click();
      await settleAnimations();
      const note = page.locator('[data-draft-global="descriptionFooterText"]');
      await note.focus();
      await page.evaluate(() => {
        window.settingsBackdrop = document.querySelector(
          ".mobile-sheet-backdrop",
        );
      });
      await page.setViewportSize({
        width: width === 390 ? 1440 : 390,
        height: 844,
      });
      await settleAnimations();
      assert.equal(
        await note.evaluate((el) => el === document.activeElement),
        true,
        "Responsive settings must retain field focus",
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.settingsBackdrop ===
            document.querySelector(".mobile-sheet-backdrop"),
        ),
        true,
        "Responsive settings must retain their active modal",
      );
      await page.setViewportSize({ width, height: 844 });
      await settleAnimations();
      const typing = await measureSelects(() => note.fill(`Note ${width}`));
      const widget = page
        .locator("[data-draft-global-settings] [data-draft-select]")
        .first();
      const dropdown = widget.locator("[data-draft-select-trigger]");
      await dropdown.scrollIntoViewIfNeeded();
      const timing = await dropdown.evaluate((button) => {
        const start = performance.now();
        button.click();
        return {
          milliseconds: performance.now() - start,
          expanded: button.getAttribute("aria-expanded"),
        };
      });
      assert.equal(timing.expanded, "true");
      await page.keyboard.press("End");
      await page.keyboard.press("Escape");
      assert.equal(await dropdown.getAttribute("aria-expanded"), "false");
      assert.equal(
        await dropdown.evaluate((el) => el === document.activeElement),
        true,
      );
      await dropdown.click();
      await widget.locator('[data-draft-select-option="fr"]').click();
      assert.equal(await widget.locator("select").inputValue(), "fr");
      assert.equal(
        await widget.locator("[data-draft-select-label]").textContent(),
        await widget
          .locator("select")
          .evaluate((el) => el.selectedOptions[0].textContent),
      );
      assert.equal(
        await widget
          .locator("[data-draft-select-trigger] img")
          .getAttribute("src"),
        await widget
          .locator('[data-draft-select-option="fr"] img')
          .getAttribute("src"),
        "Changed choices must refresh their artwork",
      );
      for (let i = 0; i < 10; i++) {
        await dropdown.click();
        await page.keyboard.press(i % 2 ? "Tab" : "Escape");
        assert.equal(await dropdown.getAttribute("aria-expanded"), "false");
      }
      await page.keyboard.press("Escape");
      await assertReleased();
      for (let i = 0; i < 6; i++) {
        await trigger.click();
        await page.keyboard.press("Escape");
        await assertReleased();
        assert.equal(
          await trigger.evaluate((el) => el === document.activeElement),
          true,
        );
      }
      const account = page.locator('[data-mobile-web="profile-menu-trigger"]');
      for (let i = 0; i < 6; i++) {
        await account.click();
        await page.keyboard.press("Escape");
        await assertReleased();
        assert.equal(await account.getAttribute("aria-expanded"), "false");
      }
      await account.evaluate((button) => {
        button.click();
        button.click();
        button.click();
      });
      await settleAnimations();
      assert.equal(
        await account.getAttribute("aria-expanded"),
        "true",
        "A quick close/reopen must keep the account menu open",
      );
      await page.keyboard.press("Escape");
      await assertReleased();
      results.push({ width, idle, typing, dropdownOpen: timing });
    }
    await page.evaluate(() => {
      window.libraryRebuilds = 0;
      window.libraryObserver = new MutationObserver((records) => {
        window.libraryRebuilds += records.length;
      });
      window.libraryObserver.observe(
        document.querySelector("[data-draft-items]"),
        {
          childList: true,
        },
      );
    });
    await page.locator(".draft-item-open").first().click();
    await page
      .locator("[data-draft-item-photos] > .draft-photo")
      .nth(9)
      .waitFor();
    await page.locator("[data-draft-global-trigger]").click();
    await settleAnimations();
    for (let i = 0; i < 6; i++) {
      await click(i % 2 ? "settings-item" : "settings-defaults");
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(resolve)),
      );
      assert.equal(await page.locator(".mobile-sheet-backdrop").count(), 1);
      assert.equal(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
    }
    await page.keyboard.press("Escape");
    await assertReleased();
    await page.evaluate(() => {
      window.photoRebuilds = 0;
      window.photoObserver = new MutationObserver((records) => {
        window.photoRebuilds += records.length;
      });
      window.photoObserver.observe(
        document.querySelector("[data-draft-item-photos]"),
        {
          childList: true,
        },
      );
    });
    await page
      .locator("#draft-title:visible")
      .fill("Updated item after autosave");
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").textContent ===
        "Saved",
    );
    const hiddenLibraryRebuilds = await page.evaluate(() => {
      window.libraryRebuilds += window.libraryObserver.takeRecords().length;
      window.libraryObserver.disconnect();
      return window.libraryRebuilds;
    });
    const photoRebuilds = await page.evaluate(() => {
      window.photoRebuilds += window.photoObserver.takeRecords().length;
      window.photoObserver.disconnect();
      return window.photoRebuilds;
    });
    await click("back");
    assert.equal(
      await page
        .locator(".draft-item-open")
        .first()
        .textContent()
        .then((s) => s.includes("Updated item after autosave")),
      true,
    );
    await writeFile(
      `${output}/performance-overlays-result.json`,
      JSON.stringify(
        { selects: results, hiddenLibraryRebuilds, photoRebuilds },
        null,
        2,
      ),
    );
    if (!process.env.DRAFT_BROWSER_BASELINE) {
      assert.equal(
        photoRebuilds,
        0,
        "Editing text must retain the photo grid and menus",
      );
      assert.equal(
        hiddenLibraryRebuilds,
        0,
        "Hidden library must not rebuild during editing/autosave",
      );
      for (const result of results) {
        assert.equal(
          result.idle.mutations,
          0,
          "Idle clicks must not rewrite closed dropdowns",
        );
        assert.equal(
          result.typing.mutations,
          0,
          "Note typing must not rewrite unchanged selects",
        );
      }
    }
    assert.deepEqual(errors, []);
    return;
  }
  if (name === "viewport-fit") {
    await page.evaluate(() => {
      const banner = document.createElement("aside");
      banner.textContent =
        "Local preview · Demo account and simulated generation · No customer data or charges";
      banner.style.cssText =
        "padding:10px 16px;font:13px system-ui;text-align:center";
      document.body.prepend(banner);
    });
    const fitChecks = [];
    const fits = async (state) => {
      for (const width of [360, 390, 768, 1440]) {
        await screenshot(`fit-${state}`, width);
        const size = await page.evaluate(() => ({
          viewport: document.documentElement.clientHeight,
          page: document.documentElement.scrollHeight,
          width: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
        }));
        assert.ok(
          size.page <= size.viewport + 1,
          `${state} unnecessarily scrolls at ${width}px: ${JSON.stringify(size)}`,
        );
        assert.ok(size.pageWidth <= size.width + 1);
        fitChecks.push({ state, viewportWidth: width, ...size });
      }
    };
    await fits("empty-library");
    await click("new");
    await fits("single-entry");
    await click("back");
    await click("bulk");
    await fits("batch-entry");
    await click("close-import");
    await click("new");
    await click("write");
    await fits("manual-entry");
    await click("back");
    await click("new");
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles(file("front"));
    await page.waitForFunction(
      () => !document.querySelector('[data-draft-action="generate"]').disabled,
    );
    await fits("one-photo-preparation");
    await click("back");
    await page.getByRole("button", { name: "Listed", exact: true }).click();
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    await fits("empty-listed");
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await page.locator('[data-mobile-web="sign-out"]').click();
    await page.locator('[data-mobile-web="auth-card"]:visible').waitFor();
    await fits("sign-in");
    assert.deepEqual(errors, []);
    await writeFile(
      `${output}/viewport-fit-result.json`,
      JSON.stringify({ passed: true, checks: fitChecks, pageErrors: errors }),
    );
    console.log("Viewport fit regression passed");
    return;
  }
  if (name === "item-preparation") {
    const findings = [];
    await click("new");
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles(file("front"));
    await page.waitForFunction(
      () => !document.querySelector('[data-draft-action="generate"]').disabled,
    );
    for (const width of [360, 390, 768, 1440])
      await screenshot("one-photo", width);
    if (await page.locator('[data-draft-action="write"]').isVisible())
      findings.push("Manual writing remains in photo preparation");
    if (await page.locator('[data-draft-action="done"]').isVisible())
      findings.push("Listed is available before listing text");
    if (await page.locator(".draft-cover-label").count())
      findings.push("Redundant Cover badge remains");
    await page.setViewportSize({ width: 390, height: 640 });
    if (process.env.DRAFT_BROWSER_NATIVE_PHONE) {
      const chooserPromise = page.waitForEvent("filechooser");
      await page
        .getByRole("button", { name: "Add photos", exact: true })
        .click();
      const chooser = await chooserPromise;
      assert.equal(chooser.isMultiple(), true);
      assert.equal(
        await chooser.element().getAttribute("capture"),
        null,
        "Native picker permits both library and camera choices",
      );
      assert.equal(
        await page.locator(".draft-photo-source").getAttribute("open"),
        null,
      );
    } else {
      await page
        .getByRole("button", { name: "Add photos", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Photo library", exact: true })
        .waitFor();
      await screenshot("photo-source", 390);
      await page.keyboard.press("Escape");
    }
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles(Array.from({ length: 9 }, (_, i) => file(`detail-${i}`)));
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-item-photos] .draft-photo:not(.draft-upload)",
        ).length === 10 &&
        !document.querySelector('[data-draft-action="generate"]').disabled,
    );
    for (const width of [360, 390, 768, 1440]) {
      await screenshot("ten-photos", width);
      const header = await page
        .locator(".mobile-workspace-header")
        .evaluate((el) => {
          const brand = el
            .querySelector(".mobile-workspace-brand")
            .getBoundingClientRect();
          const controls = el
            .querySelector(".mobile-workspace-header-actions")
            .getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            centerDifference: Math.abs(
              brand.top + brand.height / 2 - controls.top - controls.height / 2,
            ),
            paddingTop: style.paddingTop,
            paddingBottom: style.paddingBottom,
          };
        });
      assert.ok(
        header.centerDifference <= 1,
        "Logo and controls share a vertical centre",
      );
      assert.equal(
        header.paddingTop,
        header.paddingBottom,
        "Header has balanced vertical spacing",
      );
      const gaps = await page
        .locator("[data-draft-item-photos]")
        .evaluate((el) => {
          const grid = el.getBoundingClientRect();
          const first = el.children[0].getBoundingClientRect();
          const row = [...el.children]
            .map((p) => p.getBoundingClientRect())
            .filter((p) => Math.abs(p.top - first.top) < 1);
          return {
            left: Math.abs(row[0].left - grid.left),
            right: Math.abs(row.at(-1).right - grid.right),
          };
        });
      if (gaps.left > 1 || gaps.right > 1)
        findings.push(`Photo grid leaves a side gap at ${width}px`);
      if (width < 768) {
        const bottomGap = await page
          .locator(".draft-generation-actions")
          .evaluate(
            (el) =>
              el.getBoundingClientRect().bottom -
              el.querySelector(".draft-generate").getBoundingClientRect()
                .bottom,
          );
        assert.ok(
          bottomGap <= 5,
          "Bottom action leaves only four pixels of padding and its border",
        );
        const heading = await page.locator("#draft-editor-title").boundingBox();
        const lineHeight = await page
          .locator("#draft-editor-title")
          .evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
        assert.ok(
          heading.height <= lineHeight + 1,
          "Preparation title remains on one line",
        );
        const saved = await page
          .locator("[data-draft-save-status]")
          .boundingBox();
        if (saved.y < heading.y + heading.height)
          findings.push(`Saved is beside the heading at ${width}px`);
      }
    }
    await page.setViewportSize({ width: 390, height: 640 });
    const addPhotos = page.getByRole("button", {
      name: "Add photos",
      exact: true,
    });
    assert.equal(
      await addPhotos.getAttribute("aria-disabled"),
      "true",
      "Ten photos disables further additions",
    );
    const target = page.locator("[data-draft-item-photos] .draft-photo").nth(5);
    const targetUrl = await target.locator("img").getAttribute("src");
    const photoIds = photos
      .filter((p) => p.draft_id === drafts[0].id)
      .map((p) => p.id);
    await target.locator("summary").click();
    await page
      .getByRole("button", { name: "Delete photo", exact: true })
      .click();
    const dialog = page.locator("[data-draft-delete-dialog][open]");
    await dialog.waitFor();
    if (
      (await dialog
        .locator("[data-draft-delete-cover]")
        .getAttribute("src")) !== targetUrl
    )
      findings.push(
        "Delete confirmation shows the cover instead of the chosen photo",
      );
    if (
      (await dialog.locator('[value="confirm"]').innerText()).trim() !==
      "Delete"
    )
      findings.push("Delete action still says permanently");
    await screenshot("delete-photo", 390);
    await dialog.locator('[value="cancel"]').click();
    assert.deepEqual(
      photos.filter((p) => p.draft_id === drafts[0].id).map((p) => p.id),
      photoIds,
      "Cancel keeps every photo",
    );
    await target.locator("summary").click();
    await page
      .getByRole("button", { name: "Delete photo", exact: true })
      .click();
    await page
      .locator('[data-draft-delete-dialog][open] [value="confirm"]')
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-item-photos] .draft-photo")
          .length === 9,
    );
    assert.deepEqual(
      photos.filter((p) => p.draft_id === drafts[0].id).map((p) => p.id),
      photoIds.filter((_, i) => i !== 5),
      "Only the chosen photo is deleted",
    );
    await writeFile(
      `${output}/item-preparation-result.json`,
      JSON.stringify({ findings, pageErrors: errors }, null, 2),
    );
    assert.deepEqual(findings, []);
    await click("generate");
    await page.locator("#draft-description:visible").waitFor();
    const reviewStyle = await page
      .locator("[data-draft-copy-fields]")
      .evaluate((el) => {
        const title = getComputedStyle(el.querySelector("#draft-title"));
        const description = getComputedStyle(
          el.querySelector("#draft-description"),
        );
        return {
          titleSize: title.fontSize,
          descriptionSize: description.fontSize,
          titleWeight: title.fontWeight,
          descriptionWeight: description.fontWeight,
        };
      });
    assert.equal(reviewStyle.titleSize, reviewStyle.descriptionSize);
    assert.equal(reviewStyle.titleWeight, reviewStyle.descriptionWeight);
    assert.equal(await page.locator('[data-draft-action="edit"]').count(), 0);
    assert.equal(
      await page.locator("[data-draft-editor-footer] .draft-help").count(),
      0,
    );
    assert.equal(
      await page.locator('[data-draft-action="done"]').isVisible(),
      true,
      "Listed becomes available after generation",
    );
    await screenshots("generated-review");
    const longDescription = Array.from(
      { length: 35 },
      (_, i) =>
        `Detail ${i + 1}: soft fabric, a comfortable fit and measurements checked against the photos.`,
    ).join("\n\n");
    await page.locator("#draft-description").fill(longDescription);
    await page
      .locator('[data-draft-save-status][data-status="saved"]')
      .waitFor();
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 640 });
      await settleAnimations();
      await page.waitForFunction(() => {
        const field = document.querySelector("#draft-description");
        return field.scrollHeight <= field.clientHeight + 2;
      });
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      const field = await page.locator("#draft-description").boundingBox();
      const bar = await page
        .locator("[data-draft-editor-footer]")
        .boundingBox();
      assert.ok(
        field.y + field.height <= bar.y,
        "The final description lines scroll clear of the fixed action",
      );
      const panel = await page.locator(".draft-text-panel").boundingBox();
      assert.ok(
        bar.y - (panel.y + panel.height) <= 8,
        "No extra page clearance remains between the form and action at the end of a long description",
      );
      await page.screenshot({
        path: `${output}/long-description-bottom-${width}.png`,
        animations: "disabled",
      });
    }
    assert.deepEqual(errors, []);
    console.log("Item preparation regression passed");
    return;
  }
  if (name === "mobile-usability") {
    const findings = [];
    const visibleAction = async (selector, label) => {
      const box = await page.locator(selector).boundingBox();
      const height = page.viewportSize().height;
      if (!box || box.y < 0 || box.y + box.height > height)
        findings.push(
          `${label} outside ${page.viewportSize().width} x ${height}`,
        );
    };
    await page.locator(".draft-item-open").first().click();
    for (const width of [360, 390]) {
      await screenshot("mobile-review", width);
      await visibleAction('[data-draft-action="copy-title"]', "Copy title");
      await visibleAction("#draft-title", "Listing title");
      await visibleAction(
        '[data-draft-action="copy-description"]',
        "Copy description",
      );
    }
    saveFailure = true;
    await page.locator("#draft-title").fill("Recoverable mobile edit");
    await page
      .locator('[data-draft-save-status][data-status="error"]')
      .waitFor();
    await screenshot("mobile-save-error", 390);
    await visibleAction('[data-draft-action="save"]', "Retry save");
    saveFailure = false;
    await click("save");
    await page
      .locator('[data-draft-save-status][data-status="saved"]')
      .waitFor();
    await click("back");
    await click("new");
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles(Array.from({ length: 10 }, (_, i) => file(`single-${i}`)));
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-item-photos] .draft-photo:not(.draft-upload)",
        ).length === 10 &&
        !document.querySelector('[data-draft-action="generate"]').disabled,
    );
    await screenshot("mobile-single-ready", 390);
    await visibleAction('[data-draft-action="generate"]', "Single generate");
    await page.locator("[data-draft-item-photos]").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const lastPhoto = await page
      .locator("[data-draft-item-photos] .draft-photo:not(.draft-upload)")
      .last()
      .boundingBox();
    const singleBar = await page
      .locator(".draft-generation-actions")
      .boundingBox();
    assert.ok(
      lastPhoto.y + lastPhoto.height <= singleBar.y,
      "Last photo can be scrolled clear of the generation action",
    );
    await page.screenshot({
      path: `${output}/mobile-single-bottom-390-fold.png`,
      animations: "disabled",
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    const navigationBefore = await page
      .locator(".draft-editor-navigation")
      .boundingBox();
    const generateBefore = await page
      .locator('[data-draft-action="generate"]')
      .boundingBox();
    const actionBoxBefore = await page
      .locator("[data-draft-generation-actions]")
      .boundingBox();
    const scrollBefore = await page
      .locator("[data-draft-item-photos]")
      .evaluate((el) => el.scrollTop);
    holdGeneration = true;
    await click("generate");
    await page
      .locator('[data-draft-action="generate"][aria-busy="true"]')
      .waitFor();
    await waitForFixture(() => releaseGeneration);
    assert.equal(
      await page
        .locator("[data-draft-item-photos]")
        .evaluate((el) => el.scrollTop),
      scrollBefore,
      "Generating preserves the photo scroll position",
    );
    await screenshot("mobile-single-running", 390);
    const navigationAfter = await page
      .locator(".draft-editor-navigation")
      .boundingBox();
    if (navigationBefore.y !== navigationAfter.y)
      findings.push("Single generation moves navigation");
    assert.deepEqual(
      await page.locator('[data-draft-action="generate"]').boundingBox(),
      generateBefore,
      "Generate retains its bounds while running",
    );
    assert.equal(
      await page.locator('[data-draft-action="generate"]').isEnabled(),
      false,
    );
    assert.equal(
      await page
        .locator('[data-draft-action="generate"] [data-draft-label]')
        .innerText(),
      "Generating…",
    );
    assert.equal(
      await page.locator("[data-draft-generate-loader]").isVisible(),
      true,
    );
    assert.equal(
      await page.locator("[data-draft-generate-play]").isVisible(),
      false,
    );
    assert.equal(await page.locator("[data-draft-queue]").isVisible(), false);
    await visibleAction('[data-draft-action="generate"]', "Running generation");
    holdGeneration = false;
    releaseGeneration();
    await page.locator("#draft-description:visible").waitFor();
    assert.deepEqual(
      await page.locator('[data-draft-action="done"]').boundingBox(),
      generateBefore,
      "Generate and Mark as listed occupy the same mobile position",
    );
    assert.deepEqual(
      await page.locator("[data-draft-editor-footer]").boundingBox(),
      actionBoxBefore,
      "The entire bottom action box retains identical dimensions and position",
    );
    await click("back");
    await click("bulk");
    await page
      .locator('[data-draft-input="bulk"]')
      .setInputFiles(Array.from({ length: 12 }, (_, i) => file(`batch-${i}`)));
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-photo-id]:not(:disabled)")
          .length === 12,
    );
    for (const photo of await page.locator("[data-draft-photo-id]").all())
      await photo.check();
    await click("individual");
    await page.waitForFunction(
      () => document.querySelectorAll(".draft-group-row").length === 12,
    );
    for (const width of [360, 390]) {
      await screenshot("mobile-batch-ready", width);
      await visibleAction(
        '[data-draft-action="generate-groups"]',
        "Batch generate",
      );
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const lastGroup = await page
      .locator(".draft-group-row")
      .last()
      .boundingBox();
    const batchBar = await page
      .locator(".draft-group-generation")
      .boundingBox();
    assert.ok(
      lastGroup.y + lastGroup.height <= batchBar.y,
      "Last batch item can be scrolled clear of the pinned action",
    );
    await page.screenshot({
      path: `${output}/mobile-batch-bottom-390-fold.png`,
      animations: "disabled",
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    holdGeneration = true;
    await click("generate-groups");
    await screenshot("mobile-batch-running", 390);
    await visibleAction('[data-draft-action="pause"]', "Batch pause");
    await click("pause");
    holdGeneration = false;
    releaseGeneration();
    await page.waitForFunction(
      () => !document.querySelector('[data-draft-action="resume"]').hidden,
    );
    await screenshot("mobile-batch-paused", 390);
    await visibleAction('[data-draft-action="resume"]', "Batch resume");
    await writeFile(
      `${output}/mobile-usability-result.json`,
      JSON.stringify({ findings, pageErrors: errors }, null, 2),
    );
    assert.deepEqual(findings, []);
    assert.deepEqual(errors, []);
    console.log("Mobile usability regression passed");
    return;
  }
  if (name === "entry-polish") {
    const addNew = page.getByRole("button", { name: "Add new", exact: true });
    assert.equal(
      await addNew.count(),
      1,
      "Library has one Add new menu action",
    );
    await screenshots("library");
    await addNew.click();
    await screenshot("add-menu", 390);
    await screenshot("add-menu", 1440);
    await page
      .getByRole("button", { name: "One item", exact: true })
      .filter({ visible: true })
      .click();
    await page.locator("[data-draft-upload-intro]:visible").waitFor();
    assert.equal(
      await page.locator("[data-draft-editor-settings]").isVisible(),
      false,
      "Empty entry uses global header settings",
    );
    assert.equal(
      await page.locator("[data-draft-entry-help]").isVisible(),
      false,
    );
    await page
      .locator('[data-phone-upload="single"] [data-phone-qr] img')
      .waitFor();
    assert.equal(
      await page.locator('[data-phone-upload="single"]').isVisible(),
      true,
      "Desktop entry has a phone QR pane",
    );
    assert.equal(
      await page.locator("[data-draft-upload-intro] small").count(),
      0,
      "Entry does not display limit captions",
    );
    const entryBounds = {};
    const boundsFor = async (mode) =>
      page.evaluate((mode) => {
        const selectors =
          mode === "single"
            ? [
                ".draft-editor.is-empty .draft-editor-navigation > button",
                "#draft-editor-title",
                ".draft-entry-mode",
                "[data-draft-upload-intro]",
              ]
            : [
                '[data-draft-action="close-import"]',
                "[data-draft-heading]",
                "[data-draft-import] .draft-mode",
                "[data-draft-bulk-entry]",
              ];
        return selectors.map((selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return [
            rect.x + scrollX,
            rect.y + scrollY,
            rect.width,
            rect.height,
          ].map(Math.round);
        });
      }, mode);
    for (const width of [360, 390, 768, 1440]) {
      await screenshot("new-entry", width);
      entryBounds[width] = await boundsFor("single");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.locator('[data-phone-upload="single"]').isVisible(),
      false,
    );
    const chooser = page.waitForEvent("filechooser");
    await click("choose-item");
    await chooser;
    assert.equal(
      await page.locator('[data-draft-input="item"]').getAttribute("capture"),
      null,
      "Native chooser offers camera and library",
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    const global = page.locator("[data-draft-global-settings]");
    const dialog = page.locator("#draft-global-dialog");
    await page.locator("[data-draft-global-trigger]").click();
    await page
      .getByRole("dialog", { name: "Listing settings", exact: true })
      .waitFor();
    assert.ok(
      (await dialog.evaluate((el) => el.getAnimations().length)) > 0,
      "Settings animates on opening",
    );
    assert.equal(
      await page
        .locator('[data-settings-scope="global"] [data-draft-select="tone"]')
        .count(),
      1,
    );
    assert.equal(
      await page
        .locator(
          '[data-settings-scope="global"] .draft-choice:nth-of-type(2) label svg',
        )
        .count(),
      2,
    );
    assert.equal(
      await page
        .locator('[data-settings-scope="global"] .draft-switch > span > svg')
        .count(),
      3,
    );
    assert.ok(
      (await page
        .locator('[data-settings-scope="global"] .draft-note-meta small')
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) <= 12,
    );
    const tone = global.locator('[data-draft-select="tone"]');
    await tone.locator("[data-draft-select-trigger]").click();
    await screenshots("tone-options");
    await tone.getByRole("option", { name: "Friendly", exact: true }).click();
    assert.equal(
      await global.locator('[data-draft-global="tone"]').inputValue(),
      "friendly",
    );
    await screenshots("new-settings");
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      assert.equal(
        await dialog.locator(".draft-close").evaluate((el) => {
          const box = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(
              box.x + box.width / 2,
              box.y + box.height / 2,
            ),
          );
        }),
        true,
        "Close button stays visible and unobstructed above the dialog header",
      );
    }
    const structure = await dialog.evaluate((el) => {
      const header = el
        .querySelector(".draft-dialog-header")
        .getBoundingClientRect();
      const body = el
        .querySelector(".draft-settings-content")
        .getBoundingClientRect();
      const footer = el
        .querySelector(".draft-dialog-footer")
        .getBoundingClientRect();
      return header.bottom <= body.top + 1 && body.bottom <= footer.top + 1;
    });
    assert.equal(
      structure,
      true,
      "Header, scrolling form and footer have separate bounds",
    );
    await click("save-global-defaults");
    await global.locator("[data-draft-global-save-status]:visible").waitFor();
    assert.equal(
      JSON.parse(
        await page.evaluate(() =>
          localStorage.getItem(
            "autolister:listing-defaults:123e4567-e89b-42d3-a456-426614174000",
          ),
        ),
      ).tone,
      "friendly",
    );
    const retainedDuringExit = await global.evaluate((el) => {
      el.querySelector(".draft-close").click();
      return (
        el.open &&
        el.querySelector(".draft-popover-panel").getAnimations().length > 0
      );
    });
    assert.equal(
      retainedDuringExit,
      true,
      "Settings remains visible through its exit animation",
    );
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .locator("[data-draft-global-trigger]")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    const account = page.locator('[data-mobile-web="profile-menu"]');
    assert.ok(
      (await account.evaluate((el) => el.getAnimations().length)) > 0,
      "Account animates on opening",
    );
    assert.equal(
      await page
        .locator('[data-mobile-web="usage-credits-value"]')
        .textContent(),
      "17",
    );
    await screenshots("account-extra-credits");
    assert.equal(
      await page
        .locator('[data-mobile-web="usage-daily-value"]')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      true,
      "Usage counters fit without wrapping",
    );
    assert.ok(
      await page.locator(".mobile-extra-credits").evaluate((el) => {
        const label = el
          .querySelector(".mobile-usage-label")
          .getBoundingClientRect();
        const value = el.querySelector("strong").getBoundingClientRect();
        return value.left - label.right < 16;
      }),
      "Credit count stays beside its label",
    );
    assert.equal(
      await account.evaluate((el) => {
        el.querySelector('[data-mobile-web="close-account"]').click();
        return !el.hidden && el.getAnimations().length > 0;
      }),
      true,
    );
    await account.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .locator('[data-mobile-web="profile-menu-trigger"]')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await click("bulk");
    await page.locator("[data-draft-bulk-entry]:visible").waitFor();
    await page
      .locator('[data-phone-upload="batch"] [data-phone-qr] img')
      .waitFor();
    for (const width of [360, 390, 768, 1440]) {
      await screenshot("batch-entry", width);
      const batchBounds = await boundsFor("batch");
      for (const index of [0, 1, 2, 3]) {
        assert.equal(
          batchBounds[index][1],
          entryBounds[width][index][1],
          "Single and batch share vertical control positions",
        );
        if (index !== 1)
          assert.equal(
            batchBounds[index][0],
            entryBounds[width][index][0],
            "Single and batch share horizontal control positions",
          );
      }
    }
    phoneComplete = true;
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-pool] .draft-photo:not(.draft-upload)",
        ).length === 2,
    );
    assert.equal(
      drafts.length,
      3,
      "Phone batch photos remain ungrouped until the user creates an item",
    );
    await page
      .locator("[data-draft-pool] [data-draft-photo-id]")
      .first()
      .check();
    await click("group");
    await page
      .locator("[data-draft-created-groups] .draft-group-row")
      .waitFor();
    await page
      .locator(".draft-group-remove")
      .filter({ visible: true })
      .last()
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-pool] .draft-photo:not(.draft-upload)",
        ).length === 2,
    );
    assert.equal(
      drafts.length,
      3,
      "Removing an ungenerated item returns all photos and leaves no empty draft",
    );
    await page
      .locator("[data-draft-pool] [data-draft-photo-id]")
      .first()
      .check();
    await page
      .locator("[data-draft-pool] [data-draft-photo-id]")
      .last()
      .check();
    await click("group");
    await page
      .locator("[data-draft-created-groups] .draft-group-row")
      .waitFor();
    assert.equal(
      await page.locator("[data-draft-import] > .draft-mode").isVisible(),
      false,
    );
    await click("generate-groups");
    await page.waitForFunction(() =>
      document
        .querySelector("[data-draft-created-groups]")
        .textContent.includes("Ready to copy"),
    );
    await screenshots("batch-generated");
    await click("close-import");
    await addNew.click();
    phoneOpenFailure = true;
    await page
      .getByRole("button", { name: "One item", exact: true })
      .filter({ visible: true })
      .click();
    const phone = page.locator('[data-phone-upload="single"]');
    await phone.locator("[data-phone-retry]:visible").waitFor();
    await screenshot("phone-connection-error", 1440);
    await phone.locator("[data-phone-retry]").click();
    await phone.locator("[data-phone-qr] img").waitFor();
    phoneExpired = true;
    await page.waitForFunction(() =>
      document
        .querySelector('[data-phone-upload="single"] [data-phone-status]')
        .textContent.includes("expired"),
    );
    await phone.locator("[data-phone-retry]").click();
    await phone.locator("[data-phone-qr] img").waitFor();
    await phone.locator("[data-phone-copy]").click();
    const handoff = await page.evaluate(() => navigator.clipboard.readText());
    const handoffUrl = new URL(handoff);
    assert.equal(handoffUrl.pathname, "/phone-upload/");
    assert.equal(handoffUrl.searchParams.get("v"), "2");
    assert.equal(
      [...handoffUrl.searchParams.keys()].length,
      2,
      "QR link has only session and protocol version",
    );
    phoneComplete = true;
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-item-photos] .draft-photo:not(.draft-upload)",
        ).length === 2,
    );
    await click("generate");
    await page.locator("[data-draft-copy-fields]:visible").waitFor();
    assert.equal(
      drafts[0].settings.tone,
      "friendly",
      "New item receives saved global defaults",
    );
    await screenshots("phone-item-review");
    assert.equal(await page.locator(".draft-entry-mode").isVisible(), false);
    assert.equal(
      await page.locator("[data-draft-editor-settings] summary").isVisible(),
      false,
    );
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await page.locator("[data-draft-global-trigger]").click();
      await page.waitForFunction(() => {
        const el = document.querySelector("#draft-item-dialog");
        return (
          el.getAttribute("aria-modal") === "true" &&
          el.getAnimations().length === 0
        );
      });
      const before = await page.locator("#draft-item-dialog").boundingBox();
      const transition = await page
        .locator('#draft-item-dialog [data-draft-action="settings-defaults"]')
        .evaluate((el) => {
          el.click();
          const panel = document.querySelector("#draft-global-dialog");
          return {
            modals: document.querySelectorAll(
              '.draft-settings .draft-popover-panel[aria-modal="true"]',
            ).length,
            backdrops: document.querySelectorAll(".mobile-sheet-backdrop")
              .length,
            motion: panel.getAnimations().length,
            opacity: getComputedStyle(panel).opacity,
            overflow: document.body.style.overflow,
          };
        });
      assert.deepEqual(
        transition,
        {
          modals: 1,
          backdrops: 1,
          motion: 0,
          opacity: "1",
          overflow: "hidden",
        },
        "Scope changes retain a fully visible modal without reopening animation",
      );
      assert.deepEqual(
        await page.locator("#draft-global-dialog").boundingBox(),
        before,
        "Scope change retains frame geometry",
      );
      await page
        .locator('#draft-global-dialog [data-draft-action="settings-item"]')
        .click();
      assert.deepEqual(
        await page.locator("#draft-item-dialog").boundingBox(),
        before,
      );
      await screenshot("item-header-settings", width);
      await page.keyboard.press("Escape");
      await page.locator("#draft-item-dialog").waitFor({ state: "hidden" });
    }
    await page.locator("[data-draft-global-trigger]").click();
    await settleAnimations();
    await page.locator("#draft-item-dialog").evaluate((panel) => {
      panel.querySelector(".draft-close").click();
      panel.querySelector('[data-draft-action="settings-defaults"]').click();
    });
    await settleAnimations();
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.locator(".mobile-sheet-backdrop").count(), 1);
    assert.equal(
      await dialog.getAttribute("aria-modal"),
      "true",
      "An interrupted close cannot clean up the newly active settings scope",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("[data-draft-global-trigger]").click();
    await page
      .locator('#draft-item-dialog [data-draft-action="settings-defaults"]')
      .click();
    await page
      .getByRole("dialog", { name: "Listing settings", exact: true })
      .waitFor();
    assert.equal(
      await dialog.evaluate((el) => el.getAnimations().length),
      0,
      "Reduced motion disables dialog motion",
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await click("back");
    await click("new");
    await click("write");
    await page.locator("[data-draft-editor].is-manual:visible").waitFor();
    assert.equal(await page.locator(".draft-entry-mode").isVisible(), false);
    const manualBounds = async () =>
      page
        .locator("[data-draft-editor], .draft-text-panel, #draft-title")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width };
          }),
        );
    const manualPositions = new Map();
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await settleAnimations();
      manualPositions.set(width, await manualBounds());
    }
    await page.locator("#draft-title").fill("Vintage linen waistcoat");
    await page
      .locator("#draft-description")
      .fill("Cream linen waistcoat. See photos for condition.");
    await page
      .locator('[data-draft-save-status][data-status="saved"]')
      .waitFor();
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await settleAnimations();
      assert.deepEqual(
        await manualBounds(),
        manualPositions.get(width),
        "Manual writing retains geometry after typing and autosave",
      );
      await screenshot("manual-writing", width);
    }
    await page.reload();
    await page.locator("[data-draft-editor].is-manual:visible").waitFor();
    assert.equal(
      await page.locator("#draft-title").inputValue(),
      "Vintage linen waistcoat",
    );
    await screenshots("manual-review");
    await click("back");
    await click("selection");
    const cards = page.locator(".draft-item-open");
    await cards.first().click();
    assert.equal(
      await page.locator(".draft-item > input").first().isChecked(),
      true,
      "Clicking the whole card selects in Select mode",
    );
    assert.equal(
      await page.locator('[data-draft-action="generate-selected"]').isVisible(),
      false,
      "A photo-free selection shows deletion without an unusable generation action",
    );
    assert.equal(await page.locator("[data-draft-editor]").isVisible(), false);
    await cards.first().click();
    assert.equal(
      await page.locator(".draft-item > input").first().isChecked(),
      false,
    );
    await cards.first().click();
    await cards.nth(1).click();
    await screenshots("library-selected");
    const countBeforeDelete = drafts.length;
    await click("delete-selected");
    await page.locator("[data-draft-delete-dialog][open]").waitFor();
    await page
      .locator('[data-draft-delete-dialog] button[value="cancel"]')
      .click();
    assert.equal(
      drafts.length,
      countBeforeDelete,
      "Canceling bulk deletion keeps every item",
    );
    await click("delete-selected");
    await page
      .locator('[data-draft-delete-dialog] button[value="confirm"]')
      .click();
    await page.waitForFunction(
      () => !document.querySelector("[data-draft-selected-count]").textContent,
    );
    assert.equal(
      drafts.length,
      countBeforeDelete - 2,
      "Confirmed bulk deletion removes exactly the selection",
    );
    await click("selection");
    for (const request of phoneRequests.filter(
      (value) => value.action === "open",
    )) {
      assert.ok(
        request.headers.authorization,
        "Opening a QR session requires owner authentication",
      );
      assert.equal(
        request.headers["x-autolister-client"],
        undefined,
        "Reuse anonymous phone capability without account credentials",
      );
    }
    assert.deepEqual(errors, []);
    await writeFile(
      `${output}/entry-polish-result.json`,
      JSON.stringify(
        {
          passed: true,
          widths: [360, 390, 768, 1440],
          phoneRequests: phoneRequests.length,
          extraCredits: 17,
          generatedSettings,
        },
        null,
        2,
      ),
    );
    console.log("Entry polish regression passed");
    return;
  }
  if (name === "presentation-polish") {
    const headerSettings = page.locator("[data-draft-global-trigger]");
    assert.equal(
      await headerSettings.count(),
      1,
      "Global settings belongs in the header",
    );
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 760 });
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).scrollbarGutter,
        ),
        "stable",
        "The page reserves scrollbar width across short, long and modal states",
      );
      assert.equal(
        await headerSettings.evaluate((el) => !!el.closest("header")),
        true,
      );
      const captionPadding = await page
        .locator(".draft-item-open > span:last-child")
        .first()
        .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
      assert.ok(
        captionPadding >= 12,
        "Card captions retain horizontal padding",
      );
      const firstCard = page.locator(".draft-item-open").first();
      await settleAnimations();
      const documentBounds = (el) => {
        const box = el.getBoundingClientRect();
        return [box.x + scrollX, box.y + scrollY, box.width, box.height].map(
          Math.round,
        );
      };
      const cardBounds = await firstCard.evaluate(documentBounds);
      await firstCard.hover();
      assert.deepEqual(
        await firstCard.evaluate(documentBounds),
        cardBounds,
        "Hover leaves card geometry stable",
      );
      assert.equal(
        await firstCard
          .locator(":scope > span:last-child")
          .evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft)),
        captionPadding,
        "Hover retains caption padding",
      );
      if (width === 1440)
        await page.screenshot({
          path: `${output}/polished-card-hover-1440.png`,
          animations: "disabled",
        });
      await screenshot("polished-library", width);
      const libraryGrid = await page
        .locator("[data-draft-items]")
        .boundingBox();
      await click("selection");
      assert.deepEqual(
        await page.locator("[data-draft-items]").boundingBox(),
        libraryGrid,
        "Selection toolbar does not move library cards",
      );
      await click("selection");
      const toolbar = page.locator(".draft-library-toolbar");
      const toolbarBefore = await toolbar.boundingBox();
      const addBefore = await page
        .getByRole("button", { name: "Add new", exact: true })
        .boundingBox();
      await page.locator('[data-draft-tab="done"]').click();
      await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
      assert.deepEqual(
        await toolbar.boundingBox(),
        toolbarBefore,
        "Drafts and Listed retain toolbar geometry",
      );
      assert.deepEqual(
        await page
          .getByRole("button", { name: "Add new", exact: true })
          .boundingBox(),
        addBefore,
        "Add item retains its position between tabs",
      );
      await page.locator('[data-draft-tab="draft"]').click();
      await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    }
    await headerSettings.click();
    await page
      .locator('[data-draft-global-settings] [aria-modal="true"]')
      .waitFor();
    const language = page
      .locator('[data-settings-scope="global"] [data-draft-language]')
      .first();
    await language.locator("[data-draft-language-trigger]").click();
    await language
      .getByRole("option", { name: "Français", exact: true })
      .click();
    assert.equal(
      await page
        .locator('[data-draft-global="titleLanguageCode"]')
        .inputValue(),
      "fr",
    );
    assert.equal(
      await language
        .locator("[data-draft-language-flag]")
        .evaluate((el) => el.complete && el.naturalWidth > 0),
      true,
    );
    await language.locator("[data-draft-language-trigger]").click();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator('[data-draft-global="titleLanguageCode"]')
        .inputValue(),
      "cz",
    );
    await screenshots("polished-language-settings");
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      await language.locator("[data-draft-language-trigger]").click();
      await screenshot("polished-language-menu", width);
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator("[data-draft-global-settings]").getAttribute("open"),
        "",
        "Escape closes language options before closing settings",
      );
    }
    await page.keyboard.press("Escape");
    await page.locator("#draft-global-dialog").waitFor({ state: "hidden" });
    assert.equal(
      await headerSettings.evaluate((el) => el === document.activeElement),
      true,
    );
    await click("bulk");
    await page
      .locator('[data-draft-input="bulk"]')
      .setInputFiles(
        Array.from({ length: 12 }, (_, i) => file(`group-photo-${i}`)),
      );
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-photo-id]:not(:disabled)")
          .length === 12,
    );
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => {
        const el = document.querySelector(".draft-group-generation");
        return el && getComputedStyle(el).display !== "none";
      });
      await page.evaluate(() => scrollTo(0, 0));
      await settleAnimations();
      const gridBefore = await page.locator("[data-draft-pool]").boundingBox();
      await page.locator("[data-draft-photo-id]").first().check();
      const gridAfter = await page.locator("[data-draft-pool]").boundingBox();
      assert.deepEqual(
        gridAfter,
        gridBefore,
        "Selection leaves the grid geometry stable",
      );
      const cta = page.locator('[data-draft-action="group"]');
      assert.equal(await cta.innerText(), "Create item");
      const bounds = await cta.boundingBox();
      assert.ok(
        bounds.y >= 0 && bounds.y + bounds.height <= 700,
        "Create item stays above the fold",
      );
      await page.screenshot({
        path: `${output}/polished-grouping-${width}.png`,
        animations: "disabled",
      });
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      const scrolled = await cta.boundingBox();
      assert.ok(
        scrolled.y >= 0 && scrolled.y + scrolled.height <= 700,
        "Create item stays visible after scrolling",
      );
      await page.locator("[data-draft-photo-id]").first().uncheck();
    }
    await page.locator("[data-draft-photo-id]").first().check();
    const poolWidth = (await page.locator("[data-draft-pool]").boundingBox())
      .width;
    await click("group");
    await page
      .locator("[data-draft-created-groups] .draft-group-row")
      .first()
      .waitFor();
    assert.equal(
      (await page.locator("[data-draft-pool]").boundingBox()).width,
      poolWidth,
      "Creating the first item retains the photo column width",
    );
    assert.equal(
      drafts[0].description,
      "",
      "Create item groups photos without generating text",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await headerSettings.evaluate(
        (el) => getComputedStyle(el).transitionDuration,
      ),
      "0s",
    );
    assert.deepEqual(errors, []);
    await writeFile(
      `${output}/presentation-polish-result.json`,
      JSON.stringify(
        {
          passed: true,
          widths: [360, 390, 768, 1440],
          checks: [
            "header settings",
            "stable page scrollbar and Drafts/Listed toolbar",
            "stable library selection",
            "caption padding",
            "stable card hover and caption padding",
            "rendered flags and keyboard language selection",
            "stable photo selection",
            "stable photo width after first group",
            "fixed Create item action",
            "grouping before generation",
            "reduced motion",
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log("Presentation polish regression passed");
    return;
  }
  if (name === "settings-layout") {
    const positions = () =>
      page
        .locator(".draft-tabs, [data-draft-library-actions]")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width };
          }),
        );
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-draft-tab="draft"]').click();
      await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
      const before = await positions();
      assert.ok(await page.locator("[data-draft-global-trigger]").isVisible());
      await page.screenshot({ path: `${output}/toolbar-drafts-${width}.png` });
      await page.locator('[data-draft-tab="done"]').click();
      await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
      assert.deepEqual(
        await positions(),
        before,
        `Toolbar stays fixed when switching tabs at ${width}`,
      );
      assert.ok(await page.locator("[data-draft-global-trigger]").isVisible());
      await page.screenshot({ path: `${output}/toolbar-listed-${width}.png` });
    }
    await page.locator('[data-draft-tab="draft"]').click();
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    await click("new");
    await page.locator("[data-draft-global-trigger]").click();
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 700 });
      await settleAnimations();
      const geometry = await page
        .locator("[data-draft-global-settings] .draft-popover-panel")
        .evaluate((el) => {
          const panel = el.getBoundingClientRect();
          const body = el
            .querySelector(".draft-settings-content")
            .getBoundingClientRect();
          return {
            top: panel.top,
            bottom: panel.bottom,
            height: body.height,
            viewport: innerHeight,
          };
        });
      assert.ok(
        geometry.top >= 15 &&
          geometry.bottom <= geometry.viewport - 15 &&
          geometry.height >= 300,
        `Settings have usable viewport space at ${width}: ${JSON.stringify(geometry)}`,
      );
      await page.screenshot({
        path: `${output}/empty-settings-short-${width}.png`,
      });
      await screenshot("empty-settings", width);
    }
    await page.keyboard.press("Escape");
    const global = page.locator("[data-draft-global-trigger]");
    await global.click();
    await page
      .locator(
        '[data-draft-global-settings] .draft-popover-panel[aria-modal="true"]',
      )
      .waitFor();
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator('[data-draft-action="save-global-defaults"]')
        .evaluate((el) => el === document.activeElement),
      true,
      "Desktop dialog traps backward focus",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator("[data-draft-global-settings] [data-draft-close]")
        .evaluate((el) => el === document.activeElement),
      true,
      "Desktop dialog traps forward focus",
    );
    await page
      .locator('[data-draft-global="descriptionLength"][value="short"]')
      .check();
    await page
      .locator('[data-draft-global="tone"]')
      .selectOption("friendly", { force: true });
    await page.locator('[data-draft-global="useHashtags"]').check();
    await page
      .locator('[data-draft-global="descriptionFooterText"]')
      .fill("Smoke-free home.");
    await page.locator('[data-draft-global="includeSellerNote"]').check();
    await click("save-global-defaults");
    await page.locator("[data-draft-global-save-status]:visible").waitFor();
    await screenshots("global-settings");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .locator('[data-draft-global="descriptionFooterText"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/global-settings-note-390.png` });
    await page.setViewportSize({ width: 720, height: 500 });
    assert.equal(
      await page
        .locator('[data-draft-action="save-global-defaults"]')
        .isVisible(),
      true,
    );
    const compactPanel = await page
      .locator("[data-draft-global-settings] .draft-popover-panel")
      .boundingBox();
    assert.ok(
      compactPanel.y >= 0 && compactPanel.y + compactPanel.height <= 500,
      "Settings fit the effective viewport at 200% browser zoom",
    );
    await page.screenshot({
      path: `${output}/global-settings-effective-zoom-200.png`,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.keyboard.press("Escape");
    await page.locator("#draft-global-dialog").waitFor({ state: "hidden" });
    assert.equal(
      await global.evaluate((el) => el === document.activeElement),
      true,
      "Escape restores the global settings trigger",
    );
    await page.reload();
    await page.locator("[data-draft-global-trigger]").click();
    assert.equal(
      await page
        .locator('[data-draft-global="descriptionLength"][value="short"]')
        .isChecked(),
      true,
      "Global defaults apply to the empty composer after reload",
    );
    await page.keyboard.press("Escape");
    await click("back");
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-editor]").waitFor({ state: "visible" });
    const layout = () =>
      page
        .locator(".draft-preparation, .draft-text-panel")
        .evaluateAll((elements) =>
          elements.map((el) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, width: r.width };
          }),
        );
    const closed = await layout();
    await page.locator("[data-draft-global-trigger]").click();
    assert.deepEqual(
      await layout(),
      closed,
      "Opening item settings does not reflow the review",
    );
    assert.equal(
      await page
        .locator('[data-draft-field="descriptionLength"][value="long"]')
        .isChecked(),
      true,
      "Existing item settings are preserved",
    );
    await page.keyboard.press("Escape");
    await global.click();
    await page
      .locator('#draft-item-dialog [data-draft-action="settings-defaults"]')
      .click();
    await page
      .locator(
        '[data-draft-global-settings] .draft-popover-panel[aria-modal="true"]',
      )
      .waitFor();
    await page
      .locator('[data-draft-global="descriptionFooterText"]')
      .fill("https://example.test");
    assert.equal(
      await page
        .locator('[data-draft-action="save-global-defaults"]')
        .isDisabled(),
      true,
    );
    await page
      .locator('[data-draft-global="descriptionFooterText"]')
      .fill("Smoke-free home.");
    assert.equal(
      await page
        .locator('[data-draft-action="save-global-defaults"]')
        .isDisabled(),
      false,
    );
    await page.keyboard.press("Escape");
    assert.deepEqual(errors, []);
    await writeFile(
      `${output}/settings-layout-result.json`,
      JSON.stringify(
        {
          passed: true,
          checks: [
            "stable Drafts/Listed toolbar at four widths",
            "usable empty settings dialog at short viewport heights",
            "globally accessible defaults",
            "defaults survive reload",
            "existing item overrides preserved",
            "stable review geometry",
            "global note validation",
            "desktop modal focus wrapping and Escape restoration",
            "global note reachable by internal scrolling on mobile",
            "effective viewport at 200% zoom",
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log("Settings layout regression passed");
    return;
  }
  if (name === "visual-reference") {
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-global-trigger]").click();
    await screenshots("reference-review");
    assert.deepEqual(errors, []);
    console.log("Source reference captures passed");
    return;
  }
  if (name === "full-settings") {
    const originalIds = drafts.map((d) => d.id);
    await page.locator(".draft-item-open").first().click();
    const firstId = originalIds[0];
    await page.locator("[data-draft-global-trigger]").click();
    await page
      .locator('[data-draft-field="titleLanguageCode"]')
      .selectOption("fr", { force: true });
    await page
      .locator('[data-draft-field="descriptionLanguageCode"]')
      .selectOption("nl", { force: true });
    await page
      .locator('[data-draft-field="descriptionLength"][value="short"]')
      .check();
    await page
      .locator('[data-draft-field="useBulletPoints"][value="false"]')
      .check();
    await page
      .locator('[data-draft-field="tone"]')
      .selectOption("enthusiastic", { force: true });
    await page.locator('[data-draft-field="useHashtags"]').check();
    await page.locator('[data-draft-field="useEmojis"]').check();
    await page.locator('[data-draft-field="includeSellerNote"]').check();
    await page
      .locator('[data-draft-field="descriptionFooterText"]')
      .fill("Smoke-free home. Happy to bundle items.");
    await click("save-defaults");
    await page.locator("[data-draft-default-save-status]:visible").waitFor();
    await screenshots("studio-full-settings");
    await page
      .locator("[data-draft-editor-settings] .draft-settings-done")
      .click();
    await click("back");
    const expected = {
      titleLanguageCode: "fr",
      descriptionLanguageCode: "nl",
      descriptionLength: "short",
      useBulletPoints: false,
      tone: "enthusiastic",
      useHashtags: true,
      useEmojis: true,
      includeSellerNote: true,
      descriptionFooterText: "Smoke-free home. Happy to bundle items.",
    };
    assert.deepEqual(drafts.find((d) => d.id === firstId).settings, expected);
    assert.equal(
      drafts.find((d) => d.id === firstId).description,
      "Saved description",
      "Settings don't replace existing text",
    );
    await click("new");
    await page.locator("[data-draft-global-trigger]").click();
    assert.equal(
      await page.locator('[data-draft-global="tone"]').inputValue(),
      "enthusiastic",
      "New items use saved defaults immediately",
    );
    await page.locator('[data-draft-global="includeSellerNote"]').uncheck();
    await click("save-global-defaults");
    await page.locator("[data-draft-global-settings] .draft-close").click();
    await page.locator("#draft-global-dialog").waitFor({ state: "hidden" });
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles([file("studio-front"), file("studio-detail")]);
    await page.waitForFunction(() => {
      const generate = document.querySelector('[data-draft-action="generate"]');
      return generate.getClientRects().length > 0 && !generate.disabled;
    });
    const singleId = drafts[0].id;
    await screenshots("studio-single-ready");
    await click("generate");
    await page.locator("#draft-description:visible").waitFor();
    assert.deepEqual(generatedSettings.at(-1), {
      id: singleId,
      settings: { ...expected, includeSellerNote: false },
    });
    await page.reload();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.locator("[data-draft-global-trigger]").click();
    assert.equal(
      await page
        .locator('[data-draft-field="descriptionFooterText"]')
        .inputValue(),
      expected.descriptionFooterText,
      "Excluded note survives reload",
    );
    assert.equal(
      await page.locator('[data-draft-field="includeSellerNote"]').isChecked(),
      false,
    );
    await screenshots("studio-review");
    await page
      .locator('[data-draft-field="descriptionFooterText"]')
      .fill("Contact me at https://example.test");
    await page
      .locator(
        "[data-settings-scope='item'] [data-draft-settings-error]:visible",
      )
      .waitFor();
    assert.equal(
      await page.locator('[data-draft-action="regenerate"]').isDisabled(),
      true,
      "Invalid notes block generation",
    );
    await screenshots("studio-note-invalid");
    assert.equal(
      await page
        .locator("[data-draft-editor-settings] .draft-settings-done")
        .isDisabled(),
      true,
    );
    const noteErrorVisible = await page
      .locator("[data-settings-scope='item'] [data-draft-settings-error]")
      .evaluate((el) => {
        const error = el.getBoundingClientRect();
        const body = el
          .closest(".draft-settings-content")
          .getBoundingClientRect();
        return error.top >= body.top && error.bottom <= body.bottom;
      });
    assert.equal(
      noteErrorVisible,
      true,
      "Note error stays inside the visible settings body",
    );
    await page
      .locator('[data-draft-field="descriptionFooterText"]')
      .fill(expected.descriptionFooterText);
    assert.equal(
      await page.locator('[data-draft-action="regenerate"]').isDisabled(),
      false,
      "A corrected note becomes usable again",
    );
    await page
      .locator("[data-draft-editor-settings] .draft-settings-done")
      .click();
    await click("back");
    for (const id of originalIds.slice(1)) {
      const d = drafts.find((d) => d.id === id);
      d.title = "";
      d.description = "";
    }
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await page.reload();
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    await click("bulk");
    await page.locator(".draft-group-settings").nth(1).click();
    await page
      .locator("[data-draft-editor-settings] .draft-popover-panel")
      .waitFor({ state: "visible" });
    assert.equal(
      await page.locator("[data-draft-editor]").isVisible(),
      false,
      "Item settings do not enter the item from grouping",
    );
    const groupingPosition = await page
      .locator("[data-draft-groups]")
      .boundingBox();
    await page
      .locator('[data-draft-field="tone"]')
      .selectOption("friendly", { force: true });
    await page
      .locator("[data-draft-editor-settings] .draft-settings-done")
      .click();
    await page.locator("#draft-item-dialog").waitFor({ state: "hidden" });
    assert.deepEqual(
      await page.locator("[data-draft-groups]").boundingBox(),
      groupingPosition,
      "Saving item options preserves batch position",
    );
    await page.locator("[data-draft-global-trigger]").click();
    saveFailure = true;
    await page
      .locator('[data-draft-default="descriptionLength"][value="short"]')
      .check();
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[data-draft-default="descriptionLength"][value="long"]',
        ).checked,
    );
    assert.equal(
      drafts.find((d) => d.id === originalIds[2]).settings.descriptionLength,
      "long",
      "A failed batch update keeps the previous defaults",
    );
    await screenshots("studio-batch-settings-error");
    assert.match(
      await page.locator("[data-draft-batch-save-status]").innerText(),
      /Not saved/,
    );
    saveFailure = false;
    await page
      .locator('[data-draft-default="descriptionLength"][value="short"]')
      .check();
    await page.waitForFunction(
      () => !document.querySelector('[data-draft-default="tone"]').disabled,
    );
    await page.locator('[data-draft-default="useHashtags"]').check();
    await page.waitForFunction(
      () => !document.querySelector('[data-draft-default="tone"]').disabled,
    );
    await page.locator(".draft-batch-settings .draft-settings-done").click();
    assert.equal(
      drafts.find((d) => d.id === originalIds[1]).settings.tone,
      "friendly",
      "Custom choices survive batch updates",
    );
    assert.equal(
      drafts.find((d) => d.id === originalIds[1]).settings.descriptionLength,
      "long",
    );
    assert.equal(
      drafts.find((d) => d.id === originalIds[2]).settings.descriptionLength,
      "short",
      "Inheriting items receive batch updates",
    );
    assert.equal(
      drafts.find((d) => d.id === originalIds[2]).settings.useHashtags,
      true,
    );
    await screenshots("studio-batch-ready");
    const batchGeometry = new Map();
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      batchGeometry.set(
        width,
        await page.locator("[data-draft-groups]").boundingBox(),
      );
    }
    holdGeneration = true;
    await click("generate-groups");
    await waitForFixture(() => releaseGeneration);
    await screenshots("studio-batch-running");
    for (const width of [360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      assert.deepEqual(
        await page.locator("[data-draft-groups]").boundingBox(),
        batchGeometry.get(width),
        "Batch progress retains the item panel geometry",
      );
    }
    await click("pause");
    holdGeneration = false;
    releaseGeneration();
    await page.locator('[data-draft-action="resume"]:visible').waitFor();
    await screenshots("studio-batch-paused");
    await click("resume");
    await waitForFixture(() => generatedSettings.length === 3);
    assert.equal(generatedSettings[1].settings.tone, "friendly");
    assert.equal(generatedSettings[2].settings.descriptionLength, "short");
    await page.waitForFunction(
      () =>
        document.querySelector('[data-draft-action="generate-groups"]').hidden,
    );
    await screenshots("studio-batch-complete");
    planTier = "basic";
    await page.reload();
    await page.locator(".draft-group-card").first().click();
    await page.locator("[data-draft-global-trigger]").click();
    await page
      .locator(
        "[data-settings-scope='item'] [data-draft-settings-access]:visible",
      )
      .waitFor();
    assert.equal(
      await page
        .locator('[data-draft-field="tone"] option[value="friendly"]')
        .evaluate((el) => el.disabled),
      true,
    );
    await page.locator('[data-draft-field="useEmojis"]').uncheck();
    await page.locator('[data-draft-field="includeSellerNote"]').uncheck();
    assert.equal(
      await page.locator('[data-draft-field="useEmojis"]').isDisabled(),
      true,
    );
    await screenshots("studio-plan-access");
    await writeFile(
      `${output}/full-settings-result.json`,
      JSON.stringify(
        {
          passed: true,
          generatedSettings,
          viewports: [360, 390, 768, 1440],
          checks: [
            "all writing options persisted",
            "separate languages",
            "defaults apply immediately",
            "excluded note survives reload",
            "existing text retained",
            "batch inheritance preserves custom settings",
            "sequential mixed settings generation",
            "pause and resume",
            "invalid seller note blocks generation",
            "plan access keeps saved options and permits turning them off",
            "batch settings save failure can be retried without losing custom choices",
            "overflow and menu positioning",
          ],
          errors,
        },
        null,
        2,
      ),
    );
  } else if (name === "ui-redesign") {
    await click("new");
    assert.equal(
      await page.locator('label:has([data-draft-input="item"])').isVisible(),
      false,
      "Empty entry has one gallery picker",
    );
    await click("back");
    await click("bulk");
    assert.equal(
      await page.locator("[data-draft-grouping-complete]").isVisible(),
      true,
      "Exhausted pool has a completion state",
    );
    assert.equal(
      await page.locator('[data-draft-action="generate-groups"]').isVisible(),
      false,
      "Completed drafts do not show an unusable generation button",
    );
    await page.locator(".draft-group-card").first().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.match(
      await page.locator('[data-draft-action="back"]').innerText(),
      /Back to grouping/,
    );
    await page.locator("#draft-title").fill("A saved seller title");
    await page.locator("#draft-description").focus();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").dataset.status ===
        "saved",
    );
    assert.equal(
      await page.locator("[data-draft-save-status]").isVisible(),
      true,
      "Acknowledged save status stays visible while editing",
    );
    await screenshots("redesign-review");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-draft-global-trigger]").click();
    const settingsPanel = page.locator(
      "[data-draft-editor-settings] .draft-popover-panel",
    );
    await page
      .locator(
        '[data-draft-editor-settings] .draft-popover-panel[aria-modal="true"]',
      )
      .waitFor();
    assert.equal(await settingsPanel.getAttribute("aria-modal"), "true");
    assert.equal(
      await page
        .locator(".draft-preparation")
        .evaluate((el) => Boolean(el.closest("[inert]"))),
      true,
      "Sheet makes the background inert",
    );
    await page.keyboard.press("Shift+Tab");
    assert.equal(
      await page
        .locator("[data-draft-editor-settings] .draft-settings-done")
        .evaluate((el) => el === document.activeElement),
      true,
      "Shift-Tab wraps within the sheet",
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await settingsPanel
        .locator(".draft-close")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await screenshots("redesign-settings");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await settingsPanel.waitFor({ state: "hidden" });
    assert.equal(
      await page.locator(".draft-preparation").evaluate((el) => el.inert),
      false,
    );
    assert.equal(await page.locator(".mobile-sheet-backdrop").count(), 0);
    await page.locator("[data-draft-item-photos] summary").first().click();
    await page.locator(".is-mobile-sheet").waitFor();
    const photoPanel = page.locator(".is-mobile-sheet");
    assert.equal(
      await photoPanel.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(rect.x + 24, rect.y + 24));
      }),
      true,
      "Photo sheet is above its backdrop",
    );
    await screenshots("redesign-photo-options");
    await page.keyboard.press("Escape");
    await page
      .locator("[data-draft-item-photos] .draft-photo-options[open]")
      .waitFor({ state: "hidden" });
    await page
      .locator("#draft-title")
      .fill(
        "Black wrap dress with a waist tie and a detailed condition description",
      );
    await page
      .locator("#draft-description")
      .fill(
        Array.from(
          { length: 24 },
          (_, i) =>
            `Detail ${i + 1}: Black fabric, wrap front and gathered sleeves visible in the original photos.`,
        ).join("\n\n"),
      );
    await page.locator("#draft-title").focus();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-draft-save-status]").dataset.status ===
        "saved",
    );
    await screenshots("redesign-long-content");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(
      await page
        .locator('[data-draft-action="copy-title"]')
        .evaluate((el) => getComputedStyle(el).transitionDuration),
      "0s",
    );
    await page.locator('[data-draft-action="copy-title"]').focus();
    assert.equal(
      await page
        .locator('[data-draft-action="copy-title"]')
        .evaluate((el) => getComputedStyle(el).outlineStyle),
      "solid",
    );
    await screenshot("redesign-keyboard-reduced-motion", 390);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await click("back");
    await page.locator("[data-draft-grouping-complete]:visible").waitFor();
    await screenshots("redesign-grouping-complete");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-mobile-web="profile-menu-trigger"]').click();
    await page
      .locator('[data-mobile-web="profile-menu"][aria-modal="true"]')
      .waitFor();
    assert.equal(
      await page.locator(".mobile-workspace-main").evaluate((el) => el.inert),
      true,
    );
    await screenshots("redesign-account");
    await page.keyboard.press("Escape");
    assert.equal(
      await page.locator(".mobile-workspace-main").evaluate((el) => el.inert),
      false,
    );
    await click("close-import");
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-draft-item-photos] summary").first().click();
    await page.locator(".is-mobile-sheet").waitFor();
    await page.getByRole("button", { name: "Ungroup", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(
          "[data-draft-item-photos] .draft-photo-options",
        ).length === 0,
    );
    assert.equal(
      await page.locator(".mobile-sheet-backdrop").count(),
      0,
      "Removing a photo releases its sheet",
    );
    assert.equal(
      await page.locator(".mobile-workspace-main").evaluate((el) => el.inert),
      false,
    );
    await writeFile(
      `${output}/redesign-result.json`,
      JSON.stringify(
        {
          passed: true,
          viewports: [360, 390, 768, 1440],
          checks: [
            "single empty entry picker",
            "grouping completion",
            "eligible generation action visibility",
            "contextual back label",
            "visible save acknowledgement",
            "mobile dialog semantics and inert background",
            "sheet Tab and Shift-Tab containment",
            "Escape cleanup and focus restoration",
            "photo sheet stacking",
            "account sheet cleanup",
            "long editable content",
            "visible keyboard focus",
            "reduced motion",
            "photo correction releases the removed mobile sheet",
            "desktop photo popovers stay within the viewport",
            "horizontal overflow",
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  } else if (name === "pages") {
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
    await click("selection");
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
    await waitForFixture(() => releaseList);
    await screenshots("library-loading");
    releaseList();
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
    assert.equal(
      drafts.length,
      0,
      "Opening Drafts must not create a blank item",
    );
    assert.equal(await page.locator("[data-draft-editor]").isVisible(), false);
    await screenshots("home-empty");
    listFailure = true;
    await page.reload();
    await page.locator("[data-draft-retry]:visible").waitFor();
    assert.equal(
      await page.locator(".draft-empty h2").textContent(),
      "Drafts unavailable",
    );
    assert.equal(
      await page.locator(".draft-empty button").count(),
      0,
      "Load failure is not presented as an empty account",
    );
    await screenshots("library-error");
    await click("reload");
    await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
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
    await screenshots("account-error");
    await page.locator('[data-mobile-web="close-account"]').click();
    await click("new");
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.goBack();
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await page.goForward();
    await page.locator("[data-draft-editor]:visible").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    const cameraChooser = page.waitForEvent("filechooser");
    await click("choose-item");
    await cameraChooser;
    assert.equal(
      await page.locator('[data-draft-input="item"]').getAttribute("capture"),
      null,
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
    await screenshots("delete-confirmation");
    await page.locator('[data-draft-delete-dialog] [value="confirm"]').click();
    await page.locator("[data-draft-editor]").waitFor({ state: "hidden" });
    await click("bulk");
    assert.equal(
      await page.locator(".draft-heading h1").textContent(),
      "Add several items",
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
    holdUpload = true;
    await page
      .locator('[data-draft-input="item"]')
      .setInputFiles([file("front", "#7899ba"), file("back", "#7899ba")]);
    await waitForFixture(() => releaseUpload);
    await screenshots("upload-progress");
    holdUpload = false;
    releaseUpload();
    await page
      .getByRole("button", { name: "Retry photo", exact: true })
      .waitFor();
    await screenshots("upload-error");
    await screenshot("upload-recovery", 390);
    assert.equal(
      await page
        .locator(".draft-upload")
        .getByRole("button", { name: "Remove", exact: true })
        .evaluate((el) => {
          const box = el.getBoundingClientRect();
          return (
            document
              .elementFromPoint(box.x + box.width / 2, box.y + box.height - 2)
              ?.closest("button") === el
          );
        }),
      true,
      "Upload recovery is not covered by generation controls",
    );
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
    await screenshots("photo-decode-error");
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
    await screenshots("photo-preparation");
    holdGeneration = true;
    await click("generate");
    await waitForFixture(() => releaseGeneration);
    await screenshots("generation-progress");
    holdGeneration = false;
    releaseGeneration();
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
      false,
    );
    assert.equal(await page.locator("#draft-title").isVisible(), true);
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
      await page.locator("#draft-description").isVisible(),
      true,
      "Reload restores directly editable fields",
    );
    assert.equal(
      await page.locator("#draft-description").inputValue(),
      "My edited description\n\nExact line breaks.",
    );
    for (const width of [360, 390, 768, 1440])
      await screenshot("editor", width);
    const settings = page.locator("[data-draft-global-trigger]");
    await settings.focus();
    await page.keyboard.press("Enter");
    await page.locator("#draft-item-dialog").waitFor({ state: "visible" });
    await screenshots("settings");
    await page.locator("[data-draft-editor-settings] .draft-close").focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator('#draft-item-dialog [data-draft-action="settings-item"]')
        .first()
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    await page
      .locator("[data-draft-editor-settings] .draft-popover-panel")
      .waitFor({ state: "hidden" });
    assert.equal(
      await settings.evaluate((el) => el === document.activeElement),
      true,
    );
    const account = page.locator('[data-mobile-web="profile-menu-trigger"]');
    await account.focus();
    await page.keyboard.press("Enter");
    await screenshots("account");
    await account.focus();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator('[data-mobile-web="close-account"]')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.press("Escape");
    await page
      .locator('[data-mobile-web="profile-menu"]')
      .waitFor({ state: "hidden" });
    assert.equal(
      await account.evaluate((el) => el === document.activeElement),
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    for (const selector of [
      '[data-draft-action="done"]',
      '[data-draft-action="copy-title"]',
      "[data-draft-global-trigger]",
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
    for (const ink of ["252923", "686B65", "3458DF", "237052", "B33D41"])
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
    await screenshots("recovery");
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
      () => document.querySelectorAll(".draft-group-card").length === 1,
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
    assert.equal(await page.locator(".draft-item").count(), 3);
    await screenshots("library");
    await page.locator(".draft-item-open").first().click();
    await page.locator("[data-draft-editor]:visible").waitFor();
    assert.equal(
      await page.locator('[data-draft-action="done"]').isVisible(),
      false,
      "Photo-only preparation cannot be marked as listed",
    );
    drafts[0].title = "Grouped item";
    drafts[0].description = "Prepared listing text";
    await page.reload();
    await page.locator("#draft-description:visible").waitFor();
    assert.equal(
      await page
        .locator('[data-draft-action="done"] [data-draft-label]')
        .textContent(),
      "Mark as listed",
    );
    assert.equal(
      await page.locator("[data-draft-copy-fields]").isVisible(),
      true,
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
    const selectionTarget = await page
      .locator(".draft-item>input")
      .first()
      .boundingBox();
    assert.ok(
      selectionTarget.width >= 44 && selectionTarget.height >= 44,
      "Library selection has a 44px touch target",
    );
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
    await page.locator("[data-draft-global-trigger]").click();
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
    await page.locator("[data-draft-global-trigger]").click();
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
      /^Generate 20 drafts$/,
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
    await click("selection");
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
    let codeRequests = 0;
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
      if (path === "/api/auth/magic-link") codeRequests++;
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
    await screenshots("auth", authPage);
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
    await screenshots("otp", authPage);
    await authPage.locator("#mobile-otp").fill("123456");
    await authPage.waitForFunction(
      () =>
        document.querySelector('[data-mobile-web="auth-status"]').dataset
          .tone === "error",
    );
    await screenshots("otp-error", authPage);
    const beforeResend = codeRequests;
    await authPage
      .getByRole("button", { name: "Resend code", exact: true })
      .click();
    await authPage.waitForFunction(
      () =>
        document.querySelector('[data-mobile-web="auth-status"]')
          .textContent === "Email sent.",
    );
    assert.equal(codeRequests, beforeResend + 1);
    assert.equal(await authPage.locator("#mobile-otp").inputValue(), "");
    assert.equal(
      await authPage.locator('[data-mobile-web="auth-email"]').textContent(),
      "seller@example.test",
    );
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
            "library loading and retry after list failure",
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
            "prepared listing moves to Listed, survives reload and restores to Drafts",
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
            "sign-in choices, official Google mark, destination code entry, neutral success, error, Resend code and Change email",
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
