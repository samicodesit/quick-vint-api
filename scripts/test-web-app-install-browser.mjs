import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.DRAFT_BROWSER_URL || "http://127.0.0.1:4357";
assert.equal(new URL(base).hostname, "127.0.0.1");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/app`);
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  assert.equal(manifestHref, "/app/manifest.webmanifest");
  const cdp = await context.newCDPSession(page);
  const result = await cdp.send("Page.getAppManifest");
  assert.deepEqual(
    result.errors,
    [],
    "Chromium accepts the actual served manifest",
  );
  const manifest = JSON.parse(result.data);
  assert.equal(manifest.name, "AutoLister");
  assert.equal(manifest.short_name, "AutoLister");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/app");
  assert.equal(manifest.start_url, "/app");
  assert.equal(manifest.scope, "/app");
  for (const route of [
    "/app",
    "/app/auth/callback",
    "/app?checkout=success",
    "/app?checkout=cancelled",
  ])
    assert.ok(new URL(route, base).pathname.startsWith(manifest.scope));
  assert.equal(new URL("/", base).pathname.startsWith(manifest.scope), false);
  assert.equal(manifest.prefer_related_applications, false);
  for (const icon of manifest.icons) {
    const size = Number(icon.sizes.split("x")[0]);
    assert.ok([192, 512].includes(size));
    const decoded = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, icon.src);
    assert.deepEqual(decoded, { width: size, height: size });
  }
  const quiet = await page.evaluate(async () => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(event);
    return {
      suppressed: event.defaultPrevented,
      workers: (await navigator.serviceWorker.getRegistrations()).length,
      caches: (await caches.keys()).length,
      overlays: document.querySelectorAll('dialog[open], [aria-modal="true"]')
        .length,
    };
  });
  assert.deepEqual(quiet, {
    suppressed: true,
    workers: 0,
    caches: 0,
    overlays: 0,
  });
  assert.equal(
    await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"),
    "/apple-touch-icon.png",
  );
  assert.equal(
    await page
      .locator('meta[name="apple-mobile-web-app-capable"]')
      .getAttribute("content"),
    "yes",
  );
  await page.goto(`${base}/app/auth/callback`);
  assert.equal(
    await page.locator('link[rel="manifest"]').getAttribute("href"),
    manifestHref,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      manifestAccepted: true,
      correctIconSizes: true,
      appAndCallbackInScope: true,
      checkoutReturnsInScope: true,
      installPromptSuppressed: true,
      noWorkersOrCaches: true,
      errors,
      productionRequestsSent: 0,
    }),
  );
} finally {
  await browser.close();
}
