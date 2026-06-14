'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Workflow, Users, ListChecks, ToggleLeft, ToggleRight } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  InputField,
  SelectField,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { WorkflowTypes } from '@/services/api/types';

export default function OnboardingPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [workflows, setWorkflows] = useState<WorkflowTypes.Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.workflows
      .list()
      .then((res) => {
        setWorkflows(res.data || res.items || []);
      })
      .catch((err) => {
        setError(err instanceof APIError ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleActive = async (wf: WorkflowTypes.Workflow) => {
    try {
      if (wf.active || wf.is_active) {
        await api.workflows.deactivate(wf.id);
      } else {
        await api.workflows.activate(wf.id);
      }
      loadData();
    } catch {
      /* noop */
    }
  };

  const filtered = useMemo(() => {
    return workflows.filter((wf) => {
      if (activeFilter === 'active' && !wf.active && !wf.is_active) return false;
      if (activeFilter === 'inactive' && (wf.active || wf.is_active)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          wf.name.toLowerCase().includes(q) ||
          (wf.description || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [workflows, activeFilter, search]);

  const activeOptions = [
    { value: 'all', label: t('onboarding.workflows.allStatuses', 'All') },
    { value: 'active', label: t('onboarding.workflows.active', 'Active') },
    { value: 'inactive', label: t('onboarding.workflows.inactive', 'Inactive') },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('onboarding.workflows.title', 'Onboarding Workflows')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {workflows.length} {t('onboarding.workflows.totalWorkflows', 'total workflows')}
          </p>
        </div>
        <Link href="/dashboard/onboarding/new">
          <Button variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            {t('onboarding.workflows.createWorkflow', 'Create workflow')}
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <InputField
                id="search-workflows"
                type="text"
                placeholder={t('onboarding.workflows.search', 'Search workflows…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <SelectField
              id="filter-active"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              options={activeOptions}
              className="sm:w-40"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title={t('onboarding.workflows.couldntLoad', "Couldn't load workflows")}
              error={error}
              onRetry={loadData}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Workflow className="h-12 w-12" />}
              title={
                workflows.length === 0
                  ? t('onboarding.workflows.noWorkflowsYet', 'No workflows yet')
                  : t('onboarding.workflows.noWorkflowsFound', 'No workflows found')
              }
              description={
                workflows.length === 0
                  ? t('onboarding.workflows.noWorkflowsDesc', 'Create your first onboarding workflow to get started.')
                  : t('onboarding.workflows.tryAdjusting', 'Try adjusting your filters.')
              }
              action={
                workflows.length === 0 ? (
                  <Link href="/dashboard/onboarding/new">
                    <Button variant="primary">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('onboarding.workflows.createWorkflow', 'Create workflow')}
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((wf) => {
                const isActive = wf.active || wf.is_active;
                const stepCount = wf.steps?.length || 0;
                return (
                  <Link key={wf.id} href={`/dashboard/onboarding/${wf.id}`}>
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {wf.name}
                            </h3>
                            <Badge variant={isActive ? 'success' : 'default'}>
                              {isActive
                                ? t('onboarding.workflows.active', 'Active')
                                : t('onboarding.workflows.inactive', 'Inactive')}
                            </Badge>
                          </div>
                          {wf.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                              {wf.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <ListChecks className="h-3.5 w-3.5" />
                              <span>
                                {stepCount} {t('onboarding.workflows.steps', 'steps')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              <span>
                                {wf.execution_count || wf.runs || 0}{' '}
                                {t('onboarding.workflows.candidates', 'candidates')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleActive(wf);
                            }}
                          >
                            {isActive ? (
                              <ToggleRight className="h-4 w-4 mr-1 text-green-500" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 mr-1" />
                            )}
                            {isActive
                              ? t('onboarding.workflows.deactivate', 'Deactivate')
                              : t('onboarding.workflows.activate', 'Activate')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
