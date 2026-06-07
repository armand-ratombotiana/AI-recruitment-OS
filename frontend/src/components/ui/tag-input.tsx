'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Plus, X, Tag as TagIcon, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api, APIError } from '@/services/api/client';
import type { TagTypes } from '@/services/api/types';
import { translate, type Locale } from '@/stores/locale-store';
import { TagChip } from './tag-chip';

export type TagEntityType = TagTypes.EntityType;

export interface TagInputTag {
  id?: string;
  name: string;
  color?: string;
  slug?: string;
}

export interface TagInputProps {
  id?: string;
  value: TagInputTag[];
  onChange: (next: TagInputTag[]) => void;
  entityType?: TagEntityType;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  maxTags?: number;
  allowCreate?: boolean;
  showColorPicker?: boolean;
  defaultColor?: string;
  locale?: Locale;
  ariaLabel?: string;
  helpText?: string;
  onError?: (msg: string) => void;
}

const PRESET_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#6366f1',
  '#a855f7',
  '#64748b',
];

function normaliseColor(c: string | undefined | null, fallback: string): string {
  if (!c) return fallback;
  const v = c.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return fallback;
  return v.toLowerCase();
}

function dedupeByName(list: TagInputTag[]): TagInputTag[] {
  const seen = new Set<string>();
  const out: TagInputTag[] = [];
  for (const t of list) {
    const k = t.name.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export function TagInput({
  id: idProp,
  value,
  onChange,
  entityType = 'global',
  placeholder,
  disabled = false,
  className,
  maxTags,
  allowCreate = true,
  showColorPicker = true,
  defaultColor = '#3b82f6',
  locale = 'en',
  ariaLabel,
  helpText,
  onError,
}: TagInputProps) {
  const id = useId();
  const inputId = idProp ?? id;
  const listboxId = `${id}-listbox`;
  const colorId = `${id}-color`;
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const t = useCallback(
    (key: string, fb?: string) => translate(locale, key, fb),
    [locale]
  );

  const placeholderText =
    placeholder ?? t('tags.inputPlaceholder', 'Add a tag…');
  const aria = ariaLabel ?? t('tags.inputAria', 'Tags');

  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showColor, setShowColor] = useState(false);
  const [pickedColor, setPickedColor] = useState<string>(normaliseColor(defaultColor, '#3b82f6'));
  const [suggestions, setSuggestions] = useState<TagInputTag[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [creating, setCreating] = useState(false);

  const tags = useMemo(() => dedupeByName(value || []), [value]);
  const valueKeys = useMemo(
    () => new Set(tags.map((v) => v.name.trim().toLowerCase())),
    [tags]
  );

  const fetchSuggestions = useCallback(
    async (query: string) => {
      setLoadingSuggestions(true);
      try {
        const params: Record<string, string> = { page_size: '20' };
        if (query.trim()) params.search = query.trim();
        if (entityType) params.entity_type = entityType;
        const res = await api.tags.list(params);
        const list = Array.isArray(res?.data) ? res.data : [];
        const mapped: TagInputTag[] = list
          .map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            slug: t.slug,
          }))
          .filter((t) => !valueKeys.has(t.name.trim().toLowerCase()));
        setSuggestions(mapped);
      } catch (e) {
        const msg = e instanceof APIError ? e.message : 'Failed to load tags';
        onError?.(msg);
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    },
    [entityType, onError, valueKeys]
  );

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      fetchSuggestions(draft);
    }, 150);
    return () => clearTimeout(handle);
  }, [draft, open, fetchSuggestions]);

  useEffect(() => {
    if (activeIndex >= suggestions.length) {
      setActiveIndex(Math.max(0, suggestions.length - 1));
    }
  }, [suggestions, activeIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const commit = useCallback(
    (raw: string, opts?: { color?: string; id?: string; slug?: string }) => {
      const trimmed = raw.trim();
      if (!trimmed) return false;
      if (valueKeys.has(trimmed.toLowerCase())) {
        setDraft('');
        return false;
      }
      if (maxTags && tags.length >= maxTags) {
        onError?.(t('tags.maxReached', 'Maximum number of tags reached'));
        return false;
      }
      const next: TagInputTag = {
        name: trimmed,
        color: normaliseColor(opts?.color ?? pickedColor, defaultColor),
        id: opts?.id,
        slug: opts?.slug,
      };
      onChange([...tags, next]);
      setDraft('');
      setOpen(false);
      return true;
    },
    [defaultColor, maxTags, onChange, onError, pickedColor, t, tags, valueKeys]
  );

  const createRemote = useCallback(
    async (raw: string, color: string) => {
      if (!allowCreate) {
        commit(raw, { color });
        return;
      }
      setCreating(true);
      try {
        const created = await api.tags.create({
          name: raw.trim(),
          color,
          entity_type: entityType,
        });
        commit(created.name, { color: created.color, id: created.id, slug: created.slug });
      } catch (e) {
        const msg = e instanceof APIError ? e.message : 'Failed to create tag';
        onError?.(msg);
      } finally {
        setCreating(false);
      }
    },
    [allowCreate, commit, entityType, onError]
  );

  const handleSelectSuggestion = useCallback(
    (s: TagInputTag) => {
      commit(s.name, { id: s.id, color: s.color, slug: s.slug });
    },
    [commit]
  );

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(suggestions.length, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const q = draft.trim();
      if (!q) return;
      if (open && suggestions[activeIndex] && suggestions[activeIndex].name.toLowerCase() === q.toLowerCase()) {
        handleSelectSuggestion(suggestions[activeIndex]);
        return;
      }
      if (allowCreate) {
        void createRemote(q, pickedColor);
      } else {
        commit(q);
      }
      return;
    }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
  };

  const handleRemove = useCallback(
    (name: string) => {
      onChange(tags.filter((tg) => tg.name !== name));
    },
    [onChange, tags]
  );

  const canCreateFromDraft =
    allowCreate && draft.trim().length > 0 && !valueKeys.has(draft.trim().toLowerCase());
  const showList = open && (suggestions.length > 0 || loadingSuggestions || canCreateFromDraft);

  return (
    <div ref={containerRef} className={cn('space-y-2', className)}>
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 w-full min-h-[42px] rounded-lg border bg-white px-2 py-1.5 text-sm shadow-sm',
          'border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500',
          'dark:bg-surface-800 dark:border-surface-700',
          disabled && 'opacity-60 pointer-events-none'
        )}
        role="group"
        aria-label={aria}
      >
        {tags.map((tag) => (
          <TagChip
            key={`${tag.id ?? ''}-${tag.name}`}
            id={tag.id}
            name={tag.name}
            color={tag.color}
            size="md"
            removable={!disabled}
            onRemove={() => handleRemove(tag.name)}
            ariaLabel={t('tags.removeAria', 'Remove tag {name}').replace('{name}', tag.name)}
          />
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            const q = draft.trim();
            if (q && !valueKeys.has(q.toLowerCase())) {
              if (allowCreate) {
                void createRemote(q, pickedColor);
              } else {
                commit(q);
              }
            }
          }}
          disabled={disabled}
          placeholder={tags.length === 0 ? placeholderText : ''}
          aria-label={aria}
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-activedescendant={
            showList && suggestions[activeIndex] ? `${listboxId}-${suggestions[activeIndex].id ?? suggestions[activeIndex].name}` : undefined
          }
          autoComplete="off"
          className="flex-1 min-w-[140px] bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed dark:text-gray-100 dark:placeholder:text-gray-500"
        />
        {canCreateFromDraft && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (allowCreate) {
                void createRemote(draft.trim(), pickedColor);
              } else {
                commit(draft);
              }
            }}
            disabled={disabled || creating}
            aria-label={t('tags.addAria', 'Add tag')}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-brand-300 dark:hover:bg-brand-500/20"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            {t('tags.add', 'Add')}
          </button>
        )}
      </div>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="relative z-40 -mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 animate-fade-in"
        >
          {loadingSuggestions && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t('tags.loading', 'Loading tags…')}
            </li>
          ) : null}
          {!loadingSuggestions && suggestions.length === 0 && !canCreateFromDraft ? (
            <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t('tags.noMatches', 'No matching tags')}
            </li>
          ) : null}
          {suggestions.map((s, i) => (
            <li
              key={s.id ?? s.name}
              id={`${listboxId}-${s.id ?? s.name}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectSuggestion(s);
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer',
                i === activeIndex && 'bg-blue-50 dark:bg-brand-500/20'
              )}
            >
              <TagIcon className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
              <span className="flex-1 truncate text-gray-900 dark:text-gray-100">{s.name}</span>
              {s.color ? (
                <span
                  className="h-2.5 w-2.5 rounded-full border border-gray-200 dark:border-surface-600"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          ))}
          {canCreateFromDraft && (
            <li
              role="option"
              aria-selected={activeIndex === suggestions.length}
              onMouseEnter={() => setActiveIndex(suggestions.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                if (allowCreate) {
                  void createRemote(draft.trim(), pickedColor);
                } else {
                  commit(draft);
                }
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer border-t border-gray-100 dark:border-surface-700',
                activeIndex === suggestions.length && 'bg-blue-50 dark:bg-brand-500/20'
              )}
            >
              <Plus className="h-3.5 w-3.5 text-blue-600 dark:text-brand-400" aria-hidden="true" />
              <span className="flex-1 truncate text-blue-700 dark:text-brand-300">
                {t('tags.createNew', 'Create new tag "{name}"').replace('{name}', draft.trim())}
              </span>
              {showColor && (
                <span
                  className="h-2.5 w-2.5 rounded-full border border-gray-200 dark:border-surface-600"
                  style={{ backgroundColor: pickedColor }}
                  aria-hidden="true"
                />
              )}
            </li>
          )}
        </ul>
      )}

      {showColorPicker && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowColor((s) => !s)}
            aria-expanded={showColor}
            aria-controls={colorId}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-surface-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Palette className="h-3.5 w-3.5" aria-hidden="true" />
            <span
              className="h-3 w-3 rounded-full border border-gray-300 dark:border-surface-600"
              style={{ backgroundColor: pickedColor }}
              aria-hidden="true"
            />
            {t('tags.color', 'New tag color')}
          </button>
          {showColor && (
            <div id={colorId} className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('tags.color', 'New tag color')}>
              {PRESET_COLORS.map((c) => {
                const selected = c.toLowerCase() === pickedColor.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setPickedColor(c)}
                    title={c}
                    className={cn(
                      'h-5 w-5 rounded-full border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      selected
                        ? 'border-gray-900 dark:border-white ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-surface-900'
                        : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
              <label className="ml-1 inline-flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                {t('tags.customColor', 'Custom')}
                <input
                  type="color"
                  value={pickedColor}
                  onChange={(e) => setPickedColor(normaliseColor(e.target.value, pickedColor))}
                  className="h-5 w-5 cursor-pointer rounded border border-gray-200 dark:border-surface-700 bg-transparent p-0"
                  aria-label={t('tags.customColor', 'Custom color')}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {helpText && (
        <p className="text-xs text-gray-500 dark:text-gray-400">{helpText}</p>
      )}
    </div>
  );
}

export default TagInput;
