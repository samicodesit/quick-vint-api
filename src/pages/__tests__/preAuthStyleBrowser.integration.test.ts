import { createServer, type Server } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { afterAll, beforeAll, it } from "vitest";
import { UI_LOCALES } from "../../app/mobile-web/uiCopy";

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

async function continueToSignIn(page: any) {
  await expect(page.locator('[data-mobile-web="auth-card"]')).toBeVisible();
  await expect(page.locator("[data-style-setup],.um-preauth")).toHaveCount(0);
}

async function chooseStyle(page: any) {
  // Simulate a choice already saved by the previous release, without reviving its wizard.
  await page.evaluate(
    (chosen: unknown) =>
      localStorage.setItem(
        "autolister:pre-auth-style:v1",
        JSON.stringify({
          version: 1,
          id: crypto.randomUUID(),
          state: "pending",
          settings: chosen,
        }),
      ),
    chosen,
  );
  await continueToSignIn(page);
}

it.skipIf(!enabled).each(["google", "email-code", "email-link"])(
  "migrates a legacy chosen style through %s once, then preserves later edits",
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
  "opens sign-in on normal and direct visits without changing saved choices",
  async () => {
    const { context, page, errors } = await fixture(390, 844, {
      existing: true,
    });
    try {
      await chooseStyle(page);
      const before = await page.evaluate(() =>
        localStorage.getItem("autolister:pre-auth-style:v1"),
      );
      for (const route of ["/app", "/app?signin=1"]) {
        await page.goto(base + route);
        await continueToSignIn(page);
        expect(
          await page.evaluate(() =>
            localStorage.getItem("autolister:pre-auth-style:v1"),
          ),
        ).toBe(before);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  },
  30000,
);

it.skipIf(!enabled)(
  "preserves existing defaults and opens a restored session directly at item photos",
  async () => {
    const { context, page, errors } = await fixture(390, 844, {
      existing: true,
      authenticated: true,
    });
    try {
      await expect(
        page.getByRole("heading", { name: "Add item", exact: true }),
      ).toBeVisible();
      await expect(
        page.locator("[data-style-setup],.um-preauth,dialog.um-modal"),
      ).toHaveCount(0);
      expect(
        await page.evaluate(
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
  "keeps sign-in above the full example on phones and fits every interface locale",
  async () => {
    for (const locale of UI_LOCALES) {
      for (const width of [320, 390, 768, 1440]) {
        const { context, page, errors } = await fixture(
          width,
          width === 320 ? 568 : 900,
          { locale: locale === "cz" ? "cs" : locale },
        );
        try {
          const auth = page.locator(".auth-entry-form");
          await expect(auth).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          const bounds = await page.evaluate(() => {
            const form = document
              .querySelector(".auth-entry-form")!
              .getBoundingClientRect();
            const example = document
              .querySelector(".auth-example")!
              .getBoundingClientRect();
            const google = document
              .querySelector('[data-mobile-web="google-sign-in"]')!
              .getBoundingClientRect();
            const submit = document
              .querySelector('[data-mobile-web="email-form"] button')!
              .getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth > innerWidth,
              formTop: form.top,
              exampleTop: example.top,
              googleBottom: google.bottom,
              submitBottom: submit.bottom,
              height: innerHeight,
            };
          });
          expect(bounds.overflow, `${locale} ${width}`).toBe(false);
          expect(bounds.googleBottom, `${locale} ${width}`).toBeLessThan(
            bounds.height,
          );
          if (width < 960) {
            expect(bounds.formTop).toBeLessThan(bounds.exampleTop);
            expect(bounds.submitBottom, `${locale} ${width}`).toBeLessThan(
              bounds.height,
            );
          }
          await expect(page.locator(".auth-example-item li")).toHaveCount(4);
          if (locale !== "en")
            await expect(page.locator(".auth-example h2")).not.toHaveText(
              "From photos to a ready-to-copy draft.",
            );
          if (
            outputPath() &&
            ["en", "nl", "de", "fr"].includes(locale) &&
            [390, 1440].includes(width)
          ) {
            await mkdir(outputPath()!, { recursive: true });
            await page.screenshot({
              path: join(outputPath()!, `signin-${locale}-${width}.png`),
              fullPage: true,
            });
          }
          expect(errors).toEqual([]);
        } finally {
          await context.close();
        }
      }
    }
  },
  120000,
);

function outputPath() {
  return process.env.PREAUTH_STYLE_BROWSER_OUTPUT;
}

it.skipIf(!enabled)(
  "imports ChatGPT photos into the signed-in editor with that seller's saved note",
  async () => {
    const { context, page } = await fixture(390, 844, {
      existing: true,
      authenticated: true,
    });
    const plugin =
      "https://autolister-one-item-prototype.samicodesit.chatgpt.site";
    try {
      await page.evaluate(
        ({ account, chosen }: any) => {
          localStorage.setItem(
            "autolister:listing-defaults:" + account,
            JSON.stringify(chosen),
          );
          localStorage.setItem("autolister:style-setup:v1:" + account, "done");
        },
        { account, chosen },
      );
      await context.route(plugin + "/test", (route: any) =>
        route.fulfill({
          contentType: "text/html",
          body: '<button id="open">Open draft in AutoLister</button>',
        }),
      );
      const sender = await context.newPage();
      await sender.goto(plugin + "/test");
      await sender.evaluate((base: string) => {
        document.querySelector("button")!.onclick = () => {
          window.open(base + "/app/#import-chatgpt-item", "_blank");
        };
        window.addEventListener("message", async (e) => {
          if (e.origin !== base || e.data.type !== "autolister.ready") return;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 50;
          const blob = await new Promise<Blob>((r) =>
            canvas.toBlob((b) => r(b!), "image/jpeg"),
          );
          (e.source as Window).postMessage(
            {
              type: "autolister.item",
              nonce: e.data.nonce,
              item: {
                id: "a006e938-459f-4da7-a69f-177ef9a78653",
                title: "Blue mug",
                description: "Blue mug with a round handle.",
                photos: [blob],
              },
            },
            base,
          );
        });
      }, base);
      const opened = context.waitForEvent("page");
      await sender.click("#open");
      const target = await opened;
      await expect(target.locator('[data-draft-field="title"]')).toHaveValue(
        "Blue mug",
        { timeout: 15000 },
      );
      await expect(
        target.locator('[data-draft-field="description"]'),
      ).toHaveValue(
        "Blue mug with a round handle.\n\n" + chosen.descriptionFooterText,
      );
      expect(new URL(target.url()).hash).toBe("");
    } finally {
      await context.close();
    }
  },
  30000,
);
