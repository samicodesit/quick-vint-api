import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const welcome = readFileSync(
  "src/components/WelcomeFirstListing.astro",
  "utf8",
);

describe("first listing on the install welcome page", () => {
  it("lets sellers open the existing sample independently of any signup or generation", () => {
    expect(welcome).toContain('<details class="sample"');
    expect(welcome).toContain("Try a sample photo");
    expect(welcome).toContain("/app/welcome-sample-dress.webp");
    expect(welcome).toContain("{sampleTitle}");
    expect(welcome).toContain("{sampleDescription}");
  });
});
