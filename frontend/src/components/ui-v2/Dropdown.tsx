'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useId,
  useMemo,
} from 'react';
import { cn } from '@/lib/utils';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  shortcut?: string;
  onClick?: () => void;
}

export interface DropdownGroup {
  label?: string;
  items: DropdownItem[];
}

export type DropdownDivider = { type: 'divider' };

export type DropdownEntry = DropdownItem | DropdownGroup | DropdownDivider;

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownEntry[];
  align?: 'start' | 'end';
  className?: string;
}

function isDivider(entry: DropdownEntry): entry is DropdownDivider {
  return 'type' in entry && (entry as DropdownDivider).type === 'divider';
}

function isGroup(entry: DropdownEntry): entry is DropdownGroup {
  return 'items' in entry && Array.isArray((entry as DropdownGroup).items);
}

export function Dropdown({ trigger, items, align = 'start', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const flatItems = useMemo(() => {
    const result: DropdownItem[] = [];
    for (const entry of items) {
      if (isDivider(entry)) continue;
      if (isGroup(entry)) {
        result.push(...entry.items);
      } else {
        result.push(entry as DropdownItem);
      }
    }
    return result;
  }, [items]);

  const handleSelect = useCallback(
    (item: DropdownItem) => {
      if (item.disabled) return;
      item.onClick?.();
      setOpen(false);
      setHighlightedIndex(-1);
    },
    []
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setOpen(true);
          setHighlightedIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) => {
            let next = prev + 1;
            while (next < flatItems.length && flatItems[next].disabled) next++;
            return next < flatItems.length ? next : prev;
          });
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => {
            let next = prev - 1;
            while (next >= 0 && flatItems[next].disabled) next--;
            return next >= 0 ? next : prev;
          });
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (highlightedIndex >= 0 && flatItems[highlightedIndex]) {
            handleSelect(flatItems[highlightedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setHighlightedIndex(-1);
          break;
        case 'Home':
          e.preventDefault();
          setHighlightedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setHighlightedIndex(flatItems.length - 1);
          break;
      }
    },
    [open, highlightedIndex, flatItems, handleSelect]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    const highlighted = menuRef.current.querySelector<HTMLElement>(`[data-index="${highlightedIndex}"]`);
    highlighted?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, open]);

  let flatIndex = -1;

  return (
    <div
      ref={containerRef}
      className={cn('relative inline-flex', className)}
      onKeyDown={handleKeyDown}
    >
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) setHighlightedIndex(0);
        }}
      >
        {trigger}
      </div>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-orientation="vertical"
          className={cn(
            'absolute top-full mt-1 z-[var(--z-dropdown)] min-w-[180px]',
            'rounded-lg border border-[var(--color-surface-200)]',
            'bg-[var(--color-surface-0)] shadow-elevation-3',
            'dark:bg-[var(--color-surface-800)] dark:border-[var(--color-surface-600)]',
            'py-1 animate-scale-in',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((entry, i) => {
            if (isDivider(entry)) {
              return (
                <div
                  key={`divider-${i}`}
                  className="my-1 border-t border-[var(--color-surface-200)] dark:border-[var(--color-surface-600)]"
                  role="separator"
                />
              );
            }
            if (isGroup(entry)) {
              return (
                <div key={`group-${entry.label ?? i}`} role="group" aria-label={entry.label}>
                  {entry.label && (
                    <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                      {entry.label}
                    </div>
                  )}
                  {entry.items.map((item) => {
                    flatIndex++;
                    const idx = flatIndex;
                    return (
                      <DropdownMenuItem
                        key={item.id}
                        item={item}
                        index={idx}
                        highlighted={highlightedIndex === idx}
                        onSelect={() => handleSelect(item)}
                        onHighlight={() => setHighlightedIndex(idx)}
                      />
                    );
                  })}
                </div>
              );
            }
            const item = entry as DropdownItem;
            flatIndex++;
            const idx = flatIndex;
            return (
              <DropdownMenuItem
                key={item.id}
                item={item}
                index={idx}
                highlighted={highlightedIndex === idx}
                onSelect={() => handleSelect(item)}
                onHighlight={() => setHighlightedIndex(idx)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DropdownMenuItem({
  item,
  index,
  highlighted,
  onSelect,
  onHighlight,
}: {
  item: DropdownItem;
  index: number;
  highlighted: boolean;
  onSelect: () => void;
  onHighlight: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-index={index}
      tabIndex={-1}
      disabled={item.disabled}
      aria-disabled={item.disabled || undefined}
      onClick={onSelect}
      onMouseEnter={onHighlight}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left',
        'transition-colors',
        item.disabled && 'opacity-50 cursor-not-allowed',
        item.danger
          ? 'text-[var(--color-danger-600)] dark:text-[var(--color-danger-500)]'
          : 'text-[var(--color-ink-primary)] dark:text-[var(--color-surface-200)]',
        highlighted && !item.disabled && 'bg-[var(--color-surface-100)] dark:bg-[var(--color-surface-700)]',
        !highlighted && !item.disabled && 'hover:bg-[var(--color-surface-50)] dark:hover:bg-[var(--color-surface-700)]'
      )}
    >
      {item.icon && <span className="shrink-0 h-4 w-4" aria-hidden="true">{item.icon}</span>}
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <kbd className="text-[10px] text-[var(--color-ink-muted)] font-mono">{item.shortcut}</kbd>
      )}
    </button>
  );
}
