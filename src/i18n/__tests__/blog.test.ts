import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_COPY } from "../blog";

const englishCategorySource = readFileSync(
  join(process.cwd(), "src/pages/blog/category/[category].astro"),
  "utf8",
);
const localizedCategorySource = readFileSync(
  join(process.cwd(), "src/pages/[lang]/blog/category/[category].astro"),
  "utf8",
);

describe("blog framing copy", () => {
  it("keeps the blog hub marketplace-neutral across locales", () => {
    for (const [locale, copy] of Object.entries(BLOG_COPY)) {
      const hubCopy = [
        copy.seoTitle,
        copy.seoDescription,
        copy.eyebrow,
        copy.title,
        copy.subtitle,
        copy.latestSubtitle,
      ].join(" ");

      expect(hubCopy, `${locale} blog hub copy`).not.toMatch(/\bVinted\b/i);
    }
  });

  it("keeps category page metadata marketplace-neutral", () => {
    expect(englishCategorySource).not.toContain("Vinted Seller Blog");
    expect(englishCategorySource).not.toContain("Vinted sellers");
    expect(localizedCategorySource).not.toContain("Vinted sellers");
  });
});
