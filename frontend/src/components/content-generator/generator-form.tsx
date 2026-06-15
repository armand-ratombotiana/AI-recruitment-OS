'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  FileText,
  Mail,
  FileCheck,
  XCircle,
  Linkedin,
  Briefcase,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

export type ContentType =
  | 'job_description'
  | 'email'
  | 'offer_letter'
  | 'rejection'
  | 'linkedin_post';

export type ToneType = 'professional' | 'friendly' | 'formal';

export interface GeneratorFormData {
  contentType: ContentType;
  tone: ToneType;
  jobTitle: string;
  company: string;
  requirements: string;
  candidateName: string;
  candidateEmail: string;
  additionalContext: string;
  templateId?: string;
}

interface GeneratorFormProps {
  onGenerate: (data: GeneratorFormData) => void;
  loading: boolean;
  initialData?: Partial<GeneratorFormData>;
}

const CONTENT_TYPES: Array<{
  value: ContentType;
  icon: typeof FileText;
  gradient: string;
}> = [
  { value: 'job_description', icon: Briefcase, gradient: 'from-blue-500 to-indigo-600' },
  { value: 'email', icon: Mail, gradient: 'from-purple-500 to-pink-600' },
  { value: 'offer_letter', icon: FileCheck, gradient: 'from-emerald-500 to-teal-600' },
  { value: 'rejection', icon: XCircle, gradient: 'from-red-500 to-rose-600' },
  { value: 'linkedin_post', icon: Linkedin, gradient: 'from-sky-500 to-blue-600' },
];

const TONES: Array<{ value: ToneType }> = [
  { value: 'professional' },
  { value: 'friendly' },
  { value: 'formal' },
];

const DEFAULT_FORM: GeneratorFormData = {
  contentType: 'job_description',
  tone: 'professional',
  jobTitle: '',
  company: '',
  requirements: '',
  candidateName: '',
  candidateEmail: '',
  additionalContext: '',
};

export function GeneratorForm({ onGenerate, loading, initialData }: GeneratorFormProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [form, setForm] = useState<GeneratorFormData>({
    ...DEFAULT_FORM,
    ...initialData,
  });

  const update = useCallback(
    <K extends keyof GeneratorFormData>(key: K, value: GeneratorFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const showCandidateFields = useMemo(
    () => ['email', 'offer_letter', 'rejection'].includes(form.contentType),
    [form.contentType]
  );

  const showJobFields = useMemo(
    () => ['job_description', 'email', 'offer_letter', 'linkedin_post'].includes(form.contentType),
    [form.contentType]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onGenerate(form);
    },
    [form, onGenerate]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('contentGenerator.contentType', 'Content type')}
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {CONTENT_TYPES.map((ct) => {
            const Icon = ct.icon;
            const active = form.contentType === ct.value;
            return (
              <button
                key={ct.value}
                type="button"
                onClick={() => update('contentType', ct.value)}
                className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-brand-500 dark:bg-brand-500/10'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm dark:border-surface-700 dark:bg-surface-800 dark:hover:border-surface-600'
                }`}
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${ct.gradient} text-white transition-transform group-hover:scale-105`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={`text-xs font-medium text-center ${
                    active
                      ? 'text-blue-700 dark:text-brand-300'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {t(`contentGenerator.types.${ct.value}`, ct.value.replace(/_/g, ' '))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('contentGenerator.tone', 'Tone')}
        </label>
        <div className="flex gap-2">
          {TONES.map((tone) => {
            const active = form.tone === tone.value;
            return (
              <button
                key={tone.value}
                type="button"
                onClick={() => update('tone', tone.value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-400 dark:hover:border-surface-600'
                }`}
              >
                {t(`contentGenerator.tones.${tone.value}`, tone.value)}
              </button>
            );
          })}
        </div>
      </div>

      {showJobFields && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="cg-job-title"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('contentGenerator.jobTitle', 'Job title')}
            </label>
            <input
              id="cg-job-title"
              type="text"
              value={form.jobTitle}
              onChange={(e) => update('jobTitle', e.target.value)}
              placeholder={t('contentGenerator.jobTitlePlaceholder', 'e.g. Senior Frontend Engineer')}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="cg-company"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('contentGenerator.company', 'Company name')}
            </label>
            <input
              id="cg-company"
              type="text"
              value={form.company}
              onChange={(e) => update('company', e.target.value)}
              placeholder={t('contentGenerator.companyPlaceholder', 'e.g. Acme Corp')}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="cg-requirements"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('contentGenerator.requirements', 'Requirements / Key details')}
            </label>
            <textarea
              id="cg-requirements"
              value={form.requirements}
              onChange={(e) => update('requirements', e.target.value)}
              rows={4}
              placeholder={t(
                'contentGenerator.requirementsPlaceholder',
                'List key requirements, skills, benefits...'
              )}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>
        </div>
      )}

      {showCandidateFields && (
        <div className="space-y-4">
          <div>
            <label
              htmlFor="cg-candidate-name"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('contentGenerator.candidateName', 'Candidate name')}
            </label>
            <input
              id="cg-candidate-name"
              type="text"
              value={form.candidateName}
              onChange={(e) => update('candidateName', e.target.value)}
              placeholder={t('contentGenerator.candidateNamePlaceholder', 'e.g. Jane Doe')}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="cg-candidate-email"
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('contentGenerator.candidateEmail', 'Candidate email')}
            </label>
            <input
              id="cg-candidate-email"
              type="email"
              value={form.candidateEmail}
              onChange={(e) => update('candidateEmail', e.target.value)}
              placeholder={t('contentGenerator.candidateEmailPlaceholder', 'e.g. jane@example.com')}
              className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
            />
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="cg-context"
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('contentGenerator.additionalContext', 'Additional context')}
        </label>
        <textarea
          id="cg-context"
          value={form.additionalContext}
          onChange={(e) => update('additionalContext', e.target.value)}
          rows={3}
          placeholder={t(
            'contentGenerator.additionalContextPlaceholder',
            'Any extra details to include...'
          )}
          className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-surface-700 dark:bg-surface-900 dark:text-gray-100"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="md"
        disabled={loading}
        leftIcon={
          loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )
        }
      >
        {loading
          ? t('contentGenerator.generating', 'Generating...')
          : t('contentGenerator.generate', 'Generate')}
      </Button>
    </form>
  );
}
