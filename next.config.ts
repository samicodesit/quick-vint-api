import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  // Note: Static export is disabled to support API routes and cron jobs
  // For static marketing site only, enable: output: 'export', distDir: 'dist'
  // For full functionality (API + cron jobs), deploy to Vercel without static export

  // Image optimization (required for static export)
  images: {
    unoptimized: true,
  },

  // i18n configuration (handled by next-intl middleware for dev, static for export)
  // Note: For static export with i18n, we use the [locale] dynamic segment

  // Trailing slashes for cleaner URLs
  trailingSlash: true,

  // Headers and rewrites are handled in vercel.json for production

  // Environment variables that should be available at build time
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://autolister.app',
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
