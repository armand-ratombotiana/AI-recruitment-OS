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
      target: '[data-tour="candidates-import"]',
      titleKey: 'tour.candidates.import.title',
      descKey: 'tour.candidates.import.desc',
    },
    {
      target: '[data-tour="candidates-table"]',
      titleKey: 'tour.candidates.table.title',
      descKey: 'tour.candidates.table.desc',
    },
    {
      target: '[data-tour="candidates-ai"]',
      titleKey: 'tour.candidates.ai.title',
      descKey: 'tour.candidates.ai.desc',
    },
    {
      target: '[data-tour="candidates-bulk"]',
      titleKey: 'tour.candidates.bulk.title',
      descKey: 'tour.candidates.bulk.desc',
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
      target: '[data-tour="jobs-stats"]',
      titleKey: 'tour.jobs.stats.title',
      descKey: 'tour.jobs.stats.desc',
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
      target: '[data-tour="ppe-language"]',
      titleKey: 'tour.ppe.language.title',
      descKey: 'tour.ppe.language.desc',
    },
    {
      target: '[data-tour="ppe-timer"]',
      titleKey: 'tour.ppe.timer.title',
      descKey: 'tour.ppe.timer.desc',
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
    {
      target: '[data-tour="ppe-submit"]',
      titleKey: 'tour.ppe.submit.title',
      descKey: 'tour.ppe.submit.desc',
    },
  ],
};

export const aiCopilotTour: TourDefinition = {
  id: 'ai-copilot',
  titleKey: 'tour.aiCopilot.title',
  introKey: 'tour.aiCopilot.intro',
  steps: [
    {
      target: '[data-tour="copilot-agents"]',
      titleKey: 'tour.aiCopilot.agents.title',
      descKey: 'tour.aiCopilot.agents.desc',
    },
    {
      target: '[data-tour="copilot-prompts"]',
      titleKey: 'tour.aiCopilot.prompts.title',
      descKey: 'tour.aiCopilot.prompts.desc',
    },
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
    {
      target: '[data-tour="copilot-history"]',
      titleKey: 'tour.aiCopilot.history.title',
      descKey: 'tour.aiCopilot.history.desc',
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
    {
      target: '[data-tour="pipeline-drag"]',
      titleKey: 'tour.pipeline.drag.title',
      descKey: 'tour.pipeline.drag.desc',
    },
    {
      target: '[data-tour="pipeline-ai"]',
      titleKey: 'tour.pipeline.ai.title',
      descKey: 'tour.pipeline.ai.desc',
    },
  ],
};

export const interviewsTour: TourDefinition = {
  id: 'interviews',
  titleKey: 'tour.interviews.title',
  introKey: 'tour.interviews.intro',
  steps: [
    {
      target: '[data-tour="interviews-schedule"]',
      titleKey: 'tour.interviews.schedule.title',
      descKey: 'tour.interviews.schedule.desc',
    },
    {
      target: '[data-tour="interviews-upcoming"]',
      titleKey: 'tour.interviews.upcoming.title',
      descKey: 'tour.interviews.upcoming.desc',
    },
    {
      target: '[data-tour="interviews-filters"]',
      titleKey: 'tour.interviews.filters.title',
      descKey: 'tour.interviews.filters.desc',
    },
    {
      target: '[data-tour="interviews-table"]',
      titleKey: 'tour.interviews.table.title',
      descKey: 'tour.interviews.table.desc',
    },
    {
      target: '[data-tour="interviews-join"]',
      titleKey: 'tour.interviews.join.title',
      descKey: 'tour.interviews.join.desc',
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
      target: '[data-tour="analytics-range"]',
      titleKey: 'tour.analytics.range.title',
      descKey: 'tour.analytics.range.desc',
    },
    {
      target: '[data-tour="analytics-stats"]',
      titleKey: 'tour.analytics.stats.title',
      descKey: 'tour.analytics.stats.desc',
    },
    {
      target: '[data-tour="analytics-funnel"]',
      titleKey: 'tour.analytics.funnel.title',
      descKey: 'tour.analytics.funnel.desc',
    },
    {
      target: '[data-tour="analytics-ai"]',
      titleKey: 'tour.analytics.ai.title',
      descKey: 'tour.analytics.ai.desc',
    },
    {
      target: '[data-tour="analytics-export"]',
      titleKey: 'tour.analytics.export.title',
      descKey: 'tour.analytics.export.desc',
    },
  ],
};

export const workflowsTour: TourDefinition = {
  id: 'workflows',
  titleKey: 'tour.workflows.title',
  introKey: 'tour.workflows.intro',
  steps: [
    {
      target: '[data-tour="workflows-create"]',
      titleKey: 'tour.workflows.create.title',
      descKey: 'tour.workflows.create.desc',
    },
    {
      target: '[data-tour="workflows-filter"]',
      titleKey: 'tour.workflows.filter.title',
      descKey: 'tour.workflows.filter.desc',
    },
    {
      target: '[data-tour="workflows-list"]',
      titleKey: 'tour.workflows.list.title',
      descKey: 'tour.workflows.list.desc',
    },
    {
      target: '[data-tour="workflows-activate"]',
      titleKey: 'tour.workflows.activate.title',
      descKey: 'tour.workflows.activate.desc',
    },
    {
      target: '[data-tour="workflows-actions"]',
      titleKey: 'tour.workflows.actions.title',
      descKey: 'tour.workflows.actions.desc',
    },
  ],
};

export const ALL_TOURS = {
  candidates: candidatesTour,
  jobs: jobsTour,
  ppe: ppeTour,
  aiCopilot: aiCopilotTour,
  pipeline: pipelineTour,
  interviews: interviewsTour,
  settings: settingsTour,
  analytics: analyticsTour,
  workflows: workflowsTour,
} as const;
