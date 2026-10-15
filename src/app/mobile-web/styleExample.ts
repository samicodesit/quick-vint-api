import {
  detectLanguage,
  getTranslation,
  normalizeLanguage,
  translations,
} from "./styleTranslations";
export type ListingStyle = {
  titleLanguage: string;
  descriptionLanguage: string;
  length: "short" | "long";
  bullets: boolean;
  hashtags: boolean;
  emojis: boolean;
  includeNote: boolean;
  note: string;
};
export const initialStyle: ListingStyle = {
  titleLanguage: "en",
  descriptionLanguage: "en",
  length: "short",
  bullets: true,
  hashtags: true,
  emojis: true,
  includeNote: false,
  note: "",
};
export function resolveInitialStyle(
  languages: readonly string[],
  saved: Record<string, string | null> = {},
): ListingStyle {
  const detected = detectLanguage(languages);
  const supported = (value: string | null | undefined) =>
    translations.some((t) => t.code === normalizeLanguage(value))
      ? normalizeLanguage(value)
      : null;
  const base = supported(saved.selectedLanguage) ?? detected;
  return {
    ...initialStyle,
    titleLanguage: supported(saved.selectedTitleLanguage) ?? base,
    descriptionLanguage: supported(saved.selectedDescriptionLanguage) ?? base,
  };
}
/** Same settings contract as the existing web draft workspace, kept in memory here. */
export function draftSettingsFromStyle(style: ListingStyle) {
  return {
    titleLanguageCode: style.titleLanguage,
    descriptionLanguageCode: style.descriptionLanguage,
    descriptionLength: style.length,
    useBulletPoints: style.bullets,
    useEmojis: style.emojis,
    useHashtags: style.hashtags,
    tone: "standard" as const,
    includeSellerNote: style.includeNote && Boolean(style.note.trim()),
    descriptionFooterText: style.note.trim(),
  };
}
/** Prepared translations and concise rewrites of the same five source details. */
export function buildExample(style: ListingStyle) {
  const text = getTranslation(style.descriptionLanguage).example;
  return {
    title: getTranslation(style.titleLanguage).example.title,
    intro:
      (style.length === "short" ? text.shortIntro : text.intro) +
      (style.emojis ? " 🖤" : "."),
    details: (style.length === "short" ? text.shortDetails : text.details).map(
      (detail, index) => detail + (style.emojis && index === 2 ? " ✨" : ""),
    ),
    note: style.includeNote ? style.note : "",
    hashtags: style.hashtags ? text.hashtags : "",
  };
}
