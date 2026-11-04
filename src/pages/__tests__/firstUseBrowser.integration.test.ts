import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { afterAll, beforeAll, it } from "vitest";
import { SITE_EXTRA_COPY, type SiteLocale } from "../../i18n/site";

// Run against a local build with mobile web, drafts and user models enabled,
// PUBLIC_SUPABASE_URL=https://drafts-test.supabase.co and a fixture anon key.
// All auth and API responses are fixtures. Never calls a production API.
const enabled = process.env.RUN_FIRST_USE_BROWSER_TESTS === "1";
const base = process.env.FIRST_USE_BASE_URL || "http://127.0.0.1:4332";
const output = process.env.FIRST_USE_BROWSER_OUTPUT;
let browser: any, expect: any;
beforeAll(async () => {
  if (!enabled) return;
  if (new URL(base).hostname !== "127.0.0.1") throw new Error("Local QA only");
  const pw = createRequire("/home/mests/projects/quick-vint/package.json")(
    "@playwright/test",
  );
  expect = pw.expect;
  browser = await pw.chromium.launch({ headless: true });
  if (output) await mkdir(output, { recursive: true });
});
afterAll(async () => browser?.close());

async function fixture(
  width = 390,
  invitationState = "dismissed",
  authenticated = true,
  modelReady = false,
) {
  const context = await browser.newContext({
    viewport: { width, height: width < 768 ? 844 : 900 },
    locale: "en-GB",
    reducedMotion: "reduce",
  });
  const user = {
    id: "123e4567-e89b-42d3-a456-426614174000",
    email: "fixture@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-10-19T10:00:00Z",
  };
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 36000, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    expires_in: 36000,
    expires_at: Math.floor(Date.now() / 1000) + 36000,
    token_type: "bearer",
    user,
  };
  if (authenticated)
    await context.addInitScript((s: any) => {
      localStorage.setItem("sb-drafts-test-auth-token", JSON.stringify(s));
    }, session);
  const creates: unknown[] = [];
  await context.route("**/*", async (route: any) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.hostname === "drafts-test.supabase.co")
      return route.fulfill({
        json:
          url.pathname === "/auth/v1/user"
            ? user
            : url.pathname === "/auth/v1/verify"
              ? session
              : {},
      });
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/auth/magic-link")
      return route.fulfill({ json: { success: true } });
    if (url.pathname === "/api/user/model") {
      const body = req.method() === "GET" ? null : req.postDataJSON();
      if (body?.action === "create") creates.push(body);
      const claimed = body?.action === "invite" && invitationState === "unseen";
      if (claimed) invitationState = "seen";
      if (body?.action === "dismiss") invitationState = "dismissed";
      return route.fulfill({
        json: {
          model: modelReady
            ? { state: "ready", imageUrl: "/images/user-model-male.webp" }
            : null,
          enabled: modelReady,
          invitationState,
          claimed,
        },
      });
    }
    if (url.pathname === "/api/user/usage")
      return route.fulfill({
        json: {
          plan: { tier: "free", status: "active", isPaid: false },
          canGenerate: true,
          remaining: { freeGenerations: 5, generations: 5, minute: 10 },
        },
      });
    if (url.pathname === "/api/drafts")
      return route.fulfill({
        json: { drafts: [], imports: [], nextCursor: null },
      });
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({ json: { ok: true } });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on("pageerror", (e: Error) => errors.push(e.message));
  return { context, page, creates, errors };
}

