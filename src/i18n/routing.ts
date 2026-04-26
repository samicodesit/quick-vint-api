import { DEFAULT_SITE_LOCALE } from "./site.js";
import type { SiteLocale } from "./site.js";

export const LOCALE_FLAGS: Record<SiteLocale, string> = {
  en: "gb",
  fr: "fr",
  de: "de",
  nl: "nl",
  pl: "pl",
  es: "es",
  it: "it",
  pt: "pt",
};

/**
 * Returns the absolute path for a given locale and base path.
 *   en + /          → /
 *   en + /pricing   → /pricing
 *   fr + /          → /fr/
 *   fr + /pricing   → /fr/pricing
 */
export function localizedPath(lang: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath =
    cleanPath === "/" ? "/" : cleanPath.replace(/\/$/, "");

  if (lang === DEFAULT_SITE_LOCALE) {
    return normalizedPath;
  }

  if (normalizedPath === "/") {
    return `/${lang}/`;
  }

  return `/${lang}${normalizedPath}`;
}
