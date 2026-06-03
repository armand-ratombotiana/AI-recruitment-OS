'use client';

import { useState, useRef, useEffect, KeyboardEvent, useMemo } from 'react';
import { Search as SearchIcon, X, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  suggestions?: string[];
  recentSearches?: string[];
  onClearRecent?: () => void;
  debounceMs?: number;
  loading?: boolean;
  className?: string;
  showRecent?: boolean;
  maxSuggestions?: number;
}

export function Search({
  value: controlled,
  onChange,
  onSubmit,
  placeholder = 'Search...',
  suggestions = [],
  recentSearches = [],
  onClearRecent,
  debounceMs = 300,
  loading = false,
  className,
  showRecent = true,
  maxSuggestions = 8,
}: SearchProps) {
  const [internal, setInternal] = useState('');
  const [debounced, setDebounced] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : internal;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(value), debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, debounceMs]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSuggestions = useMemo(() => {
    if (!debounced) return [];
    const q = debounced.toLowerCase();
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && s.toLowerCase() !== q)
      .slice(0, maxSuggestions);
  }, [debounced, suggestions, maxSuggestions]);

  const filteredRecent = useMemo(() => {
    if (!showRecent || debounced) return [];
    return recentSearches.slice(0, maxSuggestions);
  }, [recentSearches, debounced, showRecent, maxSuggestions]);

  const showDropdown = isOpen && (filteredSuggestions.length > 0 || filteredRecent.length > 0);

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  const handleSelect = (text: string) => {
    setValue(text);
    setIsOpen(false);
    setActiveIdx(-1);
    onSubmit?.(text);
  };

  const handleClear = () => {
    setValue('');
    setDebounced('');
    setActiveIdx(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const totalOptions = filteredSuggestions.length + filteredRecent.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(totalOptions - 1, i + 1));
      setIsOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0) {
        e.preventDefault();
        const opt = activeIdx < filteredSuggestions.length
          ? filteredSuggestions[activeIdx]
          : filteredRecent[activeIdx - filteredSuggestions.length];
        if (opt) handleSelect(opt);
      } else {
        setIsOpen(false);
        onSubmit?.(value);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <div className="relative">
        <SearchIcon
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIdx >= 0 ? `search-opt-${activeIdx}` : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setIsOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-gray-300 pl-9 pr-9 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        {loading && (
          <div
            className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600"
            aria-hidden="true"
          />
        )}
      </div>

      {showDropdown && (
        <ul
          id="search-listbox"
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {filteredRecent.length > 0 && (
            <>
              <li className="flex items-center justify-between px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Recent
                </span>
                {onClearRecent && (
                  <button
                    type="button"
                    onClick={onClearRecent}
                    className="text-blue-600 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
                  >
                    Clear
                  </button>
                )}
              </li>
              {filteredRecent.map((s, i) => {
                const idx = filteredSuggestions.length + i;
                return (
                  <li
                    key={`r-${s}-${i}`}
                    id={`search-opt-${idx}`}
                    role="option"
                    aria-selected={activeIdx === idx}
                    onClick={() => handleSelect(s)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                      activeIdx === idx ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                    )}
                  >
                    <Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                    {s}
                  </li>
                );
              })}
            </>
          )}
          {filteredSuggestions.length > 0 && (
            <>
              {filteredRecent.length > 0 && (
                <li className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-50 inline-flex items-center gap-1 w-full">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  Suggestions
                </li>
              )}
              {filteredSuggestions.map((s, i) => (
                <li
                  key={`s-${s}-${i}`}
                  id={`search-opt-${i}`}
                  role="option"
                  aria-selected={activeIdx === i}
                  onClick={() => handleSelect(s)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                    activeIdx === i ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                  )}
                >
                  <SearchIcon className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                  <HighlightMatch text={s} query={debounced} />
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900 rounded-sm">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
