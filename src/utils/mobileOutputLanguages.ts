export interface MobileOutputLanguage {
  code: string;
  label: string;
  shortLabel: string;
  flagCountryCode: string;
}

/**
 * Keep this list in the same order and with the same country flags as the
 * extension. `shortLabel` is retained for data parity only. The mobile UI
 * deliberately renders the flag and full label instead.
 */
export const SUPPORTED_OUTPUT_LANGUAGES: readonly MobileOutputLanguage[] = [
  { code: "en", label: "English", shortLabel: "EN", flagCountryCode: "gb" },
  { code: "fr", label: "Français", shortLabel: "FR", flagCountryCode: "fr" },
  { code: "cz", label: "Čeština", shortLabel: "CZ", flagCountryCode: "cz" },
  { code: "da", label: "Dansk", shortLabel: "DA", flagCountryCode: "dk" },
  { code: "nl", label: "Nederlands", shortLabel: "NL", flagCountryCode: "nl" },
  { code: "de", label: "Deutsch", shortLabel: "DE", flagCountryCode: "de" },
  { code: "el", label: "Ελληνικά", shortLabel: "EL", flagCountryCode: "gr" },
  { code: "hr", label: "Hrvatski", shortLabel: "HR", flagCountryCode: "hr" },
  { code: "fi", label: "Suomeksi", shortLabel: "FI", flagCountryCode: "fi" },
  { code: "hu", label: "Magyar", shortLabel: "HU", flagCountryCode: "hu" },
  { code: "it", label: "Italiano", shortLabel: "IT", flagCountryCode: "it" },
  { code: "lt", label: "Lietuvių", shortLabel: "LT", flagCountryCode: "lt" },
  { code: "pl", label: "Polski", shortLabel: "PL", flagCountryCode: "pl" },
  { code: "pt", label: "Português", shortLabel: "PT", flagCountryCode: "pt" },
  { code: "ro", label: "Română", shortLabel: "RO", flagCountryCode: "ro" },
  { code: "es", label: "Español", shortLabel: "ES", flagCountryCode: "es" },
  { code: "sk", label: "Slovenčina", shortLabel: "SK", flagCountryCode: "sk" },
  { code: "sv", label: "Svenska", shortLabel: "SV", flagCountryCode: "se" },
];

const SUPPORTED_LANGUAGE_CODES = new Set(
  SUPPORTED_OUTPUT_LANGUAGES.map((language) => language.code),
);

export function normalizeMobileLanguageCode(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return normalized === "cs" ? "cz" : normalized;
}

export function getMobileOutputLanguage(
  value: unknown,
): MobileOutputLanguage | undefined {
  const code = normalizeMobileLanguageCode(value);
  return SUPPORTED_OUTPUT_LANGUAGES.find((language) => language.code === code);
}

export function isSupportedMobileLanguage(value: unknown): boolean {
  return SUPPORTED_LANGUAGE_CODES.has(normalizeMobileLanguageCode(value));
}

export function getMobileLanguageFlagUrl(
  language: MobileOutputLanguage,
): string {
  return `https://flagcdn.com/w40/${language.flagCountryCode}.png`;
}
