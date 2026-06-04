import Link from 'next/link';
import { WifiOff } from 'lucide-react';
import { OfflineRetryButton } from './offline-retry-button';

export const metadata = {
  title: 'Offline | AI-ROS',
  description: 'You appear to be offline. Please check your connection.',
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-slate-50 dark:from-surface-950 dark:via-surface-900 dark:to-surface-950 p-6">
      <div className="max-w-md w-full text-center">
        <div className="h-16 w-16 rounded-2xl bg-gradient-brand mx-auto mb-4 flex items-center justify-center shadow-brand">
          <WifiOff className="h-8 w-8 text-white" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">You’re offline</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          It looks like your internet connection dropped. Cached pages will still work, but live data is unavailable until you reconnect.
        </p>
        <div className="mt-6 flex gap-2 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Go to dashboard
          </Link>
          <OfflineRetryButton />
        </div>
      </div>
    </main>
  );
}
