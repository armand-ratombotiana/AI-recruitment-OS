'use client';

import { useState, useCallback } from 'react';
import {
  X,
  Plus,
  Trash2,
  Filter,
  Palette,
  Database,
  Clock,
  Type,
  BarChart3,
  Globe,
  AlignLeft,
} from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

export type DesignerWidgetType =
  | 'metric'
  | 'line-chart'
  | 'bar-chart'
  | 'pie-chart'
  | 'funnel-chart'
  | 'table'
  | 'map'
  | 'text'
  | 'iframe';

export type DataSourceEndpoint =
  | 'candidates'
  | 'jobs'
  | 'interviews'
  | 'analytics'
  | 'pipeline'
  | 'activity'
  | 'custom';

export type FilterOperator = 'equals' | 'notEquals' | 'contains' | 'greaterThan' | 'lessThan' | 'in';

export interface WidgetFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface ConditionalRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  color: string;
}

export interface WidgetConfig {
  title: string;
  dataSource: DataSourceEndpoint;
  customUrl: string;
  filters: WidgetFilter[];
  refreshInterval: number;
  chartOptions: {
    primaryColor: string;
    showLegend: boolean;
    showGrid: boolean;
    showTooltip: boolean;
    xAxisLabel: string;
    yAxisLabel: string;
    stacked: boolean;
    smooth: boolean;
  };
  conditionalFormatting: ConditionalRule[];
  metricField: string;
  metricLabel: string;
  metricPrefix: string;
  metricSuffix: string;
  textContent: string;
  iframeUrl: string;
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  title: '',
  dataSource: 'candidates',
  customUrl: '',
  filters: [],
  refreshInterval: 0,
  chartOptions: {
    primaryColor: '#3b82f6',
    showLegend: true,
    showGrid: true,
    showTooltip: true,
    xAxisLabel: '',
    yAxisLabel: '',
    stacked: false,
    smooth: false,
  },
  conditionalFormatting: [],
  metricField: '',
  metricLabel: '',
  metricPrefix: '',
  metricSuffix: '',
  textContent: '',
  iframeUrl: '',
};

const DATA_SOURCE_OPTIONS: DataSourceEndpoint[] = [
  'candidates',
  'jobs',
  'interviews',
  'analytics',
  'pipeline',
  'activity',
  'custom',
];

const REFRESH_OPTIONS = [
  { value: 0, key: 'off' },
  { value: 5000, key: '5s' },
  { value: 15000, key: '15s' },
  { value: 30000, key: '30s' },
  { value: 60000, key: '1m' },
  { value: 300000, key: '5m' },
];

const FILTER_OPERATORS: FilterOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'greaterThan',
  'lessThan',
  'in',
];

const CONDITION_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

interface WidgetConfigPanelProps {
  widgetType: DesignerWidgetType;
  config: WidgetConfig;
  onChange: (config: WidgetConfig) => void;
  onClose: () => void;
}

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-400 transition',
        className,
      )}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'w-full rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-400 transition',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-brand-400',
          checked ? 'bg-blue-600 dark:bg-brand-500' : 'bg-gray-200 dark:bg-surface-700',
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
      <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span>
    </label>
  );
}

