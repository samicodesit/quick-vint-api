import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_EXTRA_COPY } from "../../i18n/site";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/HomeLanding.astro"),
  "utf8",
);

describe("home hero copy", () => {
  it("renders one consolidated badge and one review-before-publishing benefit", () => {
    expect(source).not.toContain("{copy.heroBadgeSafe}");
    expect(source).not.toContain("{copy.heroBulletSafety}");
    expect(source.match(/\{extra\.heroBadgePrimary\}/g)).toHaveLength(2);
    expect(source.match(/\{extra\.heroBullet3\}/g)).toHaveLength(1);
  });

  it("describes the photo organizer card by its actual function", () => {
    expect(SITE_EXTRA_COPY.en.home.feature2Title).toBe(
      "Organize photos into items",
    );
    expect(SITE_EXTRA_COPY.en.home.feature2Body).toBe(
      "Group mixed photos into separate items before creating your listing drafts.",
    );
  });
});
