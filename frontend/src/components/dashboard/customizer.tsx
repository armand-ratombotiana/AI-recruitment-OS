'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { GripVertical, Eye, EyeOff, RotateCcw, Save, X } from 'lucide-react';
import { Modal, Switch, Button } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import {
  WIDGET_META,
  DEFAULT_WIDGET_ORDER,
  DEFAULT_WIDGET_CONFIG,
  DashboardWidgetConfig,
  WidgetId,
} from './widgets/config';

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  config: DashboardWidgetConfig;
  onSave: (config: DashboardWidgetConfig) => void;
}

export function DashboardCustomizer({ isOpen, onClose, config, onSave }: DashboardCustomizerProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [draftOrder, setDraftOrder] = useState<WidgetId[]>(config.order);
  const [draftHidden, setDraftHidden] = useState<WidgetId[]>(config.hidden);
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);
  const [dragOverId, setDragOverId] = useState<WidgetId | null>(null);
  const dragSnapshot = useRef<WidgetId[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraftOrder(config.order);
      setDraftHidden(config.hidden);
    }
  }, [isOpen, config]);

  const allIds = DEFAULT_WIDGET_ORDER;

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, id: WidgetId) => {
    setDraggingId(id);
    dragSnapshot.current = draftOrder;
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', id);
    } catch {
      /* Firefox quirks */
    }
  }, [draftOrder]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, overId: WidgetId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== overId) setDragOverId(overId);
  }, [dragOverId]);

  const handleDragLeave = useCallback((_e: React.DragEvent<HTMLDivElement>, id: WidgetId) => {
    if (dragOverId === id) setDragOverId(null);
  }, [dragOverId]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, dropId: WidgetId) => {
    e.preventDefault();
    const sourceId = draggingId ?? e.dataTransfer.getData('text/plain') as WidgetId;
    if (!sourceId || sourceId === dropId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    setDraftOrder((prev) => {
      const next = [...prev];
      const fromIdx = next.indexOf(sourceId);
      const toIdx = next.indexOf(dropId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDraggingId(null);
    setDragOverId(null);
  }, [draggingId]);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
    dragSnapshot.current = null;
  }, []);

  const toggleVisibility = useCallback((id: WidgetId) => {
    setDraftHidden((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const moveUp = useCallback((id: WidgetId) => {
    setDraftOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((id: WidgetId) => {
    setDraftOrder((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setDraftOrder(DEFAULT_WIDGET_CONFIG.order);
    setDraftHidden(DEFAULT_WIDGET_CONFIG.hidden);
  }, []);

  const save = useCallback(() => {
    onSave({ order: draftOrder, hidden: draftHidden });
    onClose();
  }, [draftOrder, draftHidden, onSave, onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dashboard.customize.title', 'Customize dashboard')}
      description={t('dashboard.customize.desc', 'Toggle widgets on or off, drag to reorder them. Your layout is saved locally.')}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <Button
            variant="ghost"
            onClick={reset}
            aria-label={t('dashboard.customize.reset', 'Reset to default')}
          >
            <RotateCcw className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t('dashboard.customize.reset', 'Reset to default')}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" onClick={save}>
              <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-2" role="list" aria-label={t('dashboard.customize.list', 'Widget list')}>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {t('dashboard.customize.help', 'Drag the handle to reorder. Toggle the switch to show or hide.')}
        </p>
        {draftOrder.map((id, idx) => {
          const meta = WIDGET_META[id];
          if (!meta) return null;
          const hidden = draftHidden.includes(id);
          const isDragging = draggingId === id;
          const isDragOver = dragOverId === id && draggingId !== id;
          return (
            <div
              key={id}
              role="listitem"
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragOver={(e) => handleDragOver(e, id)}
              onDragLeave={(e) => handleDragLeave(e, id)}
              onDrop={(e) => handleDrop(e, id)}
              onDragEnd={handleDragEnd}
              aria-grabbed={isDragging}
              className={[
                'group flex items-center gap-3 p-3 rounded-lg border bg-white dark:bg-surface-900 transition-all',
                isDragging
                  ? 'opacity-50 border-blue-400 dark:border-brand-400'
                  : isDragOver
                    ? 'border-blue-500 dark:border-brand-400 ring-2 ring-blue-200 dark:ring-brand-500/30'
                    : 'border-gray-200 dark:border-surface-700 hover:border-gray-300 dark:hover:border-surface-600',
              ].join(' ')}
            >
              <button
                type="button"
                aria-label={t('dashboard.customize.dragHandle', 'Drag to reorder')}
                className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                <GripVertical className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {t(meta.titleKey, meta.titleDefault)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {t(meta.descriptionKey, meta.descriptionDefault)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveUp(id)}
                  disabled={idx === 0}
                  aria-label={t('dashboard.customize.moveUp', 'Move up')}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-surface-800 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(id)}
                  disabled={idx === draftOrder.length - 1}
                  aria-label={t('dashboard.customize.moveDown', 'Move down')}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-surface-800 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <div className="ml-1 flex items-center gap-1.5">
                  <span className="sr-only">
                    {hidden ? t('dashboard.customize.hidden', 'Hidden') : t('dashboard.customize.shown', 'Shown')}
                  </span>
                  <Switch
                    checked={!hidden}
                    onChange={() => toggleVisibility(id)}
                    aria-label={t('dashboard.customize.toggle', 'Toggle widget visibility')}
                  />
                  {hidden ? (
                    <EyeOff className="h-4 w-4 text-gray-400" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4 text-blue-500" aria-hidden="true" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {allIds.filter((id) => !draftOrder.includes(id)).length > 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            {t('dashboard.customize.missing', 'Some widgets are not yet in your layout.')}
          </p>
        )}
      </div>
    </Modal>
  );
}