export function WidgetConfigPanel({
  widgetType,
  config,
  onChange,
  onClose,
}: WidgetConfigPanelProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const update = useCallback(
    <K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) => {
      onChange({ ...config, [key]: value });
    },
    [config, onChange],
  );

  const updateChart = useCallback(
    <K extends keyof WidgetConfig['chartOptions']>(
      key: K,
      value: WidgetConfig['chartOptions'][K],
    ) => {
      onChange({
        ...config,
        chartOptions: { ...config.chartOptions, [key]: value },
      });
    },
    [config, onChange],
  );

  const addFilter = useCallback(() => {
    const newFilter: WidgetFilter = {
      id: crypto.randomUUID(),
      field: '',
      operator: 'equals',
      value: '',
    };
    update('filters', [...config.filters, newFilter]);
  }, [config.filters, update]);

  const removeFilter = useCallback(
    (id: string) => {
      update(
        'filters',
        config.filters.filter((f) => f.id !== id),
      );
    },
    [config.filters, update],
  );

  const updateFilter = useCallback(
    (id: string, field: keyof WidgetFilter, value: string) => {
      update(
        'filters',
        config.filters.map((f) => (f.id === id ? { ...f, [field]: value } : f)),
      );
    },
    [config.filters, update],
  );

  const addConditionalRule = useCallback(() => {
    const rule: ConditionalRule = {
      id: crypto.randomUUID(),
      field: '',
      operator: 'greaterThan',
      value: '',
      color: CONDITION_COLORS[0],
    };
    update('conditionalFormatting', [...config.conditionalFormatting, rule]);
  }, [config.conditionalFormatting, update]);

  const removeConditionalRule = useCallback(
    (id: string) => {
      update(
        'conditionalFormatting',
        config.conditionalFormatting.filter((r) => r.id !== id),
      );
    },
    [config.conditionalFormatting, update],
  );

  const updateConditionalRule = useCallback(
    (id: string, field: keyof ConditionalRule, value: string) => {
      update(
        'conditionalFormatting',
        config.conditionalFormatting.map((r) =>
          r.id === id ? { ...r, [field]: value } : r,
        ),
      );
    },
    [config.conditionalFormatting, update],
  );

  const isChart = ['line-chart', 'bar-chart', 'pie-chart', 'funnel-chart'].includes(widgetType);

  return (
    <div className="w-80 shrink-0 border-l border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-surface-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('dashboardDesigner.configPanel', 'Widget Configuration')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-500 dark:text-gray-400 transition"
          aria-label={t('common.close', 'Close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <SectionHeader icon={<Type className="h-4 w-4" />} label={t('dashboardDesigner.config.title', 'Title')} />
          <Input
            value={config.title}
            onChange={(v) => update('title', v)}
            placeholder={t('dashboardDesigner.config.titlePlaceholder', 'Widget title...')}
          />
        </div>

        <div>
          <SectionHeader
            icon={<Database className="h-4 w-4" />}
            label={t('dashboardDesigner.config.dataSource', 'Data Source')}
          />
          <Select
            value={config.dataSource}
            onChange={(v) => update('dataSource', v as DataSourceEndpoint)}
            options={DATA_SOURCE_OPTIONS.map((ds) => ({
              value: ds,
              label: t(`dashboardDesigner.config.endpoints.${ds}`, ds.charAt(0).toUpperCase() + ds.slice(1)),
            }))}
          />
          {config.dataSource === 'custom' && (
            <div className="mt-2">
              <FieldLabel>{t('dashboardDesigner.config.customUrl', 'Custom URL')}</FieldLabel>
              <Input
                value={config.customUrl}
                onChange={(v) => update('customUrl', v)}
                placeholder={t('dashboardDesigner.config.customUrlPlaceholder', 'https://api.example.com/data')}
              />
            </div>
          )}
        </div>

        <div>
          <SectionHeader
            icon={<Filter className="h-4 w-4" />}
            label={t('dashboardDesigner.config.filters', 'Filters')}
          />
          {config.filters.map((f) => (
            <div key={f.id} className="space-y-1.5 mb-3 p-2 rounded-lg bg-gray-50 dark:bg-surface-800">
              <Input
                value={f.field}
                onChange={(v) => updateFilter(f.id, 'field', v)}
                placeholder={t('dashboardDesigner.config.filterField', 'Field')}
              />
              <Select
                value={f.operator}
                onChange={(v) => updateFilter(f.id, 'operator', v)}
                options={FILTER_OPERATORS.map((op) => ({
                  value: op,
                  label: t(`dashboardDesigner.config.operators.${op}`, op),
                }))}
              />
              <Input
                value={f.value}
                onChange={(v) => updateFilter(f.id, 'value', v)}
                placeholder={t('dashboardDesigner.config.filterValue', 'Value')}
              />
              <button
                type="button"
                onClick={() => removeFilter(f.id)}
                className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                {t('dashboardDesigner.config.removeFilter', 'Remove filter')}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addFilter}
            className="text-xs text-blue-600 dark:text-brand-400 hover:text-blue-700 dark:hover:text-brand-300 flex items-center gap-1 font-medium"
          >
            <Plus className="h-3 w-3" />
            {t('dashboardDesigner.config.addFilter', 'Add filter')}
          </button>
        </div>

        <div>
          <SectionHeader
            icon={<Clock className="h-4 w-4" />}
            label={t('dashboardDesigner.config.refreshInterval', 'Refresh Interval')}
          />
          <Select
            value={String(config.refreshInterval)}
            onChange={(v) => update('refreshInterval', Number(v))}
            options={REFRESH_OPTIONS.map((r) => ({
              value: String(r.value),
              label: t(`dashboardDesigner.config.refreshOptions.${r.key}`, r.key),
            }))}
          />
        </div>

        {widgetType === 'metric' && (
          <div>
            <SectionHeader
              icon={<BarChart3 className="h-4 w-4" />}
              label={t('dashboardDesigner.widgets.metric', 'Metric')}
            />
            <div className="space-y-2">
              <div>
                <FieldLabel>{t('dashboardDesigner.config.metricField', 'Metric field')}</FieldLabel>
                <Input
                  value={config.metricField}
                  onChange={(v) => update('metricField', v)}
                  placeholder={t('dashboardDesigner.config.metricFieldPlaceholder', 'e.g. totalCandidates')}
                />
              </div>
              <div>
                <FieldLabel>{t('dashboardDesigner.config.metricLabel', 'Metric label')}</FieldLabel>
                <Input
                  value={config.metricLabel}
                  onChange={(v) => update('metricLabel', v)}
                  placeholder={t('dashboardDesigner.config.metricLabelPlaceholder', 'e.g. Total Candidates')}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>{t('dashboardDesigner.config.metricPrefix', 'Prefix')}</FieldLabel>
                  <Input value={config.metricPrefix} onChange={(v) => update('metricPrefix', v)} placeholder="$" />
                </div>
                <div>
                  <FieldLabel>{t('dashboardDesigner.config.metricSuffix', 'Suffix')}</FieldLabel>
                  <Input value={config.metricSuffix} onChange={(v) => update('metricSuffix', v)} placeholder="%" />
                </div>
              </div>
            </div>
          </div>
        )}

        {isChart && (
          <div>
            <SectionHeader
              icon={<Palette className="h-4 w-4" />}
              label={t('dashboardDesigner.config.chartOptions', 'Chart Options')}
            />
            <div className="space-y-3">
              <div>
                <FieldLabel>{t('dashboardDesigner.config.primaryColor', 'Primary color')}</FieldLabel>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.chartOptions.primaryColor}
                    onChange={(e) => updateChart('primaryColor', e.target.value)}
                    className="h-8 w-8 rounded border border-gray-200 dark:border-surface-700 cursor-pointer"
                  />
                  <Input
                    value={config.chartOptions.primaryColor}
                    onChange={(v) => updateChart('primaryColor', v)}
                    className="flex-1"
                  />
                </div>
              </div>
              <div>
                <FieldLabel>{t('dashboardDesigner.config.xAxisLabel', 'X axis label')}</FieldLabel>
                <Input
                  value={config.chartOptions.xAxisLabel}
                  onChange={(v) => updateChart('xAxisLabel', v)}
                />
              </div>
              <div>
                <FieldLabel>{t('dashboardDesigner.config.yAxisLabel', 'Y axis label')}</FieldLabel>
                <Input
                  value={config.chartOptions.yAxisLabel}
                  onChange={(v) => updateChart('yAxisLabel', v)}
                />
              </div>
              <div className="space-y-2">
                <Toggle
                  checked={config.chartOptions.showLegend}
                  onChange={(v) => updateChart('showLegend', v)}
                  label={t('dashboardDesigner.config.showLegend', 'Show legend')}
                />
                <Toggle
                  checked={config.chartOptions.showGrid}
                  onChange={(v) => updateChart('showGrid', v)}
                  label={t('dashboardDesigner.config.showGrid', 'Show grid')}
                />
                <Toggle
                  checked={config.chartOptions.showTooltip}
                  onChange={(v) => updateChart('showTooltip', v)}
                  label={t('dashboardDesigner.config.showTooltip', 'Show tooltip')}
                />
                {widgetType === 'bar-chart' && (
                  <Toggle
                    checked={config.chartOptions.stacked}
                    onChange={(v) => updateChart('stacked', v)}
                    label={t('dashboardDesigner.config.stacked', 'Stacked')}
                  />
                )}
                {widgetType === 'line-chart' && (
                  <Toggle
                    checked={config.chartOptions.smooth}
                    onChange={(v) => updateChart('smooth', v)}
                    label={t('dashboardDesigner.config.smooth', 'Smooth curves')}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {widgetType === 'text' && (
          <div>
            <SectionHeader
              icon={<AlignLeft className="h-4 w-4" />}
              label={t('dashboardDesigner.config.text', 'Text content')}
            />
            <textarea
              value={config.textContent}
              onChange={(e) => update('textContent', e.target.value)}
              placeholder={t('dashboardDesigner.config.textPlaceholder', 'Enter text or markdown...')}
              rows={6}
              className="w-full rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 dark:focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-brand-400 transition resize-y"
            />
          </div>
        )}

        {widgetType === 'iframe' && (
          <div>
            <SectionHeader
              icon={<Globe className="h-4 w-4" />}
              label={t('dashboardDesigner.config.iframeUrl', 'Iframe URL')}
            />
            <Input
              value={config.iframeUrl}
              onChange={(v) => update('iframeUrl', v)}
              placeholder={t('dashboardDesigner.config.iframeUrlPlaceholder', 'https://...')}
            />
          </div>
        )}

        <div>
          <SectionHeader
            icon={<Palette className="h-4 w-4" />}
            label={t('dashboardDesigner.config.conditionalFormatting', 'Conditional Formatting')}
          />
          {config.conditionalFormatting.map((rule) => (
            <div key={rule.id} className="space-y-1.5 mb-3 p-2 rounded-lg bg-gray-50 dark:bg-surface-800">
              <Input
                value={rule.field}
                onChange={(v) => updateConditionalRule(rule.id, 'field', v)}
                placeholder={t('dashboardDesigner.config.filterField', 'Field')}
              />
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={rule.operator}
                  onChange={(v) => updateConditionalRule(rule.id, 'operator', v)}
                  options={FILTER_OPERATORS.map((op) => ({
                    value: op,
                    label: t(`dashboardDesigner.config.operators.${op}`, op),
                  }))}
                />
                <Input
                  value={rule.value}
                  onChange={(v) => updateConditionalRule(rule.id, 'value', v)}
                  placeholder={t('dashboardDesigner.config.filterValue', 'Value')}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {CONDITION_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateConditionalRule(rule.id, 'color', c)}
                      className={cn(
                        'h-5 w-5 rounded-full border-2 transition',
                        rule.color === c
                          ? 'border-gray-900 dark:border-white scale-110'
                          : 'border-transparent',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => removeConditionalRule(rule.id)}
                  className="ml-auto text-xs text-red-500 hover:text-red-600 dark:text-red-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addConditionalRule}
            className="text-xs text-blue-600 dark:text-brand-400 hover:text-blue-700 dark:hover:text-brand-300 flex items-center gap-1 font-medium"
          >
            <Plus className="h-3 w-3" />
            {t('dashboardDesigner.config.addRule', 'Add rule')}
          </button>
        </div>
      </div>
    </div>
  );
}
