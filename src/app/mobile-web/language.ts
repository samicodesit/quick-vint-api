import {
  getMobileOutputLanguage,
  isSupportedMobileLanguage,
  normalizeMobileLanguageCode,
} from "../../utils/mobileOutputLanguages";

export interface BrowserStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LanguageResolutionInput {
  storage: BrowserStorageAdapter;
  hostname: string;
  navigatorLanguages?: readonly string[];
  navigatorLanguage?: string;
}

export interface MobileLanguagePreferences {
  languageCode: string;
  titleLanguageCode: string;
  descriptionLanguageCode: string;
}

export const SUPPORTED_LANGUAGE_STORAGE_KEYS = [
  "selectedLanguage",
  "selectedTitleLanguage",
  "selectedDescriptionLanguage",
] as const;

type SharedLanguageDefaults = {
  resolveListingLanguagePreferences?: (
    storage?: Record<string, string | null>,
    options?: {
      hostname?: string;
      navigatorLanguages?: readonly string[];
      navigatorLanguage?: string;
    },
  ) => {
    selectedLanguage?: unknown;
    titleLanguageCode?: unknown;
    descriptionLanguageCode?: unknown;
  };
};

declare global {
  // This global is attached by /ui-components/language-defaults.js.
  // eslint-disable-next-line no-var
  var AutoListerLanguageDefaults: SharedLanguageDefaults | undefined;
}

let sharedDefaultsLoad: Promise<void> | null = null;

/** Load the existing extension resolver once in browser contexts. */
export function loadSharedLanguageDefaults(): Promise<void> {
  if (
    globalThis.AutoListerLanguageDefaults?.resolveListingLanguagePreferences
  ) {
    return Promise.resolve();
  }
  if (sharedDefaultsLoad) return sharedDefaultsLoad;
  if (typeof document === "undefined") return Promise.resolve();

  sharedDefaultsLoad = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/ui-components/language-defaults.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      sharedDefaultsLoad = null;
      reject(new Error("language_defaults_load_failed"));
    };
    document.head.appendChild(script);
  });
  return sharedDefaultsLoad;
}

function storedLanguage(
  storage: BrowserStorageAdapter,
  key: string,
): string | null {
  const value = normalizeMobileLanguageCode(storage.getItem(key));
  return isSupportedMobileLanguage(value) ? value : null;
}

function domainLanguage(hostname: string): string | null {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const suffixes: readonly [string, string][] = [
    ["vinted.at", "de"],
    ["vinted.de", "de"],
    ["vinted.fr", "fr"],
    ["vinted.nl", "nl"],
    ["vinted.it", "it"],
    ["vinted.es", "es"],
    ["vinted.pl", "pl"],
    ["vinted.pt", "pt"],
    ["vinted.cz", "cz"],
    ["vinted.sk", "sk"],
    ["vinted.lt", "lt"],
    ["vinted.dk", "da"],
    ["vinted.fi", "fi"],
    ["vinted.hu", "hu"],
    ["vinted.ro", "ro"],
    ["vinted.hr", "hr"],
    ["vinted.se", "sv"],
    ["vinted.gr", "el"],
    ["vinted.co.uk", "en"],
    ["vinted.com.au", "en"],
    ["vinted.ie", "en"],
    ["vinted.com", "en"],
  ];
  const match = suffixes.find(
    ([suffix]) => host === suffix || host.endsWith(`.${suffix}`),
  );
  return match?.[1] ?? null;
}

function browserLanguage(input: LanguageResolutionInput): string {
  const browserNavigator =
    typeof navigator === "undefined" ? undefined : navigator;
  const candidates = [
    ...(input.navigatorLanguages ?? browserNavigator?.languages ?? []),
    input.navigatorLanguage ?? browserNavigator?.language,
  ];
  for (const candidate of candidates) {
    const code = normalizeMobileLanguageCode(candidate);
    if (isSupportedMobileLanguage(code)) return code;
  }
  return "en";
}

function fallbackResolution(
  input: LanguageResolutionInput,
): MobileLanguagePreferences {
  const defaultCode = domainLanguage(input.hostname) ?? browserLanguage(input);
  const languageCode =
    storedLanguage(input.storage, "selectedLanguage") ?? defaultCode;
  const titleLanguageCode =
    storedLanguage(input.storage, "selectedTitleLanguage") ?? languageCode;
  const descriptionLanguageCode =
    storedLanguage(input.storage, "selectedDescriptionLanguage") ??
    languageCode;
  return { languageCode, titleLanguageCode, descriptionLanguageCode };
}

export function resolveMobileLanguagePreferences(
  input: LanguageResolutionInput,
): MobileLanguagePreferences {
  const storageValues = Object.fromEntries(
    SUPPORTED_LANGUAGE_STORAGE_KEYS.map((key) => [
      key,
      input.storage.getItem(key),
    ]),
  ) as Record<string, string | null>;
  const sharedResolver =
    globalThis.AutoListerLanguageDefaults?.resolveListingLanguagePreferences;
  const shared = sharedResolver?.(storageValues, {
    hostname: input.hostname,
    navigatorLanguages: input.navigatorLanguages,
    navigatorLanguage: input.navigatorLanguage,
  });
  const fallback = fallbackResolution(input);
  const languageCode =
    getMobileOutputLanguage(shared?.selectedLanguage)?.code ??
    fallback.languageCode;
  const titleLanguageCode =
    getMobileOutputLanguage(shared?.titleLanguageCode)?.code ??
    fallback.titleLanguageCode;
  const descriptionLanguageCode =
    getMobileOutputLanguage(shared?.descriptionLanguageCode)?.code ??
    fallback.descriptionLanguageCode;
  const result = { languageCode, titleLanguageCode, descriptionLanguageCode };

  for (const [key, value] of Object.entries(result)) {
    input.storage.setItem(
      key === "languageCode"
        ? "selectedLanguage"
        : key === "titleLanguageCode"
          ? "selectedTitleLanguage"
          : "selectedDescriptionLanguage",
      value,
    );
  }
  return result;
}
