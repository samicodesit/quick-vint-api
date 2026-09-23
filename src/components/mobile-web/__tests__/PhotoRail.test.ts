import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/components/mobile-web/PhotoRail.astro",
  "utf8",
);

describe("mobile photo rail compact contract", () => {
  it("keeps compact draft photos in one smaller horizontal row", () => {
    expect(source).toContain(".mobile-photo-rail.is-compact");
    expect(source).toContain(
      ".mobile-photo-rail.is-compact .photo-rail-scroll",
    );
    expect(source).toContain(".mobile-photo-rail.is-compact .photo-tile");
    expect(source).toContain("overflow-x: auto");
    expect(source).toContain("overflow-y: hidden");
  });
});
