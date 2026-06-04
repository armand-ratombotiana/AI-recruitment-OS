import type { TourDefinition } from './feature-tour';

export const candidatesTour: TourDefinition = {
  id: 'candidates',
  titleKey: 'tour.candidates.title',
  introKey: 'tour.candidates.intro',
  steps: [
    {
      target: '[data-tour="candidates-search"]',
      titleKey: 'tour.candidates.filters.title',
      descKey: 'tour.candidates.filters.desc',
    },
    {
      target: '[data-tour="candidates-add"]',
      titleKey: 'tour.candidates.add.title',
      descKey: 'tour.candidates.add.desc',
    },
    {
      target: '[data-tour="candidates-table"]',
      titleKey: 'tour.candidates.table.title',
      descKey: 'tour.candidates.table.desc',
    },
    {
      target: '[data-tour="candidates-row"]',
      titleKey: 'tour.candidates.details.title',
      descKey: 'tour.candidates.details.desc',
    },
  ],
};

export const jobsTour: TourDefinition = {
  id: 'jobs',
  titleKey: 'tour.jobs.title',
  introKey: 'tour.jobs.intro',
  steps: [
    {
      target: '[data-tour="jobs-search"]',
      titleKey: 'tour.jobs.filters.title',
      descKey: 'tour.jobs.filters.desc',
    },
    {
      target: '[data-tour="jobs-create"]',
      titleKey: 'tour.jobs.create.title',
      descKey: 'tour.jobs.create.desc',
    },
    {
      target: '[data-tour="jobs-row"]',
      titleKey: 'tour.jobs.manage.title',
      descKey: 'tour.jobs.manage.desc',
    },
  ],
};

export const ppeTour: TourDefinition = {
  id: 'ppe',
  titleKey: 'tour.ppe.title',
  introKey: 'tour.ppe.intro',
  steps: [
    {
      target: '[data-tour="ppe-problem"]',
      titleKey: 'tour.ppe.choose.title',
      descKey: 'tour.ppe.choose.desc',
    },
    {
      target: '[data-tour="ppe-editor"]',
      titleKey: 'tour.ppe.editor.title',
      descKey: 'tour.ppe.editor.desc',
    },
    {
      target: '[data-tour="ppe-run"]',
      titleKey: 'tour.ppe.run.title',
      descKey: 'tour.ppe.run.desc',
    },
    {
      target: '[data-tour="ppe-hint"]',
      titleKey: 'tour.ppe.hint.title',
      descKey: 'tour.ppe.hint.desc',
    },
  ],
};

export const aiCopilotTour: TourDefinition = {
  id: 'ai-copilot',
  titleKey: 'tour.aiCopilot.title',
  introKey: 'tour.aiCopilot.intro',
  steps: [
    {
      target: '[data-tour="copilot-input"]',
      titleKey: 'tour.aiCopilot.input.title',
      descKey: 'tour.aiCopilot.input.desc',
    },
    {
      target: '[data-tour="copilot-response"]',
      titleKey: 'tour.aiCopilot.response.title',
      descKey: 'tour.aiCopilot.response.desc',
    },
  ],
};

export const pipelineTour: TourDefinition = {
  id: 'pipeline',
  titleKey: 'tour.pipeline.title',
  introKey: 'tour.pipeline.intro',
  steps: [
    {
      target: '[data-tour="pipeline-stages"]',
      titleKey: 'tour.pipeline.stages.title',
      descKey: 'tour.pipeline.stages.desc',
    },
    {
      target: '[data-tour="pipeline-card"]',
      titleKey: 'tour.pipeline.card.title',
      descKey: 'tour.pipeline.card.desc',
    },
  ],
};

export const settingsTour: TourDefinition = {
  id: 'settings',
  titleKey: 'tour.settings.title',
  introKey: 'tour.settings.intro',
  steps: [
    {
      target: '[data-tour="settings-tabs"]',
      titleKey: 'tour.settings.tabs.title',
      descKey: 'tour.settings.tabs.desc',
    },
  ],
};

export const analyticsTour: TourDefinition = {
  id: 'analytics',
  titleKey: 'tour.analytics.title',
  introKey: 'tour.analytics.intro',
  steps: [
    {
      target: '[data-tour="analytics-funnel"]',
      titleKey: 'tour.analytics.funnel.title',
      descKey: 'tour.analytics.funnel.desc',
    },
  ],
};

export const workflowsTour: TourDefinition = {
  id: 'workflows',
  titleKey: 'tour.workflows.title',
  introKey: 'tour.workflows.intro',
  steps: [
    {
      target: '[data-tour="workflows-list"]',
      titleKey: 'tour.workflows.list.title',
      descKey: 'tour.workflows.list.desc',
    },
  ],
};

export const ALL_TOURS = {
  candidates: candidatesTour,
  jobs: jobsTour,
  ppe: ppeTour,
  aiCopilot: aiCopilotTour,
  pipeline: pipelineTour,
  settings: settingsTour,
  analytics: analyticsTour,
  workflows: workflowsTour,
} as const;
