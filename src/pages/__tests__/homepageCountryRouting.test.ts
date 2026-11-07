import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("built homepage country routing", () => {
  it.skipIf(!existsSync("dist/home-us/index.html"))(
    "keeps canonical homepage SEO identical for US and default crawls",
    () => {
      const normal = readFileSync("dist/home-default/index.html", "utf8");
      const us = readFileSync("dist/home-us/index.html", "utf8");
      for (const pattern of [
        /<title>([\s\S]*?)<\/title>/,
        /<h1[^>]*>([\s\S]*?)<\/h1>/,
        /<meta name="description" content="([^"]*)"/,
      ]) {
        const expected = normal.match(pattern)?.[1];
        expect(expected).toBeTruthy();
        expect(us.match(pattern)?.[1]).toBe(expected);
      }
    },
  );
  it.skipIf(!existsSync("dist")).each([
    ["US", "Compatible with Vinted, Depop, Poshmark and eBay*."],
    ["NL", "Turn your photos into Vinted listing drafts."],
    [undefined, "Turn your photos into Vinted listing drafts."],
  ])(
    "serves the correct initial HTML for %s with filesystem precedence",
    (country, expected) => {
      // Vercel serves existing files before applying high-level rewrites.
      let file = "dist/index.html";
      if (!existsSync(file)) {
        const config = JSON.parse(readFileSync("vercel.json", "utf8"));
        const rule = config.rewrites.find(
          (candidate: any) =>
            candidate.source === "/" &&
            (!candidate.has ||
              candidate.has.every(
                (condition: any) =>
                  condition.type === "header" &&
                  condition.key === "x-vercel-ip-country" &&
                  condition.value === country,
              )),
        );
        expect(
          rule,
          "A default rewrite must also serve unknown countries",
        ).toBeDefined();
        file = `dist${rule.destination}/index.html`;
      }
      expect(readFileSync(file, "utf8")).toContain(expected);
    },
  );
});
