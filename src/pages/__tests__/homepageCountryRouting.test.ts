import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("built homepage country routing", () => {
  it.skipIf(!existsSync("dist")).each([
    ["US", "Compatible with Vinted, Depop, Poshmark and eBay*."],
    ["NL", "Compatible with Vinted &amp; eBay*."],
    [undefined, "Compatible with Vinted &amp; eBay*."],
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
