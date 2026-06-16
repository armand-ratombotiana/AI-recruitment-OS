'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Tag as TagIcon,
  Pencil,
  Trash2,
  RefreshCw,
  Palette,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  Briefcase,
  UserCircle2,
  FileText,
  CalendarClock,
  Globe,
  Hash,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import type { TagTypes } from '@/services/api/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  EmptyState,
  Breadcrumb,
  Modal,
  ConfirmDialog,
  ErrorState,
  Badge,
  useToast,
  TagChip,
} from '@/components';
import { useAuthStore } from '@/stores';
import { useLocaleStore, translate, formatRelativeTime } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';

const PRESET_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#6366f1',
  '#a855f7',
  '#64748b',
];

type EntityType = TagTypes.EntityType;

const ENTITY_TYPES: Array<{
  value: EntityType;
  labelKey: string;
  fallback: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: 'global', labelKey: 'tags.entityTypes.global', fallback: 'Global', icon: Globe },
  { value: 'candidate', labelKey: 'tags.entityTypes.candidate', fallback: 'Candidate', icon: UserCircle2 },
  { value: 'job', labelKey: 'tags.entityTypes.job', fallback: 'Job', icon: Briefcase },
  { value: 'interview', labelKey: 'tags.entityTypes.interview', fallback: 'Interview', icon: CalendarClock },
  { value: 'resume', labelKey: 'tags.entityTypes.resume', fallback: 'Resume', icon: FileText },
];

function normaliseColor(c: string | undefined | null, fallback: string): string {
  if (!c) return fallback;
  const v = c.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) return fallback;
  return v.toLowerCase();
}

function isValidName(name: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 50;
}

interface TagFormState {
  name: string;
  color: string;
  entity_type: EntityType;
  description: string;
}

const EMPTY_FORM: TagFormState = {
  name: '',
  color: '#3b82f6',
  entity_type: 'global',
  description: '',
};

