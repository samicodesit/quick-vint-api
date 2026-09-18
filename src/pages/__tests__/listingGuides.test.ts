import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("localized listing guides", () => {
  it("validates translations, routes and SEO output when built", () => {
    const args = ["scripts/check-listing-guides.mjs"];
    if (existsSync("dist")) args.push("--built");
    const output = execFileSync(process.execPath, args, {
      encoding: "utf8",
    });
    expect(output).toContain("Verified 24 translated listing guides");
  });
});
