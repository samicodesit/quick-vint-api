import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://autolister.app'),
  title: {
    default: 'AutoLister AI - AI-Powered Vinted Listings',
    template: '%s | AutoLister AI',
  },
  description: 'Generate compelling Vinted listings instantly with AutoLister AI. Professional titles and descriptions that sell.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'AutoLister AI',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@autolisterai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // google: 'your-google-verification-code', // Update with actual code when available
  },
  alternates: {
    canonical: '/',
    languages: {
      'en': '/',
      'fr': '/fr/',
      'de': '/de/',
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
