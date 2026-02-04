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
  const t = await getTranslations({ locale, namespace: 'meta.privacy' });

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
    alternates: {
      canonical: locale === 'en' ? '/privacy/' : `/${locale}/privacy/`,
      languages: {
        en: '/privacy/',
        fr: '/fr/privacy/',
        de: '/de/privacy/',
      },
    },
  };
}

export default async function PrivacyPage() {
  return (
    <div className="container" style={{ padding: '4rem 20px', maxWidth: '800px' }}>
      <h1>Privacy Policy</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Last updated: {new Date().toLocaleDateString()}</p>

      <div style={{ lineHeight: '1.8', color: '#374151' }}>
        <p style={{ marginBottom: '1.5rem' }}>
          At AutoLister AI, we take your privacy seriously. This Privacy Policy describes how we
          collect, use, and protect your personal information when you use our service.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>1. Information We Collect</h2>
        <p>We collect the following types of information:</p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Email address (for account creation and authentication)</li>
          <li>Usage data (API calls, feature usage)</li>
          <li>Images uploaded for listing generation</li>
          <li>Payment information (handled securely by Stripe)</li>
        </ul>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Provide and maintain our service</li>
          <li>Process payments and manage subscriptions</li>
          <li>Send important notifications about your account</li>
          <li>Improve our AI models and service quality</li>
          <li>Prevent fraud and abuse</li>
        </ul>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>3. Data Storage and Security</h2>
        <p>
          We use industry-standard security measures to protect your data. Your information is stored
          securely using Supabase and encrypted in transit. Payment information is processed by
          Stripe and never touches our servers.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>4. Third-Party Services</h2>
        <p>We use the following third-party services:</p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>
            <strong>Supabase</strong> - For database and authentication
          </li>
          <li>
            <strong>Stripe</strong> - For payment processing
          </li>
          <li>
            <strong>OpenAI</strong> - For AI-powered listing generation
          </li>
        </ul>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>5. Your Rights</h2>
        <p>You have the right to:</p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Access your personal data</li>
          <li>Request correction of your data</li>
          <li>Request deletion of your account and data</li>
          <li>Export your data</li>
          <li>Opt out of non-essential communications</li>
        </ul>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>6. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. If you delete your account, we
          will remove your personal information within 30 days, except where we are required to
          retain it for legal purposes.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>7. Cookies</h2>
        <p>
          We use essential cookies to maintain your session and preferences. We do not use
          third-party tracking cookies.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by
          posting the new Privacy Policy on this page.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>9. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy, please contact us at{' '}
          <a href="mailto:hello@autolister.app">hello@autolister.app</a>.
        </p>
      </div>
    </div>
  );
}
