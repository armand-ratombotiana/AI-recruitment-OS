import {
  Eye,
  EyeOff,
  FileJson,
  FolderOpen,
  LayoutGrid,
  Monitor,
  Save,
  Smartphone,
  Sparkles,
  Tablet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DesignerWidget, DashboardTemplate } from './designer-types';

export type ResponsiveBreakpoint = 'desktop' | 'tablet' | 'mobile';

interface DesignerHeaderProps {
  dirty: boolean;
  previewMode: boolean;
  breakpoint: ResponsiveBreakpoint;
  saving: boolean;
  showTemplates: boolean;
  templates: DashboardTemplate[];
  templateName: string;
  onBreakpointChange: (bp: ResponsiveBreakpoint) => void;
  onTogglePreview: () => void;
  onExport: () => void;
  onImport: () => void;
  onToggleTemplates: () => void;
  onSave: () => void;
  onTemplateNameChange: (name: string) => void;
  onSaveAsTemplate: () => void;
  onLoadTemplate: (tmpl: DashboardTemplate) => void;
  onDeleteTemplate: (id: string) => void;
  t: (key: string, fb?: string) => string;
}

const breakpointIcon = (bp: ResponsiveBreakpoint) => {
  if (bp === 'desktop') return <Monitor className="h-4 w-4" />;
  if (bp === 'tablet') return <Tablet className="h-4 w-4" />;
  return <Smartphone className="h-4 w-4" />;
};

export function DesignerHeader({
  dirty,
  previewMode,
  breakpoint,
  saving,
  showTemplates,
  templates,
  templateName,
  onBreakpointChange,
  onTogglePreview,
  onExport,
  onImport,
  onToggleTemplates,
  onSave,
  onTemplateNameChange,
  onSaveAsTemplate,
  onLoadTemplate,
  onDeleteTemplate,
  t,
}: DesignerHeaderProps) {
  return (
    <>
      <div className="shrink-0 border-b border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutGrid className="h-5 w-5 text-blue-600 dark:text-brand-400" />
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {t('dashboardDesigner.title', 'Dashboard Designer')}
            </h1>
            {dirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                {t('dashboardDesigner.unsavedChanges', 'Unsaved changes')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 dark:border-surface-700 overflow-hidden mr-2">
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
                  {breakpointIcon(bp)}
                  <span className="hidden sm:inline">{t(`dashboardDesigner.responsive.${bp}`, bp)}</span>
                </button>
              ))}
            </div>
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
              {t('dashboardDesigner.toolbar.export', 'Export')}
            </button>
            <button
              type="button"
              onClick={onImport}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('dashboardDesigner.toolbar.import', 'Import')}
            </button>
            <button
              type="button"
              onClick={onToggleTemplates}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('dashboardDesigner.toolbar.template', 'Template')}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 dark:bg-brand-500 text-white hover:bg-blue-700 dark:hover:bg-brand-600 disabled:opacity-50 flex items-center gap-1.5 transition"
            >
              <Save className="h-3.5 w-3.5" />
              {saving
                ? t('dashboardDesigner.toolbar.saving', 'Saving...')
                : t('dashboardDesigner.toolbar.save', 'Save')}
            </button>
          </div>
        </div>
      </div>

      {showTemplates && (
        <div className="shrink-0 border-b border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 px-4 py-3">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('dashboardDesigner.templates.title', 'Templates')}
              </h4>
              {templates.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {t('dashboardDesigner.templates.noTemplates', 'No saved templates')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800"
                    >
                      <button
                        type="button"
                        onClick={() => onLoadTemplate(tmpl)}
                        className="text-xs font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-brand-400"
                      >
                        {tmpl.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteTemplate(tmpl.id)}
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => onTemplateNameChange(e.target.value)}
                  placeholder={t('dashboardDesigner.templates.templateNamePlaceholder', 'My dashboard...')}
                  className="rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onSaveAsTemplate}
                  disabled={!templateName.trim()}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 dark:bg-brand-500 text-white hover:bg-blue-700 dark:hover:bg-brand-600 disabled:opacity-50 transition"
                >
                  {t('dashboardDesigner.templates.saveAs', 'Save as template')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
