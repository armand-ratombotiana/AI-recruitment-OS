'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bookmark, BookmarkPlus, ChevronDown, Star, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Modal } from './modal';
import { FilterChip } from './filter-chip';
import type { FilterValues } from './advanced-filter';
import {
  SMART_FILTERS,
  getSmartFilter,
  type SavedSearch,
  type SavedSearchScope,
  type SmartFilterDefinition,
  type SmartFilterId,
} from '@/hooks/use-saved-searches';
import { translate, type Locale } from '@/stores/locale-store';

const SCOPE_LABELS: Record<SavedSearchScope, string> = {
  candidates: 'candidates',
  jobs: 'jobs',
  global: 'global',
};

export interface SavedSearchMenuProps {
  scope: SavedSearchScope;
  searches: SavedSearch[];
  hydrated: boolean;
  locale: Locale;
  onApply: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
  emptyLabel?: string;
  buttonLabel?: string;
  align?: 'left' | 'right';
}

export function SavedSearchMenu({
  scope,
  searches,
  hydrated,
  locale,
  onApply,
  onDelete,
  emptyLabel,
  buttonLabel,
  align = 'left',
}: SavedSearchMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const t = (key: string, fallback: string) => translate(locale, key, fallback);

  const title = buttonLabel ?? t('savedSearch.button', 'Saved searches');
  const label = emptyLabel ?? t('savedSearch.empty', 'No saved searches yet');
  const count = hydrated ? searches.length : 0;
  const filterEmpty = label;

  return (
    <div ref={ref} className={cn('relative inline-block', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          open
            ? 'border-blue-500 text-blue-700 bg-blue-50 dark:border-brand-400 dark:text-brand-200 dark:bg-brand-500/20'
            : 'border-gray-200 text-gray-700 bg-white hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700'
        )}
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{title}</span>
        {count > 0 && (
          <span
            className={cn(
              'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
              open
                ? 'bg-blue-600 text-white dark:bg-brand-400'
                : 'bg-gray-200 text-gray-700 dark:bg-surface-700 dark:text-gray-200'
            )}
            aria-hidden="true"
          >
            {count}
          </span>
        )}
        <ChevronDown
          className={cn('h-3 w-3 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('savedSearch.menuAria', 'Saved searches menu')}
          className={cn(
            'absolute z-40 mt-1.5 w-80 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg',
            'dark:border-surface-700 dark:bg-surface-900',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {count === 0 ? (
            <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">{filterEmpty}</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-surface-800" role="none">
              {searches.map((s) => (
                <SavedSearchItem
                  key={s.id}
                  search={s}
                  locale={locale}
                  onApply={() => {
                    onApply(s);
                    setOpen(false);
                  }}
                  onDelete={() => onDelete(s.id)}
                />
              ))}
            </ul>
          )}
          <div className="border-t border-gray-100 dark:border-surface-800 px-3 py-2 text-[10px] text-gray-400 dark:text-gray-500">
            {t('savedSearch.scope', 'Scope: {scope}').replace('{scope}', SCOPE_LABELS[scope])}
          </div>
        </div>
      )}
    </div>
  );
}

function SavedSearchItem({
  search,
  locale,
  onApply,
  onDelete,
}: {
  search: SavedSearch;
  locale: Locale;
  onApply: () => void;
  onDelete: () => void;
}) {
  const t = (key: string, fallback: string) => translate(locale, key, fallback);
  const filterCount = Object.keys(search.filters || {}).length + (search.query ? 1 : 0);
  const smart = getSmartFilter(search.smartFilter);
  return (
    <li role="none" className="group">
      <div className="flex items-start gap-2 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-surface-800">
        <button
          type="button"
          role="menuitem"
          onClick={onApply}
          className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{search.name}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-1">
            {smart && (
              <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-accent-500/20 dark:text-accent-300">
                <Star className="h-2.5 w-2.5" aria-hidden="true" />
                {smart.label}
              </span>
            )}
            <span>
              {filterCount > 0
                ? t('savedSearch.filterCount', '{count} filter{plural}').replace('{count}', String(filterCount)).replace('{plural}', filterCount === 1 ? '' : 's')
                : t('savedSearch.noFilters', 'No filters')}
            </span>
            {search.query && (
              <span className="truncate"> · “{search.query}”</span>
            )}
          </p>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={t('savedSearch.deleteAria', 'Delete saved search {name}').replace('{name}', search.name)}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-danger-500/10 dark:hover:text-danger-500"
          title={t('common.delete', 'Delete')}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

// ----------------------------------------------------------------------------
// Save current search dialog
// ----------------------------------------------------------------------------

export interface SaveSearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  existingNames?: string[];
  defaultName?: string;
  locale: Locale;
}

export function SaveSearchDialog({
  isOpen,
  onClose,
  onSave,
  existingNames = [],
  defaultName = '',
  locale,
}: SaveSearchDialogProps) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const t = (key: string, fallback: string) => translate(locale, key, fallback);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
      setError(null);
    }
  }, [isOpen, defaultName]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('savedSearch.nameRequired', 'Please enter a name'));
      return;
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      setError(t('savedSearch.nameExists', 'A saved search with this name already exists'));
      return;
    }
    onSave(trimmed);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('savedSearch.saveTitle', 'Save current search')}
      description={t('savedSearch.saveDesc', 'Save these filters and query to access them later.')}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
          >
            {t('savedSearch.nameLabel', 'Name')}
          </label>
          <input
            id={inputId}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder={t('savedSearch.namePh', 'e.g. Senior React devs in Paris')}
            autoFocus
            maxLength={64}
            className={cn(
              'w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm',
              'focus:outline-none focus:ring-1',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500 dark:border-danger-500'
                : 'border-gray-200 focus:border-blue-500 focus:ring-blue-500',
              'dark:bg-surface-800 dark:text-gray-100 dark:placeholder-gray-500',
              'dark:focus:border-brand-400 dark:focus:ring-brand-400'
            )}
          />
          {error && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-danger-500">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" variant="primary" leftIcon={<BookmarkPlus className="h-4 w-4" />}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// Quick smart-filter chips
// ----------------------------------------------------------------------------

export interface SmartFiltersProps {
  scope: SavedSearchScope;
  locale: Locale;
  activeId: SmartFilterId | null;
  onSelect: (id: SmartFilterId | null) => void;
  className?: string;
}

export function SmartFilters({
  scope,
  locale,
  activeId,
  onSelect,
  className,
}: SmartFiltersProps) {
  const t = (key: string, fallback: string) => translate(locale, key, fallback);
  const filters = useMemo<SmartFilterDefinition[]>(
    () => SMART_FILTERS.filter((f) => f.scope === scope),
    [scope]
  );

  if (filters.length === 0) return null;

  return (
    <div
      role="group"
      aria-label={t('smartFilters.title', 'Smart filters')}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Star className="h-3 w-3 text-amber-500" aria-hidden="true" />
        {t('smartFilters.title', 'Smart filters')}
      </span>
      {filters.map((f) => {
        const active = activeId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(active ? null : f.id)}
            aria-pressed={active}
            title={f.description}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
              active
                ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-warning-500/20 dark:border-warning-500/40 dark:text-warning-500'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-surface-800 dark:border-surface-700 dark:text-gray-200 dark:hover:bg-surface-700'
            )}
          >
            {active && <X className="h-3 w-3" aria-hidden="true" />}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Composed toolbar: Save button + Saved search menu
// ----------------------------------------------------------------------------

export interface SavedSearchToolbarProps {
  scope: SavedSearchScope;
  searches: SavedSearch[];
  hydrated: boolean;
  locale: Locale;
  onApply: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
  onSaveClick: () => void;
  disabled?: boolean;
  align?: 'left' | 'right';
}

export function SavedSearchToolbar({
  scope,
  searches,
  hydrated,
  locale,
  onApply,
  onDelete,
  onSaveClick,
  disabled,
  align,
}: SavedSearchToolbarProps) {
  const t = (key: string, fallback: string) => translate(locale, key, fallback);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<BookmarkPlus className="h-3.5 w-3.5" />}
        onClick={onSaveClick}
        disabled={disabled}
        title={t('savedSearch.saveTooltip', 'Save the current search')}
      >
        {t('savedSearch.save', 'Save search')}
      </Button>
      <SavedSearchMenu
        scope={scope}
        searches={searches}
        hydrated={hydrated}
        locale={locale}
        onApply={onApply}
        onDelete={onDelete}
        align={align}
      />
    </div>
  );
}

// Re-export the FilterChip in case consumers want a quick render of saved filter values.
export { FilterChip };
