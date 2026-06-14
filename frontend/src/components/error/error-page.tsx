'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, Send, Bug } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { reportErrorFromException, addBreadcrumb } from '@/utils/error-reporter';
import { cn } from '@/lib/utils';

interface ErrorPageProps {
  error?: Error | null;
  title?: string;
  description?: string;
  statusCode?: number;
  onRetry?: () => void;
  digest?: string;
}

export function ErrorPage({
  error,
  title,
  description,
  statusCode,
  onRetry,
  digest,
}: ErrorPageProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fallback: string) => translate(locale, key, fallback);
  const [reported, setReported] = useState(false);
  const [reporting, setReporting] = useState(false);

  const displayTitle =
    title ?? t('errors.pageTitle', 'Something went wrong');
  const displayDescription =
    description ??
    t(
      'errors.pageDescription',
      'An unexpected error occurred. Our team has been notified. You can try again or return to the dashboard.'
    );

  const handleReport = async () => {
    if (reported || reporting) return;
    setReporting(true);
    addBreadcrumb('error-page', 'User clicked report', 'info');
    try {
      const err = error ?? new Error(displayTitle);
      await reportErrorFromException(err, {
        tags: { source: 'error-page', status: String(statusCode ?? 500) },
        severity: statusCode && statusCode >= 500 ? 'fatal' : 'error',
        digest,
      });
      setReported(true);
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-gradient-to-br from-gray-50 via-white to-slate-50 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950">
      <div className="w-full max-w-lg">
        <div
          className={cn(
            'rounded-2xl border shadow-lg overflow-hidden',
            'border-red-200 bg-white',
            'dark:border-red-900/50 dark:bg-surface-900'
          )}
        >
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div
                className="shrink-0 h-14 w-14 rounded-2xl flex items-center justify-center bg-red-100 dark:bg-red-900/30"
                aria-hidden="true"
              >
                <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                {statusCode && (
                  <p className="text-xs font-mono font-bold text-red-500 dark:text-red-400 mb-1">
                    {statusCode}
                  </p>
                )}
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {displayTitle}
                </h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  {displayDescription}
                </p>
                {digest && (
                  <p className="mt-2 text-xs font-mono text-gray-500 dark:text-gray-500">
                    {t('errors.reference', 'Reference')}: {digest}
                  </p>
                )}
                {reported && (
                  <p className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <Send className="h-3 w-3" aria-hidden="true" />
                    {t('errors.reported', 'Error report sent successfully')}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <Link
                href="/dashboard"
                className={cn(
                  'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg',
                  'border border-gray-300 bg-white text-sm font-semibold text-gray-700',
                  'hover:bg-gray-50',
                  'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                  'dark:focus-visible:ring-offset-surface-900',
                  'transition-colors'
                )}
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                {t('errors.goHome', 'Go to dashboard')}
              </Link>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg',
                    'bg-red-600 text-white text-sm font-semibold hover:bg-red-700',
                    'dark:bg-red-600 dark:hover:bg-red-500',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2',
                    'dark:focus-visible:ring-offset-surface-900',
                    'transition-colors'
                  )}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t('common.retry', 'Try again')}
                </button>
              )}
              {!reported && (
                <button
                  type="button"
                  onClick={handleReport}
                  disabled={reporting}
                  className={cn(
                    'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg',
                    'border border-gray-300 bg-white text-sm font-medium text-gray-700',
                    'hover:bg-gray-50 disabled:opacity-50',
                    'dark:border-surface-700 dark:bg-surface-800 dark:text-gray-300 dark:hover:bg-surface-700',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                    'dark:focus-visible:ring-offset-surface-900',
                    'transition-colors'
                  )}
                >
                  <Bug className="h-4 w-4" aria-hidden="true" />
                  {reporting
                    ? t('errors.reporting', 'Sending…')
                    : t('errors.report', 'Report error')}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div
              className={cn(
                'border-t px-6 sm:px-8 py-4',
                'border-gray-200 bg-gray-50',
                'dark:border-surface-700 dark:bg-surface-800/50'
              )}
            >
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                {t('errors.technicalDetails', 'Technical details')}
              </p>
              <pre
                className={cn(
                  'text-xs font-mono rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words',
                  'bg-white border border-gray-200 text-gray-700',
                  'dark:bg-surface-950 dark:border-surface-700 dark:text-gray-300'
                )}
              >
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
