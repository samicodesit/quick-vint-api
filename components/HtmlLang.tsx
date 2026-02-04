'use client';

/**
 * @deprecated This component is deprecated. The html lang attribute is now set server-side
 * in app/[locale]/layout.tsx for better SEO. This component is kept for backwards compatibility
 * but no longer has any effect.
 */
export function HtmlLang({ locale }: { locale: string }) {
  // No-op: lang is now set server-side in the root layout
  return null;
}
