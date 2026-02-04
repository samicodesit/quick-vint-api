import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';

// Required for static export
export const dynamic = 'force-static';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.home' });

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
    alternates: {
      canonical: locale === 'en' ? '/' : `/${locale}/`,
      languages: {
        en: '/',
        fr: '/fr/',
        de: '/de/',
      },
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations();

  const getLocalizedHref = (path: string) => {
    if (locale === 'en') return path;
    return `/${locale}${path}`;
  };

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1>{t('home.heroTitle')}</h1>
            <p className="subtitle">{t('home.heroSubtitle')}</p>
            <div className="hero-cta">
              <a
                href="https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                {t('home.ctaStart')}
              </a>
              <Link href={getLocalizedHref('/pricing/')} className="btn btn-secondary">
                {t('home.pricing.viewPlans')}
              </Link>
            </div>
            <div className="social-proof">
              <p>{t('home.cta.subtitle')}</p>
              <div className="stats">
                <div className="stat">
                  <span className="stat-number">10K+</span>
                  <span className="stat-label">{t('home.stats.listings')}</span>
                </div>
                <div className="stat">
                  <span className="stat-number">14+</span>
                  <span className="stat-label">{t('home.stats.languages')}</span>
                </div>
                <div className="stat">
                  <span className="stat-number">~3 sec</span>
                  <span className="stat-label">{t('home.stats.speed')}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-image-container">
            <video
              className="hero-video"
              src="/vid-promo.mp4"
              poster="/screenshot-1.png"
              autoPlay
              muted
              loop
              playsInline
              controls
              aria-label="Promo video showing AutoLister AI generating a Vinted listing"
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <div className="section-header">
            <h2>{t('home.features.title')}</h2>
            <p>{t('home.features.subtitle')}</p>
          </div>
          <div className="features-grid">
            <div className="feature">
              <span className="feature-icon">🎯</span>
              <h3>{t('home.features.instant.title')}</h3>
              <p>{t('home.features.instant.description')}</p>
            </div>
            <div className="feature">
              <span className="feature-icon">⚡</span>
              <h3>{t('home.features.intelligent.title')}</h3>
              <p>{t('home.features.intelligent.description')}</p>
            </div>
            <div className="feature">
              <span className="feature-icon">🧠</span>
              <h3>{t('home.features.optimization.title')}</h3>
              <p>{t('home.features.optimization.description')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>{t('home.howItWorks.title')}</h2>
            <p>{t('home.howItWorks.subtitle')}</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <h3>{t('home.howItWorks.step1.title')}</h3>
              <p>{t('home.howItWorks.step1.description')}</p>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <h3>{t('home.howItWorks.step2.title')}</h3>
              <p>{t('home.howItWorks.step2.description')}</p>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <h3>{t('home.howItWorks.step3.title')}</h3>
              <p>{t('home.howItWorks.step3.description')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <h2>{t('home.cta.title')}</h2>
          <p>{t('home.cta.subtitle')}</p>
          <div className="hero-cta">
            <a
              href="https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              {t('home.cta.button')}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
