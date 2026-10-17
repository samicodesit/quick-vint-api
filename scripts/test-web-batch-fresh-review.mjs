import assert from "node:assert/strict";

process.env.DRAFT_BROWSER_INTERACTIVE = "1";
process.env.DRAFT_BROWSER_HEADLESS = "1";
process.env.DRAFT_BROWSER_OUTPUT ||= "/tmp/autolister-web-fresh-review";
const mode = process.env.WEB_REVIEW_CONTEXT || "fresh";
assert.ok(["fresh", "legacy", "missing", "mixed"].includes(mode));
const { reviewJourney: flow } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = flow;
async function until(predicate, message) {
  const deadline = Date.now() + 15000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, message);
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
  await until(
    () =>
      page
        .locator(".draft-group-card")
        .count()
        .then((n) => n === 2),
    "groups saved",
  );
  await flow.click("generate-groups");
  await until(
    () =>
      page
        .locator(".draft-group-review")
        .count()
        .then((n) => n === 2),
    "initial results ready",
  );
  await flow.click("close-import");
  const before = await flow.snapshot();
  let requests = 0;
  let failures = 0;
  await page.route("**/api/generate", (route) => {
    requests++;
    if (mode === "mixed" && requests > 1) return route.fallback();
    failures++;
    return route.fulfill({
      status: 422,
      json: { error: "Controlled definitive failure" },
    });
  });
  await flow.click("selection");
  for (const checkbox of await page.locator(".draft-item > input").all())
    await checkbox.check();
  await flow.click("generate-selected");
  await until(
    () =>
      page
        .locator("[data-draft-queue-title]")
        .textContent()
        .then((text) =>
          text.includes(`${mode === "mixed" ? 1 : 2} failed`),
        ),
    "generation outcomes persisted",
  );
  const reviewIds = await page.evaluate(
    () => history.state.draftWorkspace.reviewIds,
  );
  const failedDrafts = (await flow.snapshot()).drafts.filter(
    (draft) => draft.operation_state === "failed",
  );
  const firstFailed = reviewIds
    .map((id) => failedDrafts.find((draft) => draft.id === id))
    .find(Boolean);
  assert.ok(firstFailed);
  await page.evaluate((mode) => {
    for (const key of Object.keys(sessionStorage)) {
      let value;
      try {
        value = JSON.parse(sessionStorage.getItem(key));
      } catch {
        continue;
      }
      if (!Array.isArray(value?.remaining) || !Array.isArray(value?.completed))
        continue;
      if (mode === "legacy") {
        delete value.reviewIds;
        sessionStorage.setItem(key, JSON.stringify(value));
      }
      if (mode === "missing") sessionStorage.removeItem(key);
    }
  }, mode);
  await page.goto(new URL(`/app?fresh=${mode}`, page.url()).href);
  await page
    .locator(".draft-item-open")
    .filter({ hasText: firstFailed.title })
    .click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  assert.match(
    await page.locator("#draft-editor-title").innerText(),
    /Needs attention/,
  );
  assert.equal(
    await page.locator('[data-draft-action="next"]:visible').isDisabled(),
    mode !== "mixed",
    "Next must skip unresolved failures even without page history or queue context",
  );
  if (mode !== "missing") {
    assert.equal(
      await page
        .locator('[data-draft-action="next"]')
        .getAttribute("aria-label"),
      "Next ready item",
    );
    assert.deepEqual(
      await page.evaluate(() => history.state.draftWorkspace.reviewIds),
      reviewIds,
      "fresh entry restores the batch review scope",
    );
  }
  assert.equal(
    await page
      .locator('[data-draft-action="copy-title"]')
      .getAttribute("aria-label"),
    "Copy previous title",
  );
  assert.match(
    await page.locator('[data-draft-action="done"]:visible').innerText(),
    /Retry.*1 generation/,
  );
  await flow.bounds(`Fresh ${mode} failed review remains compact`);
  await page.screenshot({
    path: `${process.env.DRAFT_BROWSER_OUTPUT}/${mode}-failed.png`,
    fullPage: true,
  });
  if (mode === "mixed") {
    await flow.click("next");
    await until(
      () =>
        page.evaluate(
          (id) => history.state?.draftWorkspace?.draftId !== id,
          firstFailed.id,
        ),
      "Next opens the ready draft",
    );
    assert.doesNotMatch(
      await page.locator("#draft-editor-title").innerText(),
      /Needs attention/,
    );
    assert.notEqual(
      await page.evaluate(() => history.state.draftWorkspace.draftId),
      firstFailed.id,
    );
  }
  assert.equal(requests, 2, "navigation and restoration never regenerate");
  assert.equal(failures, mode === "mixed" ? 1 : 2);
  assert.deepEqual(
    (await flow.snapshot()).photos.map((p) => p.id).sort(),
    before.photos.map((p) => p.id).sort(),
  );
  assert.deepEqual(flow.stats().errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      mode,
      failures,
      nextDisabled: mode !== "mixed",
      retainedPhotos: before.photos.length,
    }),
  );
} finally {
  flow.finishGeneration();
  await context.close();
  await browser.close();
}
