'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--color-brand-600)] text-white',
    'hover:bg-[var(--color-brand-700)] active:bg-[var(--color-brand-800)]',
    'focus-visible:ring-[var(--color-brand-500)]',
    'shadow-sm',
    'dark:bg-[var(--color-brand-500)] dark:hover:bg-[var(--color-brand-400)] dark:active:bg-[var(--color-brand-600)]',
  ].join(' '),
  secondary: [
    'bg-[var(--color-surface-0)] text-[var(--color-ink-primary)]',
    'border border-[var(--color-surface-300)]',
    'hover:bg-[var(--color-surface-50)] active:bg-[var(--color-surface-100)]',
    'focus-visible:ring-[var(--color-surface-400)]',
    'dark:bg-[var(--color-surface-800)] dark:text-[var(--color-surface-200)] dark:border-[var(--color-surface-600)]',
    'dark:hover:bg-[var(--color-surface-700)] dark:active:bg-[var(--color-surface-600)]',
  ].join(' '),
  ghost: [
    'text-[var(--color-ink-secondary)]',
    'hover:bg-[var(--color-surface-100)] active:bg-[var(--color-surface-200)]',
    'focus-visible:ring-[var(--color-surface-400)]',
    'dark:text-[var(--color-surface-300)] dark:hover:bg-[var(--color-surface-800)] dark:active:bg-[var(--color-surface-700)]',
  ].join(' '),
  danger: [
    'bg-[var(--color-danger-600)] text-white',
    'hover:bg-[var(--color-danger-700)] active:bg-[var(--color-danger-700)]',
    'focus-visible:ring-[var(--color-danger-500)]',
    'shadow-sm',
    'dark:bg-[var(--color-danger-500)] dark:hover:bg-[var(--color-danger-600)]',
  ].join(' '),
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-lg',
  xl: 'h-14 px-8 text-lg gap-2.5 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    className,
    children,
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-colors transition-duration-[var(--transition-fast)]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-[var(--color-surface-0)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        '[aria-disabled=true]:opacity-50 [aria-disabled=true]:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        leftIcon && <span className="inline-flex shrink-0" aria-hidden="true">{leftIcon}</span>
      )}
      {children && <span className={cn(loading && 'sr-only')}>{children}</span>}
      {!loading && rightIcon && <span className="inline-flex shrink-0" aria-hidden="true">{rightIcon}</span>}
    </button>
  );
});
