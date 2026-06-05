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
  showErrorDetails?: boolean;
  secondaryAction?: React.ReactNode;
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
  showErrorDetails = true,
  secondaryAction,
}: ErrorStateProps) {
  const errMsg = error instanceof Error ? error.message : typeof error === 'string' ? error : null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        fullHeight ? 'min-h-[400px] py-12' : 'py-8',
        className
      )}
    >
      <div
        className={cn(
          'mb-4 flex h-14 w-14 items-center justify-center rounded-full',
          'bg-red-50 text-red-600',
          'dark:bg-danger-500/10 dark:text-danger-500'
        )}
        aria-hidden="true"
      >
        {icon ?? <AlertTriangle className="h-7 w-7" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{description}</p>
      )}
      {showErrorDetails && errMsg && (
        <pre
          className={cn(
            'mt-3 max-w-md overflow-x-auto rounded-md px-3 py-2 text-left text-xs',
            'bg-gray-50 border border-gray-200 text-gray-700',
            'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-300'
          )}
        >
          {errMsg}
        </pre>
      )}
      {(onRetry || secondaryAction) && (
        <div className="mt-5 flex flex-col-reverse sm:flex-row items-center gap-2">
          {secondaryAction}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm',
                'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                'dark:bg-brand-500 dark:hover:bg-brand-400 dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900'
              )}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {retryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
