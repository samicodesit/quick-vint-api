import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney } = await import("./test-local-browser-drafts.mjs");
const { browser, page, click, upload, saved, settled } = reviewJourney;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output =
  process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-local-drafts";
const action = (name) => page.locator(`[data-draft-action="${name}"]`);
const field = (name) => page.locator(`[data-draft-field="${name}"]`);
const meter = page.locator("[data-draft-free-meter]");
const gear = page.locator("[data-draft-global-trigger]");
const errors = [];
const events = [];
let generations = 0;
let shortDefault = false;
let holdGeneration;
let releaseGeneration;
const result = {
  title: "Black textured wrap dress with puff sleeves",
  shortTitle: "Black wrap dress",
  longDescription:
    "Black textured wrap dress with a V-neck, short puff sleeves and a flared skirt.\n\n- Wrap front with three buttons at the waist\n- Short sleeves with gathered cuffs\n- Flared hem with a curved overlap",
  shortDescription:
    "Black wrap dress with puff sleeves and three waist buttons.",
};
const creditUsage = {
  plan: { tier: "free", status: "free", isPaid: false },
  limits: { freeLifetime: 5 },
  remaining: { freeLifetime: 0, packCredits: 12, generations: 12, minute: 10 },
  canGenerate: true,
};
const subscriptionUsage = {
  plan: { tier: "pro", status: "active", isPaid: true },
  limits: { daily: 25, monthly: 250 },
  remaining: {
    daily: 0,
    monthly: 132,
    packCredits: 12,
    generations: 12,
    minute: 10,
  },
  canGenerate: true,
};
let usage = creditUsage;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/api/user/usage", (route) =>
  route.fulfill({ json: usage }),
);
await page.route("**/api/events/track", async (route) => {
  const payload = route.request().postDataJSON().events;
  events.push(...payload);
  await route.fulfill({
    json: { acknowledgedIds: payload.map(({ id }) => id) },
  });
});
await page.route("**/api/generate", async (route) => {
  generations++;
  const input = route.request().postDataJSON();
  assert.equal(input.descriptionLength, shortDefault ? "short" : "long");
  await holdGeneration;
  usage = {
    ...usage,
    remaining: {
      ...usage.remaining,
      generations: usage.remaining.generations - 1,
      packCredits: usage.remaining.packCredits - 1,
    },
  };
  return route.fulfill({
    json: {
      ...result,
      description: shortDefault
        ? result.shortDescription
        : result.longDescription,
    },
  });
});

async function uploadPair() {
  await upload(1);
  await page
    .locator('[data-draft-input="item"]')
    .first()
    .setInputFiles({
      name: "detail.png",
      mimeType: "image/png",
      buffer: await readFile(
        new URL("../docs/qa/browser-drafts/sample-detail.png", import.meta.url),
      ),
    });
  await page.locator("[data-draft-item-photos] .draft-photo").nth(1).waitFor();
  await page.waitForFunction(() => !document.querySelector(".draft-upload"));
  await settled();
}

