'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Edit3, ListChecks, Save, X } from 'lucide-react';
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
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { ReviewTypes } from '@/services/api/types';

const CATEGORIES = ['performance', 'communication', 'leadership', 'teamwork', 'innovation', 'general'];

export default function QuestionsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [cycles, setCycles] = useState<ReviewTypes.ReviewCycle[]>([]);
  const [selectedCycle, setSelectedCycle] = useState('');
  const [questions, setQuestions] = useState<ReviewTypes.ReviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReviewTypes.ReviewQuestion | null>(null);
  const [formText, setFormText] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCategory, setFormCategory] = useState('general');
  const [formWeight, setFormWeight] = useState('1');
  const [formOrder, setFormOrder] = useState('0');
  const [formRequired, setFormRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCycles = useCallback(() => {
    api.reviews.listCycles()
      .then((res) => {
        const data = (res as any).data || [];
        setCycles(data);
        if (data.length > 0 && !selectedCycle) setSelectedCycle(data[0].id);
      })
      .catch(() => { /* noop */ });
  }, [selectedCycle]);

  const loadQuestions = useCallback(() => {
    if (!selectedCycle) return;
    setLoading(true);
    api.reviews.getCycleQuestions(selectedCycle)
      .then((qs) => setQuestions(qs))
      .catch(() => setQuestions([]))
      .finally(() => setLoading(false));
  }, [selectedCycle]);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const filtered = categoryFilter === 'all'
    ? questions
    : questions.filter((q) => q.category === categoryFilter);

  const openCreate = () => {
    setEditing(null);
    setFormText('');
    setFormDesc('');
    setFormCategory('general');
    setFormWeight('1');
    setFormOrder(String(questions.length));
    setFormRequired(true);
    setModalOpen(true);
  };

  const openEdit = (q: ReviewTypes.ReviewQuestion) => {
    setEditing(q);
    setFormText(q.text);
    setFormDesc(q.description || '');
    setFormCategory(q.category);
    setFormWeight(String(q.weight));
    setFormOrder(String(q.order));
    setFormRequired(q.required);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedCycle || !formText.trim()) return;
    setSaving(true);
    try {
      await api.reviews.createCycleQuestion(selectedCycle, {
        cycle_id: selectedCycle,
        text: formText.trim(),
        description: formDesc.trim() || null,
        category: formCategory,
        weight: Number(formWeight) || 1,
        order: Number(formOrder) || 0,
        required: formRequired,
      });
      showToast('success', editing
        ? t('performanceReviews.questions.questionUpdated', 'Question updated')
        : t('performanceReviews.questions.questionCreated', 'Question created'));
      setModalOpen(false);
      loadQuestions();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (qId: string) => {
    try {
      await api.reviews.delete(qId);
      showToast('success', t('performanceReviews.questions.questionDeleted', 'Question deleted'));
      loadQuestions();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : String(err));
    }
  };

  const cycleOptions = cycles.map((c) => ({ value: c.id, label: c.name }));
  const categoryOptions = [
    { value: 'all', label: t('performanceReviews.questions.allCategories', 'All categories') },
    ...CATEGORIES.map((c) => ({ value: c, label: t(`performanceReviews.questions.categories.${c}`, c) })),
  ];
  const formCategoryOptions = CATEGORIES.map((c) => ({
    value: c,
    label: t(`performanceReviews.questions.categories.${c}`, c),
  }));

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('performanceReviews.questions.title', 'Questions')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('performanceReviews.questions.subtitle', 'Manage review questions by category.')}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate} disabled={!selectedCycle}>
          <Plus className="h-4 w-4 mr-2" />
          {t('performanceReviews.questions.createQuestion', 'Create question')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <SelectField
              id="select-cycle"
              value={selectedCycle}
              onChange={(e) => setSelectedCycle(e.target.value)}
              options={cycleOptions}
              className="sm:w-60"
            />
            <SelectField
              id="filter-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={categoryOptions}
              className="sm:w-48"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="h-12 w-12" />}
              title={t('performanceReviews.questions.noQuestions', 'No questions yet')}
              description={t('performanceReviews.questions.noQuestionsDesc', 'Create questions to use in performance reviews.')}
            />
          ) : (
            <div className="space-y-2">
              {filtered
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((q) => (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-surface-700"
                  >
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-6 text-center pt-0.5">
                      {q.order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {q.text}
                        {q.required && <span className="text-red-500 ml-1">*</span>}
                      </p>
                      {q.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{q.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="default" size="sm">
                          {t(`performanceReviews.questions.categories.${q.category}`, q.category)}
                        </Badge>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          w:{q.weight}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(q)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-500"
                        aria-label={t('performanceReviews.questions.editQuestion', 'Edit question')}
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(q.id)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500"
                        aria-label={t('performanceReviews.questions.deleteQuestion', 'Delete question')}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={
        editing
          ? t('performanceReviews.questions.editQuestion', 'Edit question')
          : t('performanceReviews.questions.createQuestion', 'Create question')
      }>
        <div className="space-y-4 p-4">
          <TextareaField
            id="q-text"
            label={t('performanceReviews.questions.text', 'Question text')}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            rows={2}
            required
          />
          <TextareaField
            id="q-desc"
            label={t('performanceReviews.questions.description', 'Description')}
            value={formDesc}
            onChange={(e) => setFormDesc(e.target.value)}
            rows={2}
          />
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              id="q-category"
              label={t('performanceReviews.questions.category', 'Category')}
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              options={formCategoryOptions}
            />
            <InputField
              id="q-weight"
              type="number"
              label={t('performanceReviews.questions.weight', 'Weight')}
              value={formWeight}
              onChange={(e) => setFormWeight(e.target.value)}
              min={0}
              step={0.1}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <InputField
              id="q-order"
              type="number"
              label={t('performanceReviews.questions.order', 'Order')}
              value={formOrder}
              onChange={(e) => setFormOrder(e.target.value)}
              min={0}
            />
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formRequired}
                  onChange={(e) => setFormRequired(e.target.checked)}
                  className="rounded border-gray-300 dark:border-surface-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('performanceReviews.questions.required', 'Required')}
                </span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving || !formText.trim()}>
              <Save className="h-4 w-4 mr-2" />
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
