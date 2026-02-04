import { MetadataRoute } from 'next';
import { locales, defaultLocale } from '@/i18n/config';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://autolister.app';

  // Define all page paths
  const pages = ['', 'pricing/', 'terms/', 'privacy/', 'support/', 'cancel/', 'success/'];

  // Generate sitemap entries for all locale combinations
  const sitemapEntries: MetadataRoute.Sitemap = [];

  pages.forEach((page) => {
    const path = page === '' ? '' : page;

    // Create alternates for all locales
    const alternates: { languages: Record<string, string> } = {
      languages: {},
    };

    locales.forEach((locale) => {
      const localePath = locale === defaultLocale ? `/${path}` : `/${locale}/${path}`;
      alternates.languages[locale] = `${baseUrl}${localePath}`;
    });

    // Add entry for each locale
    locales.forEach((locale) => {
      const url = locale === defaultLocale ? `${baseUrl}/${path}` : `${baseUrl}/${locale}/${path}`;

      sitemapEntries.push({
        url,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: page === '' ? 1 : 0.8,
        alternates,
      });
    });
  });

  return sitemapEntries;
}