async function checkReviewHierarchy() {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["title", "description"]) {
      const boxes = await action(`variant-${name}`).evaluate((el) => {
        const row = el.parentElement;
        const lines = (node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length;
        };
        return {
          button: el.getBoundingClientRect().toJSON(),
          copy: row
            .querySelector('[data-draft-action^="copy-"]')
            .getBoundingClientRect()
            .toJSON(),
          heading: row.getBoundingClientRect().toJSON(),
          columns: getComputedStyle(row).gridTemplateColumns,
          labelLineCount: lines(row.querySelector("label")),
          copyLineCount: lines(
            row.querySelector(
              '[data-draft-action^="copy-"] [data-draft-label]',
            ),
          ),
        };
      });
      const { button, copy, heading } = boxes;
      assert.equal(boxes.labelLineCount, 1, `${width}px ${name} label wraps`);
      assert.equal(boxes.copyLineCount, 1, `${width}px Copy wraps`);
      assert.ok(
        Math.abs(
          button.x + button.width / 2 - (heading.x + heading.width / 2),
        ) < 12,
        `${width}px ${name}: ${JSON.stringify(boxes)}`,
      );
      assert.ok(
        button.x + button.width <= copy.x,
        `${width}px ${name} overlaps Copy`,
      );
      assert.ok(
        button.height <= copy.height,
        `${width}px ${name} is taller than Copy`,
      );
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function capture(label, sizes = [390, 1440]) {
  if (process.env.DRAFT_POLISH_CAPTURE !== "1") return;
  for (const width of sizes) {
    await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
    await settled();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/after-${label}-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

try {
  await page.goto(`${base}/app`);
  await action("back").waitFor();
  await uploadPair();
  await click("back");
  await click("new");
  await uploadPair();
  await meter.getByText("Credits", { exact: true }).waitFor();
  assert.equal(
    await meter.locator("[data-draft-credits-value]").textContent(),
    "12",
  );
  assert.equal(await meter.getByText("No free drafts left").isVisible(), false);
  assert.equal(await action("previous").isVisible(), false);
  assert.equal(await action("next").isVisible(), false);
  assert.equal(await page.locator("[data-draft-position]").isVisible(), false);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const row = await meter.boundingBox();
    const more = await meter
      .getByRole("button", { name: "Get more" })
      .boundingBox();
    assert.ok(Math.abs(row.x + row.width / 2 - width / 2) < 9);
    assert.equal(more.height, row.height - 2);
    assert.ok(row.height < 52, "Get more fits on one line");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const glow = () =>
    action("generate").evaluate(
      (button) => getComputedStyle(button).animationName,
    );
  assert.equal(await glow(), "draft-generate-glow");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await glow(), "none");
  assert.notEqual(
    await action("generate").evaluate(
      (button) => getComputedStyle(button).boxShadow,
    ),
    "none",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await capture("prepare");
  await meter.getByRole("button", { name: "Get more" }).click();
  const closePaidOptions = page.getByRole("button", {
    name: "Close paid options",
  });
  await closePaidOptions.waitFor();
  await closePaidOptions.click();

  usage = subscriptionUsage;
  await page.reload();
  await meter.getByText("Today", { exact: true }).waitFor();
  assert.equal(
    await meter.locator('[data-draft-quota="daily"] strong').textContent(),
    "25 / 25",
  );
  assert.equal(
    await meter.locator('[data-draft-quota="monthly"] strong').textContent(),
    "118 / 250",
  );
  assert.equal(
    await meter.locator("[data-draft-credits-value]").textContent(),
    "12",
  );
  await capture("subscription");
  usage = {
    ...subscriptionUsage,
    limits: { daily: null, monthly: 75 },
    remaining: {
      ...subscriptionUsage.remaining,
      daily: null,
      monthly: 42,
      packCredits: 0,
      generations: 33,
    },
  };
  await page.reload();
  await meter.getByText("Unlimited", { exact: true }).waitFor();
  assert.equal(
    await meter.locator('[data-draft-quota="monthly"] strong').textContent(),
    "33 / 75",
  );
  assert.equal(
    await meter.locator("[data-draft-usage-credits]").isVisible(),
    false,
  );
  usage = subscriptionUsage;
  await page.reload();
  await meter.getByText("25 / 25", { exact: true }).waitFor();

  if (process.env.DRAFT_POLISH_CAPTURE === "1") {
    const button = action("generate");
    const box = await button.boundingBox();
    for (let frame = 0; frame < 16; frame++) {
      await button.evaluate(
        (el, time) => {
          for (const animation of el.getAnimations({ subtree: true })) {
            animation.pause();
            animation.currentTime = time;
          }
        },
        (frame * 2600) / 16,
      );
      await page.screenshot({
        path: `${output}/pulse-${String(frame).padStart(2, "0")}.png`,
        clip: { x: 0, y: Math.floor(box.y - 33), width: 390, height: 84 },
      });
    }
  }

  assert.equal(await gear.getAttribute("data-settings-unseen"), "true");
  assert.equal(
    await gear.evaluate(
      (el) => getComputedStyle(el, "::after").backgroundColor,
    ),
    "rgb(225, 45, 69)",
  );
  assert.match(
    await gear.locator("svg").getAttribute("class"),
    /lucide-settings\b/,
  );
  await gear.click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor();
  assert.equal(await gear.getAttribute("data-settings-unseen"), null);
  await page.keyboard.press("Escape");
  await page.reload();
  await action("generate").waitFor();
  assert.equal(await gear.getAttribute("data-settings-unseen"), null);
  holdGeneration = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  await click("generate");
  await action("generate").getByText("Generating…", { exact: true }).waitFor();
  assert.equal(await action("generate").isDisabled(), true);
  assert.equal(await glow(), "none");
  releaseGeneration();
  await action("variant-title").waitFor();
  await checkReviewHierarchy();
  assert.equal(await field("description").inputValue(), result.longDescription);
  assert.match(
    await action("variant-description").innerText(),
    /Make it shorter!\s*😡/,
  );
  assert.equal(await generations, 1);
  await page.waitForFunction(
    () =>
      document.querySelector("[data-draft-credits-value]").textContent === "11",
  );
  await capture("review", [320, 390, 1440]);

  await field("title").fill("My edited black dress title");
  await action("variant-title").click();
  await action("variant-description").click();
  assert.equal(await field("title").inputValue(), result.shortTitle);
  assert.equal(
    await field("description").inputValue(),
    result.shortDescription,
  );
  assert.equal(await action("variant-title").locator("svg").isVisible(), true);
  await saved();
  await capture("undo");
  await action("copy-description").click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    result.shortDescription,
  );
  await page.reload();
  await action("variant-title").waitFor();
  assert.equal(await field("title").inputValue(), result.shortTitle);
  await action("variant-title").click();
  await action("variant-description").click();
  assert.equal(
    await field("title").inputValue(),
    "My edited black dress title",
  );
  assert.equal(await field("description").inputValue(), result.longDescription);
  assert.equal(await generations, 1);

  await saved();
  await click("back");
  await click("new");
  await upload(1);
  await gear.click();
  const short = page
    .getByRole("dialog", { name: "Settings" })
    .getByRole("radio", { name: "Short", exact: true });
  await short.check();
  await page.keyboard.press("Escape");
  shortDefault = true;
  await click("generate");
  await action("variant-description").waitFor();
  assert.equal(
    await field("description").inputValue(),
    result.shortDescription,
  );
  assert.equal(
    await action("variant-description").innerText(),
    "Make it longer",
  );
  await capture("short-default", [390]);
  await action("variant-description").click();
  assert.equal(await field("description").inputValue(), result.longDescription);
  assert.equal(await generations, 2);

  usage = {
    ...creditUsage,
    remaining: { ...creditUsage.remaining, generations: 0, packCredits: 0 },
    canGenerate: false,
    blockedReason: "free_lifetime_limit",
  };
  await page.reload();
  await meter.getByText("No free drafts left").waitFor();
  await click("back");
  await click("new");
  await upload(1);
  assert.equal(await glow(), "none");

  await click("back");
  await page.getByText(result.title, { exact: true }).first().click();
  await action("variant-title").waitFor();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", { get: () => ["nl-NL"] });
    Object.defineProperty(navigator, "language", { get: () => "nl-NL" });
  });
  await page.reload();
  await action("variant-title").waitFor();
  assert.equal(await action("variant-title").innerText(), "Korter maken?");

  const variantEvents = events.filter(
    ({ event }) => event === "web_draft_text_variant",
  );
  assert.deepEqual(
    variantEvents.map(({ context }) => [context.field, context.method]),
    [
      ["title", "shorter"],
      ["description", "shorter"],
      ["title", "undo"],
      ["description", "undo"],
      ["description", "longer"],
    ],
  );
  for (const { context } of variantEvents)
    assert.ok(!JSON.stringify(context).includes("Black"));
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    JSON.stringify({
      generations,
      variantEvents: variantEvents.length,
      pageErrors: errors.length,
    }),
  );
} finally {
  releaseGeneration?.();
  await browser.close();
}
