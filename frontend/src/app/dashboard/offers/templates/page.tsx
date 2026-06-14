'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  FileText,
  Edit,
  Trash2,
  Eye,
  X,
  Save,
  FilePlus,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  InputField,
  TextareaField,
  ConfirmDialog,
  useToast,
  Modal,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { OfferTypes } from '@/services/api/types';

export default function OfferTemplatesPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [templates, setTemplates] = useState<OfferTypes.OfferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OfferTypes.OfferTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<OfferTypes.OfferTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OfferTypes.OfferTemplate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBody, setFormBody] = useState('');

  const loadTemplates = useCallback(() => {
    setLoading(true);
    setError(null);
    api.offers
      .listTemplates()
      .then((res) => setTemplates(res.data || []))
      .catch((err) => setError(err instanceof APIError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openCreate = () => {
    setEditingTemplate(null);
    setFormName('');
    setFormDescription('');
    setFormBody('');
    setShowModal(true);
  };

  const openEdit = (tmpl: OfferTypes.OfferTemplate) => {
    setEditingTemplate(tmpl);
    setFormName(tmpl.name);
    setFormDescription(tmpl.description);
    setFormBody(tmpl.body);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      if (editingTemplate) {
        showToast('success', t('offers.templates.updated', 'Template updated'));
      } else {
        showToast('success', t('offers.templates.created', 'Template created'));
      }
      setShowModal(false);
      loadTemplates();
    } catch (err) {
      showToast(
        'error',
        err instanceof APIError ? err.message : t('offers.templates.saveFailed', 'Failed to save template'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      showToast('success', t('offers.templates.deleted', 'Template deleted'));
      loadTemplates();
    } catch (err) {
      showToast(
        'error',
        err instanceof APIError ? err.message : t('offers.templates.deleteFailed', 'Failed to delete template'),
      );
    } finally {
      setSubmitting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('offers.templates.title', 'Offer templates')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('offers.templates.subtitle', 'Manage reusable offer templates')}
          </p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <FilePlus className="h-4 w-4 mr-2" />
          {t('offers.templates.createTemplate', 'Create template')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title={t('offers.templates.couldntLoad', "Couldn't load templates")}
              error={error}
              onRetry={loadTemplates}
            />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title={t('offers.templates.noTemplates', 'No templates yet')}
              description={t(
                'offers.templates.noTemplatesDesc',
                'Create your first offer template to speed up offer creation.',
              )}
              action={
                <Button variant="primary" onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('offers.templates.createTemplate', 'Create template')}
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {templates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  className="p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {tmpl.name}
                      </h3>
                      {tmpl.description && (
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                          {tmpl.description}
                        </p>
                      )}
                      {tmpl.body && (
                        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 line-clamp-3 font-mono">
                          {tmpl.body}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewTemplate(tmpl)}
                        aria-label={t('common.view', 'View')}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(tmpl)}
                        aria-label={t('common.edit', 'Edit')}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(tmpl)}
                        aria-label={t('common.delete', 'Delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          editingTemplate
            ? t('offers.templates.editTemplate', 'Edit template')
            : t('offers.templates.createTemplate', 'Create template')
        }
      >
        <div className="space-y-4 p-6">
          <InputField
            id="tmpl-name"
            label={t('offers.templates.fields.name', 'Name *')}
            required
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder={t('offers.templates.placeholders.name', 'Standard offer')}
            disabled={submitting}
          />
          <TextareaField
            id="tmpl-desc"
            label={t('offers.templates.fields.description', 'Description')}
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            placeholder={t(
              'offers.templates.placeholders.description',
              'Brief description of this template…',
            )}
            rows={2}
            disabled={submitting}
            maxLength={500}
          />
          <TextareaField
            id="tmpl-body"
            label={t('offers.templates.fields.body', 'Template body')}
            value={formBody}
            onChange={(e) => setFormBody(e.target.value)}
            placeholder={t(
              'offers.templates.placeholders.body',
              'Dear {{candidate_name}},\n\nWe are pleased to offer you the position of {{job_title}}…',
            )}
            rows={10}
            disabled={submitting}
            maxLength={10000}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-surface-700">
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={submitting}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={submitting}
              disabled={submitting || !formName.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save', 'Save')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate?.name || ''}
      >
        <div className="p-6 space-y-4">
          {previewTemplate?.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400">{previewTemplate.description}</p>
          )}
          <div className="p-4 bg-gray-50 dark:bg-surface-800 rounded-lg">
            <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
              {previewTemplate?.body || t('offers.templates.noBody', 'No template body.')}
            </pre>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setPreviewTemplate(null)}>
              <X className="h-4 w-4 mr-2" />
              {t('common.close', 'Close')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={t('offers.templates.confirmDeleteTitle', 'Delete template?')}
        description={t(
          'offers.templates.confirmDeleteDesc',
          'This will permanently delete this template. This action cannot be undone.',
        )}
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
