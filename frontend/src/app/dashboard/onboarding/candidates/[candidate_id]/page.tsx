'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  User,
  StickyNote,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Progress,
  Skeleton,
  ErrorState,
  Breadcrumb,
  useToast,
  TextareaField,
} from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import { WorkflowStepCard } from '@/components/onboarding/workflow-step-card';
import type { WorkflowStep, WorkflowStepStatus } from '@/components/onboarding/workflow-step-card';
import type { CandidateTypes } from '@/services/api/types';

export default function CandidateOnboardingPage() {
  const params = useParams();
  const candidateId = params.candidate_id as string;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push: showToast } = useToast();

  const [candidate, setCandidate] = useState<CandidateTypes.CandidateDetail | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api.candidates
      .get(candidateId)
      .then((data) => {
        setCandidate(data);
        const mockSteps: WorkflowStep[] = [
          { name: 'Sign NDA', type: 'document', description: 'Sign the non-disclosure agreement', required: true, status: 'completed' },
          { name: 'Watch intro video', type: 'video', description: 'Company culture and team intro', required: true, status: 'completed' },
          { name: 'Complete tax forms', type: 'task', description: 'Fill in W-4 or equivalent', required: true, status: 'in_progress' },
          { name: 'Team meeting', type: 'meeting', description: 'Meet your immediate team', required: true, status: 'pending' },
          { name: 'Technical assessment', type: 'assessment', description: 'Skills evaluation', required: false, status: 'pending' },
        ];
        setSteps(mockSteps);
      })
      .catch((err) => setError(err instanceof APIError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [candidateId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const completedSteps = steps.filter((s) => s.status === 'completed').length;
  const progressPct = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;

  const handleCompleteStep = async (index: number) => {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, status: 'completed' as WorkflowStepStatus } : s))
    );
    showToast('success', t('onboarding.candidate.stepCompleted', 'Step completed'));
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await api.candidates.update(candidateId, { notes } as any);
      showToast('success', t('onboarding.candidate.notesSaved', 'Notes saved'));
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('onboarding.candidate.notesFailed', 'Failed to save notes'));
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !candidate) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <ErrorState
          title={t('onboarding.candidate.couldntLoad', "Couldn't load candidate")}
          error={error || t('onboarding.candidate.notFound', 'Candidate not found')}
          onRetry={loadData}
        />
      </div>
    );
  }

  const candidateName = (candidate as any).full_name || (candidate as any).name || candidateId;

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{candidateName}</h1>
            <Badge variant={progressPct === 100 ? 'success' : 'info'}>
              {progressPct}% {t('onboarding.candidate.complete', 'complete')}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('onboarding.candidate.onboardingStatus', 'Onboarding progress')}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('onboarding.candidate.progress', 'Progress')}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {completedSteps} {t('common.of', 'of')} {steps.length} {t('onboarding.workflows.steps', 'steps')}
            </span>
          </div>
          <Progress value={progressPct} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('onboarding.candidate.stepsList', 'Onboarding steps')}
              </h2>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <WorkflowStepCard
                    key={`${step.name}-${i}`}
                    step={step}
                    index={i}
                    onComplete={handleCompleteStep}
                    onViewDetails={() => {}}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-gray-400" />
                {t('onboarding.candidate.notes', 'Notes')}
              </h3>
              <TextareaField
                id="candidate-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('onboarding.candidate.notesPlaceholder', 'Add notes about this candidate…')}
                rows={5}
              />
              <Button variant="primary" onClick={handleSaveNotes} loading={savingNotes} disabled={savingNotes}>
                {t('common.save', 'Save')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('onboarding.candidate.summary', 'Summary')}
              </h3>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  {completedSteps} {t('onboarding.candidate.completed', 'completed')}
                </p>
                <p className="flex items-center gap-2">
                  <Circle className="h-3.5 w-3.5 text-blue-500" />
                  {steps.filter((s) => s.status === 'in_progress').length} {t('onboarding.candidate.inProgress', 'in progress')}
                </p>
                <p className="flex items-center gap-2">
                  <Circle className="h-3.5 w-3.5 text-gray-400" />
                  {steps.filter((s) => s.status === 'pending').length} {t('onboarding.candidate.pending', 'pending')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
