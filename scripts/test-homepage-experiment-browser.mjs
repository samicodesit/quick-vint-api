import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.HOME_BROWSER_URL || "http://127.0.0.1:4357";
assert.ok(new URL(base).hostname === "127.0.0.1", "Fixture telemetry must stay local");
const output = process.env.HOME_BROWSER_OUTPUT || "/tmp/autolister-homepage-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let externalRequests = 0;
const blockedHosts = [];
async function fixture(width, bit, { denied = false, blocked = false, coldTap = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
  const events = [], errors = [];
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      if (url.hostname === "www.googletagmanager.com") return route.fulfill({ contentType: "application/javascript", body: "" });
      externalRequests++;
      blockedHosts.push(url.hostname);
      return route.abort();
    }
    if (url.pathname === "/api/events/track") {
      const batch = route.request().postDataJSON().events || [];
      events.push(...batch);
      return route.fulfill({ json: { acknowledgedIds: batch.map(e => e.id) } });
    }
    if (url.pathname === "/api/public-stats") return route.fulfill({ json: { generations: 11739, totalGenerations: 11739 } });
    if (coldTap && url.pathname === "/vid-promo.mp4") await new Promise(resolve => setTimeout(resolve, 800));
    return route.continue();
  });
  await context.addInitScript(({ bit, denied, blocked, coldTap }) => {
    const random = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = array => array instanceof Uint32Array && array.length === 1 ? array.fill(bit) : random(array);
    if (denied) Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage denied fixture"); } });
    window.firstHeroPaint = null;
    const observe = () => {
      const button = document.querySelector(".home-entry-web"), demo = document.querySelector(".home-hero-demo");
      if (button && demo && !window.firstHeroPaint && button.getBoundingClientRect().width) window.firstHeroPaint = { variant: document.documentElement.dataset.homeEntryVariant, button: button.getBoundingClientRect().top, demo: demo.getBoundingClientRect().top };
      if (!window.firstHeroPaint) requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
    if (blocked) {
      let tapped = false;
      document.addEventListener("pointerdown", e => { if (e.isTrusted) tapped = true; }, true);
      document.addEventListener("play", e => { if (e.target instanceof HTMLVideoElement && !tapped) e.target.pause(); }, true);
      new MutationObserver(() => document.querySelectorAll("video[autoplay]").forEach(v => v.removeAttribute("autoplay"))).observe(document, { subtree: true, childList: true });
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function() { return navigator.userActivation.isActive && !window.fullscreenConsumedTap ? play.call(this) : Promise.reject(new DOMException("Autoplay denied", "NotAllowedError")); };
      if (coldTap) HTMLVideoElement.prototype.requestFullscreen = async function() { window.fullscreenConsumedTap = true; await new Promise(resolve => setTimeout(resolve, 300)); };
    }
  }, { bit, denied, blocked, coldTap });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  return { context, page, events, errors };
}
try {
  for (const width of [320, 360, 390]) for (const bit of [0, 1]) {
    console.log(`Checking ${width}px ${bit ? "B" : "A"}`);
    const f = await fixture(width, bit);
    await f.page.goto(base);
    await f.page.waitForFunction(() => window.firstHeroPaint);
    const first = await f.page.evaluate(() => window.firstHeroPaint);
    assert.equal(first.variant, bit ? "b" : "a", "Assigned before the first visible hero frame");
    assert.equal(first.button < first.demo, Boolean(bit), "Only B moves the app action before the full demo");
    assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "No sideways scroll");
    await f.page.waitForFunction(() => localStorage.getItem("autolister.home-entry.v1.exposed") === "1");
    await f.page.waitForTimeout(1400);
    const exposure = f.events.find(e => e.event === "home_hero_exposure");
    assert.ok(exposure?.context.analyticsClientId);
    assert.equal(exposure.context.heroVariant, bit ? "b" : "a");
    assert.equal(exposure.context.heroExperiment, "mobile-entry-v1");
    await f.page.reload();
    await f.page.waitForTimeout(1400);
    assert.equal(f.events.filter(e => e.event === "home_hero_exposure").length, 1, "Refresh does not create another exposure");
    assert.equal(await f.page.locator("html").getAttribute("data-home-entry-variant"), bit ? "b" : "a");
    await f.page.locator(".home-entry-web").click();
    await f.page.waitForURL("**/app?ref=home_hero", { waitUntil: "domcontentloaded" });
    await f.page.waitForTimeout(1400);
    const click = f.events.find(e => e.event === "web_app_click");
    assert.equal(click.context.analyticsClientId, exposure.context.analyticsClientId);
    assert.equal(click.context.heroVariant, exposure.context.heroVariant);
    assert.deepEqual(f.errors, []);
    results.push({ width, variant: first.variant, beforePaint: true, stable: true, attributedEntry: true });
    await f.context.close();
  }
  for (const locale of ["fr", "de", "nl", "pl", "es", "it", "pt"]) {
    const f = await fixture(390, 1);
    await f.page.goto(`${base}/${locale}/`);
    assert.equal(await f.page.locator("html").getAttribute("data-home-entry-variant"), "b");
    assert.ok(await f.page.locator(".home-entry-device-label").isVisible());
    assert.ok(!(await f.page.locator(".home-entry-device-label").textContent()).includes("or computer"));
    assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(f.errors, []);
    results.push({ locale, translated: true });
    await f.context.close();
  }
  const boxes = [];
  for (const variant of ["a", "b"]) {
    const f = await fixture(1440, 1);
    await f.context.addInitScript(variant => localStorage.setItem("autolister.home-entry.v1", JSON.stringify({ id: "mobile-entry-v1", variant, enrolledAt: Date.now() })), variant);
    await f.page.goto(base);
    boxes.push([await f.page.locator(".home-entry-web").boundingBox(), await f.page.locator(".home-hero-demo").boundingBox()]);
    assert.ok(!(await f.page.locator(".home-entry-device-label").isVisible()));
    assert.deepEqual(f.errors, []);
    await f.context.close();
  }
  assert.deepEqual(boxes[0], boxes[1], "Desktop geometry is identical for both assignments");
  const denied = await fixture(390, 1, { denied: true });
  await denied.page.goto(base);
  assert.equal(await denied.page.locator("html").getAttribute("data-home-entry-variant"), null);
  await denied.page.waitForTimeout(1400);
  assert.equal(denied.events.filter(e => e.event === "home_hero_exposure").length, 0);
  assert.deepEqual(denied.errors, []);
  await denied.context.close();
  for (const bit of [0, 1]) for (const blocked of [false, true]) {
    const f = await fixture(390, bit, { blocked });
    await f.page.goto(base);
    await f.page.waitForFunction(() => document.querySelector("video")?.readyState === 4);
    if (blocked) {
      assert.equal(await f.page.locator("video").evaluate(v => v.paused), true, "Fixture really denied native and scripted autoplay");
      await f.page.screenshot({ path: `${output}/${bit ? "b" : "a"}-phone.png` });
    } else await f.page.waitForFunction(() => !document.querySelector("video").paused);
    await f.page.locator("button[data-open-fullscreen]").click();
    await f.page.waitForFunction(() => !document.querySelector("video").paused);
    assert.equal(await f.page.locator("video").evaluate(v => v.error), null);
    assert.deepEqual(f.errors, []);
    results.push({ variant: bit ? "b" : "a", blockedAutoplay: blocked, firstTapPlays: true });
    await f.context.close();
  }
  assert.ok(blockedHosts.every(host => host === "flagcdn.com"), `Only optional language flags may be requested outside the fixture: ${blockedHosts.join(",")}`);
  const cold = await fixture(390, 1, { blocked: true, coldTap: true });
  await cold.page.goto(base, { waitUntil: "domcontentloaded" });
  await cold.page.locator("button[data-open-fullscreen]").click();
  await cold.page.waitForFunction(() => !document.querySelector("video").paused && document.querySelector("video").readyState >= 3);
  assert.deepEqual(cold.errors, []);
  results.push({ coldFirstTap: true, fullscreenConsumedGesture: true, bufferedPlayback: true });
  await cold.context.close();
  console.log(JSON.stringify({ passed: results.length + 2, results, desktopIdentical: true, deniedStorageSafe: true, externalRequestsBlocked: externalRequests, productionRequestsSent: 0 }));
} finally { await browser.close(); }
