import {
  Copy,
  Globe,
  GripVertical,
  LayoutGrid,
  Map,
  Plus,
  Trash2,
} from 'lucide-react';
import { WidthProvider, Responsive } from 'react-grid-layout/legacy';
import type { LayoutItem } from 'react-grid-layout';
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
import { cn } from '@/lib/utils';
import type { DesignerWidget } from './designer-types';
import type { ResponsiveBreakpoint } from './designer-header';

type RGLLayout = LayoutItem;
type RGLLayouts = Record<string, RGLLayout[]>;

const ResponsiveGridLayout = WidthProvider(Responsive);

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

function WidgetPreview({ widget, locale }: { widget: DesignerWidget; locale: string }) {
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
              label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
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

interface DesignerCanvasProps {
  widgets: DesignerWidget[];
  layouts: RGLLayouts;
  selectedId: string | null;
  previewMode: boolean;
  breakpoint: ResponsiveBreakpoint;
  locale: string;
  onLayoutChange: (
    layout: readonly LayoutItem[],
    allLayouts: Partial<Record<string, readonly LayoutItem[]>>,
  ) => void;
  onSelectWidget: (id: string) => void;
  onCopyWidget: (id: string) => void;
  onDuplicateWidget: (id: string) => void;
  onRemoveWidget: (id: string) => void;
  t: (key: string, fb?: string) => string;
}

export function DesignerCanvas({
  widgets,
  layouts,
  selectedId,
  previewMode,
  breakpoint,
  locale,
  onLayoutChange,
  onSelectWidget,
  onCopyWidget,
  onDuplicateWidget,
  onRemoveWidget,
  t,
}: DesignerCanvasProps) {
  return (
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
            onLayoutChange={onLayoutChange}
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
                onClick={() => !previewMode && onSelectWidget(widget.id)}
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
                          onCopyWidget(widget.id);
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
                          onDuplicateWidget(widget.id);
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
                          onRemoveWidget(widget.id);
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
  );
}
