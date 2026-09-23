import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const configSource = readFileSync("astro.config.mjs", "utf8");

describe("public sitemap boundaries", () => {
  it("excludes private app and account routes from the sitemap filter", () => {
    for (const path of [
      "/app",
      "/app/auth/callback",
      "/auth/callback",
      "/customer-usage",
    ]) {
      expect(configSource).toContain(`"${path}"`);
    }
  });

  it("does not emit private routes in the built sitemap", () => {
    const sitemapPath = "dist/sitemap-0.xml";
    if (!existsSync(sitemapPath)) return;
    const sitemap = readFileSync(sitemapPath, "utf8");
    for (const path of [
      "/app/",
      "/app/auth/callback/",
      "/auth/callback/",
      "/customer-usage/",
    ]) {
      expect(sitemap).not.toContain(`https://autolister.app${path}`);
    }
  });
});
