'use client';

import { useState, useMemo } from 'react';
import { DataTableV2, Badge, Breadcrumb } from '@/components';
import type { ColumnV2 } from '@/components/ui/data-table-v2';
import { useLocaleStore, translate } from '@/stores/locale-store';

interface DemoRow {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: 'active' | 'inactive' | 'pending';
  salary: number;
  start_date: string;
  skills: string[];
  rating: number;
  location: string;
  notes: string;
}

const DEMO_DATA: DemoRow[] = [
  { id: '1', name: 'Alice Johnson', email: 'alice@example.com', role: 'Engineer', department: 'Engineering', status: 'active', salary: 95000, start_date: '2024-01-15', skills: ['React', 'TypeScript', 'Node.js'], rating: 4.5, location: 'New York', notes: 'Top performer' },
  { id: '2', name: 'Bob Smith', email: 'bob@example.com', role: 'Designer', department: 'Design', status: 'active', salary: 85000, start_date: '2024-02-20', skills: ['Figma', 'CSS', 'UX Research'], rating: 4.2, location: 'San Francisco', notes: '' },
  { id: '3', name: 'Carol Williams', email: 'carol@example.com', role: 'PM', department: 'Product', status: 'pending', salary: 105000, start_date: '2024-03-10', skills: ['Agile', 'Jira', 'Analytics'], rating: 4.8, location: 'London', notes: 'Leading Q2 initiative' },
  { id: '4', name: 'David Brown', email: 'david@example.com', role: 'Engineer', department: 'Engineering', status: 'active', salary: 110000, start_date: '2023-11-01', skills: ['Python', 'AWS', 'Docker'], rating: 4.0, location: 'Berlin', notes: '' },
  { id: '5', name: 'Eva Martinez', email: 'eva@example.com', role: 'Data Scientist', department: 'Data', status: 'active', salary: 120000, start_date: '2023-09-15', skills: ['Python', 'ML', 'SQL'], rating: 4.7, location: 'Remote', notes: 'ML pipeline owner' },
  { id: '6', name: 'Frank Lee', email: 'frank@example.com', role: 'DevOps', department: 'Engineering', status: 'inactive', salary: 100000, start_date: '2023-06-01', skills: ['Kubernetes', 'Terraform', 'CI/CD'], rating: 3.8, location: 'Toronto', notes: 'On leave' },
  { id: '7', name: 'Grace Kim', email: 'grace@example.com', role: 'QA Engineer', department: 'Engineering', status: 'active', salary: 80000, start_date: '2024-04-01', skills: ['Selenium', 'Jest', 'Cypress'], rating: 4.1, location: 'Seoul', notes: '' },
  { id: '8', name: 'Henry Chen', email: 'henry@example.com', role: 'Engineer', department: 'Engineering', status: 'active', salary: 98000, start_date: '2024-01-20', skills: ['Go', 'gRPC', 'PostgreSQL'], rating: 4.3, location: 'Singapore', notes: 'Backend lead' },
  { id: '9', name: 'Iris Patel', email: 'iris@example.com', role: 'Designer', department: 'Design', status: 'pending', salary: 88000, start_date: '2024-05-15', skills: ['Figma', 'Illustration', 'Motion'], rating: 4.6, location: 'Mumbai', notes: 'Starting soon' },
  { id: '10', name: 'Jack Wilson', email: 'jack@example.com', role: 'PM', department: 'Product', status: 'active', salary: 115000, start_date: '2023-08-01', skills: ['Strategy', 'Roadmapping', 'OKRs'], rating: 4.4, location: 'Austin', notes: '' },
  { id: '11', name: 'Karen Davis', email: 'karen@example.com', role: 'Engineer', department: 'Engineering', status: 'active', salary: 102000, start_date: '2023-12-10', skills: ['React', 'GraphQL', 'Redis'], rating: 4.0, location: 'Chicago', notes: '' },
  { id: '12', name: 'Leo Garcia', email: 'leo@example.com', role: 'Data Scientist', department: 'Data', status: 'inactive', salary: 118000, start_date: '2023-07-20', skills: ['R', 'TensorFlow', 'Spark'], rating: 3.9, location: 'Madrid', notes: 'Transferred' },
];

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'default'> = {
  active: 'success',
  inactive: 'default',
  pending: 'warning',
};

