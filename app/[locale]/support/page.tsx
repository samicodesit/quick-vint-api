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
  const t = await getTranslations({ locale, namespace: 'meta.support' });

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
    alternates: {
      canonical: locale === 'en' ? '/support/' : `/${locale}/support/`,
      languages: {
        en: '/support/',
        fr: '/fr/support/',
        de: '/de/support/',
      },
    },
  };
}

export default async function SupportPage() {
  return (
    <div className="container" style={{ padding: '4rem 20px', maxWidth: '800px' }}>
      <h1>Support Center</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        We&apos;re here to help you get the most out of AutoLister AI.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div
          style={{
            background: '#f9fafb',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h2 style={{ marginBottom: '1rem', color: '#1f2937' }}>Contact Us</h2>
          <p style={{ marginBottom: '1rem', color: '#374151' }}>
            Have a question or need help? Reach out to our support team.
          </p>
          <a
            href="mailto:hello@autolister.app"
            style={{
              display: 'inline-block',
              background: '#4f46e5',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: '600',
            }}
          >
            Email Support
          </a>
        </div>

        <div
          style={{
            background: '#f9fafb',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h2 style={{ marginBottom: '1rem', color: '#1f2937' }}>Frequently Asked Questions</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#374151' }}>
                How do I install the extension?
              </h3>
              <p style={{ color: '#6b7280' }}>
                Visit the Chrome Web Store and search for &quot;AutoLister AI&quot; or click the &quot;Get
                Extension&quot; button on our homepage.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#374151' }}>
                What browsers are supported?
              </h3>
              <p style={{ color: '#6b7280' }}>
                Currently, AutoLister AI is available for Google Chrome and Chromium-based browsers
                (Edge, Brave, etc.).
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#374151' }}>
                How do I cancel my subscription?
              </h3>
              <p style={{ color: '#6b7280' }}>
                You can cancel your subscription at any time through the Stripe customer portal.
                Access it from the pricing page by clicking &quot;Manage Subscription&quot; on your
                current plan.
              </p>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#374151' }}>
                Is my data secure?
              </h3>
              <p style={{ color: '#6b7280' }}>
                Yes, we take security seriously. All data is encrypted in transit and stored
                securely. We never share your personal information with third parties.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#f9fafb',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
          }}
        >
          <h2 style={{ marginBottom: '1rem', color: '#1f2937' }}>Getting Started</h2>
          <ol style={{ marginLeft: '1.5rem', color: '#374151', lineHeight: '1.8' }}>
            <li>Install the Chrome extension from the Web Store</li>
            <li>Sign up with your email address</li>
            <li>Navigate to Vinted and start creating a listing</li>
            <li>Click the AutoLister AI button to generate your description</li>
            <li>Review and publish your optimized listing!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
