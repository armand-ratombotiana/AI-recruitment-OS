'use client';

import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useMemo,
} from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface SelectProps {
  options: SelectOption[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  searchable?: boolean;
  multiple?: boolean;
  clearable?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(function Select(
  {
    options,
    value,
    onChange,
    placeholder = 'Select...',
    label,
    error,
    helperText,
    disabled = false,
    searchable = false,
    multiple = false,
    clearable = false,
    fullWidth = true,
    className,
  },
  ref
) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedValues = useMemo(() => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const filteredOptions = useMemo(() => {
    if (!search) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  const groupedOptions = useMemo(() => {
    const groups: { name: string | null; items: (SelectOption & { globalIndex: number })[] }[] = [];
    let globalIndex = 0;
    let currentGroup: string | null = null;
    let currentItems: (SelectOption & { globalIndex: number })[] = [];

    for (const opt of filteredOptions) {
      const group = opt.group ?? null;
      if (group !== currentGroup) {
        if (currentItems.length > 0) groups.push({ name: currentGroup, items: currentItems });
        currentGroup = group;
        currentItems = [];
      }
      currentItems.push({ ...opt, globalIndex: globalIndex++ });
    }
    if (currentItems.length > 0) groups.push({ name: currentGroup, items: currentItems });
    return groups;
  }, [filteredOptions]);

  const flatFiltered = useMemo(
    () => filteredOptions.map((o, i) => ({ ...o, flatIndex: i })),
    [filteredOptions]
  );

  const handleSelect = useCallback(
    (optValue: string) => {
      if (multiple) {
        const next = selectedValues.includes(optValue)
          ? selectedValues.filter((v) => v !== optValue)
          : [...selectedValues, optValue];
        onChange?.(next);
      } else {
        onChange?.(optValue);
        setOpen(false);
        setSearch('');
      }
    },
    [multiple, selectedValues, onChange]
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange?.(multiple ? [] : '');
      setSearch('');
    },
    [multiple, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (!open) {
            setOpen(true);
          } else if (highlightedIndex >= 0 && flatFiltered[highlightedIndex]) {
            handleSelect(flatFiltered[highlightedIndex].value);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (!open) setOpen(true);
          setHighlightedIndex((prev) => Math.min(prev + 1, flatFiltered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Escape':
          setOpen(false);
          setSearch('');
          break;
        case 'Home':
          e.preventDefault();
          setHighlightedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setHighlightedIndex(flatFiltered.length - 1);
          break;
      }
    },
    [disabled, open, highlightedIndex, flatFiltered, handleSelect]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [search]);

  const displayLabel = useMemo(() => {
    if (multiple) {
      if (selectedValues.length === 0) return null;
      return selectedValues
        .map((v) => options.find((o) => o.value === v)?.label ?? v)
        .join(', ');
    }
    if (!value || Array.isArray(value)) return null;
    return options.find((o) => o.value === value)?.label ?? null;
  }, [multiple, selectedValues, value, options]);

  const listboxId = `${id}-listbox`;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div
      ref={(node) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={cn('relative flex flex-col gap-1.5', fullWidth && 'w-full', className)}
      onKeyDown={handleKeyDown}
    >
      {label && (
        <label id={`${id}-label`} className="text-sm font-medium text-[var(--color-ink-primary)]">
          {label}
        </label>
      )}
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-describedby={errorId}
        aria-invalid={!!error || undefined}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={cn(
          'flex items-center justify-between gap-2 w-full rounded-lg border',
          'bg-[var(--color-surface-0)] text-left',
          'transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-0',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error
            ? 'border-[var(--color-danger-500)] focus:ring-[var(--color-danger-500)]/30'
            : 'border-[var(--color-surface-300)] focus:border-[var(--color-brand-500)] focus:ring-[var(--color-brand-500)]/30',
          'dark:bg-[var(--color-surface-800)] dark:border-[var(--color-surface-600)]',
          'dark:text-[var(--color-surface-100)]',
          'h-10 px-4 text-sm'
        )}
      >
        <span className={cn('flex-1 truncate', !displayLabel && 'text-[var(--color-ink-disabled)]')}>
          {multiple && selectedValues.length > 0 && (
            <span className="inline-flex items-center gap-1 flex-wrap">
              {selectedValues.map((v) => {
                const opt = options.find((o) => o.value === v);
                return (
                  <span
                    key={v}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--color-brand-100)] text-[var(--color-brand-700)] text-xs dark:bg-[var(--color-brand-900)] dark:text-[var(--color-brand-200)]"
                  >
                    {opt?.label ?? v}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(v);
                      }}
                      className="hover:text-[var(--color-brand-900)] dark:hover:text-[var(--color-brand-50)]"
                      aria-label={`Remove ${opt?.label ?? v}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </span>
          )}
          {!multiple && (displayLabel ?? placeholder)}
          {multiple && selectedValues.length === 0 && placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {clearable && selectedValues.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink-primary)] cursor-pointer"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-[var(--color-ink-muted)] transition-transform',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full left-0 right-0 mt-1 z-[var(--z-dropdown)]',
            'rounded-lg border border-[var(--color-surface-200)]',
            'bg-[var(--color-surface-0)] shadow-elevation-3',
            'dark:bg-[var(--color-surface-800)] dark:border-[var(--color-surface-600)]',
            'animate-scale-in'
          )}
        >
          {searchable && (
            <div className="p-2 border-b border-[var(--color-surface-200)] dark:border-[var(--color-surface-600)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-ink-muted)]" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className={cn(
                    'w-full h-8 pl-8 pr-3 text-sm rounded-md',
                    'bg-[var(--color-surface-50)] border border-[var(--color-surface-200)]',
                    'text-[var(--color-ink-primary)] placeholder:text-[var(--color-ink-disabled)]',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-500)]/30',
                    'dark:bg-[var(--color-surface-900)] dark:border-[var(--color-surface-600)]'
                  )}
                  aria-label="Search options"
                />
              </div>
            </div>
          )}
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-labelledby={label ? `${id}-label` : undefined}
            aria-multiselectable={multiple || undefined}
            className="max-h-60 overflow-y-auto py-1"
          >
            {groupedOptions.length === 0 && (
              <li className="px-4 py-2 text-sm text-[var(--color-ink-muted)]" role="option" aria-disabled="true" aria-selected="false">
                No options
              </li>
            )}
            {groupedOptions.map((group, gi) => (
              <li key={gi} role="presentation">
                {group.name && (
                  <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                    {group.name}
                  </div>
                )}
                {group.items.map((opt) => {
                  const isSelected = selectedValues.includes(opt.value);
                  const isHighlighted = opt.globalIndex === highlightedIndex;
                  return (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled || undefined}
                      onClick={() => {
                        if (!opt.disabled) handleSelect(opt.value);
                      }}
                      onMouseEnter={() => setHighlightedIndex(opt.globalIndex)}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer',
                        'transition-colors',
                        opt.disabled && 'opacity-50 cursor-not-allowed',
                        isSelected && 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)] dark:bg-[var(--color-brand-900)]/30 dark:text-[var(--color-brand-300)]',
                        isHighlighted && !isSelected && 'bg-[var(--color-surface-100)] dark:bg-[var(--color-surface-700)]',
                        !isSelected && !isHighlighted && 'text-[var(--color-ink-primary)] hover:bg-[var(--color-surface-50)] dark:text-[var(--color-surface-200)] dark:hover:bg-[var(--color-surface-700)]'
                      )}
                    >
                      {multiple && (
                        <span
                          className={cn(
                            'flex items-center justify-center h-4 w-4 rounded border',
                            isSelected
                              ? 'bg-[var(--color-brand-600)] border-[var(--color-brand-600)] text-white'
                              : 'border-[var(--color-surface-400)]'
                          )}
                          aria-hidden="true"
                        >
                          {isSelected && <Check className="h-3 w-3" />}
                        </span>
                      )}
                      <span className="flex-1">{opt.label}</span>
                      {!multiple && isSelected && <Check className="h-4 w-4 text-[var(--color-brand-600)]" aria-hidden="true" />}
                    </li>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-[var(--color-danger-500)]">
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-xs text-[var(--color-ink-muted)]">{helperText}</p>
      )}
    </div>
  );
});
