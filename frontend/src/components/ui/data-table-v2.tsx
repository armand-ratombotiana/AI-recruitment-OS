'use client';

import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useId,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { FixedSizeList as VirtualList, type ListChildComponentProps } from 'react-window';
import { cn } from '@/lib/utils';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  X,
  GripVertical,
  Pin,
  PinOff,
  PinLeft,
  PinRight,
  ChevronsDownUp,
  ChevronsUpDownIcon,
  Eye,
  EyeOff,
  Download,
  FileSpreadsheet,
  FileText,
  Save,
  FolderOpen,
  Trash2,
  Filter,
  FilterX,
  Copy,
  Clipboard,
  Settings2,
  Check,
  ChevronRight,
  Loader2,
  Inbox,
} from 'lucide-react';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import {
  useDataTable,
  type DataTableColumnConfig,
  type DataTableFilter,
  type DataTableSort,
  type DataTableView,
  type DataTableEditingCell,
} from '@/hooks/use-data-table';

export type { DataTableColumnConfig, DataTableFilter, DataTableSort, DataTableView };

export interface ColumnV2<T> {
  key: string;
  label: string;
  render?: (item: T, ctx: { index: number; selected: boolean; expanded: boolean }) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  editable?: boolean;
  hideable?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
  accessor?: (item: T) => unknown;
  className?: string;
  headerClassName?: string;
  pinned?: 'left' | 'right' | false;
  expandRender?: (item: T) => ReactNode;
}

export interface DataTableV2Props<T> {
  columns: ColumnV2<T>[];
  data: T[];
  rowKey: (item: T) => string;
  storageKey: string;

  onRowClick?: (item: T) => void;
  selectable?: boolean;
  selectedRowKeys?: string[];
  onSelectionChange?: (keys: string[], rows: T[]) => void;

  loading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;

  searchable?: boolean;
  searchPlaceholder?: string;
  density?: 'compact' | 'normal' | 'comfortable';

  virtualizeThreshold?: number;
  rowHeight?: number;
  maxHeight?: string;

  enableColumnResize?: boolean;
  enableColumnReorder?: boolean;
  enablePinning?: boolean;
  enableExpansion?: boolean;
  enableInlineEdit?: boolean;
  enableCopyPaste?: boolean;
  enableExport?: boolean;
  enableFilters?: boolean;
  enableSavedViews?: boolean;
  enableKeyboardNav?: boolean;

  onCellEdit?: (rowKey: string, columnKey: string, value: string) => void;

  toolbar?: ReactNode;
  toolbarLeft?: ReactNode;
  caption?: string;
  ariaLabel?: string;
  className?: string;
  containerClassName?: string;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
}

const DENSITY_MAP: Record<string, { cell: string; header: string; row: number }> = {
  compact: { cell: 'px-3 py-1.5 text-xs', header: 'px-3 py-1.5', row: 36 },
  normal: { cell: 'px-4 py-2.5 text-sm', header: 'px-4 py-2.5', row: 44 },
  comfortable: { cell: 'px-5 py-3.5 text-sm', header: 'px-5 py-3.5', row: 56 },
};

