'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  label: string;
  description?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (v: string) => void;
  onSearch?: (query: string) => Promise<MentionItem[]> | MentionItem[];
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  className?: string;
  label?: string;
  onSubmit?: () => void;
  ariaLabel?: string;
}

export function MentionInput({
  value,
  onChange,
  onSearch,
  placeholder = 'Type @ to mention someone…',
  disabled = false,
  rows = 2,
  maxLength = 500,
  className,
  label,
  onSubmit,
  ariaLabel,
}: MentionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [items, setItems] = useState<MentionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const detectMention = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cursor = el.selectionStart ?? 0;
    const before = value.slice(0, cursor);
    const match = /(^|\s)@([^\s@]*)$/.exec(before);
    if (match) {
      const start = cursor - match[2].length - 1;
      setMentionStart(start);
      setQuery(match[2]);
      setOpen(true);
      setActiveIndex(0);
    } else {
      setOpen(false);
      setMentionStart(null);
      setQuery('');
    }
  }, [value]);

  useEffect(() => {
    if (!open || !onSearch) return;
    let cancelled = false;
    setLoading(true);
    Promise.resolve(onSearch(query))
      .then((res) => {
        if (!cancelled) {
          setItems(res);
          setActiveIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query, onSearch]);

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (mentionStart == null) return;
      const el = ref.current;
      const cursor = el?.selectionStart ?? value.length;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursor);
      const insertion = `@${item.label} `;
      const next = before + insertion + after;
      onChange(next);
      setOpen(false);
      setMentionStart(null);
      setQuery('');
      requestAnimationFrame(() => {
        if (el) {
          const newPos = before.length + insertion.length;
          el.setSelectionRange(newPos, newPos);
          el.focus();
        }
      });
    },
    [mentionStart, value, onChange]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && items.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(items.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) insertMention(item);
        else onSubmit?.();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={cn('relative', className)}>
      {label && (
        <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            detectMention();
          }}
          onKeyDown={onKeyDown}
          onClick={detectMention}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          aria-label={ariaLabel || label}
          className={cn(
            'w-full px-3 py-2 text-sm border border-gray-200 dark:border-surface-700 rounded-lg resize-none',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            'bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
            disabled && 'opacity-50 pointer-events-none'
          )}
        />
        <span className="absolute bottom-2 right-2 text-[10px] text-gray-400 dark:text-gray-500 pointer-events-none">
          {value.length}/{maxLength}
        </span>
        {open && (
          <ul
            role="listbox"
            className="absolute z-50 left-0 bottom-full mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1 animate-fade-in"
          >
            <li className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <AtSign className="h-3 w-3" aria-hidden="true" /> Mention
            </li>
            {loading && items.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Searching…</li>
            ) : items.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No matches</li>
            ) : (
              items.map((it, i) => (
                <li
                  key={it.id}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => { e.preventDefault(); insertMention(it); }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer',
                    i === activeIndex && 'bg-blue-50 dark:bg-brand-500/20'
                  )}
                >
                  <AtSign className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-gray-900 dark:text-gray-100 font-medium">{it.label}</p>
                    {it.description && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{it.description}</p>}
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
