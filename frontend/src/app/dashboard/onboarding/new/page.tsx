'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus, GripVertical } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Breadcrumb,
  useToast,
  InputField,
  TextareaField,
  SelectField,
  CheckboxField,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { WorkflowStepCard } from '@/components/onboarding/workflow-step-card';
import type { WorkflowStep, WorkflowStepType } from '@/components/onboarding/workflow-step-card';

export default function NewOnboardingWorkflowPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [newStepName, setNewStepName] = useState('');
  const [newStepType, setNewStepType] = useState<WorkflowStepType>('document');
  const [newStepDescription, setNewStepDescription] = useState('');
  const [newStepRequired, setNewStepRequired] = useState(true);

  const handleAddStep = () => {
    if (!newStepName.trim()) return;
    setSteps((prev) => [
      ...prev,
      {
        name: newStepName.trim(),
        type: newStepType,
        description: newStepDescription.trim(),
        required: newStepRequired,
        order: prev.length,
      },
    ]);
    setNewStepName('');
    setNewStepType('document');
    setNewStepDescription('');
    setNewStepRequired(true);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    setSteps((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  const handleMoveDown = (index: number) => {
    setSteps((prev) => {
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      showToast('error', t('onboarding.workflows.nameRequired', 'Name is required'));
      return;
    }
    setSubmitting(true);
    try {
      const wf = await api.workflows.create({
        name: name.trim(),
        description: description.trim() || undefined,
        trigger: 'onboarding',
        steps: steps.map((s, i) => ({
          name: s.name,
          type: s.type,
          description: s.description,
          required: s.required,
          order: i,
        })),
        active: false,
      });
      showToast('success', t('onboarding.workflows.created', 'Workflow created'));
      router.push(`/dashboard/onboarding/${wf.id}`);
    } catch (err) {
      showToast(
        'error',
        err instanceof APIError ? err.message : t('onboarding.workflows.createFailed', 'Failed to create workflow')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const stepTypeOptions = [
    { value: 'document', label: t('onboarding.stepTypes.document', 'Document') },
    { value: 'video', label: t('onboarding.stepTypes.video', 'Video') },
    { value: 'task', label: t('onboarding.stepTypes.task', 'Task') },
    { value: 'meeting', label: t('onboarding.stepTypes.meeting', 'Meeting') },
    { value: 'assessment', label: t('onboarding.stepTypes.assessment', 'Assessment') },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('onboarding.workflows.newWorkflow', 'New Onboarding Workflow')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('onboarding.workflows.newWorkflowDesc', 'Build a structured onboarding workflow with steps for new candidates.')}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <InputField
            id="wf-name"
            label={t('onboarding.workflows.name', 'Name')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.workflows.namePlaceholder', 'e.g. Engineering Onboarding')}
          />

          <TextareaField
            id="wf-description"
            label={t('onboarding.workflows.description', 'Description')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('onboarding.workflows.descriptionPlaceholder', 'Describe the purpose of this workflow…')}
            rows={3}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('onboarding.workflows.stepsEditor', 'Steps')}
          </h2>

          {steps.length > 0 && (
            <div className="space-y-3">
              {steps.map((step, i) => (
                <WorkflowStepCard
                  key={`${step.name}-${i}`}
                  step={step}
                  index={i}
                  editable
                  totalSteps={steps.length}
                  onRemove={handleRemoveStep}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              ))}
            </div>
          )}

          <div className="p-4 rounded-lg border border-dashed border-gray-300 dark:border-surface-600 space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('onboarding.workflows.addStep', 'Add a step')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <InputField
                id="step-name"
                label={t('onboarding.workflows.stepName', 'Step name')}
                value={newStepName}
                onChange={(e) => setNewStepName(e.target.value)}
                placeholder={t('onboarding.workflows.stepNamePlaceholder', 'e.g. Sign NDA')}
              />
              <SelectField
                id="step-type"
                label={t('onboarding.workflows.stepType', 'Type')}
                value={newStepType}
                onChange={(e) => setNewStepType(e.target.value as WorkflowStepType)}
                options={stepTypeOptions}
              />
            </div>
            <TextareaField
              id="step-description"
              label={t('onboarding.workflows.stepDescription', 'Description')}
              value={newStepDescription}
              onChange={(e) => setNewStepDescription(e.target.value)}
              placeholder={t('onboarding.workflows.stepDescriptionPlaceholder', 'What does this step involve?')}
              rows={2}
            />
            <div className="flex items-center justify-between">
              <CheckboxField
                id="step-required"
                label={t('onboarding.workflows.stepRequired', 'Required')}
                checked={newStepRequired}
                onChange={(e) => setNewStepRequired(e.target.checked)}
              />
              <Button variant="secondary" onClick={handleAddStep} disabled={!newStepName.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                {t('onboarding.workflows.addStep', 'Add a step')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => router.push('/dashboard/onboarding')} disabled={submitting}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={submitting || !name.trim()}>
          {t('onboarding.workflows.createWorkflow', 'Create workflow')}
        </Button>
      </div>
    </div>
  );
}
