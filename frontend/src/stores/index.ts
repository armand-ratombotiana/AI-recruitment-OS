import { create } from 'zustand';
import { api, APIError, onUnauthorized } from '@/services/api/client';

interface AuthState {
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  ssoLogin: (provider: string, code: string, redirectUri: string) => Promise<void>;
  clearError: () => void;
}

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
    } catch { /* noop */ }
    redirectToLogin();
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('airos_token') : false,
  isLoading: false,
  error: null,
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await api.login(email, password);
      set({ isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  register: async (email, fullName, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await api.register(email, fullName, password);
      const token = (res as any)?.access_token;
      if (token) api.setToken(token);
      set({ isAuthenticated: !!token, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  logout: async () => {
    try { await api.logout(); } catch {}
    set({ user: null, isAuthenticated: false });
  },
  ssoLogin: async (provider, code, redirectUri) => {
    set({ isLoading: true, error: null });
    try {
      await api.ssoLogin(provider, code, redirectUri);
      set({ isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },
  clearError: () => set({ error: null }),
}));

interface CandidateState {
  candidates: any[];
  total: number;
  currentCandidate: any | null;
  isLoading: boolean;
  error: string | null;
  fetchCandidates: (params?: Record<string, string>) => Promise<void>;
  fetchCandidate: (id: string) => Promise<void>;
  createCandidate: (data: any) => Promise<any>;
  updateCandidate: (id: string, data: any) => Promise<void>;
  enrichCandidate: (id: string) => Promise<void>;
  matchCandidate: (id: string) => Promise<void>;
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
      const res = await api.listCandidates(params);
      set({ candidates: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchCandidate: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.getCandidate(id);
      set({ currentCandidate: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createCandidate: async (data) => {
    const result = await api.createCandidate(data);
    set((s) => ({ candidates: [result, ...s.candidates], total: s.total + 1 }));
    return result;
  },
  updateCandidate: async (id, data) => {
    const updated = await api.updateCandidate(id, data);
    set((s) => ({
      candidates: s.candidates.map((c) => (c.id === id ? updated : c)),
      currentCandidate: s.currentCandidate?.id === id ? updated : s.currentCandidate,
    }));
  },
  enrichCandidate: async (id) => {
    await api.enrichCandidate(id);
    const updated = await api.getCandidate(id);
    set((s) => ({
      candidates: s.candidates.map((c) => (c.id === id ? updated : c)),
      currentCandidate: s.currentCandidate?.id === id ? updated : s.currentCandidate,
    }));
  },
  matchCandidate: async (id) => {
    await api.matchCandidate(id);
    const updated = await api.getCandidate(id);
    set((s) => ({
      candidates: s.candidates.map((c) => (c.id === id ? updated : c)),
      currentCandidate: s.currentCandidate?.id === id ? updated : s.currentCandidate,
    }));
  },
  searchCandidates: async (query) => {
    set({ isLoading: true });
    try {
      const res = await api.searchCandidates(query);
      set({ candidates: res.data || res.results || [], total: res.total || 0, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));

interface JobState {
  jobs: any[];
  total: number;
  currentJob: any | null;
  isLoading: boolean;
  error: string | null;
  fetchJobs: (params?: Record<string, string>) => Promise<void>;
  fetchJob: (id: string) => Promise<void>;
  createJob: (data: any) => Promise<any>;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],
  total: 0,
  currentJob: null,
  isLoading: false,
  error: null,
  fetchJobs: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.listJobs(params);
      set({ jobs: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchJob: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.getJob(id);
      set({ currentJob: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createJob: async (data) => {
    const result = await api.createJob(data);
    set((s) => ({ jobs: [result, ...s.jobs], total: s.total + 1 }));
    return result;
  },
}));

interface InterviewState {
  interviews: any[];
  total: number;
  isLoading: boolean;
  error: string | null;
  fetchInterviews: (params?: Record<string, string>) => Promise<void>;
  createInterview: (data: any) => Promise<any>;
  startInterview: (id: string) => Promise<void>;
  completeInterview: (id: string) => Promise<void>;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  interviews: [],
  total: 0,
  isLoading: false,
  error: null,
  fetchInterviews: async (params) => {
    set({ isLoading: true });
    try {
      const res = await api.listInterviews(params);
      set({ interviews: res.data, total: res.total, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createInterview: async (data) => {
    const result = await api.createInterview(data);
    set((s) => ({ interviews: [result, ...s.interviews], total: s.total + 1 }));
    return result;
  },
  startInterview: async (id) => {
    const updated = await api.startInterview(id);
    set((s) => ({
      interviews: s.interviews.map((i) => (i.id === id ? updated : i)),
    }));
  },
  completeInterview: async (id) => {
    const updated = await api.completeInterview(id);
    set((s) => ({
      interviews: s.interviews.map((i) => (i.id === id ? updated : i)),
    }));
  },
}));

interface AnalyticsState {
  dashboard: any;
  pipeline: any;
  aiPerformance: any;
  isLoading: boolean;
  error: string | null;
  fetchDashboard: (timeRange?: string) => Promise<void>;
  fetchPipeline: () => Promise<void>;
  fetchAIPerformance: () => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dashboard: null,
  pipeline: null,
  aiPerformance: null,
  isLoading: false,
  error: null,
  fetchDashboard: async (timeRange = '7d') => {
    set({ isLoading: true });
    try {
      const data = await api.getDashboard(timeRange);
      set({ dashboard: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchPipeline: async () => {
    set({ isLoading: true });
    try {
      const data = await api.getPipelineAnalytics();
      set({ pipeline: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  fetchAIPerformance: async () => {
    set({ isLoading: true });
    try {
      const data = await api.getAIPerformance();
      set({ aiPerformance: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
}));

interface PPEState {
  problems: any[];
  currentSession: any | null;
  isLoading: boolean;
  error: string | null;
  fetchProblems: () => Promise<void>;
  createSession: (data: any) => Promise<any>;
  fetchSession: (id: string) => Promise<void>;
  submitCode: (sessionId: string, code: string, language: string) => Promise<any>;
  requestHint: (sessionId: string) => Promise<any>;
}

export const usePPEStore = create<PPEState>((set) => ({
  problems: [],
  currentSession: null,
  isLoading: false,
  error: null,
  fetchProblems: async () => {
    set({ isLoading: true });
    try {
      const res = await api.listPPEProblems();
      set({ problems: res.data || res, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createSession: async (data) => {
    const result = await api.createPPESession(data);
    set({ currentSession: result });
    return result;
  },
  fetchSession: async (id) => {
    set({ isLoading: true });
    try {
      const data = await api.getPPESession(id);
      set({ currentSession: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  submitCode: async (sessionId, code, language) => {
    return api.submitPPCode(sessionId, { code, language });
  },
  requestHint: async (sessionId) => {
    return api.requestHint(sessionId);
  },
}));

interface WorkflowState {
  workflows: any[];
  isLoading: boolean;
  error: string | null;
  fetchWorkflows: () => Promise<void>;
  createWorkflow: (data: any) => Promise<any>;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  workflows: [],
  isLoading: false,
  error: null,
  fetchWorkflows: async () => {
    set({ isLoading: true });
    try {
      const res = await api.listWorkflows();
      set({ workflows: res.data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },
  createWorkflow: async (data) => {
    const result = await api.createWorkflow(data);
    set((s) => ({ workflows: [result, ...s.workflows] }));
    return result;
  },
}));

interface NotificationState {
  notifications: any[];
  unreadCount: number;
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const res = await api.listNotifications();
      const notifications = res.data || [];
      set({
        notifications,
        unreadCount: notifications.filter((n: any) => !n.read).length,
        isLoading: false,
      });
    } catch {}
  },
}));

interface AIState {
  agents: any[];
  orchestrationResult: any | null;
  isLoading: boolean;
  fetchAgents: () => Promise<void>;
  orchestrate: (data: any) => Promise<any>;
  detectBias: (text: string) => Promise<any>;
  predictSuccess: (candidateId: string, jobId: string) => Promise<any>;
}

export const useAIStore = create<AIState>((set) => ({
  agents: [],
  orchestrationResult: null,
  isLoading: false,
  fetchAgents: async () => {
    set({ isLoading: true });
    try {
      const res = await api.listAIAgents();
      set({ agents: res.data, isLoading: false });
    } catch {}
  },
  orchestrate: async (data) => {
    set({ isLoading: true });
    try {
      const result = await api.orchestrate(data);
      set({ orchestrationResult: result, isLoading: false });
      return result;
    } catch (err: any) {
      set({ isLoading: false });
      throw err;
    }
  },
  detectBias: async (text) => api.detectBias(text),
  predictSuccess: async (candidateId, jobId) => api.predictSuccess(candidateId, jobId),
}));

interface BillingState {
  subscription: any;
  isLoading: boolean;
  fetchSubscription: () => Promise<void>;
}

export const useBillingStore = create<BillingState>((set) => ({
  subscription: null,
  isLoading: false,
  fetchSubscription: async () => {
    set({ isLoading: true });
    try {
      const data = await api.getSubscription();
      set({ subscription: data, isLoading: false });
    } catch {}
  },
}));