export function DataTableV2<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  storageKey,
  onRowClick,
  selectable = false,
  selectedRowKeys: selectedRowKeysProp,
  onSelectionChange,
  loading = false,
  error = null,
  onRetry,
  searchable = true,
  searchPlaceholder = 'Search...',
  density = 'normal',
  virtualizeThreshold = 100,
  rowHeight: rowHeightProp,
  maxHeight = '600px',
  enableColumnResize = true,
  enableColumnReorder = true,
  enablePinning = true,
  enableExpansion = true,
  enableInlineEdit = true,
  enableCopyPaste = true,
  enableExport = true,
  enableFilters = true,
  enableSavedViews = true,
  enableKeyboardNav = true,
  onCellEdit,
  toolbar,
  toolbarLeft,
  caption,
  ariaLabel = 'Data table',
  className,
  containerClassName,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  emptyAction,
}: DataTableV2Props<T>) {
  const baseId = useId();
  const densityConfig = DENSITY_MAP[density];
  const computedRowHeight = rowHeightProp ?? densityConfig.row;

  const dt = useDataTable<T>({
    storageKey,
    data,
    rowKey,
    defaultColumnWidth: 150,
  });

  const [search, setSearch] = useState('');
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [showColMenu, setShowColMenu] = useState(false);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showSaveViewDialog, setShowSaveViewDialog] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFilterRow, setShowFilterRow] = useState(enableFilters);
  const [editingValue, setEditingValue] = useState('');
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [resizingCol, setResizingCol] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const isControlledSelection = selectedRowKeysProp !== undefined;
  const selectedKeys = isControlledSelection
    ? new Set(selectedRowKeysProp ?? [])
    : internalSelected;

  const colConfigs = useMemo(() => {
    if (dt.columnConfigs.length === 0) {
      return columns.map((col, i) => ({
        key: col.key,
        width: col.width ?? 150,
        visible: true,
        pinned: col.pinned ?? false,
        order: i,
      }));
    }
    return dt.columnConfigs;
  }, [dt.columnConfigs, columns]);

  const orderedColumns = useMemo(() => {
    const configMap = new Map(colConfigs.map((c) => [c.key, c]));
    return [...columns]
      .sort((a, b) => {
        const ca = configMap.get(a.key);
        const cb = configMap.get(b.key);
        return (ca?.order ?? 0) - (cb?.order ?? 0);
      })
      .filter((col) => {
        const cfg = configMap.get(col.key);
        return cfg ? cfg.visible : true;
      });
  }, [columns, colConfigs]);

  const pinnedLeftColumns = useMemo(
    () => orderedColumns.filter((c) => {
      const cfg = colConfigs.find((cc) => cc.key === c.key);
      return cfg?.pinned === 'left';
    }),
    [orderedColumns, colConfigs]
  );

  const pinnedRightColumns = useMemo(
    () => orderedColumns.filter((c) => {
      const cfg = colConfigs.find((cc) => cc.key === c.key);
      return cfg?.pinned === 'right';
    }),
    [orderedColumns, colConfigs]
  );

  const unpinnedColumns = useMemo(
    () => orderedColumns.filter((c) => {
      const cfg = colConfigs.find((cc) => cc.key === c.key);
      return !cfg?.pinned;
    }),
    [orderedColumns, colConfigs]
  );

  const allVisibleColumns = useMemo(
    () => [...pinnedLeftColumns, ...unpinnedColumns, ...pinnedRightColumns],
    [pinnedLeftColumns, unpinnedColumns, pinnedRightColumns]
  );

  const searchedData = useMemo(() => {
    if (!search.trim()) return dt.filteredData;
    const q = search.toLowerCase();
    return dt.filteredData.filter((item) => {
      return allVisibleColumns.some((col) => {
        const val = col.accessor ? col.accessor(item) : item[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      });
    });
  }, [dt.filteredData, search, allVisibleColumns]);

  const totalWidth = useMemo(() => {
    let w = 0;
    if (selectable) w += 40;
    if (enableExpansion) w += 40;
    allVisibleColumns.forEach((col) => {
      const cfg = colConfigs.find((cc) => cc.key === col.key);
      w += cfg?.width ?? col.width ?? 150;
    });
    return w;
  }, [allVisibleColumns, colConfigs, selectable, enableExpansion]);

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

  useEffect(() => {
    if (!showViewMenu) return;
    const handler = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setShowViewMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showViewMenu]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  useEffect(() => {
    if (dt.editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [dt.editingCell]);

  useEffect(() => {
    if (!resizingCol) return;
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - resizeStartX.current;
      const cfg = colConfigs.find((c) => c.key === resizingCol);
      const col = columns.find((c) => c.key === resizingCol);
      const minW = col?.minWidth ?? 60;
      const maxW = col?.maxWidth ?? 600;
      const newWidth = Math.max(minW, Math.min(maxW, resizeStartWidth.current + diff));
      dt.setColumnWidth(resizingCol, newWidth);
    };
    const handleMouseUp = () => {
      setResizingCol(null);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, colConfigs, columns, dt]);

  const handleResizeStart = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const cfg = colConfigs.find((c) => c.key === key);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = cfg?.width ?? 150;
      setResizingCol(key);
    },
    [colConfigs]
  );

  const handleDragStart = useCallback((key: string) => {
    setDragCol(key);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, key: string) => {
      e.preventDefault();
      setDragOverCol(key);
    },
    []
  );

  const handleDrop = useCallback(
    (targetKey: string) => {
      if (!dragCol || dragCol === targetKey) {
        setDragCol(null);
        setDragOverCol(null);
        return;
      }
      const fromIdx = allVisibleColumns.findIndex((c) => c.key === dragCol);
      const toIdx = allVisibleColumns.findIndex((c) => c.key === targetKey);
      if (fromIdx >= 0 && toIdx >= 0) {
        const allKeys = allVisibleColumns.map((c) => c.key);
        const [moved] = allKeys.splice(fromIdx, 1);
        allKeys.splice(toIdx, 0, moved);
        const currentConfigs = colConfigs.length > 0 ? colConfigs : columns.map((c, i) => ({
          key: c.key, width: c.width ?? 150, visible: true, pinned: c.pinned ?? false, order: i,
        }));
        const reordered = allKeys.map((k, i) => {
          const existing = currentConfigs.find((cc) => cc.key === k);
          return existing ? { ...existing, order: i } : { key: k, width: 150, visible: true, pinned: false as const, order: i };
        });
        dt.reorderColumns(fromIdx, toIdx);
      }
      setDragCol(null);
      setDragOverCol(null);
    },
    [dragCol, allVisibleColumns, colConfigs, columns, dt]
  );

  const resolveRowId = useCallback(
    (item: T): string => rowKey(item),
    [rowKey]
  );

  const getCellValue = useCallback((item: T, col: ColumnV2<T>): unknown => {
    if (col.accessor) return col.accessor(item);
    return item[col.key];
  }, []);

  const setSelection = useCallback(
    (next: Set<string>) => {
      if (!isControlledSelection) setInternalSelected(next);
      const rows = data.filter((item) => next.has(resolveRowId(item)));
      onSelectionChange?.(Array.from(next), rows);
    },
    [isControlledSelection, data, resolveRowId, onSelectionChange]
  );

  const toggleRow = useCallback(
    (id: string) => {
      const next = new Set(selectedKeys);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection(next);
    },
    [selectedKeys, setSelection]
  );

  const toggleAll = useCallback(() => {
    const allIds = searchedData.map((item) => resolveRowId(item));
    const allSelected = allIds.every((id) => selectedKeys.has(id));
    if (allSelected) {
      setSelection(new Set());
    } else {
      setSelection(new Set(allIds));
    }
  }, [searchedData, resolveRowId, selectedKeys, setSelection]);

  const handleCellDoubleClick = useCallback(
    (item: T, col: ColumnV2<T>, rowIndex: number) => {
      if (!enableInlineEdit || !col.editable) return;
      const val = getCellValue(item, col);
      setEditingValue(val != null ? String(val) : '');
      dt.startEditing(rowIndex, col.key);
    },
    [enableInlineEdit, getCellValue, dt]
  );

  const handleEditCommit = useCallback(() => {
    if (!dt.editingCell) return;
    const item = searchedData[dt.editingCell.rowIndex];
    if (item && onCellEdit) {
      onCellEdit(resolveRowId(item), dt.editingCell.columnKey, editingValue);
    }
    dt.commitEdit(editingValue);
    setEditingValue('');
  }, [dt, searchedData, editingValue, resolveRowId, onCellEdit]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!enableKeyboardNav) return;

      if (e.key === 'Escape') {
        if (dt.editingCell) {
          dt.stopEditing();
          setEditingValue('');
        }
        return;
      }

      if (e.key === 'Enter' && dt.editingCell) {
        handleEditCommit();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && enableCopyPaste) {
        const ids = Array.from(selectedKeys);
        if (ids.length > 0) {
          const rows = searchedData.filter((item) => ids.includes(resolveRowId(item)));
          const keys = allVisibleColumns.map((c) => c.key);
          dt.copySelection(rows, keys);
        }
        return;
      }

      if (!dt.focusCell) return;
      const { row, col } = dt.focusCell;
      const maxRow = searchedData.length - 1;
      const maxCol = allVisibleColumns.length - 1;

      let nextRow = row;
      let nextCol = col;

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          nextRow = Math.max(0, row - 1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          nextRow = Math.min(maxRow, row + 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nextCol = Math.max(0, col - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextCol = Math.min(maxCol, col + 1);
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            nextCol = Math.max(0, col - 1);
            if (nextCol === col) nextRow = Math.max(0, row - 1);
          } else {
            nextCol = Math.min(maxCol, col + 1);
            if (nextCol === col) nextRow = Math.min(maxRow, row + 1);
          }
          break;
        default:
          return;
      }

      dt.setFocusCell({ row: nextRow, col: nextCol });
    },
    [
      enableKeyboardNav, dt, handleEditCommit, enableCopyPaste, selectedKeys,
      searchedData, allVisibleColumns, resolveRowId,
    ]
  );

  const exportCSV = useCallback(() => {
    const headers = allVisibleColumns.map((c) => c.label);
    const rows = searchedData.map((item) =>
      allVisibleColumns.map((col) => {
        const val = getCellValue(item, col);
        const str = val != null ? String(val) : '';
        return `"${str.replace(/"/g, '""')}"`;
      })
    );
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allVisibleColumns, searchedData, getCellValue]);

  const exportJSON = useCallback(() => {
    const json = JSON.stringify(searchedData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [searchedData]);

  const handleSaveView = useCallback(() => {
    if (!newViewName.trim()) return;
    dt.saveView(newViewName.trim());
    setNewViewName('');
    setShowSaveViewDialog(false);
  }, [newViewName, dt]);

  const renderSortIcon = (col: ColumnV2<T>) => {
    if (col.sortable === false) return null;
    const active = dt.sort?.key === col.key;
    return (
      <span className="inline-flex flex-col leading-none shrink-0" aria-hidden="true">
        <ChevronUp
          className={cn(
            'h-3 w-3 -mb-0.5',
            active && dt.sort?.dir === 'asc'
              ? 'text-blue-600 dark:text-brand-400'
              : 'text-gray-300 dark:text-gray-600'
          )}
        />
        <ChevronDown
          className={cn(
            'h-3 w-3',
            active && dt.sort?.dir === 'desc'
              ? 'text-blue-600 dark:text-brand-400'
              : 'text-gray-300 dark:text-gray-600'
          )}
        />
      </span>
    );
  };

  const getColumnWidth = (key: string): number => {
    const cfg = colConfigs.find((c) => c.key === key);
    return cfg?.width ?? 150;
  };

  const useVirtualization = searchedData.length >= virtualizeThreshold;

  const renderRow = (item: T, index: number, style?: React.CSSProperties) => {
    const id = resolveRowId(item);
    const isSelected = selectedKeys.has(id);
    const isExpanded = dt.expandedRows.has(id);
    const col = columns.find((c) => c.key === (enableExpansion ? c.key : ''));
    const hasExpand = enableExpansion && allVisibleColumns.some((c) => c.expandRender);

    return (
      <div key={id} style={style}>
        <tr
          data-row-id={id}
          aria-selected={selectable ? isSelected : undefined}
          aria-expanded={hasExpand ? isExpanded : undefined}
          onClick={() => onRowClick?.(item)}
          tabIndex={onRowClick || enableKeyboardNav ? 0 : undefined}
          className={cn(
            'transition-colors focus:outline-none border-b border-gray-100 dark:border-surface-700',
            onRowClick && 'cursor-pointer',
            isSelected
              ? 'bg-blue-50/60 dark:bg-brand-500/10'
              : 'hover:bg-gray-50 dark:hover:bg-surface-800',
            onRowClick && 'focus-visible:bg-blue-50 dark:focus-visible:bg-brand-500/10'
          )}
        >
          {selectable && (
            <td className={cn(densityConfig.cell, 'w-10 sticky left-0 bg-inherit z-[1]')} onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleRow(id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select row ${id}`}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-surface-500 dark:bg-surface-700"
              />
            </td>
          )}
          {hasExpand && (
            <td className={cn(densityConfig.cell, 'w-10')} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => dt.toggleExpanded(id)}
                aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                aria-expanded={isExpanded}
                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-surface-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-gray-400 transition-transform',
                    isExpanded && 'rotate-90'
                  )}
                />
              </button>
            </td>
          )}
          {allVisibleColumns.map((colDef, colIdx) => {
            const cfg = colConfigs.find((cc) => cc.key === colDef.key);
            const isPinned = cfg?.pinned;
            const pinClass = isPinned
              ? isPinned === 'left'
                ? 'sticky z-[1]'
                : 'sticky z-[1]'
              : '';
            const pinLeft = isPinned === 'left'
              ? `${(selectable ? 40 : 0) + (hasExpand ? 40 : 0) + allVisibleColumns.slice(0, colIdx).reduce((sum, c) => sum + getColumnWidth(c.key), 0)}px`
              : undefined;
            const align = colDef.align === 'right' ? 'text-right' : colDef.align === 'center' ? 'text-center' : 'text-left';
            const isFocused = dt.focusCell?.row === index && dt.focusCell?.col === colIdx;
            const isEditing = dt.editingCell?.rowIndex === index && dt.editingCell?.columnKey === colDef.key;

            return (
              <td
                key={colDef.key}
                style={{
                  width: getColumnWidth(colDef.key),
                  minWidth: getColumnWidth(colDef.key),
                  ...(isPinned === 'left' ? { left: pinLeft } : {}),
                  ...(isPinned === 'right' ? { right: '0px' } : {}),
                }}
                className={cn(
                  densityConfig.cell,
                  'whitespace-nowrap text-gray-700 dark:text-gray-200',
                  align,
                  pinClass,
                  colDef.className,
                  isPinned && 'bg-inherit',
                  isFocused && 'ring-2 ring-inset ring-blue-500'
                )}
                onDoubleClick={() => handleCellDoubleClick(item, colDef, index)}
                tabIndex={enableKeyboardNav ? 0 : undefined}
                role="gridcell"
                aria-colindex={colIdx + 1}
              >
                {isEditing ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={handleEditCommit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleEditCommit();
                      if (e.key === 'Escape') {
                        dt.stopEditing();
                        setEditingValue('');
                      }
                    }}
                    className="w-full px-1 py-0.5 text-sm border border-blue-500 rounded bg-white dark:bg-surface-800 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label={`Edit ${colDef.label}`}
                  />
                ) : colDef.render ? (
                  colDef.render(item, { index, selected: isSelected, expanded: isExpanded })
                ) : (
                  ((getCellValue(item, colDef) as ReactNode) ?? '—')
                )}
              </td>
            );
          })}
        </tr>
        {hasExpand && isExpanded && (
          <tr className="bg-gray-50 dark:bg-surface-800">
            <td
              colSpan={allVisibleColumns.length + (selectable ? 1 : 0) + 1}
              className="px-4 py-3"
            >
              {allVisibleColumns
                .filter((c) => c.expandRender)
                .map((c) => (
                  <div key={c.key}>{c.expandRender!(item)}</div>
                ))}
            </td>
          </tr>
        )}
      </div>
    );
  };

  const VirtualRow = useCallback(
    ({ index, style }: ListChildComponentProps) => {
      const item = searchedData[index];
      if (!item) return null;
      return renderRow(item, index, style);
    },
    [searchedData, allVisibleColumns, colConfigs, selectedKeys, dt.editingCell, dt.focusCell, dt.expandedRows, editingValue]
  );

  if (error) {
    return (
      <div className={cn('w-full', className)}>
        <ErrorState title="Error" error={error} onRetry={onRetry} showErrorDetails />
      </div>
    );
  }

  const showToolbar = searchable || enableExport || enableSavedViews || enableFilters || toolbar || toolbarLeft;
  const hasExpand = enableExpansion && allVisibleColumns.some((c) => c.expandRender);
  const selectionState: 'none' | 'some' | 'all' = (() => {
    if (searchedData.length === 0) return 'none';
    const ids = searchedData.map((item) => resolveRowId(item));
    const sel = ids.filter((id) => selectedKeys.has(id));
    if (sel.length === 0) return 'none';
    if (sel.length === ids.length) return 'all';
    return 'some';
  })();

  return (
    <div className={cn('w-full', className)} onKeyDown={handleKeyDown}>
      {showToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
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
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 pl-9 pr-9 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:placeholder-gray-500"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          {toolbar}
          {enableFilters && (
            <button
              type="button"
              onClick={() => setShowFilterRow((p) => !p)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                showFilterRow
                  ? 'border-blue-500 text-blue-700 bg-blue-50 dark:border-brand-400 dark:text-brand-300 dark:bg-brand-500/10'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:hover:bg-surface-700'
              )}
              aria-label="Toggle filter row"
              aria-pressed={showFilterRow}
            >
              <Filter className="h-4 w-4" />
              {dt.filters.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white dark:bg-brand-500">
                  {dt.filters.length}
                </span>
              )}
            </button>
          )}
          {enableExport && (
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:hover:bg-surface-700"
                aria-haspopup="menu"
                aria-expanded={showExportMenu}
              >
                <Download className="h-4 w-4" />
              </button>
              {showExportMenu && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
                >
                  <button
                    role="menuitem"
                    onClick={() => { exportCSV(); setShowExportMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700"
                  >
                    <FileText className="h-4 w-4" /> Export CSV
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { exportJSON(); setShowExportMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700"
                  >
                    <FileSpreadsheet className="h-4 w-4" /> Export JSON
                  </button>
                </div>
              )}
            </div>
          )}
          {enableSavedViews && (
            <div className="relative" ref={viewMenuRef}>
              <button
                type="button"
                onClick={() => setShowViewMenu((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:hover:bg-surface-700"
                aria-haspopup="menu"
                aria-expanded={showViewMenu}
              >
                <FolderOpen className="h-4 w-4" />
                Views
              </button>
              {showViewMenu && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
                >
                  <button
                    role="menuitem"
                    onClick={() => { setShowSaveViewDialog(true); setShowViewMenu(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700"
                  >
                    <Save className="h-4 w-4" /> Save current view
                  </button>
                  {dt.views.length > 0 && <div className="border-t border-gray-100 dark:border-surface-700 my-1" />}
                  {dt.views.map((v) => (
                    <div key={v.id} className="flex items-center">
                      <button
                        role="menuitem"
                        onClick={() => { dt.loadView(v.id); setShowViewMenu(false); }}
                        className="flex-1 flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700"
                      >
                        {v.name}
                      </button>
                      <button
                        onClick={() => dt.deleteView(v.id)}
                        className="px-2 py-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                        aria-label={`Delete view ${v.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="relative" ref={colMenuRef}>
            <button
              type="button"
              onClick={() => setShowColMenu((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 dark:hover:bg-surface-700"
              aria-haspopup="menu"
              aria-expanded={showColMenu}
              aria-label="Column settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {showColMenu && (
              <div
                role="menu"
                className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-surface-700 dark:bg-surface-800"
              >
                <div className="px-3 py-1.5 border-b border-gray-100 dark:border-surface-700">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Columns
                  </span>
                </div>
                {columns.map((col) => {
                  if (col.hideable === false) return null;
                  const cfg = colConfigs.find((c) => c.key === col.key);
                  const visible = cfg ? cfg.visible : true;
                  const pinned = cfg?.pinned ?? false;
                  return (
                    <div
                      key={col.key}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-700"
                    >
                      <button
                        onClick={() => dt.toggleColumnVisibility(col.key)}
                        className="inline-flex items-center gap-2 flex-1"
                        role="menuitemcheckbox"
                        aria-checked={visible}
                      >
                        {visible ? (
                          <Eye className="h-3.5 w-3.5 text-blue-600 dark:text-brand-400" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-gray-400" />
                        )}
                        {col.label}
                      </button>
                      {enablePinning && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => dt.pinColumn(col.key, pinned === 'left' ? false : 'left')}
                            className={cn('p-0.5 rounded hover:bg-gray-200 dark:hover:bg-surface-600', pinned === 'left' && 'text-blue-600 dark:text-brand-400')}
                            aria-label={`Pin ${col.label} left`}
                            title="Pin left"
                          >
                            <PinLeft className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => dt.pinColumn(col.key, pinned === 'right' ? false : 'right')}
                            className={cn('p-0.5 rounded hover:bg-gray-200 dark:hover:bg-surface-600', pinned === 'right' && 'text-blue-600 dark:text-brand-400')}
                            aria-label={`Pin ${col.label} right`}
                            title="Pin right"
                          >
                            <PinRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showSaveViewDialog && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-brand-500/30 dark:bg-brand-500/10">
          <input
            type="text"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            placeholder="View name..."
            className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm bg-white dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveView();
              if (e.key === 'Escape') setShowSaveViewDialog(false);
            }}
            autoFocus
            aria-label="View name"
          />
          <button
            onClick={handleSaveView}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            Save
          </button>
          <button
            onClick={() => { setShowSaveViewDialog(false); setNewViewName(''); }}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      )}

      {selectable && selectedKeys.size > 0 && (
        <div
          className="mb-3 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-brand-500/30 dark:bg-brand-500/10"
          role="region"
          aria-label="Selection actions"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-semibold text-white dark:bg-brand-500">
              {selectedKeys.size}
            </span>
            <span className="text-sm font-medium text-blue-900 dark:text-brand-200">selected</span>
            <button
              type="button"
              onClick={() => setSelection(new Set())}
              className="text-xs font-medium text-blue-700 hover:text-blue-900 dark:text-brand-300"
            >
              Clear
            </button>
          </div>
          {enableCopyPaste && (
            <button
              type="button"
              onClick={() => {
                const rows = searchedData.filter((item) => selectedKeys.has(resolveRowId(item)));
                const keys = allVisibleColumns.map((c) => c.key);
                dt.copySelection(rows, keys);
              }}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:text-brand-300 dark:hover:bg-brand-500/20"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div
          className={cn(
            'overflow-x-auto rounded-lg border border-gray-200 dark:border-surface-700',
            containerClassName
          )}
        >
          <table className="w-full" role="table" aria-busy="true" aria-label={ariaLabel}>
            <thead className="bg-gray-50 dark:bg-surface-800">
              <tr>
                {allVisibleColumns.map((col) => (
                  <th key={col.key} className={cn(densityConfig.header, 'text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400')}>
                    <div className="h-3 rounded bg-gray-200 dark:bg-surface-700 animate-pulse" style={{ width: '60%' }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-surface-900">
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-surface-700">
                  {allVisibleColumns.map((col) => (
                    <td key={col.key} className={densityConfig.cell}>
                      <div className="h-3 rounded bg-gray-200 dark:bg-surface-700 animate-pulse" style={{ width: `${40 + ((i + col.key.length) % 4) * 15}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : searchedData.length === 0 ? (
        <div className={cn('rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900', containerClassName)}>
          <EmptyState
            icon={emptyIcon ?? <Inbox className="h-8 w-8" />}
            title={emptyTitle ?? 'No data'}
            description={emptyDescription}
            action={emptyAction}
          />
        </div>
      ) : (
        <div
          ref={tableRef}
          className={cn(
            'overflow-auto rounded-lg border border-gray-200 dark:border-surface-700',
            containerClassName
          )}
          style={{ maxHeight }}
          role="grid"
          aria-label={ariaLabel}
          aria-rowcount={searchedData.length}
          aria-colcount={allVisibleColumns.length + (selectable ? 1 : 0) + (hasExpand ? 1 : 0)}
          tabIndex={enableKeyboardNav ? 0 : undefined}
        >
          <table className="w-full min-w-full" style={{ minWidth: totalWidth }}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="bg-gray-50 dark:bg-surface-800 sticky top-0 z-10">
              <tr>
                {selectable && (
                  <th scope="col" className={cn(densityConfig.header, 'w-10 sticky left-0 z-[2] bg-gray-50 dark:bg-surface-800')}>
                    <input
                      type="checkbox"
                      checked={selectionState === 'all'}
                      ref={(el) => { if (el) el.indeterminate = selectionState === 'some'; }}
                      onChange={toggleAll}
                      aria-label="Select all rows"
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer dark:border-surface-500 dark:bg-surface-700"
                    />
                  </th>
                )}
                {hasExpand && <th scope="col" className={cn(densityConfig.header, 'w-10')} />}
                {allVisibleColumns.map((col, colIdx) => {
                  const cfg = colConfigs.find((cc) => cc.key === col.key);
                  const isPinned = cfg?.pinned;
                  const canSort = col.sortable !== false;
                  const active = dt.sort?.key === col.key;
                  const align = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left';

                  return (
                    <th
                      key={col.key}
                      scope="col"
                      aria-sort={active ? (dt.sort?.dir === 'asc' ? 'ascending' : 'descending') : canSort ? 'none' : undefined}
                      style={{
                        width: getColumnWidth(col.key),
                        minWidth: getColumnWidth(col.key),
                        ...(isPinned === 'left' ? {
                          position: 'sticky' as const,
                          left: `${(selectable ? 40 : 0) + (hasExpand ? 40 : 0) + allVisibleColumns.slice(0, colIdx).reduce((sum, c) => sum + getColumnWidth(c.key), 0)}px`,
                          zIndex: 2,
                        } : {}),
                        ...(isPinned === 'right' ? { position: 'sticky' as const, right: 0, zIndex: 2 } : {}),
                      }}
                      className={cn(
                        densityConfig.header,
                        'text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-surface-800',
                        align,
                        canSort && 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-surface-700',
                        col.headerClassName,
                        dragOverCol === col.key && 'ring-2 ring-inset ring-blue-400'
                      )}
                      onClick={() => canSort && dt.setSort(col.key)}
                      draggable={enableColumnReorder}
                      onDragStart={() => enableColumnReorder && handleDragStart(col.key)}
                      onDragOver={(e) => enableColumnReorder && handleDragOver(e, col.key)}
                      onDrop={() => enableColumnReorder && handleDrop(col.key)}
                      onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                      tabIndex={canSort ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (canSort && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          dt.setSort(col.key);
                        }
                      }}
                    >
                      <div className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                        {enableColumnReorder && (
                          <GripVertical className="h-3 w-3 text-gray-400 cursor-grab active:cursor-grabbing" aria-hidden="true" />
                        )}
                        <span>{col.label}</span>
                        {renderSortIcon(col)}
                      </div>
                      {enableColumnResize && (
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400 dark:hover:bg-brand-400"
                          onMouseDown={(e) => handleResizeStart(col.key, e)}
                          onClick={(e) => e.stopPropagation()}
                          role="separator"
                          aria-label={`Resize ${col.label} column`}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
              {showFilterRow && (
                <tr className="bg-gray-25 dark:bg-surface-750">
                  {selectable && <th className="px-2 py-1 bg-gray-50 dark:bg-surface-800" />}
                  {hasExpand && <th className="px-2 py-1 bg-gray-50 dark:bg-surface-800" />}
                  {allVisibleColumns.map((col) => {
                    const cfg = colConfigs.find((cc) => cc.key === col.key);
                    const isPinned = cfg?.pinned;
                    const filter = dt.filters.find((f) => f.columnKey === col.key);
                    return (
                      <th
                        key={col.key}
                        className="px-2 py-1 bg-gray-50 dark:bg-surface-800"
                        style={{
                          width: getColumnWidth(col.key),
                          minWidth: getColumnWidth(col.key),
                          ...(isPinned === 'left' ? {
                            position: 'sticky' as const,
                            left: `${(selectable ? 40 : 0) + (hasExpand ? 40 : 0) + allVisibleColumns.slice(0, allVisibleColumns.indexOf(col)).reduce((sum, c) => sum + getColumnWidth(c.key), 0)}px`,
                            zIndex: 2,
                          } : {}),
                        }}
                      >
                        {col.filterable !== false && (
                          <div className="relative">
                            <input
                              type="text"
                              value={filter?.value ?? ''}
                              onChange={(e) => dt.setFilter(col.key, e.target.value)}
                              placeholder="Filter..."
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs bg-white dark:bg-surface-800 dark:border-surface-600 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              aria-label={`Filter by ${col.label}`}
                            />
                            {filter && (
                              <button
                                type="button"
                                onClick={() => dt.clearFilter(col.key)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                aria-label={`Clear ${col.label} filter`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              )}
            </thead>
            <tbody className="bg-white dark:bg-surface-900">
              {useVirtualization ? (
                <tr>
                  <td colSpan={allVisibleColumns.length + (selectable ? 1 : 0) + (hasExpand ? 1 : 0)} className="p-0">
                    <VirtualList
                      height={parseInt(maxHeight) - 80}
                      itemCount={searchedData.length}
                      itemSize={computedRowHeight}
                      width="100%"
                    >
                      {VirtualRow}
                    </VirtualList>
                  </td>
                </tr>
              ) : (
                searchedData.map((item, index) => renderRow(item, index))
              )}
            </tbody>
          </table>
        </div>
      )}

      {searchedData.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm" aria-live="polite">
          <p className="text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">{searchedData.length}</span> rows
            {selectedKeys.size > 0 && (
              <span className="ml-2 text-blue-700 dark:text-brand-300">
                · {selectedKeys.size} selected
              </span>
            )}
            {dt.filters.length > 0 && (
              <span className="ml-2 text-amber-700 dark:text-amber-300">
                · {dt.filters.length} filter{dt.filters.length > 1 ? 's' : ''} active
              </span>
            )}
          </p>
          {dt.filters.length > 0 && (
            <button
              type="button"
              onClick={dt.clearAllFilters}
              className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <FilterX className="h-3.5 w-3.5" /> Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
