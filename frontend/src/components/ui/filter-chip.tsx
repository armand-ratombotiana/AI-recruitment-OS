'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FilterChipVariant = 'default' | 'primary' | 'success' | 'warning' | 'info';

interface FilterChipProps {
  label: string;
  value: string;
  onRemove?: () => void;
  variant?: FilterChipVariant;
  icon?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

const variantClasses: Record<FilterChipVariant, string> = {
  default:
    'bg-gray-100 text-gray-800 border-gray-200 dark:bg-surface-800 dark:text-gray-200 dark:border-surface-700',
  primary:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30',
  success:
    'bg-green-50 text-green-700 border-green-200 dark:bg-success-500/20 dark:text-success-500 dark:border-success-500/30',
  warning:
    'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-warning-500/20 dark:text-warning-500 dark:border-warning-500/30',
  info:
    'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-info-500/20 dark:text-info-500 dark:border-info-500/30',
};

export function FilterChip({
  label,
  value,
  onRemove,
  variant = 'default',
  icon,
  className,
  ariaLabel,
}: FilterChipProps) {
  const removable = typeof onRemove === 'function';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium max-w-full',
        variantClasses[variant],
        className
      )}
      aria-label={ariaLabel || `${label}: ${value}`}
    >
      {icon && (
        <span className="inline-flex shrink-0 text-current" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="truncate">
        <span className="font-semibold opacity-90">{label}:</span>{' '}
        <span className="font-normal">{value}</span>
      </span>
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            'ml-0.5 -mr-1 inline-flex shrink-0 items-center justify-center rounded-full p-0.5',
            'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            'hover:bg-black/10 dark:hover:bg-white/10'
          )}
          aria-label={`Remove ${label} filter`}
          title={`Remove ${label} filter`}
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

export default FilterChip;
