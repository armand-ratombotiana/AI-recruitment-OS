'use client';

import { useState, useMemo, useRef, useEffect, useCallback, useId } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Eye,
  EyeOff,
  X,
  Loader2,
  AlertCircle,
  Inbox,
  Settings2,
  Check,
  RefreshCw,
} from 'lucide-react';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';

export type SortDirection = 'asc' | 'desc' | null;

export interface CellContext<T> {
  index: number;
  selected: boolean;
  selectable: boolean;
  row: T;
}

export interface Column<T> {
  key: string;
  label: string;
  render?: (item: T, ctx?: CellContext<T>) => React.ReactNode;
  sortable?: boolean;
  hideable?: boolean;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  accessor?: (item: T) => unknown;
  className?: string;
  headerClassName?: string;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface BulkAction<T> {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: (selected: T[], clear: () => void) => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
  loading?: boolean;
  hidden?: (selected: T[]) => boolean;
  disabled?: (selected: T[]) => boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];

  onRowClick?: (item: T) => void;
  rowKey?: (item: T) => string;

  searchable?: boolean;
  searchPlaceholder?: string;
  searchableFields?: (keyof T)[];

  pageSize?: number;
  pageSizeOptions?: number[];
  showPageSize?: boolean;
  onPageSizeChange?: (size: number) => void;

  initialSort?: SortState;
  defaultSort?: SortState;

  emptyMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;

  selectable?: boolean;
  selectedRowKeys?: string[];
  defaultSelectedRowKeys?: string[];
  onSelectionChange?: (keys: string[], rows: T[]) => void;
  getRowId?: (item: T, index: number) => string;
  bulkActions?: BulkAction<T>[];
  bulkActionsLabel?: string;

  stickyHeader?: boolean;
  maxHeight?: string;
  showColumnToggle?: boolean;
  defaultHiddenColumns?: string[];

  loading?: boolean;
  loadingRows?: number;

  error?: Error | string | null;
  onRetry?: () => void;
  errorTitle?: string;
  errorDescription?: string;

  density?: 'compact' | 'normal' | 'comfortable';

  toolbar?: React.ReactNode;
  toolbarLeft?: React.ReactNode;

  caption?: string;
  ariaLabel?: string;
  className?: string;
  tableClassName?: string;
  containerClassName?: string;

  manualPagination?: boolean;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  totalItems?: number;
  pageCount?: number;
  onPageChange?: (page: number) => void;
  onSortChange?: (sort: SortState | null) => void;
}

