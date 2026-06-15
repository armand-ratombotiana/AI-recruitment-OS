'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

export interface DataTableColumnConfig {
  key: string;
  width: number;
  visible: boolean;
  pinned: 'left' | 'right' | false;
  order: number;
}

export interface DataTableFilter {
  columnKey: string;
  value: string;
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte';
}

export interface DataTableSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface DataTableView {
  id: string;
  name: string;
  columns: DataTableColumnConfig[];
  filters: DataTableFilter[];
  sort: DataTableSort | null;
  expandedRows: string[];
  createdAt: number;
}

export interface DataTableEditingCell {
  rowIndex: number;
  columnKey: string;
}

export interface UseDataTableOptions<T> {
  storageKey: string;
  data: T[];
  rowKey: (item: T) => string;
  defaultColumnWidth?: number;
  defaultMinColumnWidth?: number;
  defaultMaxColumnWidth?: number;
}

export interface UseDataTableReturn<T> {
  columnConfigs: DataTableColumnConfig[];
  setColumnWidth: (key: string, width: number) => void;
  reorderColumns: (fromIndex: number, toIndex: number) => void;
  pinColumn: (key: string, pin: 'left' | 'right' | false) => void;
  toggleColumnVisibility: (key: string) => void;
  resetColumns: () => void;

  filters: DataTableFilter[];
  setFilter: (columnKey: string, value: string, operator?: DataTableFilter['operator']) => void;
  clearFilter: (columnKey: string) => void;
  clearAllFilters: () => void;

  sort: DataTableSort | null;
  setSort: (key: string) => void;

