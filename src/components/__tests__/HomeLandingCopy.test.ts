import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_EXTRA_COPY } from "../../i18n/site";
import { HOME_ENTRY_ROUTES } from "../../i18n/homeEntryRoutes";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/HomeLanding.astro"),
  "utf8",
);

describe("home hero copy", () => {
  it("renders one model teaser badge and one review-before-publishing benefit", () => {
    expect(source).not.toContain("{copy.heroBadgeSafe}");
    expect(source).not.toContain("{copy.heroBulletSafety}");
    expect(source.match(/\{modelCopy\.badge\}/g)).toHaveLength(1);
    expect(source.match(/\{extra\.heroBullet3\}/g)).toHaveLength(2);
  });

  it("describes the photo organizer card by its actual function", () => {
    expect(SITE_EXTRA_COPY.en.home.feature2Title).toBe(
      "Organize photos into items",
    );
    expect(SITE_EXTRA_COPY.en.home.feature2Body).toBe(
      "Group mixed photos into separate items before creating your listing drafts.",
    );
  });
  it("scopes the no-copy-paste promise to the extension route", () => {
    expect(HOME_ENTRY_ROUTES.en.webNote).toContain(
      "Copy your draft into Vinted",
    );
    expect(HOME_ENTRY_ROUTES.en.extensionNote).toContain("directly on Vinted");
    const sharedBenefits = source.slice(
      source.indexOf("<ul"),
      source.indexOf("</ul>"),
    );
    expect(sharedBenefits).not.toContain("{extra.heroBullet2}");
  });

  it("does not render or load blog posts on the homepage", () => {
    expect(source).not.toContain("BlogCard");
    expect(source).not.toContain('getCollection("blog")');
    expect(source).not.toContain("latestPosts");
  });
});
