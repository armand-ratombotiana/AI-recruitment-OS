'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { LayoutItem } from 'react-grid-layout';
import { useLocaleStore, translate } from '@/stores/locale-store';
import {
  WidgetConfigPanel,
  DEFAULT_WIDGET_CONFIG,
  type WidgetConfig,
  type DesignerWidgetType,
} from './widget-config-panel';
import type { DesignerWidget, DashboardTemplate } from './designer-types';

export type { DesignerWidget, DashboardTemplate } from './designer-types';
import { DesignerHeader, type ResponsiveBreakpoint } from './designer-header';
import { DesignerSidebar } from './designer-sidebar';
import { DesignerCanvas } from './designer-canvas';

type RGLLayouts = Record<string, LayoutItem[]>;

const DEFAULT_LAYOUTS: RGLLayouts = {
  desktop: [],
  tablet: [],
  mobile: [],
};

const TEMPLATES_STORAGE_KEY = 'airos_dashboard_templates_v1';

interface DashboardDesignerProps {
  initialWidgets?: DesignerWidget[];
  initialLayouts?: RGLLayouts;
  onSave?: (widgets: DesignerWidget[], layouts: RGLLayouts) => void;
}

export function DashboardDesigner({
  initialWidgets = [],
  initialLayouts,
  onSave,
}: DashboardDesignerProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [widgets, setWidgets] = useState<DesignerWidget[]>(initialWidgets);
  const [layouts, setLayouts] = useState<RGLLayouts>(initialLayouts ?? DEFAULT_LAYOUTS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [breakpoint, setBreakpoint] = useState<ResponsiveBreakpoint>('desktop');
  const [clipboard, setClipboard] = useState<DesignerWidget | null>(null);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const nextYRef = useRef(0);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
      if (stored) setTemplates(JSON.parse(stored));
    } catch {
      /* noop */
    }
  }, []);

  const selectedWidget = useMemo(
    () => widgets.find((w) => w.id === selectedId) ?? null,
    [widgets, selectedId],
  );

  const addWidget = useCallback(
    (type: DesignerWidgetType) => {
      const id = crypto.randomUUID();
      const newWidget: DesignerWidget = {
        id,
        type,
        config: { ...DEFAULT_WIDGET_CONFIG, title: t(`dashboardDesigner.widgets.${type}`, type) },
      };
      const y = nextYRef.current;
      nextYRef.current = y + 3;
      setWidgets((prev) => [...prev, newWidget]);
      setSelectedId(id);
      setDirty(true);

      const newLayout: LayoutItem = {
        i: id,
        x: 0,
        y,
        w: type === 'metric' ? 3 : 6,
        h: type === 'metric' ? 3 : 5,
        minW: 2,
        minH: 2,
      };
      setLayouts((prev: RGLLayouts) => ({
        ...prev,
        desktop: [...(prev.desktop || []), newLayout],
        tablet: [...(prev.tablet || []), { ...newLayout, w: 4, x: 0 }],
        mobile: [...(prev.mobile || []), { ...newLayout, w: 4, x: 0, y: y * 2 }],
      }));
    },
    [t],
  );

  const removeWidget = useCallback(
    (id: string) => {
      setWidgets((prev) => prev.filter((w) => w.id !== id));
      setLayouts((prev) => ({
        desktop: (prev.desktop || []).filter((l) => l.i !== id),
        tablet: (prev.tablet || []).filter((l) => l.i !== id),
        mobile: (prev.mobile || []).filter((l) => l.i !== id),
      }));
      if (selectedId === id) setSelectedId(null);
      setDirty(true);
    },
    [selectedId],
  );

  const duplicateWidget = useCallback(
    (id: string) => {
      const source = widgets.find((w) => w.id === id);
      if (!source) return;
      const newId = crypto.randomUUID();
      const copy: DesignerWidget = {
        id: newId,
        type: source.type,
        config: { ...source.config, title: `${source.config.title} (copy)` },
      };
      setWidgets((prev) => [...prev, copy]);
      setSelectedId(newId);
      setDirty(true);

      const sourceLayout = layouts.desktop?.find((l) => l.i === id);
      const y = (sourceLayout?.y ?? 0) + (sourceLayout?.h ?? 3) + 1;
      const newLayout: LayoutItem = {
        i: newId,
        x: sourceLayout?.x ?? 0,
        y,
        w: sourceLayout?.w ?? 6,
        h: sourceLayout?.h ?? 5,
        minW: 2,
        minH: 2,
      };
      setLayouts((prev: RGLLayouts) => ({
        ...prev,
        desktop: [...(prev.desktop || []), newLayout],
        tablet: [...(prev.tablet || []), { ...newLayout, w: 4 }],
        mobile: [...(prev.mobile || []), { ...newLayout, w: 4 }],
      }));
    },
    [widgets, layouts],
  );

  const copyWidget = useCallback(
    (id: string) => {
      const source = widgets.find((w) => w.id === id);
      if (source) setClipboard({ ...source, id: crypto.randomUUID() });
    },
    [widgets],
  );

  const pasteWidget = useCallback(() => {
    if (!clipboard) return;
    const newId = crypto.randomUUID();
    const pasted: DesignerWidget = {
      ...clipboard,
      id: newId,
      config: { ...clipboard.config, title: `${clipboard.config.title} (copy)` },
    };
    setWidgets((prev) => [...prev, pasted]);
    setSelectedId(newId);
    setDirty(true);
    const y = nextYRef.current;
    nextYRef.current = y + 3;
    const newLayout: LayoutItem = {
      i: newId,
      x: 0,
      y,
      w: 6,
      h: 5,
      minW: 2,
      minH: 2,
    };
    setLayouts((prev: RGLLayouts) => ({
      ...prev,
      desktop: [...(prev.desktop || []), newLayout],
      tablet: [...(prev.tablet || []), { ...newLayout, w: 4 }],
      mobile: [...(prev.mobile || []), { ...newLayout, w: 4 }],
    }));
  }, [clipboard]);

  const updateWidgetConfig = useCallback(
    (id: string, config: WidgetConfig) => {
      setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, config } : w)));
      setDirty(true);
    },
    [],
  );

  const handleLayoutChange = useCallback(
    (_layout: readonly LayoutItem[], allLayouts: Partial<Record<string, readonly LayoutItem[]>>) => {
      setLayouts((allLayouts ?? {}) as RGLLayouts);
      setDirty(true);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = typeof window !== 'undefined' ? localStorage.getItem('airos_token') : null;
      await fetch(`${apiBase}/api/v1/dashboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ widgets, layouts }),
      });
      setDirty(false);
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
    if (onSave) onSave(widgets, layouts);
  }, [widgets, layouts, onSave]);

  const saveAsTemplate = useCallback(() => {
    if (!templateName.trim()) return;
    const tmpl: DashboardTemplate = {
      id: crypto.randomUUID(),
      name: templateName.trim(),
      widgets: [...widgets],
      layouts: { ...layouts },
      createdAt: new Date().toISOString(),
    };
    const updated = [...templates, tmpl];
    setTemplates(updated);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
    setTemplateName('');
    setShowTemplates(false);
  }, [templateName, widgets, layouts, templates]);

  const loadTemplate = useCallback((tmpl: DashboardTemplate) => {
    setWidgets(tmpl.widgets);
    setLayouts(tmpl.layouts);
    setSelectedId(null);
    setDirty(true);
    setShowTemplates(false);
  }, []);

  const deleteTemplate = useCallback(
    (id: string) => {
      const updated = templates.filter((t) => t.id !== id);
      setTemplates(updated);
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
    },
    [templates],
  );

  const exportJSON = useCallback(() => {
    const data = JSON.stringify({ widgets, layouts }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dashboard.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [widgets, layouts]);

  const importJSON = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text) as { widgets: DesignerWidget[]; layouts: RGLLayouts };
        if (data.widgets && data.layouts) {
          setWidgets(data.widgets);
          setLayouts(data.layouts);
          setDirty(true);
        }
      } catch {
        /* noop */
      }
    };
    input.click();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' && selectedId) {
          e.preventDefault();
          copyWidget(selectedId);
        }
        if (e.key === 'v' && clipboard) {
          e.preventDefault();
          pasteWidget();
        }
        if (e.key === 'd' && selectedId) {
          e.preventDefault();
          duplicateWidget(selectedId);
        }
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        }
      }
      if (e.key === 'Delete' && selectedId && !previewMode) {
        removeWidget(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, clipboard, previewMode, copyWidget, pasteWidget, duplicateWidget, handleSave, removeWidget]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-surface-950 overflow-hidden">
      <DesignerHeader
        dirty={dirty}
        previewMode={previewMode}
        breakpoint={breakpoint}
        saving={saving}
        showTemplates={showTemplates}
        templates={templates}
        templateName={templateName}
        onBreakpointChange={setBreakpoint}
        onTogglePreview={() => setPreviewMode(!previewMode)}
        onExport={exportJSON}
        onImport={importJSON}
        onToggleTemplates={() => setShowTemplates(!showTemplates)}
        onSave={handleSave}
        onTemplateNameChange={setTemplateName}
        onSaveAsTemplate={saveAsTemplate}
        onLoadTemplate={loadTemplate}
        onDeleteTemplate={deleteTemplate}
        t={t}
      />

      <div className="flex-1 flex overflow-hidden">
        {!previewMode && (
          <DesignerSidebar
            open={paletteOpen}
            onToggle={() => setPaletteOpen(!paletteOpen)}
            onAddWidget={addWidget}
            t={t}
          />
        )}

        <DesignerCanvas
          widgets={widgets}
          layouts={layouts}
          selectedId={selectedId}
          previewMode={previewMode}
          breakpoint={breakpoint}
          locale={locale}
          onLayoutChange={handleLayoutChange}
          onSelectWidget={setSelectedId}
          onCopyWidget={copyWidget}
          onDuplicateWidget={duplicateWidget}
          onRemoveWidget={removeWidget}
          t={t}
        />

        {!previewMode && selectedWidget && (
          <WidgetConfigPanel
            widgetType={selectedWidget.type}
            config={selectedWidget.config}
            onChange={(cfg) => updateWidgetConfig(selectedWidget.id, cfg)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}
