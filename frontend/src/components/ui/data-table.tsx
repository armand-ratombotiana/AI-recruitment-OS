'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ChevronUp, ChevronDown, Search, Eye, EyeOff } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (item: T) => void;
  searchable?: boolean;
  pageSize?: number;
  searchableFields?: (keyof T)[];
  emptyMessage?: string;
  rowKey?: (item: T) => string;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  searchable = true,
  pageSize = 10,
  searchableFields,
  emptyMessage = 'No data found',
  rowKey,
  initialSort,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>(initialSort?.key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort?.dir ?? 'asc');
  const [page, setPage] = useState(1);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    };
    if (showColMenu) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColMenu]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) => {
      const fields = searchableFields ?? (Object.keys(item) as (keyof T)[]);
      return fields.some((f) => {
        const v = item[f];
        return v != null && String(v).toLowerCase().includes(q);
      });
    });
  }, [data, search, searchableFields]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const toggleCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  return (
    <div className="w-full">
      {searchable && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              aria-hidden="true"
            />
            <input
              type="search"
              role="searchbox"
              aria-label="Search table"
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setShowColMenu((s) => !s)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-haspopup="menu"
              aria-expanded={showColMenu}
            >
              {showColMenu ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
              Columns
            </button>
            {showColMenu && (
              <div
                role="menu"
                className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              >
                {columns.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer"
                    role="menuitemcheckbox"
                    aria-checked={!hiddenCols.has(col.key)}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(col.key)}
                      onChange={() => toggleCol(col.key)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-700">
        <table className="w-full" role="table">
          <thead className="bg-gray-50 dark:bg-surface-800">
            <tr>
              {visibleColumns.map((col) => {
                const canSort = col.sortable !== false;
                const align =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      sortKey === col.key
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    onClick={canSort ? () => handleSort(col.key) : undefined}
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      'px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400',
                      align,
                      canSort && 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-surface-700'
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {canSort && (
                        <span className="inline-flex flex-col" aria-hidden="true">
                          <ChevronUp
                            className={cn(
                              'h-3 w-3',
                              sortKey === col.key && sortDir === 'asc'
                                ? 'text-blue-600'
                                : 'text-gray-300'
                            )}
                          />
                          <ChevronDown
                            className={cn(
                              'h-3 w-3 -mt-1',
                              sortKey === col.key && sortDir === 'desc'
                                ? 'text-blue-600'
                                : 'text-gray-300'
                            )}
                          />
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-surface-700 bg-white dark:bg-surface-900">
            {paged.map((item, i) => (
              <tr
                key={rowKey ? rowKey(item) : i}
                onClick={() => onRowClick?.(item)}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(item);
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
                className={cn(
                  'focus:outline-none focus-visible:bg-blue-50 dark:focus-visible:bg-brand-500/10',
                  onRowClick && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-surface-800'
                )}
              >
                {visibleColumns.map((col) => {
                  const align =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left';
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-200',
                        align
                      )}
                    >
                      {col.render ? col.render(item) : item[col.key]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-500" role="status">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
          <p aria-live="polite">
            Showing {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="px-2" aria-current="page">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
