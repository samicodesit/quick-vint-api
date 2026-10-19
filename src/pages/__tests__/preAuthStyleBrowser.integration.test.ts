import { createServer, type Server } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { afterAll, beforeAll, it } from "vitest";
import { translations } from "../../app/mobile-web/styleTranslations";

// Real built app and Supabase client. Only auth/network responses are local fixtures.
// No production requests, account creation, emails, purchases or generations.
const enabled = process.env.RUN_PREAUTH_STYLE_BROWSER_TESTS === "1";
let server: Server;
let browser: any;
let base: string;
let expect: any;
const account = "123e4567-e89b-42d3-a456-426614174000";
const chosen = {
  titleLanguageCode: "de",
  descriptionLanguageCode: "fr",
  descriptionLength: "long",
  useBulletPoints: false,
  tone: "standard",
  useHashtags: false,
  useEmojis: false,
  includeSellerNote: true,
  descriptionFooterText: "I post parcels on Tuesdays.",
};
const oldStyle = {
  ...chosen,
  titleLanguageCode: "en",
  descriptionLanguageCode: "en",
  descriptionLength: "short",
  useBulletPoints: true,
  useHashtags: true,
  useEmojis: true,
  includeSellerNote: false,
  descriptionFooterText: "",
};

beforeAll(async () => {
  if (!enabled) return;
  const { chromium, expect: browserExpect } = createRequire(
    "/home/mests/projects/quick-vint/package.json",
  )("@playwright/test");
  expect = browserExpect;
  browser = await chromium.launch({ headless: true });
  const root = resolve("dist");
  server = createServer(async (req, res) => {
    try {
      let path = join(
        root,
        decodeURIComponent(new URL(req.url!, "http://localhost").pathname),
      );
      if (!path.startsWith(root + "/")) {
        res.writeHead(403).end();
        return;
      }
      if ((await stat(path)).isDirectory()) path = join(path, "index.html");
      const mime =
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".woff2": "font/woff2",
          } as Record<string, string>
        )[extname(path)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(await readFile(path));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await browser?.close();
  if (server) await new Promise<void>((r) => server.close(() => r()));
});

async function fixture(
  width = 390,
  height = 844,
  options: {
    existing?: boolean;
    authenticated?: boolean;
    locale?: string;
  } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: options.locale || "en-GB",
    reducedMotion: "reduce",
  });
  const user = {
    id: account,
    email: "fixture@example.test",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-10-19T10:00:00Z",
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const session = {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: account, exp: Math.floor(Date.now() / 1000) + 36000, role: "authenticated" })}.fixture`,
    refresh_token: "fixture-refresh",
    expires_in: 36000,
    expires_at: Math.floor(Date.now() / 1000) + 36000,
    token_type: "bearer",
    user,
  };
  await context.addInitScript(
    ({ account, oldStyle, session, options }: any) => {
      if (
        options.existing &&
        !localStorage.getItem(`autolister:listing-defaults:${account}`)
      ) {
        localStorage.setItem(
          `autolister:listing-defaults:${account}`,
          JSON.stringify(oldStyle),
        );
        sessionStorage.setItem(
          `autolister:batch-settings:${account}`,
          JSON.stringify(oldStyle),
        );
      }
      if (options.authenticated)
        localStorage.setItem(
          "sb-drafts-test-auth-token",
          JSON.stringify(session),
        );
    },
    { account, oldStyle, session, options },
  );
  const oauth: string[] = [],
    emails: any[] = [],
    errors: string[] = [];
  await context.route("**/*", async (route: any) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === "https://drafts-test.supabase.co") {
      if (url.pathname === "/auth/v1/authorize") {
        oauth.push(url.searchParams.get("provider") || "");
        const destination =
          url.searchParams.get("redirect_to") +
          `#access_token=${session.access_token}&refresh_token=${session.refresh_token}`;
        return route.fulfill({
          contentType: "text/html",
          body: `<script>location.replace(${JSON.stringify(destination)})</script>`,
        });
      }
      if (url.pathname === "/auth/v1/user")
        return route.fulfill({ json: user });
      if (url.pathname === "/auth/v1/verify") {
        expect(request.postDataJSON()).toMatchObject({
          type: "email",
          email: user.email,
          token: "123456",
        });
        return route.fulfill({ json: session });
      }
      return route.fulfill({ json: {} });
    }
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/auth/magic-link") {
      emails.push(request.postDataJSON());
      return route.fulfill({ json: { success: true } });
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
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(base + "/app?ref=blog_description_formula");
  return { context, page, oauth, emails, errors, session };
}

