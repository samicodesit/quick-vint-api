export type Locale = 'en' | 'fr' | 'de';

export const locales: Locale[] = ['en', 'fr', 'de'];
export const defaultLocale: Locale = 'en';

export const localeLabels: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
};

export const localeFlags: Record<Locale, string> = {
  en: '/assets/images/flags/gb.svg',
  fr: '/assets/images/flags/fr.svg',
  de: '/assets/images/flags/de.svg',
};
