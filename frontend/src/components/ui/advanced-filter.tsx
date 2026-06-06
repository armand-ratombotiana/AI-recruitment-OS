'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Filter as FilterIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FilterChip, type FilterChipVariant } from './filter-chip';
import { translate, type Locale } from '@/stores/locale-store';

// ----------------------------------------------------------------------------
// Value & definition types
// ----------------------------------------------------------------------------

export type FilterValue =
  | string
  | string[]
  | { start: string; end: string }
  | { min: number | null; max: number | null };

export type FilterValues = Record<string, FilterValue | undefined>;

export type FilterType = 'text' | 'select' | 'multiselect' | 'daterange' | 'numberrange';

export interface FilterOption {
  value: string;
  label: string;
}

export interface BaseFilterDef {
  key: string;
  label: string;
  type: FilterType;
}

export interface TextFilterDef extends BaseFilterDef {
  type: 'text';
  placeholder?: string;
}

export interface SelectFilterDef extends BaseFilterDef {
  type: 'select';
  options: FilterOption[];
  placeholder?: string;
  allowEmpty?: boolean;
}

export interface MultiselectFilterDef extends BaseFilterDef {
  type: 'multiselect';
  options: FilterOption[];
  placeholder?: string;
  maxSelections?: number;
}

export interface DateRangeFilterDef extends BaseFilterDef {
  type: 'daterange';
  startLabel?: string;
  endLabel?: string;
  minDate?: string;
  maxDate?: string;
}

export interface NumberRangeFilterDef extends BaseFilterDef {
  type: 'numberrange';
  min?: number;
  max?: number;
  step?: number;
  minLabel?: string;
  maxLabel?: string;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  unit?: string;
}

export type FilterDefinition =
  | TextFilterDef
  | SelectFilterDef
  | MultiselectFilterDef
  | DateRangeFilterDef
  | NumberRangeFilterDef;

interface AdvancedFilterProps {
  filters: FilterDefinition[];
  value: FilterValues;
  onChange: (value: FilterValues) => void;
  onClearAll?: () => void;
  defaultOpen?: boolean;
  className?: string;
  title?: string;
  locale?: Locale;
  variant?: 'card' | 'inline';
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const EMPTY: FilterValues = Object.freeze({}) as FilterValues;

function isEmptyValue(v: FilterValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object' && 'start' in v && 'end' in v) {
    return !v.start && !v.end;
  }
  if (typeof v === 'object' && 'min' in v && 'max' in v) {
    return v.min === null && v.max === null;
  }
  return true;
}

