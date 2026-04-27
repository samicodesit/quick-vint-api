import { describe, it, expect } from "vitest";
import { localizedPath, LOCALE_FLAGS } from "../routing.js";
import { SUPPORTED_SITE_LOCALES } from "../site.js";

describe("localizedPath", () => {
  describe("English (default locale)", () => {
    it("returns / for en + /", () => {
      expect(localizedPath("en", "/")).toBe("/");
    });

    it("returns /pricing for en + /pricing", () => {
      expect(localizedPath("en", "/pricing")).toBe("/pricing");
    });

    it("strips trailing slash on non-root paths for en", () => {
      expect(localizedPath("en", "/pricing/")).toBe("/pricing");
    });

    it("prepends slash if missing for en", () => {
      expect(localizedPath("en", "pricing")).toBe("/pricing");
    });
  });

  describe("Non-default locales", () => {
    it("returns /fr/ for fr + /", () => {
      expect(localizedPath("fr", "/")).toBe("/fr/");
    });

    it("returns /fr/pricing for fr + /pricing", () => {
      expect(localizedPath("fr", "/pricing")).toBe("/fr/pricing");
    });

    it("returns /de/ for de + /", () => {
      expect(localizedPath("de", "/")).toBe("/de/");
    });

    it("returns /de/pricing for de + /pricing", () => {
      expect(localizedPath("de", "/pricing")).toBe("/de/pricing");
    });

    it("returns /nl/pricing for nl + /pricing", () => {
      expect(localizedPath("nl", "/pricing")).toBe("/nl/pricing");
    });

    it("strips trailing slash on non-root paths for non-en", () => {
      expect(localizedPath("fr", "/pricing/")).toBe("/fr/pricing");
    });

    it("prepends slash if missing for non-en", () => {
      expect(localizedPath("es", "pricing")).toBe("/es/pricing");
    });
  });

  describe("All supported locales produce valid paths", () => {
    const paths = ["/", "/pricing"];

    SUPPORTED_SITE_LOCALES.forEach((lang) => {
      paths.forEach((path) => {
        it(`localizedPath("${lang}", "${path}") starts with /`, () => {
          const result = localizedPath(lang, path);
          expect(result.startsWith("/")).toBe(true);
        });

        it(`localizedPath("${lang}", "${path}") does not contain double slashes`, () => {
          const result = localizedPath(lang, path);
          expect(result.includes("//")).toBe(false);
        });
      });
    });
  });
});

describe("LOCALE_FLAGS", () => {
  it("has an entry for every supported locale", () => {
    SUPPORTED_SITE_LOCALES.forEach((lang) => {
      expect(LOCALE_FLAGS[lang]).toBeDefined();
    });
  });

  it("each flag is a non-empty string", () => {
    SUPPORTED_SITE_LOCALES.forEach((lang) => {
      expect(typeof LOCALE_FLAGS[lang]).toBe("string");
      expect(LOCALE_FLAGS[lang].length).toBeGreaterThan(0);
    });
  });

  it("has exactly the same count as SUPPORTED_SITE_LOCALES", () => {
    expect(Object.keys(LOCALE_FLAGS).length).toBe(
      SUPPORTED_SITE_LOCALES.length,
    );
  });
});
