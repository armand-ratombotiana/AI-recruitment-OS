'use client';

import { useId, useState, useRef, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BaseProps {
  label?: string;
  description?: string;
  helpText?: string;
  error?: string;
  success?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}

interface InputFieldProps
  extends BaseProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'required'> {
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date';
}

export function InputField({
  label,
  description,
  helpText,
  error,
  success,
  required,
  disabled,
  className,
  labelClassName,
  id: providedId,
  type = 'text',
  ...props
}: InputFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;
  const isInvalid = !!error;
  const [showPwd, setShowPwd] = useState(false);
  const isPassword = type === 'password';
  const finalType = isPassword && showPwd ? 'text' : type;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className={cn(
            'mb-1 block text-sm font-medium text-gray-700',
            disabled && 'opacity-60',
            labelClassName
          )}
        >
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {description && (
        <p id={descId} className="mb-1 text-xs text-gray-500">
          {description}
        </p>
      )}
      <div className="relative">
        <input
          id={id}
          type={finalType}
          required={required}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-required={required || undefined}
          aria-describedby={
            [error ? errorId : null, helpText ? helpId : null, description ? descId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={cn(
            'block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition-colors',
            'focus:outline-none focus:ring-1',
            'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
            isPassword && 'pr-10',
            isInvalid
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
              : success
                ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd((s) => !s)}
            aria-label={showPwd ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {showPwd ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}
        {!isPassword && (isInvalid || success) && (
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
            {isInvalid ? (
              <AlertCircle className="h-4 w-4 text-red-500" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
            )}
          </div>
        )}
      </div>
      {(error || success || helpText) && (
        <div className="mt-1.5 flex items-start gap-1 text-xs">
          {error ? (
            <p id={errorId} role="alert" className="text-red-600">
              {error}
            </p>
          ) : success ? (
            <p className="text-green-600">{success}</p>
          ) : helpText ? (
            <p id={helpId} className="text-gray-500">
              {helpText}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface TextareaFieldProps
  extends BaseProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'required'> {}

export function TextareaField({
  label,
  description,
  helpText,
  error,
  success,
  required,
  disabled,
  className,
  labelClassName,
  id: providedId,
  rows = 4,
  ...props
}: TextareaFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;
  const isInvalid = !!error;
  const counterRef = useRef<HTMLTextAreaElement>(null);
  const maxLength = props.maxLength;

  useEffect(() => {
    const el = counterRef.current;
    if (el && maxLength) {
      const remaining = maxLength - (el.value.length || 0);
      el.style.resize = 'vertical';
    }
  }, [maxLength]);

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className={cn(
            'mb-1 block text-sm font-medium text-gray-700',
            disabled && 'opacity-60',
            labelClassName
          )}
        >
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {description && (
        <p id={descId} className="mb-1 text-xs text-gray-500">
          {description}
        </p>
      )}
      <textarea
        ref={counterRef}
        id={id}
        rows={rows}
        required={required}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        aria-required={required || undefined}
        aria-describedby={
          [error ? errorId : null, helpText ? helpId : null, description ? descId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={cn(
          'block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition-colors',
          'focus:outline-none focus:ring-1',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          isInvalid
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
            : success
              ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
        )}
        {...props}
      />
      <div className="mt-1.5 flex items-start justify-between gap-2 text-xs">
        <div className="flex-1">
          {error ? (
            <p id={errorId} role="alert" className="text-red-600">
              {error}
            </p>
          ) : success ? (
            <p className="text-green-600">{success}</p>
          ) : helpText ? (
            <p id={helpId} className="text-gray-500">
              {helpText}
            </p>
          ) : null}
        </div>
        {maxLength && (
          <p className="shrink-0 text-gray-400 tabular-nums" aria-live="polite">
            {props.value?.toString().length ?? 0}/{maxLength}
          </p>
        )}
      </div>
    </div>
  );
}

interface SelectFieldProps
  extends BaseProps,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'required'> {
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export function SelectField({
  label,
  description,
  helpText,
  error,
  success,
  required,
  disabled,
  options,
  placeholder,
  className,
  labelClassName,
  id: providedId,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const descId = `${id}-desc`;
  const isInvalid = !!error;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={id}
          className={cn(
            'mb-1 block text-sm font-medium text-gray-700',
            disabled && 'opacity-60',
            labelClassName
          )}
        >
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {description && (
        <p id={descId} className="mb-1 text-xs text-gray-500">
          {description}
        </p>
      )}
      <select
        id={id}
        required={required}
        disabled={disabled}
        aria-invalid={isInvalid || undefined}
        aria-required={required || undefined}
        aria-describedby={
          [error ? errorId : null, helpText ? helpId : null, description ? descId : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        className={cn(
          'block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm transition-colors',
          'focus:outline-none focus:ring-1',
          'disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500',
          isInvalid
            ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
            : success
              ? 'border-green-300 focus:border-green-500 focus:ring-green-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
        )}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {(error || success || helpText) && (
        <div className="mt-1.5 text-xs">
          {error ? (
            <p id={errorId} role="alert" className="text-red-600">
              {error}
            </p>
          ) : success ? (
            <p className="text-green-600">{success}</p>
          ) : helpText ? (
            <p id={helpId} className="text-gray-500">
              {helpText}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface CheckboxFieldProps
  extends BaseProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'required' | 'id' | 'type'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  id?: string;
}

export function CheckboxField({
  label,
  helpText,
  error,
  disabled,
  required,
  className,
  id: providedId,
  checked,
  onCheckedChange,
  ...props
}: CheckboxFieldProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const isInvalid = !!error;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          disabled={disabled}
          required={required}
          aria-invalid={isInvalid || undefined}
          aria-describedby={
            [error ? errorId : null, helpText ? helpId : null].filter(Boolean).join(' ') ||
            undefined
          }
          className={cn(
            'mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500',
            'disabled:cursor-not-allowed disabled:opacity-60',
            isInvalid && 'border-red-500'
          )}
          {...props}
        />
        {label && (
          <label
            htmlFor={id}
            className={cn(
              'text-sm text-gray-700',
              disabled && 'opacity-60',
              !disabled && 'cursor-pointer'
            )}
          >
            {label}
            {required && (
              <span className="ml-0.5 text-red-500" aria-hidden="true">
                *
              </span>
            )}
            {helpText && !error && (
              <span id={helpId} className="block text-xs text-gray-500">
                {helpText}
              </span>
            )}
          </label>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 ml-6 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
