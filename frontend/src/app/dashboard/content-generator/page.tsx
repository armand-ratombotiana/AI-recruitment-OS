'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Sparkles,
  FileText,
  Link2,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/services/api/client';
import type { AiTypes } from '@/services/api/types';
import { Button, useToast } from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { GeneratorFormData, ContentType, ToneType } from '@/components/content-generator';
import { Skeleton } from '@/components/ui/loading';

const GeneratorForm = dynamic(() => import('@/components/content-generator').then(mod => ({ default: mod.GeneratorForm })), {
  loading: () => <Skeleton className="h-64 w-full" />,
  ssr: false,
});

const ContentPreview = dynamic(() => import('@/components/content-generator').then(mod => ({ default: mod.ContentPreview })), {
  loading: () => <Skeleton className="h-96 w-full" />,
  ssr: false,
});

function buildPrompt(data: GeneratorFormData): string {
  const parts: string[] = [];

  const typeLabels: Record<ContentType, string> = {
    job_description: 'job description',
    email: 'professional email',
    offer_letter: 'offer letter',
    rejection: 'rejection email',
    linkedin_post: 'LinkedIn post',
  };

  parts.push(`Generate a ${typeLabels[data.contentType]} with a ${data.tone} tone.`);

  if (data.jobTitle) parts.push(`Job title: ${data.jobTitle}.`);
  if (data.company) parts.push(`Company: ${data.company}.`);
  if (data.candidateName) parts.push(`Candidate name: ${data.candidateName}.`);
  if (data.candidateEmail) parts.push(`Candidate email: ${data.candidateEmail}.`);
  if (data.requirements) parts.push(`Requirements/details: ${data.requirements}.`);
  if (data.additionalContext) parts.push(`Additional context: ${data.additionalContext}.`);

  parts.push('Make it well-structured, clear, and ready to use.');

  return parts.join(' ');
}

export default function ContentGeneratorPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push } = useToast();

  const [loading, setLoading] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [currentType, setCurrentType] = useState<ContentType>('job_description');

  const handleGenerate = useCallback(
    async (data: GeneratorFormData) => {
      setLoading(true);
      setCurrentType(data.contentType);
      try {
        const prompt = buildPrompt(data);
        const request: AiTypes.OrchestrateRequest = {
          agent_type: 'content_generator',
          input: { query: prompt, task: prompt },
          context: {
            source: 'content_generator',
            content_type: data.contentType,
            tone: data.tone,
          },
        };
        const response = await api.ai.orchestrate(request);
        const result = response.result;
        let content = '';
        if (typeof result === 'string') {
          content = result;
        } else if (result && typeof result === 'object') {
          content =
            (result as Record<string, unknown>).content as string ||
            (result as Record<string, unknown>).text as string ||
            (result as Record<string, unknown>).output as string ||
            JSON.stringify(result, null, 2);
        }
        setGeneratedContent(content);
        push('success', t('contentGenerator.generationSuccess', 'Content generated successfully'));
      } catch (err) {
        push(
          'error',
          err instanceof Error ? err.message : t('contentGenerator.generationFailed', 'Generation failed')
        );
      } finally {
        setLoading(false);
      }
    },
    [push, t]
  );

  const handleEdit = useCallback((newContent: string) => {
    setGeneratedContent(newContent);
  }, []);

  const handleSaveAsTemplate = useCallback(
    (content: string) => {
      const templates = JSON.parse(localStorage.getItem('airos_content_templates') || '[]');
      const newTemplate = {
        id: `tpl-${Date.now().toString(36)}`,
        name: `${currentType.replace(/_/g, ' ')} template`,
        description: '',
        contentType: currentType,
        tone: 'professional',
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      templates.push(newTemplate);
      localStorage.setItem('airos_content_templates', JSON.stringify(templates));
      push('success', t('contentGenerator.savedAsTemplate', 'Saved as template'));
    },
    [currentType, push, t]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <Sparkles className="h-6 w-6 text-purple-500" />
            {t('contentGenerator.title', 'Content Generator')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'contentGenerator.subtitle',
              'Generate job descriptions, emails, offer letters, and more with AI.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/content-generator/templates">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<FileText className="h-4 w-4" />}
            >
              {t('contentGenerator.manageTemplates', 'Templates')}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900">
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('contentGenerator.configure', 'Configure')}
          </h2>
          <GeneratorForm onGenerate={handleGenerate} loading={loading} />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-900">
          <ContentPreview
            content={generatedContent}
            contentType={currentType}
            onEdit={handleEdit}
            onSaveAsTemplate={handleSaveAsTemplate}
          />
        </div>
      </div>
    </div>
  );
}
