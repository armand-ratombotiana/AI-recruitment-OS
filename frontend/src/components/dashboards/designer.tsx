'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Filter,
  Table2,
  Map,
  Type,
  Globe,
  Copy,
  Trash2,
  GripVertical,
  LayoutGrid,
  Monitor,
  Tablet,
  Smartphone,
  FileJson,
  FolderOpen,
  Save,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
} from 'lucide-react';
import { WidthProvider, Responsive } from 'react-grid-layout/legacy';
import type { LayoutItem } from 'react-grid-layout';
type RGLLayout = LayoutItem;
type RGLLayouts = Record<string, RGLLayout[]>;

const ResponsiveGridLayout = WidthProvider(Responsive);
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';
import {
  WidgetConfigPanel,
  DEFAULT_WIDGET_CONFIG,
  type WidgetConfig,
  type DesignerWidgetType,
  type DataSourceEndpoint,
} from './widget-config-panel';

export interface DesignerWidget {
  id: string;
  type: DesignerWidgetType;
  config: WidgetConfig;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  widgets: DesignerWidget[];
  layouts: Record<string, RGLLayout[]>;
  createdAt: string;
}

type ResponsiveBreakpoint = 'desktop' | 'tablet' | 'mobile';

const BREAKPOINT_COLS: Record<ResponsiveBreakpoint, number> = {
  desktop: 12,
  tablet: 8,
  mobile: 4,
};

const BREAKPOINT_PX: Record<string, number> = {
  desktop: 1200,
  tablet: 768,
  mobile: 480,
};

const WIDGET_PALETTE_ITEMS: {
  type: DesignerWidgetType;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
}[] = [
  { type: 'metric', icon: <BarChart3 className="h-5 w-5" />, titleKey: 'metric', descKey: 'metricDesc' },
  { type: 'line-chart', icon: <LineIcon className="h-5 w-5" />, titleKey: 'lineChart', descKey: 'lineChartDesc' },
  { type: 'bar-chart', icon: <BarChart3 className="h-5 w-5" />, titleKey: 'barChart', descKey: 'barChartDesc' },
  { type: 'pie-chart', icon: <PieIcon className="h-5 w-5" />, titleKey: 'pieChart', descKey: 'pieChartDesc' },
  { type: 'funnel-chart', icon: <Filter className="h-5 w-5" />, titleKey: 'funnelChart', descKey: 'funnelChartDesc' },
  { type: 'table', icon: <Table2 className="h-5 w-5" />, titleKey: 'table', descKey: 'tableDesc' },
  { type: 'map', icon: <Map className="h-5 w-5" />, titleKey: 'map', descKey: 'mapDesc' },
  { type: 'text', icon: <Type className="h-5 w-5" />, titleKey: 'text', descKey: 'textDesc' },
  { type: 'iframe', icon: <Globe className="h-5 w-5" />, titleKey: 'iframe', descKey: 'iframeDesc' },
];

const DEFAULT_LAYOUTS: RGLLayouts = {
  desktop: [],
  tablet: [],
  mobile: [],
};

const SAMPLE_CHART_DATA = [
  { name: 'Mon', value: 12 },
  { name: 'Tue', value: 19 },
  { name: 'Wed', value: 8 },
  { name: 'Thu', value: 25 },
  { name: 'Fri', value: 14 },
  { name: 'Sat', value: 9 },
  { name: 'Sun', value: 17 },
];

const SAMPLE_PIE_DATA = [
  { name: 'Screening', value: 35 },
  { name: 'Interview', value: 25 },
  { name: 'Offer', value: 15 },
  { name: 'Hired', value: 25 },
];

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e'];

const TEMPLATES_STORAGE_KEY = 'airos_dashboard_templates_v1';

function getEndpointPath(ds: DataSourceEndpoint): string {
  const map: Record<DataSourceEndpoint, string> = {
    candidates: '/candidates',
    jobs: '/jobs',
    interviews: '/interviews',
    analytics: '/analytics/summary',
    pipeline: '/analytics/pipeline',
    activity: '/activity',
    custom: '',
  };
  return map[ds];
}

interface WidgetPreviewProps {
  widget: DesignerWidget;
  locale: string;
}

