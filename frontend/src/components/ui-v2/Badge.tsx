'use client';

import { forwardRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
export type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  removable?: boolean;
  onRemove?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    'bg-[var(--color-surface-100)] text-[var(--color-ink-secondary)] dark:bg-[var(--color-surface-700)] dark:text-[var(--color-surface-300)]',
  primary:
    'bg-[var(--color-brand-100)] text-[var(--color-brand-700)] dark:bg-[var(--color-brand-900)]/30 dark:text-[var(--color-brand-300)]',
  success:
    'bg-[var(--color-success-50)] text-[var(--color-success-700)] dark:bg-[var(--color-success-50)]/10 dark:text-[var(--color-success-500)]',
  warning:
    'bg-[var(--color-warning-50)] text-[var(--color-warning-700)] dark:bg-[var(--color-warning-50)]/10 dark:text-[var(--color-warning-500)]',
  danger:
    'bg-[var(--color-danger-50)] text-[var(--color-danger-700)] dark:bg-[var(--color-danger-50)]/10 dark:text-[var(--color-danger-500)]',
  info: 'bg-[var(--color-info-50)] text-[var(--color-info-700)] dark:bg-[var(--color-info-50)]/10 dark:text-[var(--color-info-500)]',
  outline:
    'border border-[var(--color-surface-300)] text-[var(--color-ink-secondary)] dark:border-[var(--color-surface-600)] dark:text-[var(--color-surface-300)]',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'default', size = 'md', removable = false, onRemove, className, children, ...props },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            'inline-flex items-center justify-center rounded-full',
            'hover:bg-black/10 dark:hover:bg-white/10',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-current',
            'transition-colors'
          )}
          aria-label="Remove"
        >
          <X className={cn(size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        </button>
      )}
    </span>
  );
});
