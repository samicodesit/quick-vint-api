import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

process.env.DRAFT_BROWSER_INTERACTIVE = "1";
process.env.DRAFT_BROWSER_HEADLESS = "1";
process.env.DRAFT_BROWSER_OUTPUT ||= "/tmp/autolister-web-failed-review";
const { reviewJourney: flow } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = flow;
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, "expected browser transition");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
try {
  await page.locator("[data-style-finish]:visible").click();
  await flow.click("back");
  await flow.click("bulk");
  await flow.upload(2, true);
  for (const checkbox of await page.locator("[data-draft-pool] input").all())
    await checkbox.check();
  await flow.click("individual");
  await until(() =>
    page
      .locator(".draft-group-card")
      .count()
      .then((n) => n === 2),
  );
  await flow.click("generate-groups");
  await until(() =>
    page
      .locator(".draft-group-review")
      .count()
      .then((n) => n === 2),
  );
  const photos = (await flow.snapshot()).photos.map((p) => p.id).sort();
  await flow.click("close-import");
  let failedCalls = 0;
  await page.route("**/api/generate", (route) => {
    failedCalls++;
    return route.fulfill({
      status: 422,
      json: { error: "Controlled definitive failure" },
    });
  });
  await flow.click("selection");
  for (const checkbox of await page.locator(".draft-item > input").all())
    await checkbox.check();
  await flow.click("generate-selected");
  await until(() =>
    page
      .locator("[data-draft-queue-title]")
      .textContent()
      .then((text) => text.includes("2 failed")),
  );
  await page.locator(".draft-queue-row button").first().click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  assert.equal(
    await page.locator('[data-draft-action="copy-title"]:visible').isDisabled(),
    false,
    "a failed replacement must preserve access to previous work without a paid retry",
  );
  assert.equal(
    await page
      .locator('[data-draft-action="copy-description"]:visible')
      .isDisabled(),
    false,
  );
  assert.equal(
    await page
      .locator('[data-draft-action="copy-title"]')
      .getAttribute("aria-label"),
    "Copy previous title",
  );
  assert.equal(
    await page.locator('[data-draft-action="copy-title"]').innerText(),
    "Copy previous",
  );
  assert.equal(
    await page
      .locator('[data-draft-action="copy-description"]')
      .getAttribute("aria-label"),
    "Copy previous description",
  );
  assert.match(
    await page.locator('[data-draft-action="done"]:visible').innerText(),
    /Retry.*1 generation/,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Mark as listed", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.locator('[data-draft-action="next"]:visible').isDisabled(),
    true,
    "Next must not open another failed replacement as ready",
  );
  assert.match(
    await page.locator("#draft-editor-title").innerText(),
    /Needs attention/,
  );
  assert.equal(
    await page.locator("[data-draft-operation-status]").innerText(),
    "Controlled definitive failure",
  );
  await page.evaluate(() =>
    navigator.clipboard.writeText("unchanged-failed-output"),
  );
  const previousTitle = await page
    .locator('[data-draft-field="title"]')
    .inputValue();
  await flow.click("copy-title");
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    previousTitle,
    "the explicitly labelled previous output can be copied without generation",
  );
  assert.equal(
    failedCalls,
    2,
    "copying previous text must never start a retry",
  );
  await page.waitForTimeout(1900);
  assert.equal(
    await page.locator('[data-draft-action="copy-title"]').innerText(),
    "Copy previous",
  );
  const before = await flow.snapshot();
  await page.screenshot({
    path: `${process.env.DRAFT_BROWSER_OUTPUT}/failed-replacement.png`,
    fullPage: true,
  });
  await page.unroute("**/api/generate");
  await flow.click("done");
  await until(async () => {
    const copy = page.locator('[data-draft-action="copy-title"]:visible');
    return (
      !(await copy.isDisabled()) &&
      (await copy.getAttribute("aria-label")) === "Copy title"
    );
  });
  assert.equal(
    await page.locator('[data-draft-action="done"]:visible').isDisabled(),
    false,
  );
  assert.deepEqual(
    (await flow.snapshot()).drafts.map((d) => [d.id, d.state]),
    before.drafts.map((d) => [d.id, d.state]),
    "the failure footer retries generation and never marks the item as listed",
  );
  assert.match(
    await page.locator('[data-draft-action="done"]:visible').innerText(),
    /Mark as listed/,
  );
  assert.deepEqual(
    (await flow.snapshot()).photos.map((p) => p.id).sort(),
    photos,
  );
  const stillFailed = (await flow.snapshot()).drafts.find(
    (d) => d.operation_state === "failed",
  );
  assert.ok(stillFailed, "the other failed replacement remains unresolved");
  await flow.click("back");
  const failedRow = page
    .locator(".draft-item")
    .filter({ hasText: stillFailed.title });
  assert.match(
    await failedRow.locator(".draft-item-detail").innerText(),
    /Needs attention/,
    "retrying one item must not present another failed replacement as ready",
  );
  await page.reload();
  await failedRow.locator(".draft-item-open").waitFor();
  assert.match(
    await failedRow.locator(".draft-item-detail").innerText(),
    /Needs attention/,
    "persisted failure must survive reloading after a different item is retried",
  );
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: `${process.env.DRAFT_BROWSER_OUTPUT}/other-failure-retained.png`,
    fullPage: true,
  });
  await failedRow.locator(".draft-item-open").click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  assert.equal(
    await page.locator('[data-draft-action="copy-title"]:visible').isDisabled(),
    false,
  );
  assert.equal(
    await page
      .locator('[data-draft-action="copy-title"]')
      .getAttribute("aria-label"),
    "Copy previous title",
  );
  assert.deepEqual(flow.stats().errors, []);
  const result = {
    passed: true,
    failedCalls,
    retainedPhotos: photos.length,
    scope:
      "Actual web queue, IndexedDB and controls; local auth, storage and model. Failed replacements stay Needs attention, explicitly labelled previous output stays copyable without paid retry, navigation skips failed items, and explicit successful retry restores ordinary controls.",
  };
  await writeFile(
    `${process.env.DRAFT_BROWSER_OUTPUT}/failed-result.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  flow.finishGeneration();
  await context.close();
  await browser.close();
}
