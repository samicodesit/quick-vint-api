import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

process.env.DRAFT_BROWSER_INTERACTIVE = "1";
process.env.DRAFT_BROWSER_HEADLESS = "1";
process.env.DRAFT_BROWSER_OUTPUT ||= "/tmp/autolister-web-queued-review";
const { reviewJourney: flow } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = flow;
async function until(predicate) {
  const deadline = Date.now() + 15000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, "expected browser transition");
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
try {
  await page.locator("[data-style-finish]:visible").click();
  await flow.click("back");
  await flow.click("bulk");
  await flow.upload(3, true);
  for (const checkbox of await page.locator("[data-draft-pool] input").all()) await checkbox.check();
  await flow.click("individual");
  await until(() => page.locator(".draft-group-card").count().then(n => n === 3));
  await flow.click("generate-groups");
  await until(() => page.locator(".draft-group-review").count().then(n => n === 3));
  const photos = (await flow.snapshot()).photos.map(p => p.id).sort();
  await flow.click("close-import");
  await flow.click("selection");
  for (const checkbox of await page.locator(".draft-item > input").all()) await checkbox.check();
  flow.holdNextGeneration();
  await flow.click("generate-selected");
  await until(() => flow.stats().generations === 4);
  await flow.click("selection");
  await page.locator('.draft-item-open').filter({ hasText: 'Waiting' }).first().click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  assert.equal(await page.locator('[data-draft-action="copy-title"]:visible').isDisabled(), true,
    "opening a queued replacement must not let the seller copy the old title as the new result");
  assert.equal(await page.locator('[data-draft-action="copy-description"]:visible').isDisabled(), true);
  assert.equal(await page.locator('[data-draft-action="done"]:visible').isDisabled(), true);
  await flow.click("back");
  flow.holdNextGeneration();
  flow.finishGeneration();
  await until(() => flow.stats().generations === 5);
  await page.locator('.draft-item-open').filter({ hasText: 'Dress 4' }).click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  const firstTitle = await page.locator('[data-draft-field="title"]').inputValue();
  assert.equal(await page.locator('[data-draft-action="next"]:visible').isDisabled(), true,
    "Next must not skip the active item and expose a queued replacement's old text");
  await flow.click("done");
  await until(() => page.locator('[data-draft-field="title"]').isVisible().then(visible => !visible));
  assert.equal(await page.locator('[data-draft-field="title"]').isVisible(), false,
    "Mark as listed must return to the overview rather than open a queued replacement's old text");
  const waiting = page.locator('.draft-queue-row').filter({ hasText: 'Waiting' });
  assert.equal(await waiting.count(), 1);
  assert.equal(await waiting.locator("button").count(), 0,
    "a queued old result must not be presented as a freshly ready result");
  flow.finishGeneration();
  await until(() => flow.stats().generations === 6);
  await until(() => page.locator('[data-draft-queue-title]').textContent().then(text => text.includes('3 of 3 ready')));
  assert.deepEqual((await flow.snapshot()).photos.map(p => p.id).sort(), photos);
  assert.deepEqual(flow.stats().errors, []);
  const result = { passed: true, firstTitle, controlledGenerations: 6,
    scope: "Real web UI, IndexedDB and image processing; local auth, storage and AI. Replaces three existing generated drafts and checks queued navigation." };
  await writeFile(`${process.env.DRAFT_BROWSER_OUTPUT}/queued-result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ generations: flow.stats().generations,
    drafts: (await flow.snapshot()).drafts.map(d => ({ title: d.title, state: d.state, operation: d.operation_state })),
    body: (await page.locator('body').innerText()).slice(-4500) }));
  throw error;
} finally {
  flow.finishGeneration();
  await context.close();
  await browser.close();
}
