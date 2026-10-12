import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const layout = await readFile(
  new URL("../src/layouts/SiteLayout.astro", import.meta.url),
  "utf8",
);
const setup = layout.match(
  /<script is:inline>\s*(window\.dataLayer[\s\S]*?)<\/script>/,
)?.[1];
assert.ok(setup, "Read the actual shared website tag setup");
const measurementId = setup.match(/gtag\("config", "(G-[A-Z0-9]+)"\)/)?.[1];
assert.ok(measurementId);
const response = await fetch(
  `https://www.googletagmanager.com/gtag/js?id=${measurementId}`,
  { signal: AbortSignal.timeout(10000) },
);
assert.ok(response.ok, "Official Google tag library is available");
const sdk = await response.text();
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const broken of [false, true]) {
    const context = await browser.newContext();
    const capturedEvents = [],
      errors = [];
    const tagSetup = broken
      ? `window.dataLayer=[];function gtag(...args){dataLayer.push(args);}gtag('js',new Date());gtag('config','${measurementId}');`
      : setup;
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/qa-google-tag")
        return route.fulfill({
          contentType: "text/html",
          body: `<script>${tagSetup}</script><script src="https://www.googletagmanager.com/gtag/js?id=${measurementId}"></script>`,
        });
      if (
        url.hostname === "www.googletagmanager.com" &&
        url.pathname === "/gtag/js"
      )
        return route.fulfill({
          contentType: "application/javascript",
          body: sdk,
        });
      if (url.pathname.includes("collect")) {
        const body = new URLSearchParams(route.request().postData() || "");
        capturedEvents.push(
          url.searchParams.get("en") || body.get("en") || "other",
        );
      }
      // No Analytics event is sent. Only the official library was fetched.
      return route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("https://autolister.app/qa-google-tag");
    await page.waitForTimeout(2500);
    assert.deepEqual(errors, []);
    assert.equal(
      capturedEvents.includes("page_view"),
      !broken,
      broken
        ? "Negative control must reproduce the broken array queue"
        : "The shipped setup must produce a real page-view request",
    );
    results.push({
      case: broken ? "broken_negative_control" : "actual_site_setup",
      capturedEvents,
      analyticsRequestsSent: 0,
    });
    await context.close();
  }
  console.log(JSON.stringify({ passed: results.length, results }));
} finally {
  await browser.close();
}
