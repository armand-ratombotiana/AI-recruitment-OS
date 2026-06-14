'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, CalendarRange, Save, X } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  Breadcrumb,
  InputField,
  TextareaField,
  SelectField,
  Modal,
  useToast,
} from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import type { ReviewTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger'> = {
  open: 'success',
  closed: 'default',
  archived: 'warning',
};

export default function CyclesPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [cycles, setCycles] = useState<ReviewTypes.ReviewCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewTypes.ReviewCycle | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCycles = useCallback(() => {
    setLoading(true);
    api.reviews.listCycles()
      .then((res) => setCycles((res as any).data || []))
      .catch(() => setCycles([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const openCreate = () => {
    setEditing(null);
    setFormName('');
    setFormDesc('');
    setFormStart('');
    setFormEnd('');
    setModalOpen(true);
  };

  const openEdit = (c: ReviewTypes.ReviewCycle) => {
    setEditing(c);
    setFormName(c.name);
    setFormDesc(c.description || '');
    setFormStart(c.start_date);
    setFormEnd(c.end_date);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formStart || !formEnd) return;
    setSaving(true);
    try {
      if (editing) {
        await api.reviews.updateCycle(editing.id, {
          name: formName.trim(),
          description: formDesc.trim() || null,
          start_date: formStart,
          end_date: formEnd,
        });
        showToast('success', t('performanceReviews.cycles.cycleUpdated', 'Cycle updated successfully'));
      } else {
        await api.reviews.createCycle({
          name: formName.trim(),
          description: formDesc.trim() || null,
          start_date: formStart,
          end_date: formEnd,
        });
        showToast('success', t('performanceReviews.cycles.cycleCreated', 'Cycle created successfully'));
      }
      setModalOpen(false);
      loadCycles();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cycleId: string) => {
    try {
      await api.reviews.deleteCycle(cycleId);
      showToast('success', t('performanceReviews.cycles.cycleDeleted', 'Cycle deleted'));
      loadCycles();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('performanceReviews.cycles.title', 'Review Cycles')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('performanceReviews.cycles.subtitle', 'Manage performance review cycles.')}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t('performanceReviews.cycles.createCycle', 'Create cycle')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : cycles.length === 0 ? (
            <EmptyState
              icon={<CalendarRange className="h-12 w-12" />}
              title={t('performanceReviews.cycles.noCycles', 'No cycles yet')}
              description={t('performanceReviews.cycles.noCyclesDesc', 'Create a review cycle to organize performance reviews.')}
              action={
                <Button variant="primary" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('performanceReviews.cycles.createCycle', 'Create cycle')}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {cycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 dark:border-surface-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{cycle.name}</h3>
                      <Badge variant={STATUS_VARIANT[cycle.status] || 'default'}>
                        {t(`performanceReviews.cycles.statuses.${cycle.status}`, cycle.status)}
                      </Badge>
                    </div>
                    {cycle.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{cycle.description}</p>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {formatDate(cycle.start_date, locale)} — {formatDate(cycle.end_date, locale)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(cycle)}
                      className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-500"
                      aria-label={t('performanceReviews.cycles.editCycle', 'Edit cycle')}
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cycle.id)}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"
                      aria-label={t('performanceReviews.cycles.confirmDelete', 'Delete cycle')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editing
            ? t('performanceReviews.cycles.editCycle', 'Edit cycle')
            : t('performanceReviews.cycles.createCycle', 'Create cycle')
        }
      >
        <div className="space-y-4 p-4">
          <InputField
            id="cycle-name"
            type="text"
            label={t('performanceReviews.cycles.name', 'Name')}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
          <TextareaField
            id="cycle-desc"
            label={t('performanceReviews.cycles.description', 'Description')}
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-4">
            <InputField
              id="cycle-start"
              type="date"
              label={t('performanceReviews.cycles.startDate', 'Start date')}
              value={formStart}
              onChange={(e) => setFormStart(e.target.value)}
              required
            />
            <InputField
              id="cycle-end"
              type="date"
              label={t('performanceReviews.cycles.endDate', 'End date')}
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={saving || !formName.trim() || !formStart || !formEnd}
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
