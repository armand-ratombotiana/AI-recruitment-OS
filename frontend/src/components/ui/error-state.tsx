import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  description?: string;
  error?: Error | string | null;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: React.ReactNode;
  className?: string;
  fullHeight?: boolean;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An unexpected error occurred. Please try again.',
  error,
  onRetry,
  retryLabel = 'Try again',
  icon,
  className,
  fullHeight = false,
}: ErrorStateProps) {
  const errMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : null;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        fullHeight ? 'min-h-[400px] py-12' : 'py-8',
        className
      )}
    >
      <div
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600"
        aria-hidden="true"
      >
        {icon ?? <AlertTriangle className="h-7 w-7" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>}
      {errMsg && (
        <pre className="mt-3 max-w-md overflow-x-auto rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-left text-xs text-gray-700">
          {errMsg}
        </pre>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
