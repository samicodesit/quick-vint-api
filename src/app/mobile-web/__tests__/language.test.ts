import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveMobileLanguagePreferences,
  SUPPORTED_LANGUAGE_STORAGE_KEYS,
} from "../language";
import {
  readFormattingPreferences,
  serializeFormattingPreferences,
} from "../formatting";
import { SUPPORTED_OUTPUT_LANGUAGES } from "../../../utils/mobileOutputLanguages";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("mobile web output language preferences", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses shared defaults for browser fallback and persists title and description independently", () => {
    const storage = memoryStorage({
      selectedTitleLanguage: "fr",
      selectedDescriptionLanguage: "it",
    });
    const sharedDefaultsResolve = vi.fn(() => ({
      selectedLanguage: "de",
      titleLanguageCode: "fr",
      descriptionLanguageCode: "it",
    }));
    vi.stubGlobal("AutoListerLanguageDefaults", {
      resolveListingLanguagePreferences: sharedDefaultsResolve,
    });

    const result = resolveMobileLanguagePreferences({
      storage,
      hostname: "",
      navigatorLanguages: ["de-DE"],
      navigatorLanguage: "de-DE",
    });

    expect(result).toEqual({
      languageCode: "de",
      titleLanguageCode: "fr",
      descriptionLanguageCode: "it",
    });
    expect(sharedDefaultsResolve).toHaveBeenCalledWith(
      {
        selectedLanguage: null,
        selectedTitleLanguage: "fr",
        selectedDescriptionLanguage: "it",
      },
      {
        hostname: "",
        navigatorLanguages: ["de-DE"],
        navigatorLanguage: "de-DE",
      },
    );
    expect(
      SUPPORTED_LANGUAGE_STORAGE_KEYS.map((key) => [
        key,
        storage.values.get(key),
      ]),
    ).toEqual([
      ["selectedLanguage", "de"],
      ["selectedTitleLanguage", "fr"],
      ["selectedDescriptionLanguage", "it"],
    ]);
  });

  it("normalizes legacy cs values and uses browser language when shared defaults are absent", () => {
    const storage = memoryStorage({
      selectedLanguage: "cs-CZ",
      selectedTitleLanguage: "cs",
    });

    const result = resolveMobileLanguagePreferences({
      storage,
      hostname: "",
      navigatorLanguages: ["nl-NL"],
      navigatorLanguage: "en-US",
    });

    expect(result).toEqual({
      languageCode: "cz",
      titleLanguageCode: "cz",
      descriptionLanguageCode: "cz",
    });
    expect(storage.values.get("selectedTitleLanguage")).toBe("cz");
    expect(storage.values.get("selectedDescriptionLanguage")).toBe("cz");
  });

  it("keeps the extension language order, labels, and flag country codes", () => {
    expect(SUPPORTED_OUTPUT_LANGUAGES).toEqual([
      { code: "en", label: "English", shortLabel: "EN", flagCountryCode: "gb" },
      {
        code: "fr",
        label: "Français",
        shortLabel: "FR",
        flagCountryCode: "fr",
      },
      { code: "cz", label: "Čeština", shortLabel: "CZ", flagCountryCode: "cz" },
      { code: "da", label: "Dansk", shortLabel: "DA", flagCountryCode: "dk" },
      {
        code: "nl",
        label: "Nederlands",
        shortLabel: "NL",
        flagCountryCode: "nl",
      },
      { code: "de", label: "Deutsch", shortLabel: "DE", flagCountryCode: "de" },
      {
        code: "el",
        label: "Ελληνικά",
        shortLabel: "EL",
        flagCountryCode: "gr",
      },
      {
        code: "hr",
        label: "Hrvatski",
        shortLabel: "HR",
        flagCountryCode: "hr",
      },
      {
        code: "fi",
        label: "Suomeksi",
        shortLabel: "FI",
        flagCountryCode: "fi",
      },
      { code: "hu", label: "Magyar", shortLabel: "HU", flagCountryCode: "hu" },
      {
        code: "it",
        label: "Italiano",
        shortLabel: "IT",
        flagCountryCode: "it",
      },
      {
        code: "lt",
        label: "Lietuvių",
        shortLabel: "LT",
        flagCountryCode: "lt",
      },
      { code: "pl", label: "Polski", shortLabel: "PL", flagCountryCode: "pl" },
      {
        code: "pt",
        label: "Português",
        shortLabel: "PT",
        flagCountryCode: "pt",
      },
      { code: "ro", label: "Română", shortLabel: "RO", flagCountryCode: "ro" },
      { code: "es", label: "Español", shortLabel: "ES", flagCountryCode: "es" },
      {
        code: "sk",
        label: "Slovenčina",
        shortLabel: "SK",
        flagCountryCode: "sk",
      },
      { code: "sv", label: "Svenska", shortLabel: "SV", flagCountryCode: "se" },
    ]);
  });
});

describe("mobile web listing formatting", () => {
  it("uses Short and Bullets defaults and serializes exact generation fields", () => {
    expect(readFormattingPreferences(memoryStorage())).toEqual({
      descriptionLength: "short",
      useBulletPoints: true,
    });
    expect(
      serializeFormattingPreferences({
        descriptionLength: "short",
        useBulletPoints: false,
      }),
    ).toEqual({
      descriptionLength: "short",
      useBulletPoints: false,
    });
  });
});
