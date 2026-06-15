'use client';

import { useState, useCallback, useRef } from 'react';
import ReactGridLayout from 'react-grid-layout';
import {
  LayoutGrid,
  ChevronRight,
  Home,
  Settings,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { DashboardDesigner, type DesignerWidget, type DashboardTemplate } from '@/components/dashboards/designer';
import { DesignerToolbar, type ResponsiveBreakpoint } from '@/components/dashboards/designer-toolbar';
import { TemplateSelector } from '@/components/dashboards/template-selector';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/hooks';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

type RGLLayouts = ReactGridLayout.Layouts;

const TEMPLATES_STORAGE_KEY = 'airos_dashboard_templates_v1';

export default function DashboardDesignerPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push, ToastContainer } = useToast();

  const [dashboardName, setDashboardName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [breakpoint, setBreakpoint] = useState<ResponsiveBreakpoint>('desktop');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userTemplates, setUserTemplates] = useState<DashboardTemplate[]>([]);
  const [undoStack, setUndoStack] = useState<{ widgets: DesignerWidget[]; layouts: RGLLayouts }[]>([]);
  const [redoStack, setRedoStack] = useState<{ widgets: DesignerWidget[]; layouts: RGLLayouts }[]>([]);

  const designerRef = useRef<{
    getWidgets: () => DesignerWidget[];
    getLayouts: () => RGLLayouts;
    loadTemplate: (tmpl: DashboardTemplate) => void;
  } | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = typeof window !== 'undefined' ? localStorage.getItem('airos_token') : null;
      const res = await fetch(`${apiBase}/api/v1/dashboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: dashboardName || 'Untitled Dashboard',
          widgets: designerRef.current?.getWidgets() ?? [],
          layouts: designerRef.current?.getLayouts() ?? {},
        }),
      });
      if (res.ok) {
        setDirty(false);
        push('success', t('dashboardDesigner.saved', 'Dashboard saved'));
      } else {
        push('error', t('dashboardDesigner.saveFailed', 'Failed to save dashboard'));
      }
    } catch {
      push('error', t('dashboardDesigner.saveFailed', 'Failed to save dashboard'));
    } finally {
      setSaving(false);
    }
  }, [dashboardName, push, t]);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setUndoStack((u) => [...u, last]);
      return prev.slice(0, -1);
    });
  }, []);

  const handleExport = useCallback(() => {
    const data = JSON.stringify(
      {
        name: dashboardName,
        widgets: designerRef.current?.getWidgets() ?? [],
        layouts: designerRef.current?.getLayouts() ?? {},
      },
      null,
      2,
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dashboardName || 'dashboard'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dashboardName]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text) as { name?: string; widgets: DesignerWidget[]; layouts: RGLLayouts };
        if (data.widgets && data.layouts) {
          if (data.name) setDashboardName(data.name);
          if (designerRef.current) {
            designerRef.current.loadTemplate({
              id: 'imported',
              name: data.name || 'Imported',
              widgets: data.widgets,
              layouts: data.layouts,
              createdAt: new Date().toISOString(),
            });
          }
          setDirty(true);
          push('success', t('dashboardDesigner.templates.loaded', 'Template loaded'));
        }
      } catch {
        push('error', 'Invalid JSON file');
      }
    };
    input.click();
  }, [push, t]);

  const handleSelectBuiltinTemplate = useCallback(
    (templateId: string) => {
      push('info', t('dashboardDesigner.templates.loaded', 'Template loaded'));
      setDirty(true);
    },
    [push, t],
  );

  const handleSelectUserTemplate = useCallback(
    (tmpl: DashboardTemplate) => {
      if (designerRef.current) {
        designerRef.current.loadTemplate(tmpl);
      }
      setDirty(true);
      setShowTemplateSelector(false);
      push('success', t('dashboardDesigner.templates.loaded', 'Template loaded'));
    },
    [push, t],
  );

  const handleDeleteUserTemplate = useCallback(
    (id: string) => {
      const updated = userTemplates.filter((t) => t.id !== id);
      setUserTemplates(updated);
      localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updated));
      push('info', t('dashboardDesigner.templates.deleted', 'Template deleted'));
    },
    [userTemplates, push, t],
  );

  return (
    <>
      <div className="min-h-screen bg-gray-50 dark:bg-surface-950">
        <div className="max-w-[1920px] mx-auto">
          <nav aria-label="Breadcrumb" className="px-4 sm:px-6 pt-4 pb-2">
            <ol className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
              <li>
                <Link href="/dashboard" className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-300 transition">
                  <Home className="h-3.5 w-3.5" />
                </Link>
              </li>
              <li className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                <Link href="/dashboard/admin" className="hover:text-gray-700 dark:hover:text-gray-300 transition link-underline">
                  Admin
                </Link>
              </li>
              <li className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                <Link href="/dashboard/admin/dashboards" className="hover:text-gray-700 dark:hover:text-gray-300 transition link-underline">
                  Dashboards
                </Link>
              </li>
              <li className="flex items-center gap-1.5">
                <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
                <span className="font-semibold text-gray-900 dark:text-gray-100" aria-current="page">
                  {t('dashboardDesigner.title', 'Dashboard Designer')}
                </span>
              </li>
            </ol>
          </nav>

          <div className="px-4 sm:px-6 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-brand-500/10">
                  <LayoutGrid className="h-6 w-6 text-blue-600 dark:text-brand-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {t('dashboardDesigner.title', 'Dashboard Designer')}
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('dashboardDesigner.subtitle', 'Build custom dashboards with drag-and-drop widgets')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={dashboardName}
                  onChange={(e) => {
                    setDashboardName(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={t('dashboardDesigner.page.namePlaceholder', 'Dashboard name...')}
                  className="rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-400 transition w-48 sm:w-64"
                />
                {dirty && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                    {t('dashboardDesigner.unsavedChanges', 'Unsaved changes')}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-6 pb-3 border-b border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900">
            <DesignerToolbar
              saving={saving}
              dirty={dirty}
              previewMode={previewMode}
              breakpoint={breakpoint}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onSave={handleSave}
              onTogglePreview={() => setPreviewMode(!previewMode)}
              onBreakpointChange={setBreakpoint}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onExport={handleExport}
              onImport={handleImport}
              onOpenTemplates={() => setShowTemplateSelector(true)}
              onOpenSettings={() => setShowSettings(true)}
            />
          </div>

          <div className={cn('h-[calc(100vh-220px)]', 'mt-0')}>
            <DashboardDesigner
              onSave={(_widgets, _layouts) => {
                setDirty(false);
                push('success', t('dashboardDesigner.saved', 'Dashboard saved'));
              }}
            />
          </div>
        </div>
      </div>

      <TemplateSelector
        isOpen={showTemplateSelector}
        onClose={() => setShowTemplateSelector(false)}
        userTemplates={userTemplates}
        onSelectBuiltin={handleSelectBuiltinTemplate}
        onSelectUser={handleSelectUserTemplate}
        onDeleteUser={handleDeleteUserTemplate}
      />

      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title={t('dashboardDesigner.toolbar.settings', 'Settings')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t('dashboardDesigner.page.settings.gridRows', 'Grid Row Height')}
            </label>
            <input
              type="number"
              defaultValue={60}
              min={30}
              max={120}
              className="w-full rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-400 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
              {t('dashboardDesigner.page.settings.compactType', 'Layout Compaction')}
            </label>
            <select
              defaultValue="vertical"
              className="w-full rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-400 transition"
            >
              <option value="vertical">Vertical</option>
              <option value="horizontal">Horizontal</option>
              <option value="">None</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 dark:bg-brand-500 text-white hover:bg-blue-700 dark:hover:bg-brand-600 transition"
            >
              {t('common.done', 'Done')}
            </button>
          </div>
        </div>
      </Modal>

      <ToastContainer />
    </>
  );
}