it.skipIf(!enabled).each([390, 1365])(
  "shows the model photo hint through the web workspace at %i px",
  async (width) => {
    const { context, page, errors } = await fixture(
      width,
      "created",
      true,
      true,
    );
    try {
      await page.goto(base + "/app");
      await page.locator("[data-style-finish]").click();
      await page.locator("[data-model-compact]").click();
      const hint = page.locator(".um-preview-hint");
      await expect(hint).toHaveText(
        "Your model will wear your items in future listing photos.",
      );
      await expect(hint.locator("svg")).toBeVisible();
      await expect(page.locator(".um-preview")).toBeVisible();
      if (output) {
        const size = width < 768 ? "mobile" : "desktop";
        await hint.evaluate(
          (el: HTMLElement) => (el.style.visibility = "hidden"),
        );
        await page.screenshot({ path: `${output}/web-before-${size}.png` });
        await hint.evaluate((el: HTMLElement) => (el.style.visibility = ""));
        await expect(hint).toBeVisible();
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${output}/web-after-${size}.png` });
      }
      if (width === 390) {
        for (const locale of [
          "en",
          "fr",
          "de",
          "nl",
          "es",
          "it",
          "pl",
          "pt",
          "cz",
          "da",
          "el",
          "hr",
          "fi",
          "hu",
          "lt",
          "ro",
          "sk",
          "sv",
        ]) {
          const value = await page.evaluate((code: string) => {
            const copy = (window as any).AutoListerModelCopy;
            copy.setLocale(code);
            return copy.text(
              "Your model will wear your items in future listing photos.",
            );
          }, locale);
          expect(value).toBeTruthy();
          if (locale !== "en")
            expect(value).not.toBe(
              "Your model will wear your items in future listing photos.",
            );
          await hint
            .locator("span")
            .evaluate(
              (el: HTMLElement, text: string) => (el.textContent = text),
              value,
            );
          const fits = await hint.evaluate(
            (el: HTMLElement) => el.scrollWidth <= el.clientWidth,
          );
          expect(fits, locale).toBe(true);
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  30000,
);

it.skipIf(!enabled)(
  "opens the web app from every mobile pricing menu, with extension access separate",
  async () => {
    const { context, page } = await fixture();
    try {
      for (const locale of ["en", "de", "fr", "nl", "es", "it", "pl", "pt"]) {
        await page.goto(
          base + (locale === "en" ? "" : "/" + locale) + "/pricing",
        );
        await expect(page.locator("body")).toContainText(
          "5 " + SITE_EXTRA_COPY[locale as SiteLocale].pricing.lifetimeListings,
        );
        await page.addStyleTag({
          content: "astro-dev-toolbar{display:none!important}",
        });
        await page.locator(".site-mobile-menu-toggle button").click();
        const primary = page.locator('[data-track-context="nav_mobile"]');
        await expect(primary).toHaveAttribute(
          "href",
          new RegExp("^/app\\?ref=nav_mobile_" + locale),
        );
        await expect(primary).toHaveAttribute(
          "data-track-event",
          "web_app_click",
        );
        await expect(primary).not.toHaveAttribute("target", "_blank");
        await expect(
          page.locator('[data-track-context="nav_mobile_extension"]'),
        ).toHaveAttribute("href", /chromewebstore.google.com/);
        if (locale === "de" && output)
          await page.screenshot({ path: `${output}/pricing-after-mobile.png` });
        await primary.click();
        await page.waitForURL(/\/app\/?\?ref=nav_mobile_/);
      }
    } finally {
      await context.close();
    }
  },
  90000,
);

it.skipIf(!enabled)(
  "lets a first-time user skip the model invitation and choose item photos",
  async () => {
    const { context, page, creates } = await fixture(390, "unseen");
    try {
      await page.goto(base + "/app");
      await page.addStyleTag({
        content: "astro-dev-toolbar{display:none!important}",
      });
      await page.locator("[data-style-finish]").click();
      await expect(page.locator("dialog.um-modal")).toBeVisible();
      if (output)
        await page.screenshot({
          path: `${output}/first-invitation-mobile.png`,
        });
      await page.locator("dialog.um-modal .um-secondary").click();
      await expect(page.locator("dialog.um-modal")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: "Add item", exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByText("Choose photos", { exact: true })
          .filter({ visible: true }),
      ).toBeVisible();
      expect(creates).toEqual([]);
    } finally {
      await context.close();
    }
  },
  30000,
);

it.skipIf(!enabled).each(["skip", "preferences"])(
  "keeps guest onboarding optional and preserves %s through sign-in",
  async (choice) => {
    const { context, page, creates } = await fixture(390, "unseen", false);
    try {
      await page.goto(base + "/app");
      await page.addStyleTag({
        content: "astro-dev-toolbar{display:none!important}",
      });
      await page.locator("[data-style-finish]").click();
      if (choice === "preferences") {
        for (const [group, value] of Object.entries({
          gender: "male",
          hair: "brown",
          build: "slim",
          skinTone: "tone_2",
        }))
          await page
            .locator(`.um-view input[name="model-${group}"][value="${value}"]`)
            .check();
        await page.locator('.um-view input[type="number"]').fill("183");
        await page.locator(".um-view .um-primary").click();
      } else await page.locator(".um-view .um-secondary").click();
      await page.fill("#mobile-email", "fixture@example.test");
      await page.locator('[data-mobile-web="email-form"] button').click();
      await page.fill("#mobile-otp", "123456");
      const entry = page.locator("[data-model-compact]");
      await expect(entry).toBeVisible();
      if (choice === "preferences") {
        await expect(page.locator('.um-view input[type="number"]')).toHaveValue(
          "183",
        );
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await entry.click();
        await expect(
          page.locator('.um-view input[name="model-gender"][value="male"]'),
        ).toBeChecked();
        await expect(page.locator('.um-view input[type="number"]')).toHaveValue(
          "183",
        );
      } else {
        await expect(page.locator("dialog.um-modal")).toHaveCount(0);
        await expect(
          page
            .getByText("Choose photos", { exact: true })
            .filter({ visible: true }),
        ).toBeVisible();
      }
      expect(creates).toEqual([]);
    } finally {
      await context.close();
    }
  },
  30000,
);

it.skipIf(!enabled).each([390, 1365])(
  "retains unfinished choices across modal and settings at %i px, without creating a model",
  async (width) => {
    const { context, page, creates, errors } = await fixture(width);
    const size = width < 768 ? "mobile" : "desktop";
    try {
      await page.goto(base + "/app");
      await page.addStyleTag({
        content: "astro-dev-toolbar{display:none!important}",
      });
      await page.locator("[data-style-finish]").click();
      const entry = page.locator("[data-model-compact]");
      await expect(entry).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Add item", exact: true }),
      ).toBeVisible();
      if (output)
        await page.screenshot({ path: `${output}/first-item-${size}.png` });
      await entry.click();
      const choice = (group: string, value: string) =>
        page.locator(`.um-view input[name="model-${group}"][value="${value}"]`);
      await choice("gender", "female").check();
      await choice("hair", "red").check();
      await page.locator('.um-view input[type="number"]').fill("178");
      await choice("build", "average").check();
      await choice("skinTone", "tone_3").check();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await entry.click();
      await expect(choice("gender", "female")).toBeChecked();
      await expect(choice("hair", "red")).toBeChecked();
      await expect(choice("build", "average")).toBeChecked();
      await expect(choice("skinTone", "tone_3")).toBeChecked();
      await expect(page.locator('.um-view input[type="number"]')).toHaveValue(
        "178",
      );
      await expect(
        page.getByRole("button", {
          name: "Create and enable",
          exact: true,
        }),
      ).toBeVisible();
      if (output)
        await page.screenshot({ path: `${output}/model-after-${size}.png` });
      await page.keyboard.press("Escape");
      await page.locator("[data-draft-global-trigger]").click();
      await page.locator("#draft-global-dialog [data-user-model-open]").click();
      await expect(choice("hair", "red")).toBeChecked();
      await choice("hair", "black").check();
      await page
        .getByRole("button", { name: "Back to settings", exact: true })
        .click();
      await expect(page.locator("#draft-global-dialog h3")).toHaveText(
        "Listing settings",
      );
      await expect(page.locator("#draft-global-dialog h3")).toBeVisible();
      if (output)
        await page.screenshot({
          path: `${output}/settings-return-${size}.png`,
        });
      await page
        .locator('#draft-global-dialog [aria-label="Close settings"]')
        .click();
      await entry.click();
      await expect(choice("hair", "black")).toBeChecked();
      if (width === 390) {
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Account menu" }).click();
        await page.locator('[data-mobile-web="sign-out"]').click();
        await page.fill("#mobile-email", "fixture@example.test");
        await page.locator('[data-mobile-web="email-form"] button').click();
        await page.fill("#mobile-otp", "123456");
        await expect(entry).toBeVisible();
        await entry.click();
        await expect(
          page.locator('.um-view input[name^="model-"]:checked'),
        ).toHaveCount(0);
        await expect(page.locator('.um-view input[type="number"]')).toHaveValue(
          "170",
        );
      }
      expect(creates).toEqual([]);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  60000,
);