function formatValueForChip(
  def: FilterDefinition,
  raw: FilterValue | undefined,
  locale: Locale
): string | null {
  if (isEmptyValue(raw)) return null;

  if (def.type === 'text' || def.type === 'select') {
    const s = String(raw);
    if (def.type === 'select') {
      const opt = def.options.find((o) => o.value === s);
      return opt ? opt.label : s;
    }
    return s;
  }

  if (def.type === 'multiselect' && Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return raw
      .map((v) => def.options.find((o) => o.value === v)?.label ?? v)
      .join(', ');
  }

  if (def.type === 'daterange' && typeof raw === 'object' && !Array.isArray(raw) && 'start' in raw) {
    const { start, end } = raw as { start: string; end: string };
    if (!start && !end) return null;
    const fmt = (d: string) => {
      if (!d) return '…';
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      try {
        return new Intl.DateTimeFormat(
          locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US',
          { month: 'short', day: 'numeric', year: 'numeric' }
        ).format(dt);
      } catch {
        return d;
      }
    };
    if (start && end) return `${fmt(start)} – ${fmt(end)}`;
    return start ? `${fmt(start)} – …` : `… – ${fmt(end)}`;
  }

  if (def.type === 'numberrange' && typeof raw === 'object' && !Array.isArray(raw) && 'min' in raw) {
    const { min, max } = raw as { min: number | null; max: number | null };
    if (min === null && max === null) return null;
    const fmt = (n: number) => {
      try {
        return new Intl.NumberFormat(
          locale === 'fr' ? 'fr-FR' : locale === 'es' ? 'es-ES' : 'en-US'
        ).format(n);
      } catch {
        return String(n);
      }
    };
    const unit = def.unit ? ` ${def.unit}` : '';
    if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}${unit}`;
    if (min !== null) return `≥ ${fmt(min)}${unit}`;
    return `≤ ${fmt(max as number)}${unit}`;
  }

  return null;
}

function defaultEmpty(def: FilterDefinition): FilterValue | undefined {
  switch (def.type) {
    case 'text':
    case 'select':
      return '';
    case 'multiselect':
      return [];
    case 'daterange':
      return { start: '', end: '' };
    case 'numberrange':
      return { min: null, max: null };
  }
}

function getVariantForFilter(def: FilterDefinition): FilterChipVariant {
  if (def.type === 'daterange' || def.type === 'numberrange') return 'info';
  if (def.type === 'multiselect') return 'primary';
  if (def.type === 'select') return 'default';
  return 'default';
}

// ----------------------------------------------------------------------------
// Sub-components for each filter type
// ----------------------------------------------------------------------------

function TextFilterControl({
  def,
  value,
  onChange,
}: {
  def: TextFilterDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.placeholder}
      aria-label={def.label}
      className={cn(
        'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm',
        'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
        'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500',
        'dark:focus:border-brand-400 dark:focus:ring-brand-400'
      )}
    />
  );
}

function SelectFilterControl({
  def,
  value,
  onChange,
}: {
  def: SelectFilterDef;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={def.label}
      className={cn(
        'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm',
        'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
        'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100',
        'dark:focus:border-brand-400 dark:focus:ring-brand-400'
      )}
    >
      {def.allowEmpty !== false && (
        <option value="">{def.placeholder ?? 'Any'}</option>
      )}
      {def.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function MultiselectFilterControl({
  def,
  value,
  onChange,
}: {
  def: MultiselectFilterDef;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      if (def.maxSelections && value.length >= def.maxSelections) return;
      onChange([...value, optValue]);
    }
  };
  return (
    <div
      className={cn(
        'flex flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2',
        'dark:bg-surface-800 dark:border-surface-700'
      )}
      role="group"
      aria-label={def.label}
    >
      {def.options.length === 0 && (
        <span className="text-xs text-gray-400 dark:text-gray-500 px-1.5 py-1">—</span>
      )}
      {def.options.map((o) => {
        const active = value.includes(o.value);
        const disabled =
          !active && !!def.maxSelections && value.length >= def.maxSelections;
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o.value)}
            aria-pressed={active}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-full border transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              active
                ? 'bg-blue-100 border-blue-300 text-blue-700 dark:bg-brand-500/30 dark:border-brand-500/50 dark:text-brand-200'
                : 'bg-white dark:bg-surface-900 border-gray-200 dark:border-surface-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-surface-700',
              disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DateRangeFilterControl({
  def,
  value,
  onChange,
}: {
  def: DateRangeFilterDef;
  value: { start: string; end: string };
  onChange: (v: { start: string; end: string }) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          {def.startLabel ?? 'Start'}
        </span>
        <input
          type="date"
          value={value.start}
          min={def.minDate}
          max={def.maxDate}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          aria-label={`${def.label} start`}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100',
            'dark:focus:border-brand-400 dark:focus:ring-brand-400'
          )}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          {def.endLabel ?? 'End'}
        </span>
        <input
          type="date"
          value={value.end}
          min={def.minDate}
          max={def.maxDate}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          aria-label={`${def.label} end`}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100',
            'dark:focus:border-brand-400 dark:focus:ring-brand-400'
          )}
        />
      </label>
    </div>
  );
}

function NumberRangeFilterControl({
  def,
  value,
  onChange,
}: {
  def: NumberRangeFilterDef;
  value: { min: number | null; max: number | null };
  onChange: (v: { min: number | null; max: number | null }) => void;
}) {
  const parseNum = (s: string) => {
    if (s === '' || s === '-') return null;
    const n = Number(s);
    return isNaN(n) ? null : n;
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          {def.minLabel ?? 'Min'}
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={value.min === null ? '' : String(value.min)}
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          placeholder={def.minPlaceholder}
          onChange={(e) => onChange({ ...value, min: parseNum(e.target.value) })}
          aria-label={`${def.label} min`}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500',
            'dark:focus:border-brand-400 dark:focus:ring-brand-400'
          )}
        />
      </label>
      <label className="block">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          {def.maxLabel ?? 'Max'}
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={value.max === null ? '' : String(value.max)}
          min={def.min}
          max={def.max}
          step={def.step ?? 1}
          placeholder={def.maxPlaceholder}
          onChange={(e) => onChange({ ...value, max: parseNum(e.target.value) })}
          aria-label={`${def.label} max`}
          className={cn(
            'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
            'dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500',
            'dark:focus:border-brand-400 dark:focus:ring-brand-400'
          )}
        />
      </label>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------

export function AdvancedFilter({
  filters,
  value = EMPTY,
  onChange,
  onClearAll,
  defaultOpen = false,
  className,
  title,
  locale = 'en',
  variant = 'card',
}: AdvancedFilterProps) {
  const [open, setOpen] = useState(defaultOpen);
  const headingId = useId();

  const t = (key: string, fallback: string) => translate(locale, key, fallback);

  const activeEntries = useMemo(() => {
    return filters
      .map((def) => {
        const raw = value[def.key];
        const display = formatValueForChip(def, raw, locale);
        return display ? { def, raw, display } : null;
      })
      .filter((x): x is { def: FilterDefinition; raw: FilterValue; display: string } => !!x);
  }, [filters, value, locale]);

  const activeCount = activeEntries.length;

  const updateFilter = (key: string, next: FilterValue | undefined) => {
    const out: FilterValues = { ...value };
    if (next === undefined || isEmptyValue(next)) {
      delete out[key];
    } else {
      out[key] = next;
    }
    onChange(out);
  };

  const removeFilter = (key: string) => {
    const def = filters.find((f) => f.key === key);
    if (!def) return;
    updateFilter(key, defaultEmpty(def));
  };

  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
    } else {
      onChange({});
    }
  };

  const headerTitle = title ?? t('advancedFilters.title', 'Filters');
  const clearLabel = t('advancedFilters.clearAll', 'Clear all');
  const activeBadgeLabel = t('advancedFilters.activeCount', '{count} active').replace(
    '{count}',
    String(activeCount)
  );
  const collapseLabel = t('advancedFilters.collapse', 'Collapse filters');
  const expandLabel = t('advancedFilters.expand', 'Expand filters');
  const noFiltersLabel = t('advancedFilters.noneActive', 'No filters active');

  return (
    <section
      className={cn(
        variant === 'card' &&
          'rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900',
        className
      )}
      aria-labelledby={headingId}
    >
      <header
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 px-4 py-3',
          variant === 'card' && 'border-b border-gray-100 dark:border-surface-800'
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-7 w-7 items-center justify-center rounded-md',
              'bg-blue-50 text-blue-600 dark:bg-brand-500/20 dark:text-brand-300'
            )}
            aria-hidden="true"
          >
            <FilterIcon className="h-3.5 w-3.5" />
          </span>
          <h2
            id={headingId}
            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
          >
            {headerTitle}
          </h2>
          {activeCount > 0 && (
            <span
              className={cn(
                'inline-flex items-center justify-center rounded-full px-2 py-0.5',
                'text-[10px] font-bold leading-none',
                'bg-blue-600 text-white dark:bg-brand-500'
              )}
              aria-label={activeBadgeLabel}
            >
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={activeCount === 0}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
              'text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              'dark:text-gray-300 dark:hover:bg-surface-800',
              'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent'
            )}
            aria-label={clearLabel}
          >
            <X className="h-3 w-3" aria-hidden="true" />
            {clearLabel}
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              'inline-flex items-center justify-center rounded-md p-1.5',
              'text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              'dark:text-gray-400 dark:hover:bg-surface-800'
            )}
            aria-expanded={open}
            aria-controls={`${headingId}-panel`}
            aria-label={open ? collapseLabel : expandLabel}
          >
            {open ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </header>

      {open && (
        <div
          id={`${headingId}-panel`}
          className={cn(
            'px-4 py-3',
            variant === 'card' && 'border-b border-gray-100 dark:border-surface-800'
          )}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filters.map((def) => {
              const raw = value[def.key] ?? defaultEmpty(def);
              return (
                <div key={def.key} className="min-w-0">
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                    {def.label}
                  </label>
                  {def.type === 'text' && (
                    <TextFilterControl
                      def={def}
                      value={typeof raw === 'string' ? raw : ''}
                      onChange={(v) => updateFilter(def.key, v)}
                    />
                  )}
                  {def.type === 'select' && (
                    <SelectFilterControl
                      def={def}
                      value={typeof raw === 'string' ? raw : ''}
                      onChange={(v) => updateFilter(def.key, v)}
                    />
                  )}
                  {def.type === 'multiselect' && (
                    <MultiselectFilterControl
                      def={def}
                      value={Array.isArray(raw) ? raw : []}
                      onChange={(v) => updateFilter(def.key, v)}
                    />
                  )}
                  {def.type === 'daterange' && (
                    <DateRangeFilterControl
                      def={def}
                      value={
                        typeof raw === 'object' && !Array.isArray(raw) && 'start' in raw
                          ? (raw as { start: string; end: string })
                          : { start: '', end: '' }
                      }
                      onChange={(v) => updateFilter(def.key, v)}
                    />
                  )}
                  {def.type === 'numberrange' && (
                    <NumberRangeFilterControl
                      def={def}
                      value={
                        typeof raw === 'object' && !Array.isArray(raw) && 'min' in raw
                          ? (raw as { min: number | null; max: number | null })
                          : { min: null, max: null }
                      }
                      onChange={(v) => updateFilter(def.key, v)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <div
          className={cn(
            'px-4 py-2.5 flex flex-wrap items-center gap-1.5',
            variant === 'card' && 'bg-gray-50/50 dark:bg-surface-800/40'
          )}
          role="list"
          aria-label={t('advancedFilters.activeFilters', 'Active filters')}
        >
          {activeEntries.map(({ def, raw, display }) => (
            <FilterChip
              key={def.key}
              label={def.label}
              value={display}
              variant={getVariantForFilter(def)}
              onRemove={() => {
                if (
                  def.type === 'multiselect' &&
                  Array.isArray(raw) &&
                  raw.length > 1
                ) {
                  updateFilter(def.key, []);
                } else {
                  removeFilter(def.key);
                }
              }}
            />
          ))}
        </div>
      )}

      {open && activeCount === 0 && (
        <div
          className={cn(
            'px-4 py-2 text-xs text-gray-400 dark:text-gray-500',
            variant === 'card' && 'border-t border-gray-100 dark:border-surface-800'
          )}
        >
          {noFiltersLabel}
        </div>
      )}
    </section>
  );
}

export default AdvancedFilter;
