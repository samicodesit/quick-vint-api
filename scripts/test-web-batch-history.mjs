import assert from "node:assert/strict";

process.env.DRAFT_BROWSER_INTERACTIVE = "1";
process.env.DRAFT_BROWSER_HEADLESS = "1";
process.env.DRAFT_BROWSER_OUTPUT ||= "/tmp/autolister-web-history";
const { reviewJourney: flow } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = flow;
const distinct = process.env.WEB_HISTORY_ITEMS === "distinct";
const until = async (predicate, message) => {
  const deadline = Date.now() + 20000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};
const queueRecord = () =>
  page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((key) =>
      key.includes("draft-queue"),
    );
    return key ? JSON.parse(sessionStorage.getItem(key)) : null;
  });
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
    "batch A ready",
  );
  const orderA = await page.evaluate(
    () => history.state.draftWorkspace.reviewIds,
  );
  await page.locator(".draft-group-review").first().click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  await flow.click("back");
  await until(
    () =>
      page
        .locator("[data-draft-import]:visible")
        .count()
        .then((n) => n === 1),
    "returned to grouping",
  );
  await flow.click("close-import");
  let selectedIds = [...orderA].reverse();
  if (distinct) {
    await flow.click("bulk");
    await flow.upload(2, true);
    for (const checkbox of await page.locator("[data-draft-pool] input").all())
      await checkbox.check();
    await flow.click("individual");
    await until(
      () => flow.snapshot().then((state) => state.drafts.length === 4),
      "distinct B drafts saved",
    );
    selectedIds = (await flow.snapshot()).drafts
      .map((draft) => draft.id)
      .filter((id) => !orderA.includes(id));
    await flow.click("close-import");
  }
  flow.holdNextGeneration();
  await flow.click("selection");
  for (const id of selectedIds)
    await page.locator(`[data-focus-key="select-${id}"]`).check();
  await flow.click("generate-selected");
  await until(() => flow.stats().generations === 3, "batch B started");
  const orderB = (await queueRecord()).reviewIds;
  if (distinct)
    assert.ok(
      orderB.every((id) => !orderA.includes(id)),
      "B uses distinct items",
    );
  else
    assert.deepEqual(
      orderB,
      [...orderA].reverse(),
      "fixture selects opposite batch order",
    );
  await page.goBack();
  await until(
    () =>
      page.evaluate(
        (order) =>
          JSON.stringify(history.state?.draftWorkspace?.reviewIds) ===
          JSON.stringify(order),
        orderA,
      ),
    "historical grouping restored",
  );
  await page.goForward();
  await until(
    () =>
      page.evaluate(
        (order) =>
          JSON.stringify(history.state?.draftWorkspace?.reviewIds) ===
          JSON.stringify(order),
        orderB,
      ),
    "current history restored",
  );
  await page.goBack();
  await until(
    () =>
      page.evaluate(
        (order) =>
          JSON.stringify(history.state?.draftWorkspace?.reviewIds) ===
          JSON.stringify(order),
        orderA,
      ),
    "old view restored again",
  );
  flow.holdNextGeneration();
  flow.finishGeneration();
  await until(() => flow.stats().generations === 4, "B2 submitted");
  const progress = await queueRecord();
  assert.deepEqual(progress.completed, [orderB[0]]);
  assert.deepEqual(progress.remaining, [orderB[1]]);
  assert.deepEqual(
    progress.reviewIds,
    orderB,
    "historical view must not rewrite the live batch order",
  );
  await page.reload();
  await until(
    () => queueRecord().then((value) => value?.remaining.length === 1),
    "queue restored",
  );
  if (await page.locator('[data-draft-action="close-import"]:visible').count())
    await flow.click("close-import");
  await page.locator(`[data-focus-key="open-${orderB[0]}"]:visible`).click();
  await page.locator('[data-draft-field="title"]:visible').waitFor();
  assert.equal(
    await page.locator("[data-draft-position]").innerText(),
    "1 / 2",
  );
  assert.equal(
    await page.evaluate(() => history.state.draftWorkspace.draftId),
    orderB[0],
  );
  assert.equal(
    await page.locator('[data-draft-action="next"]').isDisabled(),
    true,
  );
  await flow.bounds("Restored batch order remains compact");
  await page.screenshot({
    path: `${process.env.DRAFT_BROWSER_OUTPUT}/restored-order.png`,
    fullPage: true,
  });
  flow.finishGeneration();
  await flow.click("resume");
  await until(
    () =>
      page
        .locator("[data-draft-queue-title]")
        .textContent()
        .then((text) => text.includes("2 of 2 ready")),
    "resumed B completes",
  );
  assert.equal(
    await page.locator('[data-draft-action="next"]').isDisabled(),
    false,
  );
  await flow.click("next");
  await until(
    () =>
      page.evaluate(
        (id) => history.state.draftWorkspace.draftId === id,
        orderB[1],
      ),
    "next follows B order",
  );
  assert.equal(
    await page.locator("[data-draft-position]").innerText(),
    "2 / 2",
  );
  assert.equal((await flow.snapshot()).photos.length, distinct ? 4 : 2);
  assert.deepEqual(flow.stats().errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      distinct,
      orderA,
      orderB,
      photos: distinct ? 4 : 2,
      history: "Back/Forward, progress, reload, Resume, completion, Next",
    }),
  );
} finally {
  flow.finishGeneration();
  await context.close();
  await browser.close();
}