async function chooseStyle(page: any) {
  await expect(page.locator("section[data-style-setup]")).toBeVisible();
  await expect(page.locator('[data-mobile-web="auth-card"]')).toBeHidden();
  await page.selectOption('[data-style-field="titleLanguageCode"]', "de");
  await page.selectOption('[data-style-field="descriptionLanguageCode"]', "fr");
  await page.click('[data-style-length="long"]');
  await page.click('[data-style-format="text"]');
  await page.click('[data-style-toggle="hashtags"]');
  await page.click('[data-style-toggle="emojis"]');
  await page.click("[data-style-edit-note]");
  await page.fill("[data-style-note-input]", chosen.descriptionFooterText);
  await page.click("[data-style-save-note]");
  await expect(page.locator("[data-style-note-preview]")).toHaveText(
    chosen.descriptionFooterText,
  );
  await page.click("[data-style-finish]");
  await expect(page.locator('[data-mobile-web="auth-card"]')).toBeVisible();
}

it.skipIf(!enabled).each(["google", "email-code", "email-link"])(
  "keeps the chosen style through %s, overrides stale defaults once, then preserves later edits",
  async (method) => {
    const { context, page, oauth, emails, errors, session } = await fixture(
      390,
      844,
      { existing: true },
    );
    try {
      await chooseStyle(page);
      if (method === "google" && process.env.PREAUTH_STYLE_BROWSER_OUTPUT) {
        await mkdir(process.env.PREAUTH_STYLE_BROWSER_OUTPUT, {
          recursive: true,
        });
        await page.screenshot({
          path: join(
            process.env.PREAUTH_STYLE_BROWSER_OUTPUT,
            "sign-in-after-style.png",
          ),
        });
      }
      await page.reload(); // Must not depend on the guest page's JS memory.
      await expect(page.locator('[data-mobile-web="auth-card"]')).toBeVisible();
      let returned = page;
      if (method === "google") {
        await page.click('[data-mobile-web="google-sign-in"]');
        await page.waitForURL(base + "/app");
        expect(oauth).toEqual(["google"]);
      } else {
        await page.fill("#mobile-email", "fixture@example.test");
        await page.locator('[data-mobile-web="email-form"] button').click();
        await expect(page.locator("#mobile-otp")).toBeVisible();
        expect(emails).toEqual([
          { email: "fixture@example.test", client: "mobile_web" },
        ]);
        if (method === "email-code") await page.fill("#mobile-otp", "123456");
        else {
          returned = await context.newPage();
          await returned.goto(
            base +
              `/app/auth/callback#access_token=${session.access_token}&refresh_token=${session.refresh_token}`,
          );
          await returned.waitForURL(base + "/app");
        }
      }
      await expect(returned.locator("[data-draft-workspace]")).toBeVisible();
      await expect(returned.locator("section[data-style-setup]")).toBeHidden();
      const saved = await returned.evaluate(
        (account: string) => ({
          defaults: JSON.parse(
            localStorage.getItem(`autolister:listing-defaults:${account}`)!,
          ),
          batch: JSON.parse(
            sessionStorage.getItem(`autolister:batch-settings:${account}`)!,
          ),
          setup: localStorage.getItem(`autolister:style-setup:v1:${account}`),
        }),
        account,
      );
      expect(saved).toEqual({ defaults: chosen, batch: chosen, setup: "done" });
      await returned.evaluate(
        ({ account, oldStyle }: any) =>
          localStorage.setItem(
            `autolister:listing-defaults:${account}`,
            JSON.stringify(oldStyle),
          ),
        { account, oldStyle },
      );
      await returned.reload();
      await expect(returned.locator("[data-draft-workspace]")).toBeVisible();
      expect(
        await returned.evaluate(
          (account: string) =>
            JSON.parse(
              localStorage.getItem(`autolister:listing-defaults:${account}`)!,
            ),
          account,
        ),
      ).toEqual(oldStyle);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  30000,
);

it.skipIf(!enabled)(
  "opens the preview on a normal app visit even with a saved choice, and resumes only explicit sign-in",
  async () => {
    const { context, page } = await fixture(440, 956);
    try {
      await chooseStyle(page);
      await page.goto(base + "/app");
      await expect(page.locator("section[data-style-setup]")).toBeVisible({
        timeout: 1500,
      });
      await expect(page.locator('[data-mobile-web="auth-card"]')).toBeHidden();
      await expect(
        page.locator('[data-style-field="titleLanguageCode"]'),
      ).toHaveValue("de");
      await expect(
        page.locator('[data-style-field="descriptionLanguageCode"]'),
      ).toHaveValue("fr");
      await expect(page.locator("[data-style-note-preview]")).toHaveText(
        chosen.descriptionFooterText,
      );
      await page.click("[data-style-finish]");
      expect(new URL(page.url()).searchParams.get("signin")).toBe("1");
      await page.reload();
      await expect(page.locator('[data-mobile-web="auth-card"]')).toBeVisible();
      await page.click('[data-mobile-web="change-style"]');
      expect(new URL(page.url()).searchParams.has("signin")).toBe(false);
      await page.reload();
      await expect(page.locator("section[data-style-setup]")).toBeVisible();
      await expect(
        page.locator('[data-style-field="titleLanguageCode"]'),
      ).toHaveValue("de");
      await page.click('[data-mobile-web="direct-sign-in"]');
      await expect(page.locator('[data-mobile-web="auth-card"]')).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("autolister:pre-auth-style:v1")!)
              .settings,
        ),
      ).toEqual(chosen);
    } finally {
      await context.close();
    }
  },
  15000,
);

