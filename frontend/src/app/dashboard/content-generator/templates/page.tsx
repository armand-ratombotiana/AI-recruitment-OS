'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  FileText,
  Plus,
  ArrowLeft,
  Search,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { Button, Modal, useToast } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { TemplateCard } from '@/components/content-generator/template-card';
import type { ContentTemplate } from '@/components/content-generator/template-card';
import type { ContentType, ToneType } from '@/components/content-generator/generator-form';

const STORAGE_KEY = 'airos_content_templates';

const ALL_TYPES: ContentType[] = [
  'job_description',
  'email',
  'offer_letter',
  'rejection',
  'linkedin_post',
];

function loadTemplates(): ContentTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveTemplates(templates: ContentTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function TemplatesPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push } = useToast();

  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [filter, setFilter] = useState<ContentType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null);
  const [showPreview, setShowPreview] = useState<ContentTemplate | null>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState<ContentType>('job_description');
  const [formTone, setFormTone] = useState<ToneType>('professional');
  const [formContent, setFormContent] = useState('');

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  const filtered = useMemo(() => {
    let list = templates;
    if (filter !== 'all') list = list.filter((tpl) => tpl.contentType === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (tpl) =>
          tpl.name.toLowerCase().includes(q) ||
          tpl.description.toLowerCase().includes(q) ||
          tpl.content.toLowerCase().includes(q)
      );
    }
    return list;
  }, [templates, filter, search]);

  const openCreate = useCallback(() => {
    setEditingTemplate(null);
    setFormName('');
    setFormDesc('');
    setFormType('job_description');
    setFormTone('professional');
    setFormContent('');
    setShowModal(true);
  }, []);

  const openEdit = useCallback((tpl: ContentTemplate) => {
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormDesc(tpl.description);
    setFormType(tpl.contentType);
    setFormTone(tpl.tone as ToneType);
    setFormContent(tpl.content);
    setShowModal(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!formName.trim() || !formContent.trim()) {
      push('error', t('contentGenerator.templateRequired', 'Name and content are required'));
      return;
    }
    const now = new Date().toISOString();
    let updated: ContentTemplate[];
    if (editingTemplate) {
      updated = templates.map((tpl) =>
        tpl.id === editingTemplate.id
          ? { ...tpl, name: formName, description: formDesc, contentType: formType, tone: formTone, content: formContent, updatedAt: now }
          : tpl
      );
    } else {
      const newTpl: ContentTemplate = {
        id: `tpl-${Date.now().toString(36)}`,
        name: formName,
        description: formDesc,
        contentType: formType,
        tone: formTone,
        content: formContent,
        createdAt: now,
        updatedAt: now,
      };
      updated = [newTpl, ...templates];
    }
    setTemplates(updated);
    saveTemplates(updated);
    setShowModal(false);
    push('success', editingTemplate ? t('contentGenerator.templateUpdated', 'Template updated') : t('contentGenerator.templateCreated', 'Template created'));
  }, [editingTemplate, formName, formDesc, formType, formTone, formContent, templates, push, t]);

  const handleDelete = useCallback(
    (tpl: ContentTemplate) => {
      const updated = templates.filter((t) => t.id !== tpl.id);
      setTemplates(updated);
      saveTemplates(updated);
      push('success', t('contentGenerator.templateDeleted', 'Template deleted'));
    },
    [templates, push, t]
  );

  const handleUse = useCallback(
    (tpl: ContentTemplate) => {
      setShowPreview(tpl);
    },
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/content-generator">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              {t('common.back', 'Back')}
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              <FileText className="h-6 w-6 text-blue-500" />
              {t('contentGenerator.templatesTitle', 'Content Templates')}
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t(
                'contentGenerator.templatesSubtitle',
                'Manage your reusable content templates.'
              )}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={openCreate}
        >
          {t('contentGenerator.createTemplate', 'Create template')}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('contentGenerator.searchTemplates', 'Search templates...')}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              filter === 'all'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-800 dark:text-gray-400 dark:hover:bg-surface-700'
            }`}
          >
            {t('common.filter', 'All')}
          </button>
          {ALL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilter(type)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                filter === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-surface-800 dark:text-gray-400 dark:hover:bg-surface-700'
              }`}
            >
              {t(`contentGenerator.types.${type}`, type.replace(/_/g, ' '))}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 p-12 text-center dark:border-surface-700 dark:bg-surface-800/30">
          <FileText className="mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {t('contentGenerator.noTemplates', 'No templates found')}
          </p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            {t(
              'contentGenerator.noTemplatesDesc',
              'Create your first template to get started.'
            )}
          </p>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            className="mt-4"
          >
            {t('contentGenerator.createTemplate', 'Create template')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tpl) => (
            <TemplateCard
              key={tpl.id}
              template={tpl}
              onUse={handleUse}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={
          editingTemplate
            ? t('contentGenerator.editTemplate', 'Edit template')
            : t('contentGenerator.createTemplate', 'Create template')
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('contentGenerator.templateName', 'Template name')}
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t('contentGenerator.templateNamePlaceholder', 'e.g. Standard JD for Engineers')}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('contentGenerator.templateDescription', 'Description')}
            </label>
            <input
              type="text"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder={t('contentGenerator.templateDescriptionPlaceholder', 'Brief description...')}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('contentGenerator.contentType', 'Content type')}
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as ContentType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
              >
                {ALL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`contentGenerator.types.${type}`, type.replace(/_/g, ' '))}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('contentGenerator.tone', 'Tone')}
              </label>
              <select
                value={formTone}
                onChange={(e) => setFormTone(e.target.value as ToneType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
              >
                <option value="professional">{t('contentGenerator.tones.professional', 'Professional')}</option>
                <option value="friendly">{t('contentGenerator.tones.friendly', 'Friendly')}</option>
                <option value="formal">{t('contentGenerator.tones.formal', 'Formal')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('contentGenerator.templateContent', 'Template content')}
            </label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={10}
              placeholder={t('contentGenerator.templateContentPlaceholder', 'Write your template content here...')}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              {editingTemplate ? t('common.save', 'Save') : t('contentGenerator.createTemplate', 'Create template')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showPreview !== null}
        onClose={() => setShowPreview(null)}
        title={showPreview?.name || ''}
      >
        {showPreview && (
          <div className="space-y-3">
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-surface-900">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                {showPreview.content}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowPreview(null)}>
                {t('common.close', 'Close')}
              </Button>
              <Link href="/dashboard/content-generator">
                <Button variant="primary" size="sm" onClick={() => setShowPreview(null)}>
                  {t('contentGenerator.useTemplate', 'Use template')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
