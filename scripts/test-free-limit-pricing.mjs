import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { signInFixture } from "./billing-browser-fixture.mjs";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const base = process.env.BILLING_QA_URL || "http://127.0.0.1:4331";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const copies = JSON.parse(
  await readFile(new URL("../src/data/billingCopy.json", import.meta.url)),
);
const item = fileURLToPath(
  new URL("../docs/qa/browser-drafts/sample-front.png", import.meta.url),
);
const output = process.env.PAYWALL_QA_OUTPUT;
const usage = {
  plan: { tier: "free", isPaid: false, status: "free" },
  canGenerate: false,
  blockedReason: "free_lifetime_limit",
  limits: { freeLifetime: 5 },
  remaining: { freeLifetime: 0, packCredits: 0, generations: 0 },
};
const browser = await chromium.launch();
try {
  for (const [lang, copy] of Object.entries(copies)) {
    for (const suffix of lang === "en" || lang === "nl" ? ["0", "8"] : ["8"]) {
      const context = await browser.newContext({
        locale: lang === "cz" ? "cs" : lang,
        viewport: { width: 320, height: 844 },
      });
      const accountId = "123e4567-e89b-42d3-a456-42661417400" + suffix;
      await signInFixture(context, accountId);
      let priceUnavailable = suffix === "8" && lang === "en";
      const regularPrice = suffix === "0" && lang === "nl";
      const purchases = [],
        events = [];
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base)
          return url.hostname === "drafts-test.supabase.co"
            ? route.fulfill({ json: {} })
            : route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        const path = url.pathname;
        if (path === "/api/user/usage") return route.fulfill({ json: usage });
        if (path === "/api/user/limit-followup-offer" && priceUnavailable)
          return route.fulfill({ status: 503, json: { error: "fixture" } });
        if (path === "/api/user/limit-followup-offer" && regularPrice)
          return route.fulfill({ json: { eligible: false } });
        if (path === "/api/user/limit-followup-offer")
          return route.fulfill({
            json: {
              eligible: true,
              offerToken: "fixture-offer",
              expiresAt: new Date(Date.now() + 3600000).toISOString(),
            },
          });
        if (path === "/api/drafts")
          return route.fulfill({
            json: { drafts: [], imports: [], nextCursor: null },
          });
        if (path === "/api/generate")
          return route.fulfill({
            status: 429,
            json: { code: "free_lifetime_limit", error: "Free limit", usage },
          });
        if (path.startsWith("/api/stripe/")) {
          purchases.push(route.request().postDataJSON());
          return route.fulfill({ status: 503, json: { error: "fixture" } });
        }
        if (path === "/api/events/track")
          events.push(...(route.request().postDataJSON().events || []));
        return route.fulfill({ json: {} });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      try {
        await page.goto(base + "/app/");
        await page
          .locator('[data-mobile-web="profile-menu-trigger"]:visible')
          .first()
          .waitFor();
        await page.locator("[data-draft-editor]:visible").waitFor();
        await page
          .locator('[data-draft-input="item"]')
          .first()
          .setInputFiles(item);
        await page
          .locator('[data-draft-action="generate"]:visible')
          .first()
          .click();
        const dialog = page.locator("dialog.mobile-paywall[open]");
        await dialog.waitFor();
        await dialog.locator('button[value="pro"]:not(:disabled)').waitFor();
        const pro = dialog.locator('button[value="pro"]');
        if (priceUnavailable) {
          assert.equal(purchases.length, 0);
          priceUnavailable = false;
          await pro.press("Enter");
          await dialog.locator('button[value="pro"]:not(:disabled)').waitFor();
          assert.equal(purchases.length, 0);
        }
        const format = (price) =>
          new Intl.NumberFormat(lang === "cz" ? "cs" : lang, {
            style: "currency",
            currency: "EUR",
          }).format(price);
        if (regularPrice) {
          assert.ok((await pro.innerText()).includes(format(9.99)));
          assert.ok(!(await pro.innerText()).includes(format(7.99)));
        } else {
          assert.ok(
            (await pro.innerText()).includes(
              copy.firstMonthPrice.replace("{price}", format(7.99)),
            ),
            lang + " first price: " + (await pro.innerText()),
          );
          assert.ok(
            (await pro.innerText()).includes(
              copy.renewalPrice.replace("{price}", format(9.99)),
            ),
            lang + " renewal price",
          );
        }
        assert.deepEqual(await dialog.locator("h3").allTextContents(), [
          copy.monthlyPlans,
          copy.oneTimeListingCredits,
        ]);
        assert.equal(await dialog.getByRole("tab").count(), 0);
        assert.equal(await dialog.locator("button[value]:visible").count(), 6);
        assert.ok(
          await dialog.evaluate((el) =>
            [el, ...el.querySelectorAll("button[value]")].every(
              (n) => n.scrollWidth <= n.clientWidth + 1,
            ),
          ),
          "320px overflow " + lang,
        );
        for (const [width, height] of [
          [320, 568],
          [390, 844],
          [667, 375],
          [768, 1024],
          [1280, 860],
        ]) {
          await page.setViewportSize({ width, height });
          assert.ok(
            await dialog.evaluate((wall) => {
              const outer = wall.getBoundingClientRect();
              if (
                outer.left < 0 ||
                outer.right > innerWidth + 1 ||
                outer.height > innerHeight + 1
              )
                return false;
              return [...wall.querySelectorAll("button[value]")].every(
                (button) => {
                  const name = button.querySelector("strong"),
                    side = button.querySelector(".mobile-paywall-option-side");
                  const range = document.createRange();
                  range.selectNodeContents(name);
                  return [...range.getClientRects()].every((rect) => {
                    const price = side.getBoundingClientRect();
                    return (
                      rect.right <= price.left + 1 ||
                      rect.bottom <= price.top + 1 ||
                      rect.top >= price.bottom - 1
                    );
                  });
                },
              );
            }),
            lang + " label or price overlaps at " + width + "x" + height,
          );
        }
        if (output && ["en", "nl"].includes(lang)) {
          for (const width of [390, 1280]) {
            await page.setViewportSize({
              width,
              height: width === 390 ? 844 : 860,
            });
            await page.screenshot({
              path:
                output + "/web-" + suffix + "-" + lang + "-" + width + ".png",
              animations: "disabled",
            });
          }
        }
        for (const choice of [
          "starter",
          "pro",
          "business",
          "credits_20",
          "credits_50",
          "credits_100",
        ]) {
          const before = purchases.length;
          await dialog.locator('button[value="' + choice + '"]').press("Enter");
          await dialog
            .getByRole("status")
            .filter({ hasText: copy.checkoutError })
            .waitFor();
          assert.equal(purchases.length, before + 1);
          assert.equal(
            purchases.at(-1).packId || purchases.at(-1).tier,
            choice,
          );
          assert.equal(
            purchases.at(-1).offerToken,
            choice === "pro" && !regularPrice ? "fixture-offer" : undefined,
          );
        }
        assert.ok(
          events.some(
            (event) =>
              event.event === "web_paywall_view" &&
              event.context.method === "combined_pricing" &&
              event.context.entryPoint === "generation_limit",
          ),
          "shared paywall exposure and entry point",
        );
        assert.equal(
          events.some((event) => event.event.startsWith("free_limit_view_")),
          false,
          "web exposures must leave the legacy experiment",
        );
        console.log(lang, suffix, "checkout and width passed");
      } catch (e) {
        console.error((await page.locator("body").innerText()).slice(0, 1500));
        throw e;
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
