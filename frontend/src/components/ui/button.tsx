import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm focus-visible:ring-blue-500 dark:bg-brand-500 dark:hover:bg-brand-400 dark:active:bg-brand-600 dark:focus-visible:ring-brand-400',
  secondary:
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 active:bg-gray-100 focus-visible:ring-gray-400 dark:bg-surface-800 dark:text-gray-200 dark:border-surface-600 dark:hover:bg-surface-700 dark:active:bg-surface-600 dark:focus-visible:ring-surface-500',
  ghost:
    'text-gray-600 hover:bg-gray-100 active:bg-gray-200 focus-visible:ring-gray-400 dark:text-gray-300 dark:hover:bg-surface-800 dark:active:bg-surface-700 dark:focus-visible:ring-surface-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm focus-visible:ring-red-500 dark:bg-danger-500 dark:hover:bg-danger-600 dark:active:bg-danger-700 dark:focus-visible:ring-danger-500',
  outline:
    'border border-blue-600 text-blue-600 hover:bg-blue-50 active:bg-blue-100 focus-visible:ring-blue-500 dark:border-brand-400 dark:text-brand-400 dark:hover:bg-brand-500/10 dark:active:bg-brand-500/20 dark:focus-visible:ring-brand-400',
  success:
    'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 shadow-sm focus-visible:ring-green-500 dark:bg-success-500 dark:hover:bg-success-600 dark:active:bg-success-700 dark:focus-visible:ring-success-500',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10 p-0',
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
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'focus-visible:ring-offset-white dark:focus-visible:ring-offset-surface-900',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
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
