import { getRequestConfig } from 'next-intl/server';
import { Locale, defaultLocale, locales } from './i18n/config';

export default getRequestConfig(async ({ requestLocale }) => {
  // Determine the locale to use
  let locale = await requestLocale;

  // Validate locale
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  // Load messages for the locale
  const messages = (await import(`./messages/${locale}.json`)).default;

  return {
    locale,
    messages,
    timeZone: 'UTC',
    now: new Date(),
  };
});