const DENSITY: Record<'compact' | 'normal' | 'comfortable', { cell: string; header: string }> = {
  compact: { cell: 'px-3 py-2 text-xs', header: 'px-3 py-2' },
  normal: { cell: 'px-4 py-3 text-sm', header: 'px-4 py-3' },
  comfortable: { cell: 'px-5 py-4 text-sm', header: 'px-5 py-4' },
};

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  rowKey,
  searchable = true,
  searchPlaceholder = 'Search...',
  searchableFields,
  pageSize: pageSizeProp = 10,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSize = true,
  onPageSizeChange,
  initialSort,
  defaultSort,
  emptyMessage = 'No data found',
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
  selectable = false,
  selectedRowKeys: selectedRowKeysProp,
  defaultSelectedRowKeys,
  onSelectionChange,
  getRowId,
  bulkActions = [],
  bulkActionsLabel = 'items selected',
  stickyHeader = false,
  maxHeight,
  showColumnToggle = true,
  defaultHiddenColumns = [],
  loading = false,
  loadingRows = 5,
  error = null,
  onRetry,
  errorTitle,
  errorDescription,
  density = 'normal',
  toolbar,
  toolbarLeft,
  caption,
  ariaLabel = 'Data table',
  className,
  tableClassName,
  containerClassName,
  manualPagination = false,
  manualSorting = false,
  manualFiltering = false,
  totalItems: totalItemsProp,
  pageCount: pageCountProp,
  onPageChange: onPageChangeProp,
  onSortChange,
}: DataTableProps<T>) {
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const totalId = `${baseId}-total`;

  const [search, setSearch] = useState('');
  const [sortState, setSortState] = useState<SortState | null>(initialSort ?? defaultSort ?? null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeProp);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => new Set(defaultHiddenColumns));
  const [showColMenu, setShowColMenu] = useState(false);
  const [internalSelected, setInternalSelected] = useState<Set<string>>(
    () => new Set(defaultSelectedRowKeys ?? [])
  );

  const isControlledSelection = selectedRowKeysProp !== undefined;
  const selectedKeys = isControlledSelection
    ? new Set(selectedRowKeysProp ?? [])
    : internalSelected;

  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showColMenu) return;
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColMenu]);

  const resolveRowId = useCallback(
    (item: T, index: number): string => {
      if (getRowId) return getRowId(item, index);
      if (rowKey) return rowKey(item);
      const id = (item as any).id;
      if (typeof id === 'string' || typeof id === 'number') return String(id);
      return String(index);
    },
    [getRowId, rowKey]
  );

  const getCellValue = useCallback((item: T, col: Column<T>): unknown => {
    if (col.accessor) return col.accessor(item);
    return (item as any)[col.key];
  }, []);

  const filtered = useMemo(() => {
    if (manualFiltering) return data;
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((item) => {
      const fields = searchableFields ?? (Object.keys(item) as (keyof T)[]);
      return fields.some((f) => {
        const v = (item as any)[f];
        return v != null && String(v).toLowerCase().includes(q);
      });
    });
  }, [data, search, searchableFields, manualFiltering]);

  const sorted = useMemo(() => {
    if (manualSorting) return filtered;
    if (!sortState) return filtered;
    const col = columns.find((c) => c.key === sortState.key);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = getCellValue(a, col);
      const bVal = getCellValue(b, col);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortState.dir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aDate = aVal instanceof Date ? aVal.getTime() : Date.parse(String(aVal));
      const bDate = bVal instanceof Date ? bVal.getTime() : Date.parse(String(bVal));
      if (!isNaN(aDate) && !isNaN(bDate)) {
        return sortState.dir === 'asc' ? aDate - bDate : bDate - aDate;
      }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
      return sortState.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortState, columns, getCellValue, manualSorting]);

  const totalItems = totalItemsProp ?? sorted.length;
  const computedTotalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const totalPages = pageCountProp ?? computedTotalPages;
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    if (manualPagination) return sorted;
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize, manualPagination]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenCols.has(c.key)),
    [columns, hiddenCols]
  );

  const handleSort = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col || col.sortable === false) return;
    let next: SortState | null;
    if (!sortState || sortState.key !== key) {
      next = { key, dir: 'asc' };
    } else if (sortState.dir === 'asc') {
      next = { key, dir: 'desc' };
    } else {
      next = null;
    }
    setSortState(next);
    onSortChange?.(next);
    if (manualPagination) setPage(1);
  };

  const setPageAndNotify = (next: number) => {
    const safe = Math.min(Math.max(1, next), totalPages);
    setPage(safe);
    onPageChangeProp?.(safe);
  };

  const handlePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
    onPageSizeChange?.(size);
    onPageChangeProp?.(1);
  };

  const toggleCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showAllCols = () => setHiddenCols(new Set());

  const setSelection = (next: Set<string>) => {
    if (!isControlledSelection) setInternalSelected(next);
    const rows = data.filter((item, i) => next.has(resolveRowId(item, i)));
    onSelectionChange?.(Array.from(next), rows);
  };

  const toggleRow = (id: string) => {
    const next = new Set(selectedKeys);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  };

  const toggleAllOnPage = () => {
    const allOnPage = paged.every((item, i) => selectedKeys.has(resolveRowId(item, (currentPage - 1) * pageSize + i)));
    const next = new Set(selectedKeys);
    paged.forEach((item, i) => {
      const id = resolveRowId(item, (currentPage - 1) * pageSize + i);
      if (allOnPage) next.delete(id);
      else next.add(id);
    });
    setSelection(next);
  };

  const clearSelection = () => setSelection(new Set());

  const selectionState: 'none' | 'some' | 'all' = (() => {
    if (paged.length === 0) return 'none';
    const ids = paged.map((item, i) => resolveRowId(item, (currentPage - 1) * pageSize + i));
    const sel = ids.filter((id) => selectedKeys.has(id));
    if (sel.length === 0) return 'none';
    if (sel.length === ids.length) return 'all';
    return 'some';
  })();

  const selectedRows = useMemo(
    () =>
      data.filter((item, i) => selectedKeys.has(resolveRowId(item, i))),
    [data, selectedKeys, resolveRowId]
  );

  const visibleBulkActions = bulkActions.filter(
    (a) => !a.hidden || !a.hidden(selectedRows)
  );

  const runBulkAction = async (action: BulkAction<T>) => {
    await action.onClick(selectedRows, clearSelection);
  };

  const renderSortIcon = (col: Column<T>) => {
    if (col.sortable === false) return null;
    const active = sortState?.key === col.key;
    return (
      <span
        className="inline-flex flex-col leading-none shrink-0"
        aria-hidden="true"
      >
        <ChevronUp
          className={cn(
            'h-3 w-3 -mb-0.5',
            active && sortState?.dir === 'asc'
              ? 'text-blue-600 dark:text-brand-400'
              : 'text-gray-300 dark:text-gray-600'
          )}
        />
        <ChevronDown
          className={cn(
            'h-3 w-3',
            active && sortState?.dir === 'desc'
              ? 'text-blue-600 dark:text-brand-400'
              : 'text-gray-300 dark:text-gray-600'
          )}
        />
      </span>
    );
  };

  const showToolbar = searchable || showColumnToggle || toolbar || toolbarLeft;

  if (error) {
    return (
      <div className={cn('w-full', className)}>
        <ErrorState
          title={errorTitle}
          description={errorDescription}
          error={error}
          onRetry={onRetry}
          showErrorDetails
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cn('w-full', className)}>
        {showToolbar && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {searchable && (
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  disabled
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm bg-white dark:bg-surface-800 dark:border-surface-600 dark:text-gray-300 dark:placeholder-gray-500"
                  aria-label="Search table"
                />
              </div>
            )}
            {toolbar}
            {toolbarLeft}
          </div>
        )}
        <div
          className={cn(
            'overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-700',
            containerClassName
          )}
        >
          <table className="w-full" role="table" aria-busy="true" aria-label={ariaLabel}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="bg-gray-50 dark:bg-surface-800">
              <tr>
                {selectable && (
                  <th scope="col" className={cn(DENSITY[density].header, 'w-10')} />
                )}
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      DENSITY[density].header,
                      'text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400',
                      col.headerClassName
                    )}
                  >
                    <span className="inline-flex items-center gap-1">{col.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-surface-700 bg-white dark:bg-surface-900">
              {Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  {selectable && (
                    <td className={DENSITY[density].cell}>
                      <div className="h-4 w-4 rounded bg-gray-200 dark:bg-surface-700 animate-pulse" />
                    </td>
                  )}
                  {visibleColumns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(DENSITY[density].cell, col.className)}
                    >
                      <div
                        className="h-3 rounded bg-gray-200 dark:bg-surface-700 animate-pulse"
                        style={{ width: `${50 + ((i + col.key.length) % 4) * 10}%` }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sr-only" role="status">Loading data</p>
      </div>
    );
  }

  if (!loading && totalItems === 0) {
    return (
      <div className={cn('w-full', className)}>
        {showToolbar && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {searchable && (
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  role="searchbox"
                  aria-label="Search table"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:placeholder-gray-500"
                />
              </div>
            )}
            {toolbar}
            {toolbarLeft}
          </div>
        )}
        <div
          className={cn(
            'overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-700',
            containerClassName
          )}
        >
          <table className="w-full" role="table" aria-label={ariaLabel}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="bg-gray-50 dark:bg-surface-800">
              <tr>
                {selectable && <th scope="col" className={cn(DENSITY[density].header, 'w-10')} />}
                {visibleColumns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    className={cn(
                      DENSITY[density].header,
                      'text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400',
                      col.headerClassName
                    )}
                  >
                    <span className="inline-flex items-center gap-1">{col.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-surface-900" />
          </table>
        </div>
        <div className="mt-4 rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900">
          <EmptyState
            icon={emptyIcon ?? <Inbox className="h-8 w-8" />}
            title={emptyTitle ?? emptyMessage}
            description={emptyDescription}
            action={emptyAction}
          />
        </div>
      </div>
    );
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className={cn('w-full', className)}>
      {showToolbar && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {toolbarLeft}
          {searchable && (
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
              <input
                type="search"
                role="searchbox"
                aria-label="Search table"
                aria-controls={baseId}
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-9 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:placeholder-gray-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
          {toolbar}
          {showColumnToggle && (
            <div className="relative" ref={colMenuRef}>
              <button
                type="button"
                onClick={() => setShowColMenu((s) => !s)}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:hover:bg-surface-700"
                aria-haspopup="menu"
                aria-expanded={showColMenu}
                aria-label="Toggle column visibility"
              >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
                Columns
              </button>
              {showColMenu && (
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
                >
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-surface-700">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Visible columns
                    </span>
                    {hiddenCols.size > 0 && (
                      <button
                        type="button"
                        onClick={showAllCols}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 focus:outline-none focus-visible:underline dark:text-brand-400 dark:hover:text-brand-300"
                      >
                        Show all
                      </button>
                    )}
                  </div>
                  {columns.map((col) => {
                    if (col.hideable === false) return null;
                    const checked = !hiddenCols.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700 cursor-pointer select-none"
                        role="menuitemcheckbox"
                        aria-checked={checked}
                      >
                        <span
                          className={cn(
                            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                            checked
                              ? 'border-blue-600 bg-blue-600 dark:border-brand-500 dark:bg-brand-500'
                              : 'border-gray-300 bg-white dark:border-surface-600 dark:bg-surface-900'
                          )}
                        >
                          {checked && <Check className="h-3 w-3 text-white" aria-hidden="true" />}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCol(col.key)}
                          className="sr-only"
                          aria-label={`Toggle column ${col.label}`}
                        />
                        {col.label}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectable && selectedKeys.size > 0 && (
        <div
          className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-brand-500/30 dark:bg-brand-500/10"
          role="region"
          aria-label="Bulk actions"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-semibold text-white dark:bg-brand-500">
              {selectedKeys.size}
            </span>
            <span className="text-sm font-medium text-blue-900 dark:text-brand-200">
              {bulkActionsLabel}
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-blue-700 hover:text-blue-900 focus:outline-none focus-visible:underline dark:text-brand-300 dark:hover:text-brand-100"
            >
              Clear
            </button>
          </div>
          {visibleBulkActions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {visibleBulkActions.map((action) => {
                const variant = action.variant ?? 'secondary';
                const variantClass: Record<string, string> = {
                  primary:
                    'bg-blue-600 text-white hover:bg-blue-700 dark:bg-brand-500 dark:hover:bg-brand-400',
                  secondary:
                    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-surface-800 dark:text-gray-200 dark:border-surface-600 dark:hover:bg-surface-700',
                  danger:
                    'bg-red-600 text-white hover:bg-red-700 dark:bg-danger-500 dark:hover:bg-danger-600',
                  outline:
                    'border border-blue-600 text-blue-600 hover:bg-blue-50 dark:border-brand-400 dark:text-brand-400 dark:hover:bg-brand-500/10',
                  ghost:
                    'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-surface-700',
                };
                const isDisabled = action.disabled?.(selectedRows) || action.loading;
                return (
                  <button
                    key={action.key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => runBulkAction(action)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-brand-400 dark:focus-visible:ring-offset-surface-900',
                      'disabled:opacity-50 disabled:pointer-events-none',
                      variantClass[variant]
                    )}
                  >
                    {action.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      action.icon && <span className="inline-flex shrink-0">{action.icon}</span>
                    )}
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          'overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-700',
          containerClassName
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table
          id={baseId}
          aria-labelledby={labelId}
          aria-describedby={totalId}
          aria-rowcount={totalItems}
          className={cn('w-full caption-bottom text-sm', tableClassName)}
        >
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead
            className={cn(
              'bg-gray-50 dark:bg-surface-800',
              stickyHeader && 'sticky top-0 z-10 shadow-sm dark:shadow-none'
            )}
          >
            <tr>
              {selectable && (
                <th
                  scope="col"
                  className={cn(DENSITY[density].header, 'w-10')}
                  aria-label="Select"
                >
                  <SelectionCheckbox
                    state={selectionState}
                    onToggle={toggleAllOnPage}
                    ariaLabel={
                      selectionState === 'all'
                        ? 'Deselect all rows on this page'
                        : 'Select all rows on this page'
                    }
                  />
                </th>
              )}
              {visibleColumns.map((col) => {
                const canSort = col.sortable !== false;
                const align =
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';
                const active = sortState?.key === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      active
                        ? sortState?.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : canSort
                          ? 'none'
                          : undefined
                    }
                    onClick={canSort ? () => handleSort(col.key) : undefined}
                    onKeyDown={
                      canSort
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSort(col.key);
                            }
                          }
                        : undefined
                    }
                    tabIndex={canSort ? 0 : undefined}
                    style={{
                      width: col.width,
                      minWidth: col.minWidth,
                    }}
                    className={cn(
                      DENSITY[density].header,
                      'text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400',
                      align,
                      canSort &&
                        'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-surface-700 focus:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-surface-700',
                      col.headerClassName
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-1',
                        col.align === 'right' && 'flex-row-reverse'
                      )}
                    >
                      {col.label}
                      {renderSortIcon(col)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-surface-700 bg-white dark:bg-surface-900">
            {paged.map((item, i) => {
              const id = resolveRowId(item, (currentPage - 1) * pageSize + i);
              const isSelected = selectedKeys.has(id);
              return (
                <tr
                  key={id}
                  data-row-id={id}
                  aria-selected={selectable ? isSelected : undefined}
                  onClick={() => onRowClick?.(item)}
                  onKeyDown={(e) => {
                    if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onRowClick(item);
                    }
                  }}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'transition-colors focus:outline-none',
                    onRowClick && 'cursor-pointer',
                    isSelected
                      ? 'bg-blue-50/60 dark:bg-brand-500/10'
                      : 'hover:bg-gray-50 dark:hover:bg-surface-800',
                    onRowClick && 'focus-visible:bg-blue-50 dark:focus-visible:bg-brand-500/10'
                  )}
                >
                  {selectable && (
                    <td
                      className={cn(
                        DENSITY[density].cell,
                        'w-10'
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectionCheckbox
                        state={isSelected ? 'all' : 'none'}
                        onToggle={() => toggleRow(id)}
                        ariaLabel={`Select row ${(item as any).label ?? id}`}
                      />
                    </td>
                  )}
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
                          DENSITY[density].cell,
                          'whitespace-nowrap text-gray-700 dark:text-gray-200',
                          align,
                          col.className
                        )}
                      >
                        {col.render
                          ? col.render(item, { index: i, selected: isSelected, selectable, row: item })
                          : ((getCellValue(item, col) as React.ReactNode) ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalItems > 0 && (
        <div
          id={totalId}
          className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
          aria-live="polite"
        >
          <p className="text-gray-600 dark:text-gray-400">
            Showing{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{start}</span>–
            <span className="font-medium text-gray-900 dark:text-gray-100">{end}</span> of{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">{totalItems}</span>
            {selectedKeys.size > 0 && (
              <span className="ml-2 text-blue-700 dark:text-brand-300">
                · {selectedKeys.size} selected
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {showPageSize && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                <label htmlFor={`${baseId}-size`} className="whitespace-nowrap">
                  Per page
                </label>
                <select
                  id={`${baseId}-size`}
                  value={pageSize}
                  onChange={(e) => handlePageSize(Number(e.target.value))}
                  aria-label="Items per page"
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200"
                >
                  {pageSizeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPageAndNotify(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                aria-label="Previous page"
              >
                Previous
              </button>
              <span
                className="px-2 text-sm text-gray-700 dark:text-gray-300"
                aria-current="page"
              >
                Page <strong>{currentPage}</strong> of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPageAndNotify(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-md border border-gray-300 px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectionCheckbox({
  state,
  onToggle,
  ariaLabel,
}: {
  state: 'none' | 'some' | 'all';
  onToggle: () => void;
  ariaLabel: string;
}) {
  const checked = state === 'all';
  const indeterminate = state === 'some';
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="inline-flex items-center justify-center"
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-surface-500 dark:bg-surface-700 dark:focus:ring-brand-400"
      />
    </span>
  );
}
