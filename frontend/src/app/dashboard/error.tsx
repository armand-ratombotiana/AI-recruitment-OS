'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, ChevronDown } from 'lucide-react';

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: DashboardErrorProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-gray-950 shadow-sm overflow-hidden">
          <div className="p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div
                className="shrink-0 h-12 w-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
                aria-hidden="true"
              >
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">
                  Something went wrong
                </h1>
                <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                  We hit an unexpected error loading this section. Please try again, or head back to the dashboard.
                </p>
                {error.digest && (
                  <p className="mt-2 text-xs font-mono text-gray-500 dark:text-gray-400">
                    Reference: {error.digest}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 transition-colors"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Go to dashboard
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 transition-colors"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              aria-controls="dashboard-error-details"
              className="w-full flex items-center justify-between gap-2 px-6 sm:px-8 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset transition-colors"
            >
              <span>Error details</span>
              <ChevronDown
                className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                  detailsOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>
            {detailsOpen && (
              <div
                id="dashboard-error-details"
                className="px-6 sm:px-8 pb-4 sm:pb-6"
              >
                <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {error.message || 'No error message available.'}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
