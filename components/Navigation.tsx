'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import { Locale, locales, localeLabels, localeFlags } from '@/i18n/config';

export function Navigation() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);

  const currentLocale = locale as Locale;

  // Helper to switch locale while staying on current page
  const switchLocale = (newLocale: Locale) => {
    router.push(pathname, { locale: newLocale });
    setLangMenuOpen(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        id="menu-backdrop"
        className={`menu-backdrop ${menuOpen ? 'open' : ''}`}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />

      {/* Mobile Language Dropdown */}
      <div className="mobile-language-dropdown">
        <button
          className="mobile-lang-btn"
          id="mobile-lang-toggle"
          aria-expanded={langMenuOpen}
          aria-controls="mobile-lang-menu"
          onClick={() => setLangMenuOpen(!langMenuOpen)}
        >
          <img
            src={localeFlags[currentLocale]}
            alt={`${localeLabels[currentLocale]} Flag`}
            className="flag-icon"
          />
          <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={`mobile-lang-menu ${langMenuOpen ? 'open' : ''}`} id="mobile-lang-menu">
          {locales.map((l) => (
            <button
              key={l}
              onClick={() => switchLocale(l)}
              className={`mobile-lang-option ${l === currentLocale ? 'active' : ''}`}
            >
              <img src={localeFlags[l]} alt={`${localeLabels[l]} Flag`} className="flag-icon" />{' '}
              {localeLabels[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      <div id="mobile-menu" className={`mobile-menu ${menuOpen ? 'open' : ''}`}>
        <button
          id="sheet-close"
          className="sheet-close"
          aria-label={t('close')}
          onClick={() => setMenuOpen(false)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <Link href="/#features" onClick={() => setMenuOpen(false)}>
          {t('features')}
        </Link>
        <Link href="/pricing" onClick={() => setMenuOpen(false)}>
          {t('pricing')}
        </Link>
        <a href="mailto:hello@autolister.app">{t('contact')}</a>
        <a
          href="https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('getExtension')}
        </a>
      </div>

      {/* Header */}
      <header className="header">
        <div className="container">
          <nav className="nav">
            <Link href="/" className="logo">
              AutoLister AI
            </Link>
            <div className="nav-links">
              <Link href="/#features">{t('features')}</Link>
              <Link href="/pricing">{t('pricing')}</Link>
              <a href="mailto:hello@autolister.app">{t('contact')}</a>
              <a
                href="https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-nav"
              >
                {t('getExtension')}
              </a>

              {/* Desktop Language Switcher */}
              <div className="language-switcher">
                <button
                  className="lang-dropdown-btn"
                  id="lang-toggle"
                  aria-expanded={langMenuOpen}
                  aria-controls="lang-menu"
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                >
                  <img
                    src={localeFlags[currentLocale]}
                    alt={`${localeLabels[currentLocale]} Flag`}
                    className="flag-icon"
                  />
                  {localeLabels[currentLocale]}
                  <svg className="dropdown-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div className={`lang-menu ${langMenuOpen ? 'open' : ''}`} id="lang-menu">
                  {locales.map((l) => (
                    <button
                      key={l}
                      onClick={() => switchLocale(l)}
                      className={`lang-option ${l === currentLocale ? 'active' : ''}`}
                    >
                      <img src={localeFlags[l]} alt={`${localeLabels[l]} Flag`} className="flag-icon" />{' '}
                      {localeLabels[l]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile Menu Button */}
            <div className="mobile-menu-button">
              <button
                id="hamburger-button"
                className={`hamburger ${menuOpen ? 'open' : ''}`}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                onClick={() => setMenuOpen(!menuOpen)}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line id="ham-top" x1="3" y1="6" x2="21" y2="6"></line>
                    <line id="ham-mid" x1="3" y1="12" x2="21" y2="12"></line>
                    <line id="ham-bot" x1="3" y1="18" x2="21" y2="18"></line>
                  </g>
                </svg>
              </button>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
