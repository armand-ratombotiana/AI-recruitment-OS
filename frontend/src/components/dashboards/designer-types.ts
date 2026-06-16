import type { LayoutItem } from 'react-grid-layout';
import type { WidgetConfig, DesignerWidgetType } from './widget-config-panel';

export interface DesignerWidget {
  id: string;
  type: DesignerWidgetType;
  config: WidgetConfig;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  widgets: DesignerWidget[];
  layouts: Record<string, LayoutItem[]>;
  createdAt: string;
}
