import {
  BarChart3,
  Filter,
  Globe,
  LineChart as LineIcon,
  Map,
  PieChart as PieIcon,
  Plus,
  Table2,
  Type,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DesignerWidgetType } from './widget-config-panel';

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

interface DesignerSidebarProps {
  open: boolean;
  onToggle: () => void;
  onAddWidget: (type: DesignerWidgetType) => void;
  t: (key: string, fb?: string) => string;
}

export function DesignerSidebar({ open, onToggle, onAddWidget, t }: DesignerSidebarProps) {
  return (
    <div
      className={cn(
        'shrink-0 border-r border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col transition-all duration-200',
        open ? 'w-64' : 'w-10',
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-surface-700">
        {open && (
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {t('dashboardDesigner.palette', 'Widget Palette')}
          </h3>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-400"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {WIDGET_PALETTE_ITEMS.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => onAddWidget(item.type)}
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
  );
}