it.skipIf(!enabled)(
  "keeps saved preferences when skipping and opens returning sessions without a preview",
  async () => {
    const first = await fixture(390, 844, { existing: true });
    try {
      await expect(
        first.page.locator("section[data-style-setup]"),
      ).toBeVisible();
      await first.page.click("[data-style-skip]");
      await first.page.fill("#mobile-email", "fixture@example.test");
      await first.page.locator('[data-mobile-web="email-form"] button').click();
      await first.page.fill("#mobile-otp", "123456");
      await expect(first.page.locator("[data-draft-workspace]")).toBeVisible();
      expect(
        await first.page.evaluate(
          (account: string) =>
            JSON.parse(
              localStorage.getItem(`autolister:listing-defaults:${account}`)!,
            ),
          account,
        ),
      ).toEqual(oldStyle);
    } finally {
      await first.context.close();
    }
    const returning = await fixture(390, 844, {
      existing: true,
      authenticated: true,
    });
    try {
      await expect(
        returning.page.locator("[data-draft-workspace]"),
      ).toBeVisible();
      await expect(
        returning.page.locator("section[data-style-setup]"),
      ).toBeHidden();
    } finally {
      await returning.context.close();
    }
  },
);

it.skipIf(!enabled)(
  "keeps the preview open with a useful error if the style cannot be saved",
  async () => {
    const { context, page } = await fixture();
    try {
      await expect(page.locator("section[data-style-setup]")).toBeVisible();
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "autolister:pre-auth-style:v1")
            throw new DOMException("full", "QuotaExceededError");
          return original.call(this, key, value);
        };
      });
      await page.click("[data-style-finish]");
      await expect(page.locator("[data-style-save-error]")).toBeVisible();
      await expect(page.locator('[data-mobile-web="auth-card"]')).toBeHidden();
    } finally {
      await context.close();
    }
  },
);