export default function DataTableV2DemoPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [selected, setSelected] = useState<string[]>([]);
  const [density, setDensity] = useState<'compact' | 'normal' | 'comfortable'>('normal');

  const columns = useMemo<ColumnV2<DemoRow>[]>(() => [
    {
      key: 'name',
      label: t('dataTableV2.demo.name', 'Name'),
      width: 200,
      editable: true,
      pinned: 'left',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
            {row.name.split(' ').map((n) => n[0]).join('')}
          </div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{row.name}</span>
        </div>
      ),
      expandRender: (row) => (
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <p><strong>Email:</strong> {row.email}</p>
          <p><strong>Notes:</strong> {row.notes || '—'}</p>
          <p><strong>Skills:</strong> {row.skills.join(', ')}</p>
        </div>
      ),
    },
    { key: 'email', label: t('dataTableV2.demo.email', 'Email'), width: 180, editable: true },
    { key: 'role', label: t('dataTableV2.demo.role', 'Role'), width: 120, editable: true },
    { key: 'department', label: t('dataTableV2.demo.department', 'Department'), width: 130, editable: true },
    {
      key: 'status',
      label: t('dataTableV2.demo.status', 'Status'),
      width: 110,
      editable: true,
      render: (row) => <Badge variant={STATUS_VARIANT[row.status] || 'default'} size="sm" dot>{row.status}</Badge>,
    },
    {
      key: 'salary',
      label: t('dataTableV2.demo.salary', 'Salary'),
      width: 120,
      align: 'right',
      render: (row) => <span className="font-medium">${row.salary.toLocaleString()}</span>,
    },
    { key: 'start_date', label: t('dataTableV2.demo.startDate', 'Start Date'), width: 120 },
    {
      key: 'skills',
      label: t('dataTableV2.demo.skills', 'Skills'),
      width: 200,
      sortable: false,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.skills.slice(0, 2).map((s) => (
            <span key={s} className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-700 font-medium dark:bg-surface-800 dark:text-gray-200">{s}</span>
          ))}
          {row.skills.length > 2 && <span className="text-xs text-gray-400">+{row.skills.length - 2}</span>}
        </div>
      ),
    },
    {
      key: 'rating',
      label: t('dataTableV2.demo.rating', 'Rating'),
      width: 90,
      align: 'center',
      render: (row) => (
        <span className="font-bold text-amber-600 dark:text-amber-400">{row.rating.toFixed(1)}</span>
      ),
    },
    { key: 'location', label: t('dataTableV2.demo.location', 'Location'), width: 130, editable: true },
  ], [t]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('dataTableV2.demo.title', 'DataTable V2 Demo')}
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('dataTableV2.demo.description', 'Interactive showcase of all DataTable V2 features: sorting, filtering, resizing, reordering, pinning, saved views, keyboard navigation, inline editing, export, and virtualization.')}
        </p>
      </div>

      <Breadcrumb />

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('dataTableV2.demo.density', 'Density')}:
        </span>
        <div className="flex items-center gap-1 bg-white dark:bg-surface-800 border border-gray-200 dark:border-surface-700 rounded-lg p-1">
          {(['compact', 'normal', 'comfortable'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                density === d
                  ? 'bg-blue-50 text-blue-600 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-surface-700'
              }`}
              aria-pressed={density === d}
            >
              {t(`dataTableV2.demo.density.${d}`, d.charAt(0).toUpperCase() + d.slice(1))}
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <span className="text-sm text-blue-600 dark:text-brand-400 font-medium">
            {selected.length} {t('dataTableV2.demo.rowsSelected', 'row(s) selected')}
          </span>
        )}
      </div>

      <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 overflow-hidden">
        <DataTableV2<DemoRow>
          columns={columns}
          data={DEMO_DATA}
          rowKey={(row) => row.id}
          storageKey="dev-data-table-demo"
          selectable
          selectedRowKeys={selected}
          onSelectionChange={(keys) => setSelected(keys)}
          density={density}
          maxHeight="500px"
          enableColumnResize
          enableColumnReorder
          enablePinning
          enableExpansion
          enableInlineEdit
          enableCopyPaste
          enableExport
          enableFilters
          enableSavedViews
          enableKeyboardNav
          searchable
          searchPlaceholder={t('dataTableV2.demo.searchPlaceholder', 'Search demo data...')}
          caption={t('dataTableV2.demo.caption', 'DataTable V2 feature demonstration table')}
          ariaLabel={t('dataTableV2.demo.ariaLabel', 'Demo data table')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <FeatureCard
          title={t('dataTableV2.demo.features.sorting.title', 'Sorting')}
          description={t('dataTableV2.demo.features.sorting.desc', 'Click column headers to sort asc/desc/none. Tri-state cycling.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.filtering.title', 'Column Filters')}
          description={t('dataTableV2.demo.features.filtering.desc', 'Toggle the filter button to show per-column filter inputs.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.resize.title', 'Column Resize')}
          description={t('dataTableV2.demo.features.resize.desc', 'Drag the right edge of any column header to resize.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.reorder.title', 'Column Reorder')}
          description={t('dataTableV2.demo.features.reorder.desc', 'Drag column headers by the grip icon to reorder.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.pin.title', 'Column Pinning')}
          description={t('dataTableV2.demo.features.pin.desc', 'Use the column settings menu to pin columns left or right.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.views.title', 'Saved Views')}
          description={t('dataTableV2.demo.features.views.desc', 'Save and restore column layout, filters, and sort state.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.keyboard.title', 'Keyboard Navigation')}
          description={t('dataTableV2.demo.features.keyboard.desc', 'Arrow keys, Tab, Enter to edit, Escape to cancel, Ctrl+C to copy.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.edit.title', 'Inline Editing')}
          description={t('dataTableV2.demo.features.edit.desc', 'Double-click editable cells to edit in place. Press Enter to commit.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.export.title', 'Export')}
          description={t('dataTableV2.demo.features.export.desc', 'Export visible data to CSV or JSON via the download button.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.virtual.title', 'Virtualization')}
          description={t('dataTableV2.demo.features.virtual.desc', 'Auto-enabled for 100+ rows using react-window for smooth scrolling.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.expand.title', 'Row Expansion')}
          description={t('dataTableV2.demo.features.expand.desc', 'Click the chevron to expand rows and show additional details.')}
        />
        <FeatureCard
          title={t('dataTableV2.demo.features.dark.title', 'Dark Mode')}
          description={t('dataTableV2.demo.features.dark.desc', 'Full dark mode support with surface-level color tokens.')}
        />
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-surface-900 rounded-xl border border-gray-200 dark:border-surface-700 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
    </div>
  );
}