function WidgetPreview({ widget, locale }: WidgetPreviewProps) {
  const { type, config } = widget;
  const color = config.chartOptions.primaryColor;

  if (type === 'metric') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
          {config.metricLabel || config.title || 'Metric'}
        </p>
        <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          {config.metricPrefix}1,247{config.metricSuffix}
        </p>
        <p className="text-xs text-green-600 dark:text-green-400 mt-1">+12.5%</p>
      </div>
    );
  }

  if (type === 'line-chart') {
    return (
      <div className="h-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={SAMPLE_CHART_DATA}>
            {config.chartOptions.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            {config.chartOptions.showTooltip && <Tooltip />}
            {config.chartOptions.showLegend && <Legend />}
            <Line
              type={config.chartOptions.smooth ? 'monotone' : 'linear'}
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'bar-chart') {
    return (
      <div className="h-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={SAMPLE_CHART_DATA}>
            {config.chartOptions.showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />}
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            {config.chartOptions.showTooltip && <Tooltip />}
            {config.chartOptions.showLegend && <Legend />}
            <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'pie-chart') {
    return (
      <div className="h-full p-2">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={SAMPLE_PIE_DATA}
              cx="50%"
              cy="50%"
              outerRadius="70%"
              dataKey="value"
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {SAMPLE_PIE_DATA.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            {config.chartOptions.showTooltip && <Tooltip />}
            {config.chartOptions.showLegend && <Legend />}
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'funnel-chart') {
    const stages = [
      { name: 'Applied', count: 450 },
      { name: 'Screening', count: 280 },
      { name: 'Interview', count: 120 },
      { name: 'Offer', count: 45 },
      { name: 'Hired', count: 22 },
    ];
    const max = stages[0].count;
    return (
      <div className="h-full p-3 space-y-1.5 overflow-hidden">
        {stages.map((s, i) => {
          const w = Math.max(15, (s.count / max) * 100);
          return (
            <div key={s.name} className="flex items-center gap-2">
              <span className="text-[10px] w-16 text-right text-gray-500 dark:text-gray-400 truncate">
                {s.name}
              </span>
              <div
                className="h-5 rounded bg-gradient-to-r from-blue-500 to-blue-600 flex items-center px-2 text-white text-[9px] font-bold"
                style={{ width: `${w}%`, opacity: 1 - i * 0.12 }}
              >
                {s.count}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'table') {
    const rows = [
      { name: 'Alice Johnson', role: 'Engineer', score: 92 },
      { name: 'Bob Smith', role: 'Designer', score: 87 },
      { name: 'Carol White', role: 'PM', score: 78 },
    ];
    return (
      <div className="h-full p-2 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 dark:border-surface-700">
              <th className="text-left py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium">Name</th>
              <th className="text-left py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium">Role</th>
              <th className="text-right py-1.5 px-2 text-gray-500 dark:text-gray-400 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-b border-gray-100 dark:border-surface-800">
                <td className="py-1.5 px-2 text-gray-900 dark:text-gray-100">{r.name}</td>
                <td className="py-1.5 px-2 text-gray-600 dark:text-gray-300">{r.role}</td>
                <td className="py-1.5 px-2 text-right font-semibold text-gray-900 dark:text-gray-100">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === 'map') {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-surface-800 dark:to-surface-700 rounded">
        <div className="text-center">
          <Map className="h-10 w-10 text-blue-400 dark:text-brand-400 mx-auto mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">Map widget preview</p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Configure data source for geo data</p>
        </div>
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div className="h-full p-4 overflow-auto">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {config.textContent ? (
            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{config.textContent}</p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">Text content will appear here...</p>
          )}
        </div>
      </div>
    );
  }

  if (type === 'iframe') {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-surface-800 rounded">
        {config.iframeUrl ? (
          <iframe
            src={config.iframeUrl}
            className="w-full h-full border-0 rounded"
            title={config.title || 'Iframe widget'}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="text-center">
            <Globe className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-400 dark:text-gray-500">Enter a URL in the config panel</p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

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

      const newLayout: RGLLayout = {
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
      const newLayout: RGLLayout = {
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
    const newLayout: RGLLayout = {
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

  const breakpointIcon = (bp: ResponsiveBreakpoint) => {
    if (bp === 'desktop') return <Monitor className="h-4 w-4" />;
    if (bp === 'tablet') return <Tablet className="h-4 w-4" />;
    return <Smartphone className="h-4 w-4" />;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-surface-950 overflow-hidden">
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
                  onClick={() => setBreakpoint(bp)}
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
              onClick={() => setPreviewMode(!previewMode)}
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
              onClick={exportJSON}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
            >
              <FileJson className="h-3.5 w-3.5" />
              {t('dashboardDesigner.toolbar.export', 'Export')}
            </button>
            <button
              type="button"
              onClick={importJSON}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('dashboardDesigner.toolbar.import', 'Import')}
            </button>
            <button
              type="button"
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-surface-700 flex items-center gap-1.5 transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('dashboardDesigner.toolbar.template', 'Template')}
            </button>
            <button
              type="button"
              onClick={handleSave}
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
                        onClick={() => loadTemplate(tmpl)}
                        className="text-xs font-medium text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-brand-400"
                      >
                        {tmpl.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(tmpl.id)}
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
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
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={t('dashboardDesigner.templates.templateNamePlaceholder', 'My dashboard...')}
                  className="rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveAsTemplate}
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

      <div className="flex-1 flex overflow-hidden">
        {!previewMode && (
          <div
            className={cn(
              'shrink-0 border-r border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col transition-all duration-200',
              paletteOpen ? 'w-64' : 'w-10',
            )}
          >
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-surface-700">
              {paletteOpen && (
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('dashboardDesigner.palette', 'Widget Palette')}
                </h3>
              )}
              <button
                type="button"
                onClick={() => setPaletteOpen(!paletteOpen)}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-400"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {paletteOpen && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {WIDGET_PALETTE_ITEMS.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => addWidget(item.type)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-surface-800 transition group"
                  >
                    <div className="shrink-0 p-2 rounded-lg bg-blue-50 dark:bg-brand-500/10 text-blue-600 dark:text-brand-400 group-hover:scale-105 transition">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {t(`dashboardDesigner.widgets.${item.titleKey}`, item.titleKey)}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        {t(`dashboardDesigner.widgets.${item.descKey}`, item.descKey)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {widgets.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <LayoutGrid className="h-16 w-16 text-gray-200 dark:text-surface-700 mx-auto mb-4" />
                <p className="text-sm text-gray-400 dark:text-gray-500 max-w-xs">
                  {t(
                    'dashboardDesigner.emptyCanvas',
                    'Drag widgets from the palette to start building your dashboard',
                  )}
                </p>
              </div>
            </div>
          ) : (
            <div
              style={{
                maxWidth:
                  breakpoint === 'desktop'
                    ? '100%'
                    : breakpoint === 'tablet'
                      ? '768px'
                      : '480px',
                margin: '0 auto',
              }}
            >
              <ResponsiveGridLayout
                className="layout"
                layouts={layouts}
                breakpoints={BREAKPOINT_PX}
                cols={BREAKPOINT_COLS}
                rowHeight={60}
                isDraggable={!previewMode}
                isResizable={!previewMode}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".widget-drag-handle"
                compactType="vertical"
              >
                {widgets.map((widget) => (
                  <div
                    key={widget.id}
                    className={cn(
                      'rounded-xl border bg-white dark:bg-surface-900 shadow-sm overflow-hidden transition',
                      selectedId === widget.id && !previewMode
                        ? 'border-blue-500 dark:border-brand-400 ring-2 ring-blue-500/20 dark:ring-brand-400/20'
                        : 'border-gray-200 dark:border-surface-700 hover:border-gray-300 dark:hover:border-surface-600',
                    )}
                    onClick={() => !previewMode && setSelectedId(widget.id)}
                  >
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 dark:border-surface-800 bg-gray-50/50 dark:bg-surface-800/50">
                      <div className="flex items-center gap-2 min-w-0">
                        {!previewMode && (
                          <GripVertical className="widget-drag-handle h-3.5 w-3.5 text-gray-300 dark:text-gray-600 cursor-grab shrink-0" />
                        )}
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">
                          {widget.config.title || t(`dashboardDesigner.widgets.${widget.type}`, widget.type)}
                        </span>
                      </div>
                      {!previewMode && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyWidget(widget.id);
                            }}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            title={t('dashboardDesigner.actions.copy', 'Copy')}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateWidget(widget.id);
                            }}
                            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-surface-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
                            title={t('dashboardDesigner.actions.duplicate', 'Duplicate')}
                          >
                            <Copy className="h-3 w-3" />
                            <Plus className="h-2 w-2 -ml-1" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeWidget(widget.id);
                            }}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition"
                            title={t('dashboardDesigner.actions.delete', 'Delete')}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="h-[calc(100%-32px)]">
                      <WidgetPreview widget={widget} locale={locale} />
                    </div>
                  </div>
                ))}
              </ResponsiveGridLayout>
            </div>
          )}
        </div>

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
