import { describe, it, expect } from "vitest";
import {
  normalizeSiteLocale,
  SUPPORTED_SITE_LOCALES,
  DEFAULT_SITE_LOCALE,
  SITE_COPY,
  SITE_EXTRA_COPY,
} from "../site.js";

// ─── normalizeSiteLocale ────────────────────────────────────────────────────

describe("normalizeSiteLocale", () => {
  it("returns 'en' for undefined", () => {
    expect(normalizeSiteLocale(undefined)).toBe("en");
  });

  it("returns 'en' for null", () => {
    expect(normalizeSiteLocale(null)).toBe("en");
  });

  it("returns 'en' for empty string", () => {
    expect(normalizeSiteLocale("")).toBe("en");
  });

  it("returns 'en' for whitespace-only string", () => {
    expect(normalizeSiteLocale("   ")).toBe("en");
  });

  it("returns 'en' for an unknown locale", () => {
    expect(normalizeSiteLocale("xx")).toBe("en");
  });

  it("returns 'en' for 'en'", () => {
    expect(normalizeSiteLocale("en")).toBe("en");
  });

  it("returns 'fr' for 'fr'", () => {
    expect(normalizeSiteLocale("fr")).toBe("fr");
  });

  it("is case-insensitive — 'FR' → 'fr'", () => {
    expect(normalizeSiteLocale("FR")).toBe("fr");
  });

  it("is case-insensitive — 'De' → 'de'", () => {
    expect(normalizeSiteLocale("De")).toBe("de");
  });

  it("strips region subtag from 'fr-FR'", () => {
    expect(normalizeSiteLocale("fr-FR")).toBe("fr");
  });

  it("strips region subtag from 'pt-BR'", () => {
    expect(normalizeSiteLocale("pt-BR")).toBe("pt");
  });

  it("strips region subtag from 'nl_NL' (underscore separator)", () => {
    expect(normalizeSiteLocale("nl_NL")).toBe("nl");
  });

  it("returns 'en' for an unknown region-tagged locale 'xx-XX'", () => {
    expect(normalizeSiteLocale("xx-XX")).toBe("en");
  });

  it("DEFAULT_SITE_LOCALE is 'en'", () => {
    expect(DEFAULT_SITE_LOCALE).toBe("en");
  });
});

// ─── SUPPORTED_SITE_LOCALES ─────────────────────────────────────────────────

describe("SUPPORTED_SITE_LOCALES", () => {
  const EXPECTED = ["en", "fr", "de", "nl", "pl", "es", "it", "pt"] as const;

  it("contains exactly 8 locales", () => {
    expect(SUPPORTED_SITE_LOCALES).toHaveLength(8);
  });

  EXPECTED.forEach((lang) => {
    it(`contains "${lang}"`, () => {
      expect(SUPPORTED_SITE_LOCALES).toContain(lang);
    });
  });

  it("has 'en' as first entry (canonical root)", () => {
    expect(SUPPORTED_SITE_LOCALES[0]).toBe("en");
  });

  it("has no duplicate entries", () => {
    const unique = new Set(SUPPORTED_SITE_LOCALES);
    expect(unique.size).toBe(SUPPORTED_SITE_LOCALES.length);
  });
});

// ─── SITE_COPY completeness ─────────────────────────────────────────────────

describe("SITE_COPY", () => {
  SUPPORTED_SITE_LOCALES.forEach((locale) => {
    describe(`locale "${locale}"`, () => {
      it("has a non-empty languageName", () => {
        expect(SITE_COPY[locale].languageName.trim().length).toBeGreaterThan(0);
      });

      const navKeys = [
        "features",
        "pricing",
        "support",
        "contact",
        "cta",
        "switcherLabel",
        "privacy",
        "terms",
        "copyright",
      ] as const;

      navKeys.forEach((key) => {
        it(`nav.${key} is a non-empty string`, () => {
          const value = SITE_COPY[locale].nav[key];
          expect(typeof value).toBe("string");
          expect(value.trim().length).toBeGreaterThan(0);
        });
      });

      const homeKeys = [
        "seoTitle",
        "seoDescription",
        "heroTitle",
        "heroSubtitle",
        "heroBadgeSafe",
        "heroBulletSafety",
        "comparisonTitle",
        "comparisonSubtitle",
      ] as const;

      homeKeys.forEach((key) => {
        it(`home.${key} is a non-empty string`, () => {
          const value = SITE_COPY[locale].home[key];
          expect(typeof value).toBe("string");
          expect(value.trim().length).toBeGreaterThan(0);
        });
      });

      const pricingKeys = [
        "seoTitle",
        "seoDescription",
        "heading",
        "headingAccent",
        "subtitle",
        "subtitleLine2",
      ] as const;

      pricingKeys.forEach((key) => {
        it(`pricing.${key} is a non-empty string`, () => {
          const value = SITE_COPY[locale].pricing[key];
          expect(typeof value).toBe("string");
          expect(value.trim().length).toBeGreaterThan(0);
        });
      });
    });
  });
});

// ─── SITE_EXTRA_COPY completeness ───────────────────────────────────────────

describe("SITE_EXTRA_COPY", () => {
  const HOME_KEYS = Object.keys(SITE_EXTRA_COPY.en.home) as Array<
    keyof (typeof SITE_EXTRA_COPY)["en"]["home"]
  >;

  const PRICING_KEYS = Object.keys(SITE_EXTRA_COPY.en.pricing) as Array<
    keyof (typeof SITE_EXTRA_COPY)["en"]["pricing"]
  >;

  SUPPORTED_SITE_LOCALES.forEach((locale) => {
    describe(`locale "${locale}"`, () => {
      HOME_KEYS.forEach((key) => {
        it(`home.${key} is a non-empty string`, () => {
          const value = SITE_EXTRA_COPY[locale].home[key];
          expect(typeof value).toBe("string");
          expect(value.trim().length).toBeGreaterThan(0);
        });
      });

      PRICING_KEYS.forEach((key) => {
        it(`pricing.${key} is a non-empty string`, () => {
          const value = SITE_EXTRA_COPY[locale].pricing[key];
          expect(typeof value).toBe("string");
          expect(value.trim().length).toBeGreaterThan(0);
        });
      });
    });
  });
});
