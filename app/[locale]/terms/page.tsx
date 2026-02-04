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
  const t = await getTranslations({ locale, namespace: 'meta.terms' });

  return {
    title: t('title'),
    description: t('description'),
    openGraph: {
      title: t('ogTitle'),
      description: t('ogDescription'),
    },
    alternates: {
      canonical: locale === 'en' ? '/terms/' : `/${locale}/terms/`,
      languages: {
        en: '/terms/',
        fr: '/fr/terms/',
        de: '/de/terms/',
      },
    },
  };
}

export default async function TermsPage() {
  return (
    <div className="container" style={{ padding: '4rem 20px', maxWidth: '800px' }}>
      <h1>Terms of Service</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>Last updated: {new Date().toLocaleDateString()}</p>

      <div style={{ lineHeight: '1.8', color: '#374151' }}>
        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>1. Acceptance of Terms</h2>
        <p>
          By accessing and using AutoLister AI, you accept and agree to be bound by the terms and
          provisions of this agreement.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>2. Use License</h2>
        <p>
          Permission is granted to temporarily use AutoLister AI for personal, non-commercial
          transitory viewing only. This is the grant of a license, not a transfer of title.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>3. Disclaimer</h2>
        <p>
          The materials on AutoLister AI are provided on an &apos;as is&apos; basis. AutoLister AI makes no
          warranties, expressed or implied, and hereby disclaims and negates all other warranties
          including, without limitation, implied warranties or conditions of merchantability, fitness
          for a particular purpose, or non-infringement of intellectual property or other violation
          of rights.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>4. Limitations</h2>
        <p>
          In no event shall AutoLister AI or its suppliers be liable for any damages (including,
          without limitation, damages for loss of data or profit, or due to business interruption)
          arising out of the use or inability to use AutoLister AI.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>5. Accuracy of Materials</h2>
        <p>
          The materials appearing on AutoLister AI could include technical, typographical, or
          photographic errors. AutoLister AI does not warrant that any of the materials on its
          website are accurate, complete, or current.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>6. Links</h2>
        <p>
          AutoLister AI has not reviewed all of the sites linked to its website and is not
          responsible for the contents of any such linked site. The inclusion of any link does not
          imply endorsement by AutoLister AI of the site.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>7. Modifications</h2>
        <p>
          AutoLister AI may revise these terms of service for its website at any time without
          notice. By using this website, you are agreeing to be bound by the then current version of
          these terms of service.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>8. Governing Law</h2>
        <p>
          These terms and conditions are governed by and construed in accordance with the laws and
          you irrevocably submit to the exclusive jurisdiction of the courts in that location.
        </p>

        <h2 style={{ marginTop: '2rem', marginBottom: '1rem', color: '#1f2937' }}>9. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at{' '}
          <a href="mailto:hello@autolister.app">hello@autolister.app</a>.
        </p>
      </div>
    </div>
  );
}
