import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney: h } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser, click, snapshot } = h;
await context.addInitScript(() =>
  document.addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "astro-dev-toolbar{display:none!important}";
    document.head.append(s);
  }),
);
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4348";
const out =
  process.env.DRAFT_BROWSER_OUTPUT ||
  "docs/qa/conversion-reliability/provider-test";
await mkdir(out, { recursive: true });
const cases = JSON.parse(await readFile(out + "/cases.json", "utf8"));
let active = 0,
  downloads = 0;
const outputs = [
  ["wrap-dress-primary.jpg", "wrap-dress-secondary.jpg"],
  [
    "mixed-panel-jacket-primary.jpg",
    "mixed-panel-jacket-remaining-secondary.jpg",
  ],
];
const titles = [
  "Black puff-sleeve wrap dress",
  "Navy jacket with contrasting black sleeves",
];
await context.route(base + "/api/user/model", (r) =>
  r.fulfill({
    json: {
      enabled: true,
      listingPhotosAvailable: true,
      invitationState: "dismissed",
      model: { state: "ready", imageUrl: "/images/user-model-female.webp" },
    },
  }),
);
await context.route(base + "/api/generate", (r) =>
  r.fulfill({
    json: {
      title: titles[active],
      description: active
        ? "Navy textured jacket with black sleeves and side panels. Asymmetric front zip and two zipped pockets."
        : "Black textured wrap dress with short puff sleeves, V-neck and three gold-tone buttons.",
      modelPhotos: {
        jobId: "11111111-2222-4333-8444-555555555555",
        status: "queued",
      },
    },
  }),
);
await context.route(base + "/api/listing-model-photos**", (r) =>
  r.fulfill({
    json: {
      jobId: "11111111-2222-4333-8444-555555555555",
      status: "ready",
      eligible: true,
      canRetry: false,
      photos: ["primary", "secondary"].map((slot, i) => ({
        slot,
        url: "https://drafts-test.supabase.co/fresh/" + outputs[active][i],
      })),
    },
  }),
);
await context.route("https://drafts-test.supabase.co/fresh/**", async (r) => {
  downloads++;
  await r.fulfill({
    contentType: "image/jpeg",
    body: await readFile(
      out + "/" + new URL(r.request().url()).pathname.split("/").pop(),
    ),
  });
});
const results = [];
try {
  await page.goto(base + "/app");
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  for (active = 0; active < cases.length; active++) {
    if (active) await click("back");
    await click("new");
    await page
      .locator('[data-draft-input="item"]')
      .first()
      .setInputFiles(cases[active].sources.slice(0, 2));
    await page.waitForFunction(
      () =>
        !document.querySelector(".draft-upload") &&
        !document.querySelector('[data-draft-action="generate"]').disabled,
    );
    await click("generate");
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-item-photos] .draft-photo")
          .length === 4,
    );
    const stored = await snapshot();
    const current = stored.drafts.find((d) => d.title === titles[active]);
    assert.ok(current, "find current draft by generated title");
    assert.deepEqual(
      stored.photos
        .filter((p) => p.draft_id === current.id)
        .sort((a, b) => a.position - b.position)
        .map((p) => p.origin || "upload"),
      ["model", "model", "upload", "upload"],
    );
    for (const [device, width, height] of [
      ["desktop", 1440, 1000],
      ["mobile", 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: out + "/" + cases[active].name + "-" + device + ".png",
        fullPage: true,
      });
    }
    const before = downloads;
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelectorAll("[data-draft-item-photos] .draft-photo")
          .length === 4,
    );
    assert.equal(downloads, before, "reload keeps local model image blobs");
    results.push({
      item: cases[active].name,
      ordered: true,
      reloaded: true,
      photos: 4,
    });
  }
  await writeFile(
    out + "/placement.json",
    JSON.stringify(
      {
        local: true,
        providerOutputsReal: true,
        applicationResponsesControlled: true,
        databaseWrites: false,
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
