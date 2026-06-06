export type WidgetId =
  | 'stats'
  | 'quick-actions'
  | 'recent-activity'
  | 'upcoming-interviews'
  | 'pipeline'
  | 'ai-tasks';

export interface WidgetMeta {
  id: WidgetId;
  titleKey: string;
  titleDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
}

export const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  stats: {
    id: 'stats',
    titleKey: 'dashboard.widgets.stats.title',
    titleDefault: 'Key metrics',
    descriptionKey: 'dashboard.widgets.stats.desc',
    descriptionDefault: 'Candidates, jobs, interviews and hires at a glance.',
  },
  'quick-actions': {
    id: 'quick-actions',
    titleKey: 'dashboard.widgets.quickActions.title',
    titleDefault: 'Quick actions',
    descriptionKey: 'dashboard.widgets.quickActions.desc',
    descriptionDefault: 'Jump to common tasks like adding a candidate or scheduling an interview.',
  },
  'recent-activity': {
    id: 'recent-activity',
    titleKey: 'dashboard.widgets.recentActivity.title',
    titleDefault: 'Recent activity',
    descriptionKey: 'dashboard.widgets.recentActivity.desc',
    descriptionDefault: 'Latest AI actions, screening runs and workflow events.',
  },
  'upcoming-interviews': {
    id: 'upcoming-interviews',
    titleKey: 'dashboard.widgets.upcomingInterviews.title',
    titleDefault: 'Upcoming interviews',
    descriptionKey: 'dashboard.widgets.upcomingInterviews.desc',
    descriptionDefault: "Interviews scheduled for the next few days.",
  },
  pipeline: {
    id: 'pipeline',
    titleKey: 'dashboard.widgets.pipeline.title',
    titleDefault: 'Pipeline funnel',
    descriptionKey: 'dashboard.widgets.pipeline.desc',
    descriptionDefault: 'Candidates by recruitment stage.',
  },
  'ai-tasks': {
    id: 'ai-tasks',
    titleKey: 'dashboard.widgets.aiTasks.title',
    titleDefault: 'AI agents',
    descriptionKey: 'dashboard.widgets.aiTasks.desc',
    descriptionDefault: 'Available AI agents and their status.',
  },
};

export const DEFAULT_WIDGET_ORDER: WidgetId[] = [
  'stats',
  'quick-actions',
  'pipeline',
  'recent-activity',
  'upcoming-interviews',
  'ai-tasks',
];

export interface DashboardWidgetConfig {
  order: WidgetId[];
  hidden: WidgetId[];
}

export const DEFAULT_WIDGET_CONFIG: DashboardWidgetConfig = {
  order: DEFAULT_WIDGET_ORDER,
  hidden: [],
};

export const STORAGE_KEY = 'airos_dashboard_widgets_v1';
