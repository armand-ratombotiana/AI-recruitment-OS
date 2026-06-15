'use client';

import {
  Save,
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  Sparkles,
  Settings,
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  Loader2,
} from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

export type ResponsiveBreakpoint = 'desktop' | 'tablet' | 'mobile';

export interface DesignerToolbarProps {
  saving: boolean;
  dirty: boolean;
  previewMode: boolean;
  breakpoint: ResponsiveBreakpoint;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  onTogglePreview: () => void;
  onBreakpointChange: (bp: ResponsiveBreakpoint) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenTemplates: () => void;
  onOpenSettings: () => void;
}

const BREAKPOINT_ICON: Record<ResponsiveBreakpoint, React.ReactNode> = {
  desktop: <Monitor className="h-4 w-4" />,
  tablet: <Tablet className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
};

export function DesignerToolbar({
  saving,
  dirty,
  previewMode,
  breakpoint,
  canUndo,
  canRedo,
  onSave,
  onTogglePreview,
  onBreakpointChange,
  onUndo,
  onRedo,
  onExport,
  onImport,
  onOpenTemplates,
  onOpenSettings,
}: DesignerToolbarProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <div className="flex rounded-lg border border-gray-200 dark:border-surface-700 overflow-hidden">
        {(['desktop', 'tablet', 'mobile'] as ResponsiveBreakpoint[]).map((bp) => (
          <button
            key={bp}
            type="button"
            onClick={() => onBreakpointChange(bp)}
            className={cn(
              'px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition',
              breakpoint === bp
                ? 'bg-blue-50 dark:bg-brand-500/10 text-blue-600 dark:text-brand-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-surface-800',
            )}
            title={t(`dashboardDesigner.responsive.${bp}`, bp)}
          >
            {BREAKPOINT_ICON[bp]}
            <span className="hidden sm:inline">{t(`dashboardDesigner.responsive.${bp}`, bp)}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200 dark:bg-surface-700 mx-1" />

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="p-1.5 text-xs rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-800 disabled:opacity-30 transition"
        title={t('dashboardDesigner.toolbar.undo', 'Undo')}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className="p-1.5 text-xs rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-800 disabled:opacity-30 transition"
        title={t('dashboardDesigner.toolbar.redo', 'Redo')}
      >
        <Redo2 className="h-4 w-4" />
      </button>

      <div className="w-px h-6 bg-gray-200 dark:bg-surface-700 mx-1" />

      <button
        type="button"
        onClick={onTogglePreview}
        className={cn(
          'px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition',
          previewMode
            ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
            : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700',
        )}
      >
        {previewMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {previewMode
          ? t('dashboardDesigner.toolbar.exitPreview', 'Exit Preview')
          : t('dashboardDesigner.toolbar.preview', 'Preview')}
      </button>

      <button
        type="button"
        onClick={onExport}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
      >
        <FileJson className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('dashboardDesigner.toolbar.export', 'Export')}</span>
      </button>

      <button
        type="button"
        onClick={onImport}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('dashboardDesigner.toolbar.import', 'Import')}</span>
      </button>

      <button
        type="button"
        onClick={onOpenTemplates}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('dashboardDesigner.toolbar.template', 'Template')}</span>
      </button>

      <button
        type="button"
        onClick={onOpenSettings}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
      >
        <Settings className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t('dashboardDesigner.toolbar.settings', 'Settings')}</span>
      </button>

      <div className="w-px h-6 bg-gray-200 dark:bg-surface-700 mx-1" />

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn(
          'px-4 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition',
          dirty
            ? 'bg-blue-600 dark:bg-brand-500 text-white hover:bg-blue-700 dark:hover:bg-brand-600'
            : 'bg-gray-200 dark:bg-surface-700 text-gray-500 dark:text-gray-400',
          saving && 'opacity-50 cursor-not-allowed',
        )}
      >
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Save className="h-3.5 w-3.5" />
        )}
        {saving
          ? t('dashboardDesigner.toolbar.saving', 'Saving...')
          : t('dashboardDesigner.toolbar.save', 'Save')}
      </button>
    </div>
  );
}
