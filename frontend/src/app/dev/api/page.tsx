'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Shield, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { ApiExplorer } from '@/components/dev/api-explorer';

export default function DevApiPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-950">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-surface-700 dark:bg-surface-900/80">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href="/dev"
            className="inline-flex items-center gap-1 rounded-md text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label={t('dev.back', 'Back to dev tools')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('dev.api.title', 'API Explorer')}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('dev.api.subtitle', 'Test endpoints, build requests, and inspect responses')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 dark:border-surface-700 dark:bg-surface-900 sm:flex">
              <Key className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400">Bearer ••••••••</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 dark:border-green-800 dark:bg-green-900/20">
              <Shield className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-green-700 dark:text-green-400">
                {t('dev.api.authenticated', 'Authenticated')}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
          <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <p className="text-xs text-blue-700 dark:text-blue-300">
            {t(
              'dev.api.mockNotice',
              'API calls are mocked for development. Responses simulate real data structures.'
            )}
          </p>
        </div>

        <ApiExplorer />
      </main>
    </div>
  );
}
