import vm from "node:vm";
import { build } from "esbuild";
import { expect, it } from "vitest";

async function storeDestination(page: string, href: string) {
  const { outputFiles } = await build({
    entryPoints: ["src/scripts/analytics.js"],
    bundle: true,
    format: "iife",
    write: false,
  });
  const link = { href, dataset: { trackContext: "home_hero_primary" } };
  vm.runInNewContext(outputFiles[0].text, {
    URL,
    URLSearchParams,
    window: { location: new URL(page), addEventListener() {} },
    document: {
      querySelectorAll: (selector: string) =>
        selector === "a[href]" ? [link] : [],
      addEventListener() {},
    },
  });
  return new URL(link.href);
}

it("preserves paid acquisition tags when opening the store from a campaign landing page", async () => {
  const result = await storeDestination(
    "https://autolister.app/?utm_source=google&utm_medium=cpc&utm_campaign=seller_search_uk_sep2026&utm_term=listing&gclid=private-click-id",
    "https://chromewebstore.google.com/detail/autolister/id?utm_source=autolister_site&utm_medium=website&utm_campaign=website_cta&utm_content=home_hero_primary",
  );
  expect(result.searchParams.get("utm_source")).toBe("google");
  expect(result.searchParams.get("utm_medium")).toBe("cpc");
  expect(result.searchParams.get("utm_campaign")).toBe(
    "seller_search_uk_sep2026",
  );
  expect(result.searchParams.get("utm_term")).toBe("listing");
  expect(result.searchParams.get("utm_content")).toBe("home_hero_primary");
  expect(result.searchParams.has("gclid")).toBe(false);
});

it("keeps the website fallback for untagged visits", async () => {
  const result = await storeDestination(
    "https://autolister.app/",
    "https://chromewebstore.google.com/detail/autolister/id",
  );
  expect(result.searchParams.get("utm_source")).toBe("autolister_site");
  expect(result.searchParams.get("utm_content")).toBe("home_hero_primary");
});

it("does not retag unrelated destinations or explicit non-website campaigns", async () => {
  for (const href of [
    "https://example.com/?target=chromewebstore.google.com",
    "https://chromewebstore.google.com/detail/autolister/id?utm_source=uninstall_page&utm_campaign=winback",
  ]) {
    const result = await storeDestination(
      "https://autolister.app/?utm_source=google&utm_medium=cpc",
      href,
    );
    expect(result.href).toBe(href);
  }
});