  expandedRows: Set<string>;
  toggleExpanded: (rowKey: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  editingCell: DataTableEditingCell | null;
  startEditing: (rowIndex: number, columnKey: string) => void;
  stopEditing: () => void;
  commitEdit: (value: string) => void;

  focusCell: { row: number; col: number } | null;
  setFocusCell: (cell: { row: number; col: number } | null) => void;

  views: DataTableView[];
  saveView: (name: string) => void;
  loadView: (id: string) => void;
  deleteView: (id: string) => void;

  filteredData: T[];
  sortedData: T[];

  clipboard: string;
  copySelection: (rows: T[], columnKeys: string[]) => void;
  pasteData: string;
  setPasteData: (data: string) => void;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveToStorage(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useDataTable<T extends Record<string, any>>(
  options: UseDataTableOptions<T>
): UseDataTableReturn<T> {
  const {
    storageKey,
    data,
    rowKey,
    defaultColumnWidth = 150,
    defaultMinColumnWidth = 60,
    defaultMaxColumnWidth = 600,
  } = options;

  const [columnConfigs, setColumnConfigs] = useState<DataTableColumnConfig[]>(() =>
    loadFromStorage(`${storageKey}:columns`, [])
  );
  const [filters, setFilters] = useState<DataTableFilter[]>(() =>
    loadFromStorage(`${storageKey}:filters`, [])
  );
  const [sort, setSortState] = useState<DataTableSort | null>(() =>
    loadFromStorage(`${storageKey}:sort`, null)
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => {
    const stored = loadFromStorage<string[]>(`${storageKey}:expanded`, []);
    return new Set(stored);
  });
  const [editingCell, setEditingCell] = useState<DataTableEditingCell | null>(null);
  const [focusCell, setFocusCell] = useState<{ row: number; col: number } | null>(null);
  const [views, setViews] = useState<DataTableView[]>(() =>
    loadFromStorage(`${storageKey}:views`, [])
  );
  const [pasteData, setPasteData] = useState('');

  useEffect(() => {
    saveToStorage(`${storageKey}:columns`, columnConfigs);
  }, [columnConfigs, storageKey]);

  useEffect(() => {
    saveToStorage(`${storageKey}:filters`, filters);
  }, [filters, storageKey]);

  useEffect(() => {
    saveToStorage(`${storageKey}:sort`, sort);
  }, [sort, storageKey]);

  useEffect(() => {
    saveToStorage(`${storageKey}:expanded`, Array.from(expandedRows));
  }, [expandedRows, storageKey]);

  useEffect(() => {
    saveToStorage(`${storageKey}:views`, views);
  }, [views, storageKey]);

  const setColumnWidth = useCallback((key: string, width: number) => {
    setColumnConfigs((prev) =>
      prev.map((c) =>
        c.key === key
          ? { ...c, width: Math.max(defaultMinColumnWidth, Math.min(defaultMaxColumnWidth, width)) }
          : c
      )
    );
  }, [defaultMinColumnWidth, defaultMaxColumnWidth]);

  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    setColumnConfigs((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((c, i) => ({ ...c, order: i }));
    });
  }, []);

  const pinColumn = useCallback((key: string, pin: 'left' | 'right' | false) => {
    setColumnConfigs((prev) =>
      prev.map((c) => (c.key === key ? { ...c, pinned: pin } : c))
    );
  }, []);

  const toggleColumnVisibility = useCallback((key: string) => {
    setColumnConfigs((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  }, []);

  const resetColumns = useCallback(() => {
    setColumnConfigs([]);
  }, []);

  const setFilter = useCallback(
    (columnKey: string, value: string, operator: DataTableFilter['operator'] = 'contains') => {
      setFilters((prev) => {
        const existing = prev.findIndex((f) => f.columnKey === columnKey);
        if (!value.trim()) {
          return existing >= 0 ? prev.filter((_, i) => i !== existing) : prev;
        }
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = { columnKey, value, operator };
          return next;
        }
        return [...prev, { columnKey, value, operator }];
      });
    },
    []
  );

  const clearFilter = useCallback((columnKey: string) => {
    setFilters((prev) => prev.filter((f) => f.columnKey !== columnKey));
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters([]);
  }, []);

  const setSort = useCallback((key: string) => {
    setSortState((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedRows(new Set(data.map((item) => rowKey(item))));
  }, [data, rowKey]);

  const collapseAll = useCallback(() => {
    setExpandedRows(new Set());
  }, []);

  const startEditing = useCallback((rowIndex: number, columnKey: string) => {
    setEditingCell({ rowIndex, columnKey });
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const commitEdit = useCallback(
    (_value: string) => {
      setEditingCell(null);
    },
    []
  );

  const matchesFilter = useCallback(
    (item: T, filter: DataTableFilter): boolean => {
      const raw = item[filter.columnKey];
      const cellValue = raw != null ? String(raw) : '';
      const filterValue = filter.value.toLowerCase();
      const cellLower = cellValue.toLowerCase();

      switch (filter.operator) {
        case 'equals':
          return cellLower === filterValue;
        case 'startsWith':
          return cellLower.startsWith(filterValue);
        case 'endsWith':
          return cellLower.endsWith(filterValue);
        case 'gt':
          return Number(cellValue) > Number(filter.value);
        case 'lt':
          return Number(cellValue) < Number(filter.value);
        case 'gte':
          return Number(cellValue) >= Number(filter.value);
        case 'lte':
          return Number(cellValue) <= Number(filter.value);
        case 'contains':
        default:
          return cellLower.includes(filterValue);
      }
    },
    []
  );

  const filteredData = useMemo(() => {
    if (filters.length === 0) return data;
    return data.filter((item) => filters.every((f) => matchesFilter(item, f)));
  }, [data, filters, matchesFilter]);

  const sortedData = useMemo(() => {
    if (!sort) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sort.key];
      const bVal = b[sort.key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sort.dir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sort]);

  const saveView = useCallback(
    (name: string) => {
      const view: DataTableView = {
        id: `view_${Date.now()}`,
        name,
        columns: columnConfigs.map((c) => ({ ...c })),
        filters: filters.map((f) => ({ ...f })),
        sort: sort ? { ...sort } : null,
        expandedRows: Array.from(expandedRows),
        createdAt: Date.now(),
      };
      setViews((prev) => [...prev, view]);
    },
    [columnConfigs, filters, sort, expandedRows]
  );

  const loadView = useCallback((id: string) => {
    const view = views.find((v) => v.id === id);
    if (!view) return;
    setColumnConfigs(view.columns.map((c) => ({ ...c })));
    setFilters(view.filters.map((f) => ({ ...f })));
    setSortState(view.sort ? { ...view.sort } : null);
    setExpandedRows(new Set(view.expandedRows));
  }, [views]);

  const deleteView = useCallback((id: string) => {
    setViews((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const copySelection = useCallback((rows: T[], columnKeys: string[]) => {
    const lines = rows.map((row) =>
      columnKeys.map((key) => {
        const val = row[key];
        return val != null ? String(val) : '';
      }).join('\t')
    );
    const text = lines.join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }, []);

  return {
    columnConfigs,
    setColumnWidth,
    reorderColumns,
    pinColumn,
    toggleColumnVisibility,
    resetColumns,

    filters,
    setFilter,
    clearFilter,
    clearAllFilters,

    sort,
    setSort,

    expandedRows,
    toggleExpanded,
    expandAll,
    collapseAll,

    editingCell,
    startEditing,
    stopEditing,
    commitEdit,

    focusCell,
    setFocusCell,

    views,
    saveView,
    loadView,
    deleteView,

    filteredData: sortedData,
    sortedData,

    clipboard: '',
    copySelection,
    pasteData,
    setPasteData,
  };
}
