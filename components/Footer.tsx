'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';

export function Footer() {
  const t = useTranslations('footer');
  const locale = useLocale();

  const getLocalizedHref = (path: string) => {
    if (locale === 'en') return path;
    return `/${locale}${path}`;
  };

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-links">
          <Link href={getLocalizedHref('/pricing/')}>{t('pricing')}</Link>
          <Link href={getLocalizedHref('/privacy/')}>{t('privacy')}</Link>
          <Link href={getLocalizedHref('/terms/')}>{t('terms')}</Link>
          <a href="mailto:hello@autolister.app">{t('support')}</a>
        </div>
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} AutoLister AI. {t('rights')}</p>
        </div>
      </div>
    </footer>
  );
}
