import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// Required for static export
export const dynamic = 'force-static';

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
      <h2 className="text-2xl font-bold mb-2">404 - {t('title')}</h2>
      <p className="text-gray-600 mb-4">{t('description')}</p>
      <Link
        href="/"
        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
      >
        {t('goHome')}
      </Link>
    </div>
  );
}
