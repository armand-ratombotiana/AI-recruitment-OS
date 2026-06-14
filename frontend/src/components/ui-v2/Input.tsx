'use client';

import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  inputSize?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const sizeStyles = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    inputSize = 'md',
    fullWidth = true,
    className,
    id: propId,
    disabled,
    required,
    ...props
  },
  ref
) {
  const autoId = useId();
  const id = propId ?? autoId;
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helperText && !error ? `${id}-helper` : undefined;
  const describedBy = errorId ?? helperId;

  return (
    <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
      {label && (
        <label
          htmlFor={id}
          className="text-sm font-medium text-[var(--color-ink-primary)]"
        >
          {label}
          {required && <span className="text-[var(--color-danger-500)] ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span
            className="absolute left-3 flex items-center text-[var(--color-ink-muted)]"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          disabled={disabled}
          required={required}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            'w-full rounded-lg border bg-[var(--color-surface-0)]',
            'text-[var(--color-ink-primary)] placeholder:text-[var(--color-ink-disabled)]',
            'transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error
              ? 'border-[var(--color-danger-500)] focus:ring-[var(--color-danger-500)]/30'
              : 'border-[var(--color-surface-300)] focus:border-[var(--color-brand-500)] focus:ring-[var(--color-brand-500)]/30',
            'dark:bg-[var(--color-surface-800)] dark:border-[var(--color-surface-600)]',
            'dark:text-[var(--color-surface-100)] dark:placeholder:text-[var(--color-surface-500)]',
            sizeStyles[inputSize],
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            className
          )}
          {...props}
        />
        {rightIcon && (
          <span
            className="absolute right-3 flex items-center text-[var(--color-ink-muted)]"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-danger-500)]">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p id={helperId} className="text-xs text-[var(--color-ink-muted)]">
          {helperText}
        </p>
      )}
    </div>
  );
});
