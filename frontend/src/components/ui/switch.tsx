'use client';

import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  id?: string;
  name?: string;
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
  className,
  id,
  name,
}: SwitchProps) {
  const sizes = {
    sm: { track: 'h-4 w-7', thumb: 'h-3 w-3', translate: 'translate-x-3' },
    md: { track: 'h-5 w-9', thumb: 'h-4 w-4', translate: 'translate-x-4' },
    lg: { track: 'h-6 w-11', thumb: 'h-5 w-5', translate: 'translate-x-5' },
  };
  const s = sizes[size];

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled || undefined}
        aria-labelledby={label ? `${id || name}-label` : undefined}
        aria-describedby={description ? `${id || name}-desc` : undefined}
        id={id}
        name={name}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          s.track,
          checked ? 'bg-blue-600' : 'bg-gray-200'
        )}
      >
        <span className="sr-only">Toggle {label || 'switch'}</span>
        <span
          aria-hidden="true"
          className={cn(
            'inline-block transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-out',
            s.thumb,
            checked ? s.translate : 'translate-x-0.5'
          )}
        />
      </button>
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && (
            <label
              id={`${id || name}-label`}
              htmlFor={id}
              className={cn(
                'block text-sm font-medium cursor-pointer select-none',
                disabled ? 'text-gray-400' : 'text-gray-900'
              )}
            >
              {label}
            </label>
          )}
          {description && (
            <p
              id={`${id || name}-desc`}
              className={cn(
                'mt-0.5 text-xs',
                disabled ? 'text-gray-400' : 'text-gray-500'
              )}
            >
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
