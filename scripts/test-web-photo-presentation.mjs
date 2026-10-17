import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

process.env.DRAFT_BROWSER_INTERACTIVE = "1";
process.env.DRAFT_BROWSER_HEADLESS = "1";
process.env.DRAFT_BROWSER_OUTPUT ||= "/tmp/autolister-web-photo-presentation";
const { reviewJourney: flow } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser } = flow;
try {
  await page.locator("[data-style-finish]:visible").click();
  await flow.click("back");
  await flow.click("bulk");
  await page.evaluate(() => {
    const pool = document.querySelector("[data-draft-pool]");
    window.photoRenderProbe = {
      added: 0,
      removed: 0,
      started: performance.now(),
    };
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        window.photoRenderProbe.added += r.addedNodes.length;
        window.photoRenderProbe.removed += r.removedNodes.length;
      }
    });
    observer.observe(pool, { childList: true });
  });
  await flow.upload(20, true);
  const imports = (await flow.snapshot()).photos.map((p) => p.id).sort();
  assert.equal(imports.length, 20);
  const importProbe = await page.evaluate(() => ({
    ...window.photoRenderProbe,
    elapsedMs: performance.now() - window.photoRenderProbe.started,
  }));
  await page
    .getByRole("checkbox", { name: "Select photo 1", exact: true })
    .check();
  await page.evaluate(() => {
    window.originalPoolPhoto = document.querySelector("[data-draft-pool] img");
    window.photoRenderProbe.added = window.photoRenderProbe.removed = 0;
  });
  await flow.click("close-import");
  await page
    .getByRole("button", { name: "Continue grouping", exact: true })
    .click();
  const revisitProbe = await page.evaluate(() => ({
    samePhotoNode:
      window.originalPoolPhoto ===
      document.querySelector("[data-draft-pool] img"),
    added: window.photoRenderProbe.added,
    removed: window.photoRenderProbe.removed,
  }));
  await writeFile(
    `${process.env.DRAFT_BROWSER_OUTPUT}/render-probe.json`,
    JSON.stringify({ importProbe, revisitProbe }, null, 2),
  );
  console.log(JSON.stringify({ importProbe, revisitProbe }));
  assert.equal(
    revisitProbe.samePhotoNode,
    true,
    "reopening an unchanged photo pool must retain its image nodes instead of recreating them",
  );
  assert.equal(
    revisitProbe.removed,
    0,
    "unchanged pool view changes must not rebuild all thumbnails",
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Select photo 1", exact: true })
      .isChecked(),
    true,
  );
  assert.deepEqual(
    (await flow.snapshot()).photos.map((p) => p.id).sort(),
    imports,
  );
  const heights = new Map();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    heights.set(
      width,
      await page
        .locator("[data-draft-pool] img")
        .first()
        .evaluate((img) => img.getBoundingClientRect().height),
    );
  }
  await page
    .getByRole("checkbox", { name: "Select photo 2", exact: true })
    .check();
  await flow.click("group");
  await page.locator(".draft-group-card").first().click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const height = await page
      .locator("[data-draft-item-photos] img")
      .first()
      .evaluate((img) => img.getBoundingClientRect().height);
    assert.equal(
      height,
      heights.get(width),
      `batch and single preparation thumbnails match at ${width}px`,
    );
    await flow.bounds(`Photo preparation fits ${width}px`);
  }
  flow.holdNextGeneration();
  await flow.click("generate");
  await page
    .locator('#draft-editor-title[data-presentation="working"] svg')
    .waitFor();
  assert.equal(
    await page.locator("#draft-editor-title svg").getAttribute("aria-hidden"),
    "true",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await flow.bounds(`Active loading indicator fits ${width}px`);
    const title = await page.locator("#draft-editor-title").boundingBox();
    const controls = await page
      .locator("[data-draft-upload-actions]")
      .boundingBox();
    assert.ok(
      title.x + title.width <= controls.x ||
        controls.x + controls.width <= title.x ||
        title.y + title.height <= controls.y ||
        controls.y + controls.height <= title.y,
      `loading heading and photo action do not overlap at ${width}px`,
    );
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator("#draft-editor-title svg")
      .evaluate((icon) => getComputedStyle(icon).animationName),
    "none",
  );
  const generationDeadline = Date.now() + 15000;
  while (flow.stats().generations !== 1) {
    assert.ok(
      Date.now() < generationDeadline,
      "controlled generation must start",
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  flow.finishGeneration();
  await page.waitForFunction(
    () =>
      document.querySelector("#draft-editor-title").textContent ===
      "Review and copy",
  );
  assert.equal(
    await page.locator("#draft-editor-title svg").count(),
    0,
    "a completed item must not keep a loading indicator",
  );
  assert.deepEqual(
    (await flow.snapshot()).photos.map((p) => p.id).sort(),
    imports,
  );
  assert.deepEqual(flow.stats().errors, []);
} finally {
  flow.finishGeneration();
  await context.close();
  await browser.close();
}
