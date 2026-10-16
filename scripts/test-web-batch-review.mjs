import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

process.env.DRAFT_BROWSER_INTERACTIVE = "1";
process.env.DRAFT_BROWSER_HEADLESS ||= "1";
const output = process.env.DRAFT_BROWSER_OUTPUT || "/tmp/autolister-web-batch-review";
process.env.DRAFT_BROWSER_OUTPUT = output;
const { reviewJourney: flow } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = flow;
const items = Number(process.env.WEB_BATCH_REVIEW_ITEMS || 2);
assert.ok([2, 20].includes(items));
await mkdir(output, { recursive: true });
const checks = [];
async function until(predicate, message) {
  const deadline = Date.now() + 15000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
try {
  await page.locator("[data-style-finish]:visible").click();
  await page.locator('[data-draft-action="back"]:visible').click();
  await flow.click("bulk");
  await flow.upload(items === 2 ? 4 : items, true);
  if (items === 2) {
    for (let group = 1; group <= 2; group++) {
      await page.locator("[data-draft-pool] input").nth(0).check();
      await page.locator("[data-draft-pool] input").nth(1).check();
      await flow.click("group");
      await until(() => page.locator(".draft-group-card").count().then(n => n === group), "group saved");
      await until(() => page.locator("[data-draft-pool] input").count().then(n => n === 4 - group * 2), "pool updated");
    }
  } else {
    for (const checkbox of await page.locator("[data-draft-pool] input").all()) await checkbox.check();
    await flow.click("individual");
    await until(() => page.locator(".draft-group-card").count().then(n => n === items), "all groups saved");
  }
  const photoIds = (await flow.snapshot()).photos.map(photo => photo.id).sort();
  flow.holdNextGeneration();
  await flow.click("generate-groups");
  await until(() => flow.stats().generations === 1, "first controlled generation submitted");
  assert.equal(await page.locator("[data-draft-import]").isVisible(), true, "start stays on the batch overview");
  flow.holdNextGeneration();
  flow.finishGeneration();
  await until(() => flow.stats().generations === 2, "second controlled generation submitted");
  const review = page.getByRole("button", { name: "Review Dress 1", exact: true });
  await review.waitFor({ timeout: 5000 });
  assert.equal(await page.locator(".draft-group-settings").count(), items - 1, "a ready row offers review instead of settings");
  assert.equal(await page.locator("[data-draft-grouping-complete]").isVisible(), false, "generation removes the redundant grouping-complete panel");
  checks.push("First ready item has an explicit Review action while later work continues, with no automatic navigation");
  await review.click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  assert.equal(await page.locator('[data-draft-field="title"]').inputValue(), "Dress 1");
  const progress = page.locator("[data-draft-queue]");
  await until(() => progress.textContent().then(text => text.includes(`1 of ${items} ready`)), "live progress survives entering review");
  assert.equal(await progress.isVisible(), true);
  assert.equal(await page.locator('[data-draft-action="next"]:visible').isDisabled(), true, "Next never opens an unfinished item");
  await page.locator('[data-draft-field="description"]').fill(Array(30).fill("Seller condition and measurement notes.").join("\n"));
  await flow.saved();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await flow.bounds(`Review and batch progress fit at ${width}px`);
    const bar = await progress.boundingBox();
    const footer = await page.locator("[data-draft-editor-footer]").boundingBox();
    assert.ok(bar && footer && bar.y + bar.height <= footer.y, "progress cannot overlap the item action");
    const brand = await page.locator(".mobile-workspace-brand").boundingBox();
    const settings = await page.locator(".mobile-header-settings").boundingBox();
    assert.ok(brand.x + brand.width <= settings.x, "header settings cannot overlap the brand");
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const scrolledBar = await progress.boundingBox();
    const header = await page.locator(".mobile-workspace-header").boundingBox();
    assert.ok(scrolledBar.y >= header.y + header.height, "scrolled progress must stay below the sticky header");
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-draft-field="description"]').fill("Seller reviewed this first draft while the batch continued.");
  await flow.saved();
  await flow.click("copy-description");
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "Seller reviewed this first draft while the batch continued.");
  const first = (await flow.snapshot()).drafts.find(draft => draft.title === "Dress 1");
  assert.equal(first.state, "draft", "copying is not publishing");
  checks.push("One compact progress panel remains accessible without covering Copy or Mark as listed; unfinished Next is disabled");
  flow.finishGeneration();
  await until(() => flow.stats().generations === items, "all controlled generations submitted");
  await until(() => progress.textContent().then(text => text.includes(`${items} of ${items} ready`)), "final progress reflects completion");
  assert.equal(await page.locator('[data-draft-field="title"]').inputValue(), "Dress 1", "later completion never navigates away");
  assert.equal(await page.locator('[data-draft-field="description"]').inputValue(), "Seller reviewed this first draft while the batch continued.");
  await page.getByRole("button", { name: "Next ready item", exact: true }).click();
  await until(() => page.locator('[data-draft-field="title"]').inputValue().then(title => title === "Dress 2"), "explicit Next opens the second ready draft");
  await page.getByRole("button", { name: "Back to batch", exact: true }).click();
  await until(() => page.locator(".draft-group-review").count().then(n => n === items), "all rows offer review");
  assert.equal(await page.locator(".draft-group-settings").count(), 0);
  assert.deepEqual((await flow.snapshot()).photos.map(photo => photo.id).sort(), photoIds, "all original local photos remain");
  assert.equal(flow.stats().generations, items, "one controlled generation per item");
  await page.getByRole("button", { name: "Review Dress 1", exact: true }).click();
  await flow.click("done");
  await until(() => page.locator('[data-draft-field="title"]').inputValue().then(title => title === "Dress 2"), "explicit Mark as listed advances to the next ready draft");
  await page.getByRole("button", { name: "Back to batch", exact: true }).click();
  await until(() => page.locator('[data-draft-import]').isVisible(), "Mark as listed preserves the batch return path");
  await flow.click("close-import");
  await flow.click("new");
  await flow.upload(1);
  await until(() => page.locator('[data-draft-action="generate"]:visible').count().then(n => n === 1), "a new single item retains Generate after a completed batch");
  assert.equal(await progress.isVisible(), false, "completed batch progress stays out of a new single item");
  assert.deepEqual(flow.stats().errors, []);
  checks.push("Opening a new single item after a completed batch keeps Generate visible without stale batch progress");
  checks.push("Later completion preserves edits and focus; explicit Next ready and Back to batch work; all photos remain and each item generates once");
  const result = { items, checks, pageErrors: flow.stats().errors, controlledGenerations: flow.stats().generations,
    scope: "Real Chromium product UI, image preparation, IndexedDB and clipboard. Controlled auth, storage and AI. No native iOS or server-owned background execution certification." };
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  flow.finishGeneration();
  await context.close();
  await browser.close();
}
