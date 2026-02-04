import { defineRouting } from 'next-intl/routing';
import { createSharedPathnamesNavigation } from 'next-intl/navigation';
import { locales, defaultLocale } from './config';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
});

// Export Link, usePathname, and useRouter for navigation
export const { Link, usePathname, useRouter } = createSharedPathnamesNavigation(routing);
