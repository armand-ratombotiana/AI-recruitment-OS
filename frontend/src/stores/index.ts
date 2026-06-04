import { create } from 'zustand';
import { api, APIError, onUnauthorized } from '@/services/api/client';
import type {
  AuthTypes,
  CandidateTypes,
  JobTypes,
  InterviewTypes,
  AnalyticsTypes,
  PpeTypes,
  AiTypes,
  WorkflowTypes,
  NotificationTypes,
  BillingTypes,
  TenantTypes,
  UserTypes,
  ComplianceTypes,
  InnovationsTypes,
} from '@/services/api/types';

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login') || window.location.pathname.startsWith('/register')) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/login?next=${next}`;
};

if (typeof window !== 'undefined') {
  onUnauthorized(() => {
    try {
      useAuthStore.setState({ user: null, isAuthenticated: false });
    } catch {
      /* noop */
    }
    redirectToLogin();
  });
}

// ========================================================================
// Auth Store
// ========================================================================

interface AuthState {
  user: AuthTypes.MeResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  ssoLogin: (provider: string, code: string, redirectUri: string) => Promise<void>;
  fetchMe: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('airos_token') : false,
  isLoading: false,
  error: null,
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await api.auth.login(email, password);
      set({ isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  register: async (email, fullName, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.auth.register({ email, full_name: fullName, password });
      if (res.access_token) api.setToken(res.access_token);
      set({ isAuthenticated: !!res.access_token, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  logout: async () => {
    try {
      await api.auth.logout();
    } catch {
      /* noop */
    }
    set({ user: null, isAuthenticated: false });
  },
  ssoLogin: async (provider, code, redirectUri) => {
    set({ isLoading: true, error: null });
    try {
      await api.sso.callback(provider, { provider, code, redirect_uri: redirectUri });
      set({ isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const user = await api.auth.getMe();
      set({ user, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  clearError: () => set({ error: null }),
}));

// ========================================================================
// Candidates Store
// ========================================================================

interface CandidateState {
  candidates: CandidateTypes.CandidateSummary[];
  total: number;
  currentCandidate: CandidateTypes.CandidateDetail | null;
  isLoading: boolean;
  error: string | null;
  fetchCandidates: (params?: Record<string, string>) => Promise<void>;
  fetchCandidate: (id: string) => Promise<void>;
  createCandidate: (data: CandidateTypes.CandidateCreateRequest) => Promise<CandidateTypes.CandidateCreateResponse>;
  updateCandidate: (id: string, data: CandidateTypes.CandidateUpdateRequest) => Promise<void>;
  deleteCandidate: (id: string) => Promise<void>;
  enrichCandidate: (id: string) => Promise<void>;
  matchCandidate: (id: string) => Promise<CandidateTypes.MatchCandidateResponse>;
  searchCandidates: (query: string) => Promise<void>;
}

export const useCandidateStore = create<CandidateState>((set) => ({
  candidates: [],
  total: 0,
  currentCandidate: null,
  isLoading: false,
  error: null,
  fetchCandidates: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.candidates.list(params);
      set({ candidates: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchCandidate: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.candidates.get(id);
      set({ currentCandidate: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createCandidate: async (data) => {
    const result = await api.candidates.create(data);
    set((s) => ({ candidates: [result as any, ...s.candidates], total: s.total + 1 }));
    return result;
  },
  updateCandidate: async (id, data) => {
    const updated = await api.candidates.update(id, data);
    set((s) => ({
      candidates: s.candidates.map((c) => (c.id === id ? (updated as any) : c)),
      currentCandidate: s.currentCandidate?.id === id ? updated : s.currentCandidate,
    }));
  },
  deleteCandidate: async (id) => {
    await api.candidates.delete(id);
    set((s) => ({
      candidates: s.candidates.filter((c) => c.id !== id),
      total: Math.max(0, s.total - 1),
      currentCandidate: s.currentCandidate?.id === id ? null : s.currentCandidate,
    }));
  },
  enrichCandidate: async (id) => {
    await api.candidates.enrich(id);
    const updated = await api.candidates.get(id);
    set((s) => ({
      candidates: s.candidates.map((c) => (c.id === id ? (updated as any) : c)),
      currentCandidate: s.currentCandidate?.id === id ? updated : s.currentCandidate,
    }));
  },
  matchCandidate: async (id) => {
    const result = await api.candidates.match(id);
    return result;
  },
  searchCandidates: async (query) => {
    set({ isLoading: true });
    try {
      const res = await api.search.searchCandidates({ query });
      set({
        candidates: (res.hits as any) || [],
        total: res.total || 0,
        isLoading: false,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));

// ========================================================================
// Jobs Store
// ========================================================================

interface JobState {
  jobs: JobTypes.JobSummary[];
  total: number;
  currentJob: JobTypes.JobDetail | null;
  matchedCandidates: JobTypes.MatchedCandidate[];
  isLoading: boolean;
  error: string | null;
  fetchJobs: (params?: Record<string, string>) => Promise<void>;
  fetchJob: (id: string) => Promise<void>;
  createJob: (data: JobTypes.JobCreateRequest) => Promise<JobTypes.JobCreateResponse>;
  updateJob: (id: string, data: JobTypes.JobUpdateRequest) => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  fetchMatchedCandidates: (jobId: string) => Promise<void>;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],
  total: 0,
  currentJob: null,
  matchedCandidates: [],
  isLoading: false,
  error: null,
  fetchJobs: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.jobs.list(params);
      set({ jobs: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchJob: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.jobs.get(id);
      set({ currentJob: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createJob: async (data) => {
    const result = await api.jobs.create(data);
    set((s) => ({ jobs: [result as any, ...s.jobs], total: s.total + 1 }));
    return result;
  },
  updateJob: async (id, data) => {
    const updated = await api.jobs.update(id, data);
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? (updated as any) : j)),
      currentJob: s.currentJob?.id === id ? updated : s.currentJob,
    }));
  },
  deleteJob: async (id) => {
    await api.jobs.delete(id);
    set((s) => ({
      jobs: s.jobs.filter((j) => j.id !== id),
      total: Math.max(0, s.total - 1),
      currentJob: s.currentJob?.id === id ? null : s.currentJob,
    }));
  },
  fetchMatchedCandidates: async (jobId) => {
    set({ isLoading: true });
    try {
      const res = await api.jobs.getMatchedCandidates(jobId);
      set({ matchedCandidates: res.candidates, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));

// ========================================================================
// Interviews Store
// ========================================================================

interface InterviewState {
  interviews: InterviewTypes.InterviewSummary[];
  total: number;
  currentInterview: InterviewTypes.InterviewDetail | null;
  isLoading: boolean;
  error: string | null;
  fetchInterviews: (params?: Record<string, string>) => Promise<void>;
  fetchInterview: (id: string) => Promise<void>;
  createInterview: (data: InterviewTypes.InterviewCreate) => Promise<InterviewTypes.InterviewDetail>;
  startInterview: (id: string) => Promise<void>;
  completeInterview: (id: string) => Promise<void>;
  submitFeedback: (id: string, data: InterviewTypes.InterviewFeedback) => Promise<void>;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  interviews: [],
  total: 0,
  currentInterview: null,
  isLoading: false,
  error: null,
  fetchInterviews: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.interviews.list(params);
      set({ interviews: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchInterview: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.interviews.get(id);
      set({ currentInterview: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createInterview: async (data) => {
    const result = await api.interviews.create(data);
    set((s) => ({ interviews: [result as any, ...s.interviews], total: s.total + 1 }));
    return result;
  },
  startInterview: async (id) => {
    const updated = await api.interviews.start(id);
    set((s) => ({
      interviews: s.interviews.map((i) => (i.id === id ? (updated as any) : i)),
      currentInterview: s.currentInterview?.id === id ? updated : s.currentInterview,
    }));
  },
  completeInterview: async (id) => {
    const updated = await api.interviews.complete(id);
    set((s) => ({
      interviews: s.interviews.map((i) => (i.id === id ? (updated as any) : i)),
      currentInterview: s.currentInterview?.id === id ? updated : s.currentInterview,
    }));
  },
  submitFeedback: async (id, data) => {
    await api.interviews.submitFeedback(id, data);
    const updated = await api.interviews.get(id);
    set((s) => ({
      currentInterview: s.currentInterview?.id === id ? updated : s.currentInterview,
    }));
  },
}));

// ========================================================================
// Analytics Store
// ========================================================================

interface AnalyticsState {
  dashboard: AnalyticsTypes.DashboardData | null;
  pipeline: AnalyticsTypes.PipelineData | null;
  aiPerformance: AnalyticsTypes.AiPerformance | null;
  timeToHire: AnalyticsTypes.TimeToHire | null;
  recruiterProductivity: AnalyticsTypes.RecruiterProductivity | null;
  isLoading: boolean;
  error: string | null;
  fetchDashboard: (timeRange?: string) => Promise<void>;
  fetchPipeline: () => Promise<void>;
  fetchAIPerformance: () => Promise<void>;
  fetchTimeToHire: () => Promise<void>;
  fetchRecruiterProductivity: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dashboard: null,
  pipeline: null,
  aiPerformance: null,
  timeToHire: null,
  recruiterProductivity: null,
  isLoading: false,
  error: null,
  fetchDashboard: async (timeRange = '7d') => {
    set({ isLoading: true });
    try {
      const data = await api.analytics.getDashboard(timeRange);
      set({ dashboard: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchPipeline: async () => {
    set({ isLoading: true });
    try {
      const data = await api.analytics.getPipeline();
      set({ pipeline: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchAIPerformance: async () => {
    set({ isLoading: true });
    try {
      const data = await api.analytics.getAiPerformance();
      set({ aiPerformance: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchTimeToHire: async () => {
    set({ isLoading: true });
    try {
      const data = await api.analytics.getTimeToHire();
      set({ timeToHire: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchRecruiterProductivity: async () => {
    set({ isLoading: true });
    try {
      const data = await api.analytics.getRecruiterProductivity();
      set({ recruiterProductivity: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));

// ========================================================================
// PPE Store
// ========================================================================

interface PPEState {
  problems: PpeTypes.PpeProblem[];
  currentSession: PpeTypes.PpeSession | null;
  lastExecution: PpeTypes.CodeExecutionResult | null;
  lastHint: PpeTypes.HintResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchProblems: () => Promise<void>;
  createSession: (data: PpeTypes.PPESessionCreate) => Promise<PpeTypes.PpeSession>;
  fetchSession: (id: string) => Promise<void>;
  submitCode: (sessionId: string, code: string, language: string) => Promise<PpeTypes.CodeExecutionResult>;
  requestHint: (sessionId: string) => Promise<PpeTypes.HintResponse>;
}

export const usePPEStore = create<PPEState>((set) => ({
  problems: [],
  currentSession: null,
  lastExecution: null,
  lastHint: null,
  isLoading: false,
  error: null,
  fetchProblems: async () => {
    set({ isLoading: true });
    try {
      const res: any = await api.ppe.listProblems();
      const list = Array.isArray(res) ? res : res.data || [];
      set({ problems: list, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createSession: async (data) => {
    const result = await api.ppe.createSession(data);
    set({ currentSession: result });
    return result;
  },
  fetchSession: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.ppe.getSession(id);
      set({ currentSession: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  submitCode: async (sessionId, code, language) => {
    const result = await api.ppe.executeCode(sessionId, { code, language });
    set({ lastExecution: result });
    return result;
  },
  requestHint: async (sessionId) => {
    const hint = await api.ppe.requestHint(sessionId);
    set({ lastHint: hint });
    return hint;
  },
}));

// ========================================================================
// Workflows Store
// ========================================================================

interface WorkflowState {
  workflows: WorkflowTypes.Workflow[];
  total: number;
  currentWorkflow: WorkflowTypes.Workflow | null;
  executions: WorkflowTypes.WorkflowExecution[];
  isLoading: boolean;
  error: string | null;
  fetchWorkflows: () => Promise<void>;
  fetchWorkflow: (id: string) => Promise<void>;
  createWorkflow: (data: WorkflowTypes.WorkflowCreate) => Promise<WorkflowTypes.Workflow>;
  updateWorkflow: (id: string, data: WorkflowTypes.WorkflowUpdate) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  triggerWorkflow: (id: string, data?: Record<string, unknown>) => Promise<WorkflowTypes.WorkflowExecution>;
  activateWorkflow: (id: string) => Promise<void>;
  deactivateWorkflow: (id: string) => Promise<void>;
  fetchExecutions: (id: string) => Promise<void>;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: [],
  total: 0,
  currentWorkflow: null,
  executions: [],
  isLoading: false,
  error: null,
  fetchWorkflows: async () => {
    set({ isLoading: true });
    try {
      const res: any = await api.workflows.list();
      const items = Array.isArray(res) ? res : (res?.data || res?.items || []);
      set({ workflows: items, total: res?.total ?? items.length, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchWorkflow: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.workflows.get(id);
      set({ currentWorkflow: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createWorkflow: async (data) => {
    const result = await api.workflows.create(data);
    set((s) => ({ workflows: [result, ...s.workflows], total: s.total + 1 }));
    return result;
  },
  updateWorkflow: async (id, data) => {
    const updated = await api.workflows.update(id, data);
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? updated : w)),
      currentWorkflow: s.currentWorkflow?.id === id ? updated : s.currentWorkflow,
    }));
  },
  deleteWorkflow: async (id) => {
    await api.workflows.delete(id);
    set((s) => ({
      workflows: s.workflows.filter((w) => w.id !== id),
      total: Math.max(0, s.total - 1),
      currentWorkflow: s.currentWorkflow?.id === id ? null : s.currentWorkflow,
    }));
  },
  triggerWorkflow: async (id, data) => {
    return api.workflows.trigger(id, data);
  },
  activateWorkflow: async (id) => {
    const updated = await api.workflows.activate(id);
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? updated : w)),
      currentWorkflow: s.currentWorkflow?.id === id ? updated : s.currentWorkflow,
    }));
  },
  deactivateWorkflow: async (id) => {
    const updated = await api.workflows.deactivate(id);
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? updated : w)),
      currentWorkflow: s.currentWorkflow?.id === id ? updated : s.currentWorkflow,
    }));
  },
  fetchExecutions: async (id) => {
    set({ isLoading: true });
    try {
      const res = await api.workflows.listExecutions(id);
      set({ executions: res.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));

// ========================================================================
// Notifications Store
// ========================================================================

interface NotificationState {
  notifications: NotificationTypes.Notification[];
  unreadCount: number;
  preferences: NotificationTypes.NotificationPreferences | null;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  fetchPreferences: () => Promise<void>;
  updatePreferences: (data: NotificationTypes.PreferencesUpdate) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  preferences: null,
  isLoading: false,
  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.notifications.list();
      const notifications = res.data || [];
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },
  markRead: async (id) => {
    await api.notifications.markRead(id);
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
  },
  markAllRead: async () => {
    await api.notifications.markAllRead();
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },
  deleteNotification: async (id) => {
    await api.notifications.delete(id);
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    }));
  },
  fetchPreferences: async () => {
    try {
      const prefs = await api.notifications.getPreferences();
      set({ preferences: prefs });
    } catch {
      /* noop */
    }
  },
  updatePreferences: async (data) => {
    const prefs = await api.notifications.updatePreferences(data);
    set({ preferences: prefs });
  },
}));

// ========================================================================
// AI Store
// ========================================================================

interface AIState {
  agents: AiTypes.Agent[];
  orchestrationResult: AiTypes.OrchestrateResponse | null;
  biasResult: InnovationsTypes.BiasDetectionResult | null;
  successPrediction: InnovationsTypes.SuccessPrediction | null;
  isLoading: boolean;
  fetchAgents: () => Promise<void>;
  orchestrate: (data: AiTypes.OrchestrateRequest) => Promise<AiTypes.OrchestrateResponse>;
  detectBias: (text: string) => Promise<InnovationsTypes.BiasDetectionResult>;
  predictSuccess: (candidateId: string, jobId: string) => Promise<InnovationsTypes.SuccessPrediction>;
  getAgentCapabilities: (agentType: string) => Promise<AiTypes.AgentCapability>;
}

export const useAIStore = create<AIState>((set) => ({
  agents: [],
  orchestrationResult: null,
  biasResult: null,
  successPrediction: null,
  isLoading: false,
  fetchAgents: async () => {
    set({ isLoading: true });
    try {
      const res = await api.ai.listAgents();
      set({ agents: res.agents, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  orchestrate: async (data) => {
    set({ isLoading: true });
    try {
      const result = await api.ai.orchestrate(data);
      set({ orchestrationResult: result, isLoading: false });
      return result;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
  detectBias: async (text) => {
    const result = await api.innovations.detectBias({ text });
    set({ biasResult: result });
    return result;
  },
  predictSuccess: async (candidateId, jobId) => {
    const result = await api.innovations.predictSuccess({
      candidate_id: candidateId,
      job_id: jobId,
    });
    set({ successPrediction: result });
    return result;
  },
  getAgentCapabilities: async (agentType) => {
    return api.ai.getAgentCapabilities(agentType);
  },
}));

// ========================================================================
// Billing Store
// ========================================================================

interface BillingState {
  subscription: BillingTypes.Subscription | null;
  plans: BillingTypes.Plan[];
  invoices: BillingTypes.Invoice[];
  paymentMethods: BillingTypes.PaymentMethod[];
  customer: BillingTypes.BillingCustomer | null;
  isLoading: boolean;
  fetchSubscription: () => Promise<void>;
  fetchPlans: () => Promise<void>;
  fetchInvoices: () => Promise<void>;
  fetchPaymentMethods: () => Promise<void>;
  fetchCustomer: () => Promise<void>;
  startTrial: (planId: string) => Promise<void>;
  cancelSubscription: (atPeriodEnd?: boolean) => Promise<void>;
  resumeSubscription: () => Promise<void>;
  pauseSubscription: () => Promise<void>;
}

export const useBillingStore = create<BillingState>((set) => ({
  subscription: null,
  plans: [],
  invoices: [],
  paymentMethods: [],
  customer: null,
  isLoading: false,
  fetchSubscription: async () => {
    set({ isLoading: true });
    try {
      const data = await api.billing.getMySubscription();
      set({ subscription: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  fetchPlans: async () => {
    set({ isLoading: true });
    try {
      const data = await api.billing.listPlans();
      set({ plans: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  fetchInvoices: async () => {
    set({ isLoading: true });
    try {
      const res = await api.billing.listMyInvoices();
      set({ invoices: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  fetchPaymentMethods: async () => {
    set({ isLoading: true });
    try {
      const data = await api.billing.listMyPaymentMethods();
      set({ paymentMethods: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  fetchCustomer: async () => {
    try {
      const data = await api.billing.getCustomer();
      set({ customer: data });
    } catch {
      /* noop */
    }
  },
  startTrial: async (planId) => {
    set({ isLoading: true });
    try {
      const data = await api.billing.startTrial({ plan_id: planId });
      set({ subscription: data, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
  cancelSubscription: async (atPeriodEnd = true) => {
    set({ isLoading: true });
    try {
      const data = await api.billing.cancelMySubscription({ at_period_end: atPeriodEnd });
      set({ subscription: data, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
  resumeSubscription: async () => {
    set({ isLoading: true });
    try {
      const data = await api.billing.resumeMySubscription();
      set({ subscription: data, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
  pauseSubscription: async () => {
    set({ isLoading: true });
    try {
      const data = await api.billing.pauseMySubscription();
      set({ subscription: data, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
}));

// ========================================================================
// Tenants Store
// ========================================================================

interface TenantState {
  currentTenant: TenantTypes.Tenant | null;
  settings: TenantTypes.TenantSettings | null;
  branding: TenantTypes.TenantBranding | null;
  usage: TenantTypes.TenantUsage | null;
  isLoading: boolean;
  error: string | null;
  fetchCurrentTenant: () => Promise<void>;
  fetchSettings: (tenantId: string) => Promise<void>;
  updateSettings: (tenantId: string, data: TenantTypes.TenantSettingsUpdateRequest) => Promise<void>;
  fetchBranding: (tenantId: string) => Promise<void>;
  updateBranding: (tenantId: string, data: TenantTypes.BrandingUpdateRequest) => Promise<void>;
  fetchUsage: (tenantId: string) => Promise<void>;
}

export const useTenantStore = create<TenantState>((set) => ({
  currentTenant: null,
  settings: null,
  branding: null,
  usage: null,
  isLoading: false,
  error: null,
  fetchCurrentTenant: async () => {
    set({ isLoading: true });
    try {
      const me = await api.auth.getMe();
      if (me.tenant_id) {
        const data = await api.tenants.get(me.tenant_id);
        set({ currentTenant: data, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchSettings: async (tenantId) => {
    try {
      const data = await api.tenants.getSettings(tenantId);
      set({ settings: data });
    } catch {
      /* noop */
    }
  },
  updateSettings: async (tenantId, data) => {
    const updated = await api.tenants.updateSettings(tenantId, data);
    set({ settings: updated });
  },
  fetchBranding: async (tenantId) => {
    try {
      const data = await api.tenants.getBranding(tenantId);
      set({ branding: data });
    } catch {
      /* noop */
    }
  },
  updateBranding: async (tenantId, data) => {
    const updated = await api.tenants.updateBranding(tenantId, data);
    set({ branding: updated });
  },
  fetchUsage: async (tenantId) => {
    try {
      const data = await api.tenants.getUsage(tenantId);
      set({ usage: data });
    } catch {
      /* noop */
    }
  },
}));

// ========================================================================
// Users Store
// ========================================================================

interface UserState {
  users: UserTypes.User[];
  total: number;
  currentUser: UserTypes.User | null;
  activity: UserTypes.UserActivity | null;
  isLoading: boolean;
  error: string | null;
  fetchUsers: (params?: Record<string, string>) => Promise<void>;
  fetchUser: (id: string) => Promise<void>;
  createUser: (data: UserTypes.UserCreateRequest) => Promise<UserTypes.User>;
  updateUser: (id: string, data: UserTypes.UserUpdateRequest) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  fetchActivity: (id: string) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  users: [],
  total: 0,
  currentUser: null,
  activity: null,
  isLoading: false,
  error: null,
  fetchUsers: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.users.list(params);
      set({ users: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchUser: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.users.get(id);
      set({ currentUser: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createUser: async (data) => {
    const result = await api.users.create(data);
    set((s) => ({ users: [result, ...s.users], total: s.total + 1 }));
    return result;
  },
  updateUser: async (id, data) => {
    const updated = await api.users.update(id, data);
    set((s) => ({
      users: s.users.map((u) => (u.id === id ? updated : u)),
      currentUser: s.currentUser?.id === id ? updated : s.currentUser,
    }));
  },
  deleteUser: async (id) => {
    await api.users.delete(id);
    set((s) => ({
      users: s.users.filter((u) => u.id !== id),
      total: Math.max(0, s.total - 1),
      currentUser: s.currentUser?.id === id ? null : s.currentUser,
    }));
  },
  fetchActivity: async (id) => {
    try {
      const data = await api.users.getActivity(id);
      set({ activity: data });
    } catch {
      /* noop */
    }
  },
}));

// ========================================================================
// Compliance Store
// ========================================================================

interface ComplianceState {
  status: ComplianceTypes.ComplianceStatus | null;
  policies: ComplianceTypes.CompliancePolicy[];
  retention: ComplianceTypes.RetentionPolicy | null;
  auditLog: ComplianceTypes.AuditEntry[];
  isLoading: boolean;
  fetchStatus: () => Promise<void>;
  fetchPolicies: () => Promise<void>;
  fetchRetention: () => Promise<void>;
  fetchAuditLog: (params?: Record<string, string>) => Promise<void>;
  recordConsent: (data: ComplianceTypes.ConsentRecordRequest) => Promise<void>;
  requestDataExport: (userId: string) => Promise<ComplianceTypes.DataExportJob>;
  requestDataDeletion: (userId: string) => Promise<ComplianceTypes.DataExportJob>;
  runCheck: () => Promise<ComplianceTypes.ComplianceCheckResult>;
}

export const useComplianceStore = create<ComplianceState>((set) => ({
  status: null,
  policies: [],
  retention: null,
  auditLog: [],
  isLoading: false,
  fetchStatus: async () => {
    set({ isLoading: true });
    try {
      const data = await api.compliance.getStatus();
      set({ status: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  fetchPolicies: async () => {
    try {
      const data = await api.compliance.listPolicies();
      set({ policies: data });
    } catch {
      /* noop */
    }
  },
  fetchRetention: async () => {
    try {
      const data = await api.compliance.getRetention();
      set({ retention: data });
    } catch {
      /* noop */
    }
  },
  fetchAuditLog: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.compliance.getAuditLog(params);
      set({ auditLog: res.data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  recordConsent: async (data) => {
    await api.compliance.recordConsent(data);
  },
  requestDataExport: async (userId) => {
    return api.compliance.requestDataExport({ user_id: userId });
  },
  requestDataDeletion: async (userId) => {
    return api.compliance.requestDataDeletion({ user_id: userId });
  },
  runCheck: async () => {
    return api.compliance.runCheck();
  },
}));

// ========================================================================
// Resumes Store
// ========================================================================

interface ResumeState {
  resumes: ResumeTypes.ResumeSummary[];
  total: number;
  currentResume: ResumeTypes.ResumeDetail | null;
  parsedResume: ResumeTypes.ParsedResumeResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchResumes: (params?: Record<string, string>) => Promise<void>;
  fetchResume: (id: string) => Promise<void>;
  uploadResume: (data: ResumeTypes.ResumeUploadRequest) => Promise<ResumeTypes.ResumeUploadResponse>;
  uploadResumeFile: (formData: FormData) => Promise<ResumeTypes.ResumeUploadResponse>;
  fetchParsedResume: (id: string) => Promise<void>;
  reparseResume: (id: string) => Promise<void>;
}

import type { ResumeTypes } from '@/services/api/types';

export const useResumeStore = create<ResumeState>((set) => ({
  resumes: [],
  total: 0,
  currentResume: null,
  parsedResume: null,
  isLoading: false,
  error: null,
  fetchResumes: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.resumes.list(params);
      set({ resumes: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchResume: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.resumes.get(id);
      set({ currentResume: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  uploadResume: async (data) => {
    const result = await api.resumes.upload(data);
    return result;
  },
  uploadResumeFile: async (formData) => {
    return api.resumes.uploadFile(formData);
  },
  fetchParsedResume: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.resumes.getParsed(id);
      set({ parsedResume: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  reparseResume: async (id) => {
    await api.resumes.reparse(id);
  },
}));

// ========================================================================
// MFA / API Keys Store
// ========================================================================

interface MfaState {
  mfaSetup: AuthTypes.MFAEnableResponse | null;
  apiKeys: AuthTypes.APIKey[];
  isLoading: boolean;
  error: string | null;
  enableMfa: () => Promise<AuthTypes.MFAEnableResponse>;
  verifyMfa: (userId: string, code: string) => Promise<AuthTypes.MFAVerifyResponse>;
  fetchApiKeys: () => Promise<void>;
  createApiKey: (data: AuthTypes.APIKeyCreateRequest) => Promise<AuthTypes.APIKey>;
  revokeApiKey: (keyId: string) => Promise<void>;
}

export const useMfaStore = create<MfaState>((set) => ({
  mfaSetup: null,
  apiKeys: [],
  isLoading: false,
  error: null,
  enableMfa: async () => {
    set({ isLoading: true });
    try {
      const me = await api.auth.getMe();
      const data = await api.auth.enableMfa({ user_id: me.id });
      set({ mfaSetup: data, isLoading: false });
      return data;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  verifyMfa: async (userId, code) => {
    return api.auth.verifyMfa({ user_id: userId, code });
  },
  fetchApiKeys: async () => {
    set({ isLoading: true });
    try {
      const data = await api.auth.listApiKeys();
      set({ apiKeys: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createApiKey: async (data) => {
    const result = await api.auth.createApiKey(data);
    set((s) => ({ apiKeys: [result, ...s.apiKeys] }));
    return result;
  },
  revokeApiKey: async (keyId) => {
    await api.auth.revokeApiKey(keyId);
    set((s) => ({ apiKeys: s.apiKeys.filter((k) => k.id !== keyId) }));
  },
}));

// ========================================================================
// SSO Store
// ========================================================================

interface SsoState {
  providers: SsoTypes.SsoProvider[];
  userInfo: SsoTypes.SsoUserInfo | null;
  isLoading: boolean;
  fetchProviders: () => Promise<void>;
  getAuthorizeUrl: (provider: string, redirectUri: string) => Promise<SsoTypes.SsoAuthorizeUrlResponse>;
  getUserInfo: () => Promise<void>;
  unlinkProvider: (provider: string) => Promise<void>;
}

import type { SsoTypes } from '@/services/api/types';

export const useSsoStore = create<SsoState>((set) => ({
  providers: [],
  userInfo: null,
  isLoading: false,
  fetchProviders: async () => {
    set({ isLoading: true });
    try {
      const data = await api.sso.listProviders();
      set({ providers: data.providers, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  getAuthorizeUrl: async (provider, redirectUri) => {
    return api.sso.getAuthorizeUrl(provider, redirectUri);
  },
  getUserInfo: async () => {
    try {
      const data = await api.sso.getUserInfo();
      set({ userInfo: data });
    } catch {
      /* noop */
    }
  },
  unlinkProvider: async (provider) => {
    await api.sso.unlinkProvider(provider);
  },
}));

// Re-export APIError for consumers
export { APIError };