it.skipIf(!enabled)(
  "opens sign-in from the header without replacing saved or selected preferences",
  async () => {
    for (const selected of [false, true]) {
      const { context, page } = await fixture(390, 844, { existing: true });
      try {
        await expect(page.locator("section[data-style-setup]")).toBeVisible();
        if (selected) await chooseStyle(page);
        const direct = page.locator('[data-mobile-web="direct-sign-in"]');
        await expect(direct).toBeVisible({ timeout: 1000 });
        expect(await direct.getAttribute("aria-label")).toBe(
          "Sign in or create an account",
        );
        await direct.click();
        await page.waitForURL(base + "/app?signin=1");
        await expect(
          page.locator('[data-mobile-web="auth-card"]'),
        ).toBeVisible();
        await expect(page.locator("section[data-style-setup]")).toBeHidden();
        await page.fill("#mobile-email", "fixture@example.test");
        await page.locator('[data-mobile-web="email-form"] button').click();
        await page.fill("#mobile-otp", "123456");
        await expect(page.locator("[data-draft-workspace]")).toBeVisible();
        expect(
          await page.evaluate(
            (account: string) =>
              JSON.parse(
                localStorage.getItem(`autolister:listing-defaults:${account}`)!,
              ),
            account,
          ),
        ).toEqual(selected ? chosen : oldStyle);
        await expect(direct).toBeHidden();
        await expect(
          page.locator('[data-mobile-web="profile-menu-trigger"]'),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    }
  },
  15000,
);

it.skipIf(!enabled)(
  "keeps the style after a cancelled sign-in and lets the visitor edit it",
  async () => {
    const { context, page } = await fixture();
    try {
      await chooseStyle(page);
      await page.goto(base + "/app/auth/callback?error=access_denied");
      await expect(
        page.locator('[data-mobile-web="callback-status"]'),
      ).toHaveAttribute("data-state", "error");
      await page.goto(base + "/app");
      await expect(page.locator("section[data-style-setup]")).toBeVisible();
      expect(
        await page
          .locator('[data-style-field="titleLanguageCode"]')
          .inputValue(),
      ).toBe("de");
      expect(
        await page
          .locator('[data-style-field="descriptionLanguageCode"]')
          .inputValue(),
      ).toBe("fr");
      await expect(page.locator('[data-style-format="text"]')).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(
        page.locator('[data-style-toggle="emojis"]'),
      ).toHaveAttribute("aria-checked", "false");
      await expect(page.locator("[data-style-note-preview]")).toHaveText(
        chosen.descriptionFooterText,
      );
    } finally {
      await context.close();
    }
  },
);

it.skipIf(!enabled)(
  "fits the interactive preview on small phones, landscape, tablet and desktop",
  async () => {
    const cases = [];
    const viewports = [
      ...[
        [320, 568],
        [390, 844],
        [440, 956],
        [667, 375],
        [844, 390],
        [1024, 320],
        [600, 551],
        [601, 551],
        [700, 600],
        [701, 451],
        [768, 1024],
        [1440, 900],
      ].map(([width, height]) => ({ width, height, locale: "en-GB" })),
      ...translations.flatMap(({ code }) =>
        [
          [320, 480],
          [568, 320],
        ].map(([width, height]) => ({
          width,
          height,
          locale: code === "cz" ? "cs" : code,
        })),
      ),
    ];
    for (const { width, height, locale } of viewports) {
      const { context, page, errors } = await fixture(width, height, {
        locale,
      });
      try {
        await expect(page.locator("section[data-style-setup]")).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        const readBounds = () =>
          page.evaluate(() => {
            const action = document
              .querySelector("[data-style-finish]")!
              .getBoundingClientRect();
            return {
              width: innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              action: {
                bottom: action.bottom,
                top: action.top,
                height: action.height,
              },
              previewHeight: document
                .querySelector("[data-style-preview]")!
                .getBoundingClientRect().height,
              footerGap:
                document.querySelector(".style-footer")!.getBoundingClientRect()
                  .top -
                document
                  .querySelector(".style-controls")!
                  .getBoundingClientRect().bottom,
            };
          });
        let bounds = await readBounds();
        if (height >= 568 && width <= 700) {
          await expect
            .poll(async () => {
              bounds = await readBounds();
              return bounds.footerGap;
            })
            .toBeLessThanOrEqual(16);
        }
        expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
        expect(bounds.action.bottom).toBeLessThanOrEqual(height);
        expect(bounds.action.height).toBeGreaterThanOrEqual(48);
        expect(bounds.previewHeight).toBeGreaterThanOrEqual(44);
        if (width === 440 && height === 956) {
          const spareInside = await page
            .locator(".style-example")
            .evaluate((card: HTMLElement) => {
              const preview = card.querySelector<HTMLElement>(
                "[data-style-preview]",
              )!;
              const last = Array.from(preview.children)
                .filter((el) => el.getClientRects().length)
                .at(-1)!;
              return (
                card.getBoundingClientRect().bottom -
                last.getBoundingClientRect().bottom -
                parseFloat(getComputedStyle(last).marginBottom) -
                parseFloat(getComputedStyle(preview).paddingBottom) -
                1
              );
            });
          expect(spareInside).toBeLessThanOrEqual(2);
          await page.emulateMedia({ reducedMotion: "no-preference" });
          const shimmer = await page
            .locator("[data-style-finish]")
            .evaluate((button: HTMLElement) => {
              const effect = getComputedStyle(button, "::after");
              return {
                animation: effect.animationName,
                transform: effect.transform,
              };
            });
          expect(shimmer.animation).not.toBe("none");
          await expect
            .poll(() =>
              page
                .locator("[data-style-finish]")
                .evaluate(
                  (button: HTMLElement) =>
                    getComputedStyle(button, "::after").transform,
                ),
            )
            .not.toBe(shimmer.transform);
          await page.emulateMedia({ reducedMotion: "reduce" });
          expect(
            await page
              .locator("[data-style-finish]")
              .evaluate(
                (button: HTMLElement) =>
                  getComputedStyle(button, "::after").animationName,
              ),
          ).toBe("none");
          if (process.env.PREAUTH_STYLE_BROWSER_OUTPUT) {
            await mkdir(process.env.PREAUTH_STYLE_BROWSER_OUTPUT, {
              recursive: true,
            });
            await page.screenshot({
              path: join(
                process.env.PREAUTH_STYLE_BROWSER_OUTPUT,
                "preview-440-short.png",
              ),
            });
          }
          const settings = await page.locator(".style-controls").boundingBox();
          await page.click('[data-style-length="long"]');
          await page.click("[data-style-edit-note]");
          await page.fill(
            "[data-style-note-input]",
            "I usually post parcels on Tuesdays. ".repeat(6).trim(),
          );
          await page.click("[data-style-save-note]");
          const expanded = await page
            .locator("[data-style-preview]")
            .evaluate((el: HTMLElement) => ({
              height: el.clientHeight,
              content: el.scrollHeight,
            }));
          expect(expanded.content).toBeGreaterThan(expanded.height);
          const settingsAfter = await page
            .locator(".style-controls")
            .boundingBox();
          expect(Math.abs(settingsAfter!.y - settings!.y)).toBeLessThanOrEqual(
            1,
          );
          await expect(page.locator("[data-style-finish]")).toBeInViewport({
            ratio: 1,
          });
        }
        if (height >= 568 && width <= 700) {
          expect(bounds.footerGap).toBeGreaterThanOrEqual(0);
          expect(
            bounds.footerGap,
            `${width}x${height} ${locale}`,
          ).toBeLessThanOrEqual(16);
        }
        expect(
          await page
            .locator("[data-style-finish]")
            .evaluate((button: HTMLElement) => {
              const box = button.getBoundingClientRect();
              return button.contains(
                document.elementFromPoint(
                  box.left + box.width / 2,
                  box.top + box.height / 2,
                ),
              );
            }),
        ).toBe(true);
        if (height <= 550 && width <= 700) {
          await page
            .locator(
              'section[data-style-setup] [data-draft-select="titleLanguageCode"] [data-draft-select-trigger]',
            )
            .click();
          await page
            .locator(
              'section[data-style-setup] [data-draft-select="titleLanguageCode"] [data-draft-select-option="de"]',
            )
            .click();
          await expect(
            page.locator('[data-style-field="titleLanguageCode"]'),
          ).toHaveValue("de");
          await page.locator("[data-style-edit-note]").scrollIntoViewIfNeeded();
          const footer = await page
            .locator("[data-style-finish]")
            .boundingBox();
          expect(footer!.y + footer!.height).toBeLessThanOrEqual(height);
        }
        expect(errors).toEqual([]);
        cases.push({ height, locale, ...bounds });
        const output = process.env.PREAUTH_STYLE_BROWSER_OUTPUT;
        if (
          output &&
          (width === 390 ||
            width === 1440 ||
            (width === 568 && locale === "en"))
        ) {
          await mkdir(output, { recursive: true });
          await page
            .locator(".style-example-photo img")
            .evaluate((img: HTMLImageElement) => img.decode());
          await page.screenshot({ path: join(output, `preview-${width}.png`) });
        }
        if (
          (width === 320 && height === 480 && locale === "de") ||
          (width === 390 && height === 844)
        ) {
          if (width === 390) {
            await page.setViewportSize({ width: 844, height: 390 });
            await expect(page.locator("[data-style-finish]")).toBeInViewport({
              ratio: 1,
            });
            await page.setViewportSize({ width, height });
            await expect(page.locator("[data-style-finish]")).toBeInViewport({
              ratio: 1,
            });
          }
          await page.addStyleTag({
            content:
              "section[data-style-setup] button { font-size: 20px !important; } #style-heading { font-size: 38px !important; }",
          });
          const enlarged = await page
            .locator("[data-style-finish]")
            .boundingBox();
          expect(enlarged!.y).toBeGreaterThanOrEqual(0);
          expect(enlarged!.y + enlarged!.height).toBeLessThanOrEqual(height);
          await page.locator("[data-style-finish]").click();
          await expect(
            page.locator('[data-mobile-web="auth-card"]'),
          ).toBeVisible();
        }
      } finally {
        await context.close();
      }
    }
    if (process.env.PREAUTH_STYLE_BROWSER_OUTPUT)
      await writeFile(
        join(process.env.PREAUTH_STYLE_BROWSER_OUTPUT, "layout-checks.json"),
        JSON.stringify(cases, null, 2) + "\n",
      );
  },
  60000,
);
