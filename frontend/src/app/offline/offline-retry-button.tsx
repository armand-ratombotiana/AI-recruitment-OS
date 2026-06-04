'use client';

export function OfflineRetryButton() {
  return (
    <button
      type="button"
      onClick={() => typeof window !== 'undefined' && window.location.reload()}
      className="inline-flex items-center justify-center h-10 px-4 rounded-lg border border-gray-300 dark:border-surface-700 bg-white dark:bg-surface-800 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      Retry
    </button>
  );
}
