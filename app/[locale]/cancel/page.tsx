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
  const t = await getTranslations({ locale, namespace: 'meta.cancel' });

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
    alternates: {
      canonical: locale === 'en' ? '/cancel/' : `/${locale}/cancel/`,
      languages: {
        en: '/cancel/',
        fr: '/fr/cancel/',
        de: '/de/cancel/',
      },
    },
  };
}

export default async function CancelPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const getLocalizedHref = (path: string) => {
    if (locale === 'en') return path;
    return `/${locale}${path}`;
  };

  return (
    <div
      className="container"
      style={{
        padding: '6rem 20px',
        maxWidth: '600px',
        textAlign: 'center',
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontSize: '4rem',
          marginBottom: '1.5rem',
        }}
      >
        😔
      </div>
      <h1 style={{ marginBottom: '1rem', color: '#1f2937' }}>Payment Cancelled</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1.1rem' }}>
        Your payment was cancelled and you haven&apos;t been charged. If you have any questions or
        encountered any issues, please don&apos;t hesitate to reach out to our support team.
      </p>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link
          href={getLocalizedHref('/pricing/')}
          style={{
            background: '#4f46e5',
            color: 'white',
            padding: '0.875rem 1.5rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
          }}
        >
          Back to Pricing
        </Link>
        <a
          href="mailto:hello@autolister.app"
          style={{
            background: '#f3f4f6',
            color: '#374151',
            padding: '0.875rem 1.5rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
          }}
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}