export default function AdminTagsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const currentUser = useAuthStore((s) => s.user);
  const isAdmin = currentUser?.role === 'admin';

  const [tags, setTags] = useState<TagTypes.Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState<'all' | EntityType>('all');
  const [editing, setEditing] = useState<TagTypes.Tag | null>(null);
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [form, setForm] = useState<TagFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TagTypes.Tag | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { push } = useToast();

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await api.tags.list({ page_size: '200' });
        const data = Array.isArray(res?.data) ? res.data : [];
        setTags(data);
      } catch (err) {
        const msg =
          err instanceof APIError
            ? err.message
            : err instanceof Error
              ? err.message
              : t('tags.loadError', 'Could not load tags');
        setError(msg);
        setTags([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tags.filter((tag) => {
      if (entityFilter !== 'all' && tag.entity_type !== entityFilter) return false;
      if (q) {
        const blob = `${tag.name} ${tag.slug ?? ''} ${tag.description ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tags, search, entityFilter]);

  const grouped = useMemo(() => {
    const map = new Map<EntityType, TagTypes.Tag[]>();
    for (const def of ENTITY_TYPES) map.set(def.value, []);
    for (const tag of filtered) {
      const key = (tag.entity_type || 'global') as EntityType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tag);
    }
    return map;
  }, [filtered]);

  const entityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tags.length };
    for (const def of ENTITY_TYPES) {
      counts[def.value] = tags.filter((t) => (t.entity_type || 'global') === def.value).length;
    }
    return counts;
  }, [tags]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreatingOpen(true);
  }, []);

  const openEdit = useCallback((tag: TagTypes.Tag) => {
    setEditing(tag);
    setForm({
      name: tag.name,
      color: normaliseColor(tag.color, '#3b82f6'),
      entity_type: (tag.entity_type || 'global') as EntityType,
      description: tag.description ?? '',
    });
    setFormError(null);
    setCreatingOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    if (submitting) return;
    setCreatingOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }, [submitting]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);
      if (!isValidName(form.name)) {
        setFormError(
          t('tags.errors.nameInvalid', 'Name must be between 1 and 50 characters')
        );
        return;
      }
      if (form.description.length > 200) {
        setFormError(
          t('tags.errors.descriptionTooLong', 'Description must be 200 characters or less')
        );
        return;
      }
      setSubmitting(true);
      try {
        if (editing) {
          const updated = await api.tags.update(editing.id, {
            name: form.name.trim(),
            color: form.color,
            entity_type: form.entity_type,
            description: form.description.trim() || null,
          });
          setTags((prev) => prev.map((tg) => (tg.id === updated.id ? updated : tg)));
          push('success', t('tags.updated', 'Tag updated'));
        } else {
          const created = await api.tags.create({
            name: form.name.trim(),
            color: form.color,
            entity_type: form.entity_type,
            description: form.description.trim() || null,
          });
          setTags((prev) => [created, ...prev]);
          push('success', t('tags.created', 'Tag created'));
        }
        closeForm();
      } catch (err) {
        const msg =
          err instanceof APIError
            ? err.message
            : err instanceof Error
              ? err.message
              : t('tags.errors.saveFailed', 'Failed to save tag');
        setFormError(msg);
        push('error', msg);
      } finally {
        setSubmitting(false);
      }
    },
    [closeForm, editing, form, push, t]
  );

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.tags.delete(confirmDelete.id);
      setTags((prev) => prev.filter((tg) => tg.id !== confirmDelete.id));
      push('success', t('tags.deleted', 'Tag deleted'));
      setConfirmDelete(null);
    } catch (err) {
      const msg =
        err instanceof APIError
          ? err.message
          : err instanceof Error
            ? err.message
              : t('tags.errors.deleteFailed', 'Failed to delete tag');
      push('error', msg);
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, push, t]);

  if (!currentUser) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t('tags.loading', 'Loading tags…')}>
        <Skeleton width="40%" height={32} />
        <Skeleton width="60%" height={16} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={80} />
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6" role="alert" aria-live="assertive">
        <Breadcrumb />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('tags.title', 'Tag manager')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('tags.subtitle', 'Create and manage tags used across candidates, jobs, and more.')}
          </p>
        </div>
        <Card>
          <CardContent className="p-10 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400"
              aria-hidden="true"
            >
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t('tags.accessDenied', 'Access denied')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
              {t(
                'tags.accessDeniedDesc',
                'You need administrator privileges to manage tags.'
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6"><Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TagIcon className="h-6 w-6 text-gray-700 dark:text-gray-200" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {t('tags.title', 'Tag manager')}
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t(
              'tags.subtitle',
              'Create and manage tags used across candidates, jobs, and more.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={
              refreshing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )
            }
            onClick={() => load(true)}
            loading={refreshing}
            disabled={refreshing}
            aria-label={t('tags.refresh', 'Refresh tags')}
          >
            {t('common.refresh', 'Refresh')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={openCreate}
            aria-label={t('tags.create', 'Create tag')}
          >
            {t('tags.create', 'Create tag')}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('tags.search', 'Search tags…')}
                aria-label={t('tags.search', 'Search tags')}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div className="lg:w-64">
              <EntityFilter value={entityFilter} onChange={setEntityFilter} t={t} locale={locale} />
            </div>
          </div>
        </CardContent>
      </Card>

      <EntitySummary
        entityFilter={entityFilter}
        onChange={setEntityFilter}
        counts={entityCounts}
        t={t}
        locale={locale}
      />

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} height={64} />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title={t('tags.loadError', 'Could not load tags')}
          description={error}
          onRetry={() => load()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<TagIcon className="h-12 w-12" />}
          title={
            tags.length === 0
              ? t('tags.empty.title', 'No tags yet')
              : t('tags.empty.filteredTitle', 'No tags match your filters')
          }
          description={
            tags.length === 0
              ? t(
                  'tags.empty.desc',
                  'Create your first tag to start labeling candidates, jobs, and other entities.'
                )
              : t('tags.empty.filteredDesc', 'Try clearing the search or filter.')
          }
          action={
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={openCreate}
            >
              {t('tags.create', 'Create tag')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([entityKey, list]) => {
            if (list.length === 0) return null;
            const meta = ENTITY_TYPES.find((e) => e.value === entityKey);
            const Icon = meta?.icon ?? TagIcon;
            return (
              <section key={entityKey} aria-labelledby={`tags-entity-${entityKey}`}>
                <Card>
                  <CardHeader>
                    <CardTitle as="h2" className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gray-500" aria-hidden="true" />
                      <span id={`tags-entity-${entityKey}`}>
                        {t(`tags.entityTypes.${entityKey}`, meta?.fallback ?? entityKey)}
                      </span>
                      <Badge variant="default" size="sm">
                        {list.length}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      {t(
                        `tags.entityDescriptions.${entityKey}`,
                        meta?.fallback ? `${meta.fallback} tags` : 'Tags'
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ul className="divide-y divide-gray-100 dark:divide-surface-700">
                      {list.map((tag) => (
                        <TagRow
                          key={tag.id}
                          tag={tag}
                          onEdit={() => openEdit(tag)}
                          onDelete={() => setConfirmDelete(tag)}
                          t={t}
                          locale={locale}
                        />
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={creatingOpen}
        onClose={closeForm}
        title={editing ? t('tags.editTitle', 'Edit tag') : t('tags.createTitle', 'Create new tag')}
        description={
          editing
            ? t('tags.editDesc', 'Update the tag definition and color.')
            : t('tags.createDesc', 'Tags help you organize candidates, jobs, and more.')
        }
        size="md"
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300"
            >
              {formError}
            </div>
          )}
          <div>
            <label
              htmlFor="tag-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('tags.fields.name', 'Name')}
              <span className="text-red-500 ml-0.5" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="tag-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              maxLength={50}
              required
              placeholder={t('tags.fields.namePh', 'e.g. Senior, Remote, Top-priority')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div>
            <label
              htmlFor="tag-entity"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('tags.fields.entityType', 'Entity type')}
            </label>
            <select
              id="tag-entity"
              value={form.entity_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, entity_type: e.target.value as EntityType }))
              }
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100"
            >
              {ENTITY_TYPES.map((et) => (
                <option key={et.value} value={et.value}>
                  {t(et.labelKey, et.fallback)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              {t('tags.fields.color', 'Color')}
            </label>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup">
              {PRESET_COLORS.map((c) => {
                const selected = c.toLowerCase() === form.color.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    title={c}
                    className={
                      'h-6 w-6 rounded-full border-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ' +
                      (selected
                        ? 'border-gray-900 dark:border-white ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-surface-900'
                        : 'border-transparent')
                    }
                    style={{ backgroundColor: c }}
                  />
                );
              })}
              <label className="ml-1 inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      color: normaliseColor(e.target.value, f.color),
                    }))
                  }
                  className="h-6 w-6 cursor-pointer rounded border border-gray-200 dark:border-surface-700 bg-transparent p-0"
                  aria-label={t('tags.fields.customColor', 'Custom color')}
                />
                <span className="font-mono text-[10px] text-gray-500">{form.color}</span>
              </label>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <TagChip name={form.name || t('tags.preview', 'Preview')} color={form.color} />
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {t('tags.previewHelp', 'This is how the tag will appear.')}
              </span>
            </div>
          </div>
          <div>
            <label
              htmlFor="tag-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {t('tags.fields.description', 'Description')}
              <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">
                ({form.description.length}/200)
              </span>
            </label>
            <textarea
              id="tag-description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value.slice(0, 200) }))
              }
              rows={2}
              placeholder={t('tags.fields.descriptionPh', 'Optional context for teammates…')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-gray-100 dark:border-surface-700">
            <Button variant="secondary" onClick={closeForm} disabled={submitting} type="button">
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submitting}
              disabled={submitting}
              leftIcon={editing ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            >
              {editing ? t('common.save', 'Save') : t('tags.create', 'Create tag')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => !deleting && setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={t('tags.deleteTitle', 'Delete tag?')}
        description={
          confirmDelete
            ? t('tags.deleteDesc', '“{name}” will be removed from all entities that use it.')
                .replace('{name}', confirmDelete.name)
            : ''
        }
        confirmLabel={t('common.delete', 'Delete')}
        cancelLabel={t('common.cancel', 'Cancel')}
        variant="danger"
        loading={deleting}
        destructive
      />
    </div>
  );
}

function EntityFilter({
  value,
  onChange,
  t,
  locale,
}: {
  value: 'all' | EntityType;
  onChange: (v: 'all' | EntityType) => void;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const meta = value === 'all' ? null : ENTITY_TYPES.find((e) => e.value === value);
  const Icon = meta?.icon ?? Globe;
  const label = value === 'all' ? t('tags.allEntityTypes', 'All entity types') : t(meta!.labelKey, meta!.fallback);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-surface-800 dark:border-surface-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={'h-3.5 w-3.5 text-gray-400 transition ' + (open ? 'rotate-180' : '')} aria-hidden="true" />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-lg py-1"
        >
          <li>
            <button
              type="button"
              role="option"
              aria-selected={value === 'all'}
              onClick={() => {
                onChange('all');
                setOpen(false);
              }}
              className={
                'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ' +
                (value === 'all'
                  ? 'bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
                  : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-surface-800')
              }
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              {t('tags.allEntityTypes', 'All entity types')}
            </button>
          </li>
          {ENTITY_TYPES.map((et) => {
            const I = et.icon;
            return (
              <li key={et.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === et.value}
                  onClick={() => {
                    onChange(et.value);
                    setOpen(false);
                  }}
                  className={
                    'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ' +
                    (value === et.value
                      ? 'bg-blue-50 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-surface-800')
                  }
                >
                  <I className="h-3.5 w-3.5" aria-hidden="true" />
                  {t(et.labelKey, et.fallback)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* locale kept to ensure parity with other call-sites */}
      <span className="sr-only">{locale}</span>
    </div>
  );
}

function EntitySummary({
  entityFilter,
  onChange,
  counts,
  t,
  locale: _locale,
}: {
  entityFilter: 'all' | EntityType;
  onChange: (v: 'all' | EntityType) => void;
  counts: Record<string, number>;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const allChip: { value: 'all'; label: string; icon: React.ComponentType<{ className?: string }> } = {
    value: 'all',
    label: t('tags.allEntityTypes', 'All entity types'),
    icon: Globe,
  };
  const chips: Array<{ value: 'all' | EntityType; label: string; icon: React.ComponentType<{ className?: string }>; count: number }> = [
    { ...allChip, count: counts.all || 0 },
    ...ENTITY_TYPES.map((e) => ({
      value: e.value,
      label: t(e.labelKey, e.fallback),
      icon: e.icon,
      count: counts[e.value] || 0,
    })),
  ];
  return (
    <div
      role="tablist"
      aria-label={t('tags.filter.entityType', 'Filter by entity type')}
      className="flex flex-wrap items-center gap-2"
    >
      {chips.map((c) => {
        const Icon = c.icon;
        const active = entityFilter === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(c.value)}
            className={
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ' +
              (active
                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-brand-500/20 dark:text-brand-300 dark:border-brand-500/30'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-surface-900 dark:border-surface-700 dark:text-gray-200 dark:hover:bg-surface-800')
            }
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{c.label}</span>
            <span
              className={
                'rounded-full px-1.5 text-[10px] ' +
                (active ? 'bg-white/40 dark:bg-white/10' : 'bg-gray-100 dark:bg-surface-800')
              }
            >
              {c.count}
            </span>
          </button>
        );
      })}
      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
        <Hash className="h-3 w-3" aria-hidden="true" />
        {t('tags.totalCount', '{count} total').replace('{count}', String(counts.all || 0))}
      </span>
    </div>
  );
}

function TagRow({
  tag,
  onEdit,
  onDelete,
  t,
  locale: _locale,
}: {
  tag: TagTypes.Tag;
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string, fb?: string) => string;
  locale: Locale;
}) {
  const updated = tag.updated_at ? formatRelativeTime(tag.updated_at, 'en') : null;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <TagChip name={tag.name} color={tag.color} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{tag.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-2">
          <span className="font-mono">{tag.slug}</span>
          {tag.description ? (
            <>
              <span className="text-gray-300 dark:text-surface-600">·</span>
              <span className="truncate">{tag.description}</span>
            </>
          ) : null}
        </p>
      </div>
      {typeof tag.usage_count === 'number' && (
        <Badge variant="default" size="sm">
          {t('tags.usage', '{count} use(s)').replace('{count}', String(tag.usage_count))}
        </Badge>
      )}
      {updated && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 hidden md:inline">
          {updated}
        </span>
      )}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Pencil className="h-3.5 w-3.5" />}
          onClick={onEdit}
          aria-label={t('common.edit', 'Edit') + ' ' + tag.name}
        >
          {t('common.edit', 'Edit')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={<Trash2 className="h-3.5 w-3.5 text-red-500" />}
          onClick={onDelete}
          aria-label={t('common.delete', 'Delete') + ' ' + tag.name}
        >
          <span className="text-red-600 dark:text-red-400">{t('common.delete', 'Delete')}</span>
        </Button>
      </div>
    </li>
  );
}
