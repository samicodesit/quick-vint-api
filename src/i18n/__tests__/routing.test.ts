import { describe, expect, it } from "vitest";
import { LOCALE_FLAGS, localizedPath } from "../routing.js";
import { SUPPORTED_SITE_LOCALES } from "../site.js";

describe("localized routing", () => {
  it("builds root and nested paths for default and localized routes", () => {
    const cases = [
      ["en", "/", "/"],
      ["en", "/pricing", "/pricing"],
      ["en", "/pricing/", "/pricing"],
      ["en", "pricing", "/pricing"],
      ["fr", "/", "/fr/"],
      ["fr", "/pricing", "/fr/pricing"],
      ["de", "/", "/de/"],
      ["de", "/pricing", "/de/pricing"],
      ["nl", "/pricing", "/nl/pricing"],
      ["fr", "/pricing/", "/fr/pricing"],
      ["es", "pricing", "/es/pricing"],
    ] as const;

    for (const [locale, path, expected] of cases) {
      expect(localizedPath(locale, path), `${locale} ${path}`).toBe(expected);
    }
  });

  it("produces clean absolute paths for every supported locale", () => {
    for (const locale of SUPPORTED_SITE_LOCALES) {
      for (const path of ["/", "/pricing"]) {
        const result = localizedPath(locale, path);
        expect(result.startsWith("/"), `${locale} ${path}`).toBe(true);
        expect(result.includes("//"), `${locale} ${path}`).toBe(false);
      }
    }
  });

  it("defines one non-empty flag for every supported locale", () => {
    expect(Object.keys(LOCALE_FLAGS)).toEqual([...SUPPORTED_SITE_LOCALES]);
    for (const locale of SUPPORTED_SITE_LOCALES) {
      expect(typeof LOCALE_FLAGS[locale], locale).toBe("string");
      expect(LOCALE_FLAGS[locale].length, locale).toBeGreaterThan(0);
    }
  });
});
