import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_LOCALE,
  SITE_COPY,
  SITE_EXTRA_COPY,
  SUPPORTED_SITE_LOCALES,
  normalizeSiteLocale,
} from "../site.js";

function expectNonEmptyString(value: unknown, label: string) {
  expect(typeof value, label).toBe("string");
  expect((value as string).trim().length, label).toBeGreaterThan(0);
}

describe("site localization", () => {
  it("normalizes supported, regional, and invalid locales", () => {
    const cases: Array<[string | null | undefined, string]> = [
      [undefined, "en"],
      [null, "en"],
      ["", "en"],
      ["   ", "en"],
      ["xx", "en"],
      ["en", "en"],
      ["fr", "fr"],
      ["FR", "fr"],
      ["De", "de"],
      ["fr-FR", "fr"],
      ["pt-BR", "pt"],
      ["nl_NL", "nl"],
      ["xx-XX", "en"],
    ];

    for (const [input, expected] of cases) {
      expect(normalizeSiteLocale(input), String(input)).toBe(expected);
    }
    expect(DEFAULT_SITE_LOCALE).toBe("en");
  });

  it("keeps the exact supported locale order", () => {
    expect(SUPPORTED_SITE_LOCALES).toEqual([
      "en",
      "fr",
      "de",
      "nl",
      "pl",
      "es",
      "it",
      "pt",
    ]);
  });

  it("populates the shared site copy for every locale", () => {
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
    const homeKeys = [
      "seoTitle",
      "seoDescription",
      "heroTitle",
      "heroSubtitle",
    ] as const;
    const pricingKeys = [
      "seoTitle",
      "seoDescription",
      "heading",
      "headingAccent",
      "subtitle",
      "subtitleLine2",
    ] as const;

    for (const locale of SUPPORTED_SITE_LOCALES) {
      expectNonEmptyString(
        SITE_COPY[locale].languageName,
        `${locale}.languageName`,
      );
      for (const key of navKeys) {
        expectNonEmptyString(
          SITE_COPY[locale].nav[key],
          `${locale}.nav.${key}`,
        );
      }
      for (const key of homeKeys) {
        expectNonEmptyString(
          SITE_COPY[locale].home[key],
          `${locale}.home.${key}`,
        );
      }
      for (const key of pricingKeys) {
        expectNonEmptyString(
          SITE_COPY[locale].pricing[key],
          `${locale}.pricing.${key}`,
        );
      }
    }
  });

  it("populates the extra home and pricing copy for every locale", () => {
    const homeKeys = Object.keys(SITE_EXTRA_COPY.en.home) as Array<
      keyof (typeof SITE_EXTRA_COPY)["en"]["home"]
    >;
    const pricingKeys = Object.keys(SITE_EXTRA_COPY.en.pricing) as Array<
      keyof (typeof SITE_EXTRA_COPY)["en"]["pricing"]
    >;

    for (const locale of SUPPORTED_SITE_LOCALES) {
      for (const key of homeKeys) {
        const value = SITE_EXTRA_COPY[locale].home[key];
        const label = `${locale}.home.${key}`;
        if (typeof value === "string") expectNonEmptyString(value, label);
        else expect(Object.keys(value).length, label).toBeGreaterThan(0);
      }
      for (const key of pricingKeys) {
        expectNonEmptyString(
          SITE_EXTRA_COPY[locale].pricing[key],
          `${locale}.pricing.${key}`,
        );
      }
    }
  });
});
