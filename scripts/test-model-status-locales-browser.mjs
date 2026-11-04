import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney: h } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser, bounds } = h;
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4331";
const output = process.env.DRAFT_BROWSER_OUTPUT || "/tmp/model-status-locales";
await mkdir(output, { recursive: true });
await context.route(`${base}/api/user/model`, (route) =>
  route.fulfill({
    json: {
      enabled: false,
      listingPhotosAvailable: true,
      invitationState: "dismissed",
      model: null,
    },
  }),
);
const files = ["user-model-ui.js", "user-model-copy.js"];
const beforeRef = process.env.MODEL_STATUS_BEFORE_REF || "2a3e714";
const sizes = [
  ["desktop", 1366, 950],
  ["mobile", 390, 844],
  ["small", 320, 740],
];
const evidence = [];
async function open() {
  await page.locator("[data-model-compact]").click();
  await page.locator("dialog.um-modal form").waitFor();
}
try {
  for (const file of files) {
    const body = execFileSync("git", ["show", `${beforeRef}:public/${file}`], {
      encoding: "utf8",
    });
    await context.route(`${base}/${file}*`, (route) =>
      route.fulfill({ contentType: "application/javascript", body }),
    );
  }
  await page.goto(base + "/app");
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  await open();
  for (const [device, width, height] of sizes.slice(0, 2)) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `${output}/web-create-before-${device}.png`,
      fullPage: true,
    });
  }
  await page.keyboard.press("Escape");
  for (const file of files) await context.unroute(`${base}/${file}*`);
  await page.reload();
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  const locales = await page.evaluate(() =>
    Object.keys(AutoListerModelCopy.copy),
  );
  for (const locale of locales) {
    await page.evaluate(
      (locale) => AutoListerModelCopy.setLocale(locale),
      locale,
    );
    await open();
    const label = await page.evaluate(() =>
      AutoListerModelCopy.text("Create and enable"),
    );
    assert.notEqual(
      locale === "en" ? "" : label,
      "Create and enable",
      `${locale} translation missing`,
    );
    const button = page.getByRole("button", { name: label, exact: true });
    await button.waitFor();
    for (const [device, width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await bounds(`model creation ${locale} ${device}`);
      assert.equal(
        await button.evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth &&
            el.scrollHeight <= el.clientHeight,
        ),
        true,
        `${locale} clipped action`,
      );
      assert.equal(
        await button.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].filter(
            (r) => r.width > 0 && r.height > 0,
          ).length;
        }),
        1,
        `${locale} creation action must stay on one line at ${width}px`,
      );
      if (["en", "nl", "de", "fr"].includes(locale) && device !== "small")
        await page.screenshot({
          path: `${output}/web-create-${locale}-${device}.png`,
          fullPage: true,
        });
    }
    evidence.push({ locale, label, widths: sizes.map((s) => s[1]) });
    await page.keyboard.press("Escape");
  }
  assert.equal(h.stats().errors.length, 0, h.stats().errors.join("\n"));
  await writeFile(`${output}/locales.json`, JSON.stringify(evidence, null, 2));
  console.log(
    `Model creation checked in ${evidence.length} locales at three widths. Local fixtures only.`,
  );
} finally {
  await browser.close();
}
