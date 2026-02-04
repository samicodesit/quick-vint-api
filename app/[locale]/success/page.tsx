import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

// Required for static export
export const dynamic = 'force-static';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.success' });

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
    alternates: {
      canonical: locale === 'en' ? '/success/' : `/${locale}/success/`,
      languages: {
        en: '/success/',
        fr: '/fr/success/',
        de: '/de/success/',
      },
    },
  };
}

export default async function SuccessPage() {
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
        🎉
      </div>
      <h1 style={{ marginBottom: '1rem', color: '#1f2937' }}>Welcome to AutoLister AI!</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem', fontSize: '1.1rem' }}>
        Your payment was successful and your subscription is now active. You can now enjoy all the
        benefits of your chosen plan.
      </p>

      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
        }}
      >
        <p style={{ color: '#166534', margin: 0 }}>
          <strong>Next steps:</strong> Open the AutoLister AI extension and start generating
          professional Vinted listings!
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a
          href="https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: '#4f46e5',
            color: 'white',
            padding: '0.875rem 1.5rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: '600',
          }}
        >
          Open Extension
        </a>
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
