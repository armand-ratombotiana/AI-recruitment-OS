import React from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  illustration?: React.ReactNode;
}

const SIZE_CLASSES = {
  sm: 'py-8',
  md: 'py-12',
  lg: 'py-16',
} as const;

const ICON_WRAP_CLASSES = {
  sm: 'h-12 w-12',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
} as const;

const ICON_SIZE_CLASSES = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
} as const;

export const EmptyState = React.memo(function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
  illustration,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        SIZE_CLASSES[size],
        className
      )}
    >
      {illustration ? (
        <div className="mb-4" aria-hidden="true">
          {illustration}
        </div>
      ) : (
        <div
          className={cn(
            'mb-4 inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-400',
            'dark:bg-surface-800 dark:text-gray-500',
            ICON_WRAP_CLASSES[size]
          )}
          aria-hidden="true"
        >
          {icon ?? <Inbox className={cn(ICON_SIZE_CLASSES[size])} />}
        </div>
      )}
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-col-reverse sm:flex-row items-center gap-2">
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  );
});
