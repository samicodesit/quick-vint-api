import assert from "node:assert/strict";

process.env.DRAFT_BROWSER_HARNESS_ONLY = "1";
const { reviewJourney } = await import("./test-local-browser-drafts.mjs");
const { page, context, browser, click, upload } = reviewJourney;
const events = [];
const generationIds = [];
context.on("request", (request) => {
  const path = new URL(request.url()).pathname;
  if (path === "/api/events/track")
    events.push(...(request.postDataJSON().events || []));
  if (path === "/api/generate")
    generationIds.push(request.headers()["x-autolister-request-id"]);
});
async function waitForEvent(predicate) {
  const deadline = Date.now() + 20000;
  while (!events.some(predicate) && Date.now() < deadline)
    await page.waitForTimeout(50);
  const event = events.find(predicate);
  assert.ok(event, "Expected telemetry event to arrive");
  return event;
}

try {
  await page.goto(new URL("/app", process.env.DRAFT_BROWSER_URL).href);
  await page.locator('[data-draft-items][aria-busy="false"]').waitFor();
  await click("new");
  await upload(2);
  // Interrupt the draft's upload before a provider request, then retry the same draft.
  const uploadRoute = "**/api/phone-upload*";
  const abort = (route) => route.abort("connectionreset");
  await context.route(uploadRoute, abort);
  await click("generate");
  const failure = await waitForEvent((e) => e.event === "generation_error");
  assert.ok(failure.context.operationId);
  assert.equal(generationIds.length, 0);
  await context.unroute(uploadRoute, abort);
  await click("generate");
  const success = await waitForEvent((e) => e.event === "generation_success");
  assert.equal(generationIds.length, 1);
  assert.notEqual(generationIds[0], failure.context.operationId);
  assert.equal(
    success.context.operationId,
    generationIds[0],
    "A successful retry must identify its own API request",
  );
  const run = events.filter((e) => e.event === "web_generation_run").at(-1);
  assert.equal(
    run.context.operationId,
    undefined,
    "The queue-level click has no individual draft attempt yet",
  );
  console.log(
    "Upload interruption, retained photos and successful retry correlated to distinct attempts.",
  );
} finally {
  await browser.close();
}
