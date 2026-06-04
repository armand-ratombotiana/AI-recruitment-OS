'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  label?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  inputClassName?: string;
  ariaLabel?: string;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  emptyText = 'No results',
  label,
  disabled = false,
  clearable = true,
  className,
  inputClassName,
  ariaLabel,
}: ComboboxProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.value.toLowerCase().includes(query.toLowerCase()) ||
        (o.description && o.description.toLowerCase().includes(query.toLowerCase()))
      )
    : options;

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered, activeIndex]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const select = useCallback(
    (opt: ComboboxOption) => {
      onChange(opt.value);
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [onChange]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) select(opt);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const listId = `${id}-listbox`;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex items-center gap-1 px-2.5 py-1.5 text-sm border border-gray-200 dark:border-surface-700 rounded-lg bg-white dark:bg-surface-900',
          'focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[activeIndex] ? `${id}-opt-${filtered[activeIndex].value}` : undefined}
          aria-label={ariaLabel || label}
          value={open ? query : selected?.label || ''}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected ? undefined : placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn('flex-1 min-w-0 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500', inputClassName)}
        />
        {clearable && selected && !disabled && !open && (
          <button
            type="button"
            onClick={() => { onChange(null); inputRef.current?.focus(); }}
            className="shrink-0 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            inputRef.current?.focus();
          }}
          className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={open ? 'Close options' : 'Open options'}
          tabIndex={-1}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 animate-fade-in"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">{emptyText}</li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.value}
                id={`${id}-opt-${opt.value}`}
                role="option"
                aria-selected={opt.value === value}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(opt)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer',
                  i === activeIndex && 'bg-blue-50 dark:bg-brand-500/20',
                  opt.value === value && 'font-medium text-blue-700 dark:text-brand-300'
                )}
              >
                {opt.icon && <span className="shrink-0 text-gray-500 dark:text-gray-400">{opt.icon}</span>}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-gray-900 dark:text-gray-100">{opt.label}</p>
                  {opt.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{opt.description}</p>}
                </div>
                {opt.value === value && <Check className="h-3.5 w-3.5 text-blue-600 dark:text-brand-400 shrink-0" aria-hidden="true" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
