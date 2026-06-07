/**
 * AI Recruitment OS — Typed API Client
 * Covers all 201 backend endpoints across 25+ microservices.
 *
 * Conventions:
 *   listX   — GET with list
 *   getX    — GET single
 *   createX — POST
 *   updateX — PUT/PATCH
 *   deleteX — DELETE
 *   searchX — GET/POST with query
 *   XMe     — current user resource
 *   XByY    — filtered/related resource
 */
import type {
  AuthTypes,
  SsoTypes,
  MailingTypes,
  TenantTypes,
  UserTypes,
  CandidateTypes,
  ResumeTypes,
  JobTypes,
  InterviewTypes,
  PpeTypes,
  AiTypes,
  AiEvaluationTypes,
  AnalyticsTypes,
  WorkflowTypes,
  NotificationTypes,
  ComplianceTypes,
  BillingTypes,
  SearchTypes,
  WebSocketTypes,
  ResumeAnalysisTypes,
  SchedulingTypes,
  FraudTypes,
  ComplianceAutomationTypes,
  TalentIntelTypes,
  WorkflowAutomationTypes,
  InnovationsTypes,
  ActivityTypes,
  HealthResponse,
  ListResponse,
  PaginatedResponse,
  MessageResponse,
  TagTypes,
} from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type UnauthorizedHandler = () => void;
const unauthorizedHandlers: Set<UnauthorizedHandler> = new Set();

export function onUnauthorized(handler: UnauthorizedHandler) {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

class APIClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) localStorage.setItem('airos_token', token);
    else localStorage.removeItem('airos_token');
  }

  getToken(): string | null {
    if (!this.token) this.token = typeof window !== 'undefined' ? localStorage.getItem('airos_token') : null;
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit & { params?: Record<string, string> } = {},
  ): Promise<T> {
    const { params, ...fetchOptions } = options;
    let url = `${API_BASE}/api/v1${endpoint}`;
    if (params) url += `?${new URLSearchParams(params).toString()}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(url, { ...fetchOptions, headers, signal: controller.signal });
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new APIError('Request timed out', 0);
      }
      throw new APIError('Network error', 0);
    }
    clearTimeout(timeout);

    if (response.status === 401) {
      this.setToken(null);
      unauthorizedHandlers.forEach((h) => {
        try {
          h();
        } catch {
          /* noop */
        }
      });
      let detail = '';
      try {
        detail = (await response.json())?.detail || '';
      } catch {
        /* noop */
      }
      throw new APIError(detail || 'Unauthorized', 401);
    }

    if (!response.ok) {
      let detail = '';
      try {
        const body = await response.json();
        detail = body?.detail || body?.message || '';
        if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join('; ');
      } catch {
        /* noop */
      }
      throw new APIError(detail || `API error: ${response.status}`, response.status);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }

  // ========================================================================
  // GLOBAL HEALTH
  // ========================================================================

  async health() {
    try {
      const res = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      return (await res.json()) as { status: string; service?: string; version?: string };
    } catch {
      return { status: 'unknown' } as { status: string };
    }
  }

  // ========================================================================
  // AUTH SERVICE
  // ========================================================================

  auth = {
    health: () => this.request<HealthResponse>('/auth/health'),
    register: (data: AuthTypes.RegisterRequest) =>
      this.request<AuthTypes.RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    login: async (email: string, password: string) => {
      const data = await this.request<AuthTypes.LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      this.setToken(data.access_token);
      return data;
    },
    refresh: (data: AuthTypes.RefreshRequest) =>
      this.request<AuthTypes.RefreshResponse>('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: async () => {
      await this.request<AuthTypes.LogoutResponse>('/auth/logout', { method: 'POST' });
      this.setToken(null);
    },
    verifyEmail: (data: AuthTypes.VerifyEmailRequest) =>
      this.request<MessageResponse>('/auth/verify-email', { method: 'POST', body: JSON.stringify(data) }),
    resendVerification: (data: AuthTypes.ResendVerificationRequest) =>
      this.request<MessageResponse>('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    forgotPassword: (data: AuthTypes.ForgotPasswordRequest) =>
      this.request<AuthTypes.ForgotPasswordResponse>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    resetPassword: (data: AuthTypes.ResetPasswordRequest) =>
      this.request<AuthTypes.ResetPasswordResponse>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deactivate: (data?: AuthTypes.DeactivateRequest) =>
      this.request<MessageResponse>('/auth/deactivate', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    reactivate: () =>
      this.request<MessageResponse>('/auth/reactivate', { method: 'POST' }),
    changePassword: (data: AuthTypes.ChangePasswordRequest) =>
      this.request<MessageResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getMe: () => this.request<AuthTypes.MeResponse>('/auth/me'),
    updateMyProfile: (data: AuthTypes.ProfileUpdateRequest) =>
      this.request<AuthTypes.MeResponse>('/auth/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    enableMfa: (data: AuthTypes.MFAEnableRequest) =>
      this.request<AuthTypes.MFAEnableResponse>('/auth/mfa/enable', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    verifyMfa: (data: AuthTypes.MFAVerifyRequest) =>
      this.request<AuthTypes.MFAVerifyResponse>('/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listApiKeys: () => this.request<AuthTypes.APIKey[]>('/auth/api-keys'),
    createApiKey: (data: AuthTypes.APIKeyCreateRequest) =>
      this.request<AuthTypes.APIKey>('/auth/api-keys', { method: 'POST', body: JSON.stringify(data) }),
    revokeApiKey: (keyId: string) =>
      this.request<MessageResponse>(`/auth/api-keys/${keyId}`, { method: 'DELETE' }),
    ssoLogin: (provider: string, code: string, redirectUri: string) =>
      this.request<AuthTypes.SSOLoginResponse>(`/auth/sso/${provider}`, {
        method: 'POST',
        body: JSON.stringify({ code, redirect_uri: redirectUri }),
      }),
    adminSeedDemo: () =>
      this.request<MessageResponse>('/auth/admin/seed-demo', { method: 'POST' }),
  };

  // ========================================================================
  // SSO SERVICE
  // ========================================================================

  sso = {
    health: () => this.request<HealthResponse>('/sso/health'),
    listProviders: () => this.request<SsoTypes.SsoProviderList>('/sso/providers'),
    getAuthorizeUrl: (provider: string, redirectUri: string) =>
      this.request<SsoTypes.SsoAuthorizeUrlResponse>(`/sso/providers/${provider}/authorize`, {
        params: { redirect_uri: redirectUri },
      }),
    callback: async (provider: string, data: SsoTypes.SsoCallbackRequest) => {
      const r = await this.request<AuthTypes.SSOLoginResponse>(`/sso/providers/${provider}/callback`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      this.setToken(r.access_token);
      return r;
    },
    getUserInfo: () => this.request<SsoTypes.SsoUserInfo>('/sso/userinfo'),
    unlinkProvider: (provider: string) =>
      this.request<MessageResponse>(`/sso/unlink/${provider}`, { method: 'DELETE' }),
  };

  // ========================================================================
  // MAILING SERVICE
  // ========================================================================

  mailing = {
    health: () => this.request<HealthResponse>('/mailing/health'),
    send: (data: MailingTypes.SendEmailRequest) =>
      this.request<MessageResponse>('/mailing/send', { method: 'POST', body: JSON.stringify(data) }),
    listSentEmails: (params?: Record<string, string>) =>
      this.request<MailingTypes.SentEmailsResponse>('/mailing/admin/emails', { params }),
    getSentEmail: (emailId: string) =>
      this.request<MailingTypes.EmailRecord>(`/mailing/admin/emails/${emailId}`),
    clearSentEmails: () => this.request<MessageResponse>('/mailing/admin/emails', { method: 'DELETE' }),
    listTokens: () => this.request<MailingTypes.MailingTokenList>('/mailing/admin/tokens'),
    verifyToken: (data: MailingTypes.VerifyTokenRequest) =>
      this.request<MailingTypes.VerifyTokenResponse>('/mailing/verify-token', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // ========================================================================
  // TENANTS SERVICE
  // ========================================================================

  tenants = {
    health: () => this.request<HealthResponse>('/tenants/health'),
    list: (params?: Record<string, string>) =>
      this.request<PaginatedResponse<TenantTypes.Tenant>>('/tenants/', { params }),
    get: (tenantId: string) => this.request<TenantTypes.Tenant>(`/tenants/${tenantId}`),
    create: (data: TenantTypes.TenantCreateRequest) =>
      this.request<TenantTypes.Tenant>('/tenants/', { method: 'POST', body: JSON.stringify(data) }),
    update: (tenantId: string, data: TenantTypes.TenantUpdateRequest) =>
      this.request<TenantTypes.Tenant>(`/tenants/${tenantId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (tenantId: string) =>
      this.request<MessageResponse>(`/tenants/${tenantId}`, { method: 'DELETE' }),
    getSettings: (tenantId: string) =>
      this.request<TenantTypes.TenantSettings>(`/tenants/${tenantId}/settings`),
    updateSettings: (tenantId: string, data: TenantTypes.TenantSettingsUpdateRequest) =>
      this.request<TenantTypes.TenantSettings>(`/tenants/${tenantId}/settings`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getBranding: (tenantId: string) =>
      this.request<TenantTypes.TenantBranding>(`/tenants/${tenantId}/branding`),
    updateBranding: (tenantId: string, data: TenantTypes.BrandingUpdateRequest) =>
      this.request<TenantTypes.TenantBranding>(`/tenants/${tenantId}/branding`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getUsage: (tenantId: string) =>
      this.request<TenantTypes.TenantUsage>(`/tenants/${tenantId}/usage`),
    getUsageHistory: (tenantId: string) =>
      this.request<TenantTypes.TenantUsageHistory>(`/tenants/${tenantId}/usage/history`),
  };

  // ========================================================================
  // USERS SERVICE
  // ========================================================================

  users = {
    health: () => this.request<HealthResponse>('/users/health'),
    list: (params?: Record<string, string>) =>
      this.request<PaginatedResponse<UserTypes.User>>('/users/', { params }),
    get: (userId: string) => this.request<UserTypes.User>(`/users/${userId}`),
    create: (data: UserTypes.UserCreateRequest) =>
      this.request<UserTypes.User>('/users/', { method: 'POST', body: JSON.stringify(data) }),
    update: (userId: string, data: UserTypes.UserUpdateRequest) =>
      this.request<UserTypes.User>(`/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (userId: string) =>
      this.request<MessageResponse>(`/users/${userId}`, { method: 'DELETE' }),
    getActivity: (userId: string) =>
      this.request<UserTypes.UserActivity>(`/users/${userId}/activity`),
  };

  // ========================================================================
  // CANDIDATES SERVICE
  // ========================================================================

  candidates = {
    health: () => this.request<HealthResponse>('/candidates/health'),
    list: (params?: Record<string, string>) =>
      this.request<CandidateTypes.CandidateListResponse>('/candidates/', { params }),
    get: (candidateId: string) =>
      this.request<CandidateTypes.CandidateDetail>(`/candidates/${candidateId}`),
    create: (data: CandidateTypes.CandidateCreateRequest) =>
      this.request<CandidateTypes.CandidateCreateResponse>('/candidates/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (candidateId: string, data: CandidateTypes.CandidateUpdateRequest) =>
      this.request<CandidateTypes.CandidateUpdateResponse>(`/candidates/${candidateId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (candidateId: string) =>
      this.request<CandidateTypes.CandidateDeleteResponse>(`/candidates/${candidateId}`, {
        method: 'DELETE',
      }),
    enrich: (candidateId: string) =>
      this.request<CandidateTypes.EnrichmentTaskResponse>(`/candidates/${candidateId}/enrich`, {
        method: 'POST',
      }),
    match: (candidateId: string) =>
      this.request<CandidateTypes.MatchCandidateResponse>(`/candidates/${candidateId}/match`, {
        method: 'POST',
      }),
    bulkDelete: (candidateIds: string[]) =>
      this.request<MessageResponse>('/candidates/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: candidateIds }),
      }),
    export: (format: 'csv' | 'xlsx' | 'pdf', candidateIds?: string[]) =>
      this.request<{ url: string; data?: string }>('/candidates/export', {
        method: 'POST',
        body: JSON.stringify({ format, ids: candidateIds }),
      }),
  };

  // ========================================================================
  // RESUMES SERVICE
  // ========================================================================

  resumes = {
    health: () => this.request<HealthResponse>('/resumes/health'),
    list: (params?: Record<string, string>) =>
      this.request<ResumeTypes.ResumeListResponse>('/resumes/', { params }),
    upload: (data: ResumeTypes.ResumeUploadRequest) =>
      this.request<ResumeTypes.ResumeUploadResponse>('/resumes/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    uploadFile: (formData: FormData) =>
      this.request<ResumeTypes.ResumeUploadResponse>('/resumes/upload', {
        method: 'POST',
        body: formData as any,
        headers: {} as any,
      }),
    get: (resumeId: string) => this.request<ResumeTypes.ResumeDetail>(`/resumes/${resumeId}`),
    getParsed: (resumeId: string) =>
      this.request<ResumeTypes.ParsedResumeResponse>(`/resumes/${resumeId}/parsed`),
    reparse: (resumeId: string) =>
      this.request<ResumeTypes.ResumeReparseResponse>(`/resumes/${resumeId}/reparse`, {
        method: 'POST',
      }),
  };

  // ========================================================================
  // JOBS SERVICE
  // ========================================================================

  jobs = {
    health: () => this.request<HealthResponse>('/jobs/health'),
    list: (params?: Record<string, string>) =>
      this.request<JobTypes.JobListResponse>('/jobs/', { params }),
    get: (jobId: string) => this.request<JobTypes.JobDetail>(`/jobs/${jobId}`),
    create: (data: JobTypes.JobCreateRequest) =>
      this.request<JobTypes.JobCreateResponse>('/jobs/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (jobId: string, data: JobTypes.JobUpdateRequest) =>
      this.request<JobTypes.JobUpdateResponse>(`/jobs/${jobId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (jobId: string) =>
      this.request<JobTypes.JobDeleteResponse>(`/jobs/${jobId}`, { method: 'DELETE' }),
    bulkDelete: (jobIds: string[]) =>
      this.request<MessageResponse>('/jobs/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: jobIds }),
      }),
    export: (format: 'csv' | 'xlsx' | 'pdf', jobIds?: string[]) =>
      this.request<{ url: string; data?: string }>('/jobs/export', {
        method: 'POST',
        body: JSON.stringify({ format, ids: jobIds }),
      }),
    getMatchedCandidates: (jobId: string) =>
      this.request<JobTypes.MatchedCandidatesResponse>(`/jobs/${jobId}/candidates`),
  };

  // ========================================================================
  // INTERVIEWS SERVICE
  // ========================================================================

  interviews = {
    health: () => this.request<HealthResponse>('/interviews/health'),
    list: (params?: Record<string, string>) =>
      this.request<InterviewTypes.InterviewListResponse>('/interviews/', { params }),
    get: (interviewId: string) =>
      this.request<InterviewTypes.InterviewDetail>(`/interviews/${interviewId}`),
    create: (data: InterviewTypes.InterviewCreate) =>
      this.request<InterviewTypes.InterviewDetail>('/interviews/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    start: (interviewId: string) =>
      this.request<InterviewTypes.InterviewDetail>(`/interviews/${interviewId}/start`, {
        method: 'POST',
      }),
    complete: (interviewId: string) =>
      this.request<InterviewTypes.InterviewDetail>(`/interviews/${interviewId}/complete`, {
        method: 'POST',
      }),
    submitFeedback: (interviewId: string, data: InterviewTypes.InterviewFeedback) =>
      this.request<MessageResponse>(`/interviews/${interviewId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getTranscript: (interviewId: string) =>
      this.request<InterviewTypes.InterviewTranscript>(`/interviews/${interviewId}/transcript`),
    getAnalytics: (interviewId: string) =>
      this.request<InterviewTypes.InterviewAnalytics>(`/interviews/${interviewId}/analytics`),
  };

  // ========================================================================
  // PPE SERVICE (Programming Practice Environment)
  // ========================================================================

  ppe = {
    health: () => this.request<HealthResponse>('/ppe/health'),
    listProblems: (params?: Record<string, string>) =>
      this.request<ListResponse<PpeTypes.PpeProblem> | PpeTypes.PpeProblem[]>('/ppe/problems', {
        params,
      }),
    getProblem: (problemId: string) =>
      this.request<PpeTypes.PpeProblem>(`/ppe/problems/${problemId}`),
    createSession: (data: PpeTypes.PPESessionCreate) =>
      this.request<PpeTypes.PpeSession>('/ppe/sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getSession: (sessionId: string) =>
      this.request<PpeTypes.PpeSession>(`/ppe/sessions/${sessionId}`),
    executeCode: (sessionId: string, data: PpeTypes.CodeSubmission) =>
      this.request<PpeTypes.CodeExecutionResult>(`/ppe/sessions/${sessionId}/execute`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    requestHint: (sessionId: string, data?: PpeTypes.HintRequest) =>
      this.request<PpeTypes.HintResponse>(`/ppe/sessions/${sessionId}/hint`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  };

  // ========================================================================
  // AI ORCHESTRATOR
  // ========================================================================

  ai = {
    health: () => this.request<HealthResponse>('/ai/health'),
    listAgents: () => this.request<AiTypes.AgentListResponse>('/ai/agents'),
    getAgentCapabilities: (agentType: string) =>
      this.request<AiTypes.AgentCapability>(`/ai/agents/${agentType}/capabilities`),
    orchestrate: (data: AiTypes.OrchestrateRequest) =>
      this.request<AiTypes.OrchestrateResponse>('/ai/orchestrate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    createTask: (data: AiTypes.CreateTaskRequest) =>
      this.request<AiTypes.AiTask>('/ai/tasks', { method: 'POST', body: JSON.stringify(data) }),
    getTask: (taskId: string) => this.request<AiTypes.AiTask>(`/ai/tasks/${taskId}`),
    getTaskResult: (taskId: string) =>
      this.request<Record<string, unknown>>(`/ai/tasks/${taskId}/result`),
    conversations: {
      list: (params?: Record<string, string>) => {
        const p: Record<string, string> = { ...(params || {}) };
        return this.request<AiTypes.AiConversationListResponse>('/ai/conversations', { params: p });
      },
      get: (conversationId: string) =>
        this.request<AiTypes.AiConversationDetail>(`/ai/conversations/${conversationId}`),
      create: (data: AiTypes.AiConversationCreateRequest) =>
        this.request<AiTypes.AiConversationDetail>('/ai/conversations', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (conversationId: string, data: AiTypes.AiConversationUpdateRequest) =>
        this.request<AiTypes.AiConversationDetail>(`/ai/conversations/${conversationId}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      delete: (conversationId: string) =>
        this.request<MessageResponse>(`/ai/conversations/${conversationId}`, {
          method: 'DELETE',
        }),
      listMessages: (conversationId: string) =>
        this.request<{ messages: AiTypes.AiConversationMessage[] }>(
          `/ai/conversations/${conversationId}/messages`
        ),
      addMessage: (
        conversationId: string,
        data: AiTypes.AiConversationMessageCreateRequest
      ) =>
        this.request<AiTypes.AiConversationMessage>(
          `/ai/conversations/${conversationId}/messages`,
          { method: 'POST', body: JSON.stringify(data) }
        ),
    },
  };

  // ========================================================================
  // ANALYTICS SERVICE
  // ========================================================================

  analytics = {
    health: () => this.request<HealthResponse>('/analytics/health'),
    getDashboard: (timeRange: string = '7d') =>
      this.request<AnalyticsTypes.DashboardData>('/analytics/dashboard', {
        params: { time_range: timeRange },
      }),
    getPipeline: () => this.request<AnalyticsTypes.PipelineData>('/analytics/pipeline'),
    getAiPerformance: () =>
      this.request<AnalyticsTypes.AiPerformance>('/analytics/ai-performance'),
    getRecruiterProductivity: () =>
      this.request<AnalyticsTypes.RecruiterProductivity>('/analytics/recruiter-productivity'),
    getTimeToHire: () =>
      this.request<AnalyticsTypes.TimeToHire>('/analytics/time-to-hire'),
    generateReport: (data: AnalyticsTypes.GenerateReportRequest) =>
      this.request<AnalyticsTypes.Report>('/analytics/reports', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getReport: (reportId: string) =>
      this.request<AnalyticsTypes.Report>(`/analytics/reports/${reportId}`),
  };

  // ========================================================================
  // EXPORTS / SCHEDULED REPORTS
  // ========================================================================

  exports = {
    list: (params?: Record<string, string>) =>
      this.request<unknown>('/exports', { params }),
    listScheduled: () =>
      this.request<unknown>('/exports/schedule', {}),
    schedule: (data: {
      type: string;
      format: string;
      frequency: string;
      recipients: string[];
      start_date?: string;
      end_date?: string;
    }) =>
      this.request<unknown>('/exports/schedule', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deleteScheduled: (id: string) =>
      this.request<MessageResponse>(`/exports/schedule/${id}`, { method: 'DELETE' }),
    generate: (data: {
      type: string;
      format: 'csv' | 'xlsx' | 'pdf';
      start_date?: string;
      end_date?: string;
      department?: string;
      location?: string;
      job_id?: string;
    }) =>
      this.request<{ id?: string; url?: string; download_url?: string; name?: string; size?: number }>(
        '/exports',
        { method: 'POST', body: JSON.stringify(data) },
      ),
  };

  // ========================================================================
  // WORKFLOWS SERVICE
  // ========================================================================

  workflows = {
    health: () => this.request<HealthResponse>('/workflows/health'),
    list: (params?: Record<string, string>) =>
      this.request<WorkflowTypes.WorkflowListResponse>('/workflows/', { params }),
    get: (workflowId: string) =>
      this.request<WorkflowTypes.Workflow>(`/workflows/${workflowId}`),
    create: (data: WorkflowTypes.WorkflowCreate) =>
      this.request<WorkflowTypes.Workflow>('/workflows/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (workflowId: string, data: WorkflowTypes.WorkflowUpdate) =>
      this.request<WorkflowTypes.Workflow>(`/workflows/${workflowId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (workflowId: string) =>
      this.request<MessageResponse>(`/workflows/${workflowId}`, { method: 'DELETE' }),
    trigger: (workflowId: string, data?: Record<string, unknown>) =>
      this.request<WorkflowTypes.WorkflowExecution>(`/workflows/${workflowId}/trigger`, {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    activate: (workflowId: string) =>
      this.request<WorkflowTypes.Workflow>(`/workflows/${workflowId}/activate`, {
        method: 'POST',
      }),
    deactivate: (workflowId: string) =>
      this.request<WorkflowTypes.Workflow>(`/workflows/${workflowId}/deactivate`, {
        method: 'POST',
      }),
    listExecutions: (workflowId: string) =>
      this.request<WorkflowTypes.ExecutionListResponse>(`/workflows/${workflowId}/executions`),
  };

  // ========================================================================
  // NOTIFICATIONS SERVICE
  // ========================================================================

  notifications = {
    health: () => this.request<HealthResponse>('/notifications/health'),
    list: (params?: Record<string, string>) =>
      this.request<NotificationTypes.NotificationListResponse>('/notifications/', { params }),
    get: (notificationId: string) =>
      this.request<NotificationTypes.Notification>(`/notifications/${notificationId}`),
    create: (data: NotificationTypes.NotificationCreate) =>
      this.request<NotificationTypes.Notification>('/notifications/', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (notificationId: string, data: NotificationTypes.NotificationUpdate) =>
      this.request<NotificationTypes.Notification>(`/notifications/${notificationId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (notificationId: string) =>
      this.request<MessageResponse>(`/notifications/${notificationId}`, { method: 'DELETE' }),
    markRead: (notificationId: string) =>
      this.request<MessageResponse>(`/notifications/${notificationId}/read`, { method: 'POST' }),
    markAllRead: () =>
      this.request<MessageResponse>('/notifications/read-all', { method: 'POST' }),
    getPreferences: () =>
      this.request<NotificationTypes.NotificationPreferences>('/notifications/preferences'),
    updatePreferences: (data: NotificationTypes.PreferencesUpdate) =>
      this.request<NotificationTypes.NotificationPreferences>('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // ========================================================================
  // TAGS SERVICE
  // ========================================================================

  tags = {
    health: () => this.request<HealthResponse>('/tags/health'),
    list: (params?: Record<string, string>) => {
      const p: Record<string, string> = { ...(params || {}) };
      return this.request<TagTypes.TagListResponse>('/tags/', { params: p });
    },
    get: (tagId: string) => this.request<TagTypes.Tag>('/tags/' + tagId),
    create: (data: TagTypes.TagCreateRequest) =>
      this.request<TagTypes.Tag>('/tags/', { method: 'POST', body: JSON.stringify(data) }),
    update: (tagId: string, data: TagTypes.TagUpdateRequest) =>
      this.request<TagTypes.Tag>('/tags/' + tagId, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (tagId: string) =>
      this.request<MessageResponse>('/tags/' + tagId, { method: 'DELETE' }),
    attachToCandidate: (tagId: string, candidateId: string) =>
      this.request<MessageResponse>('/tags/' + tagId + '/candidates/' + candidateId, {
        method: 'POST',
      }),
    detachFromCandidate: (tagId: string, candidateId: string) =>
      this.request<MessageResponse>('/tags/' + tagId + '/candidates/' + candidateId, {
        method: 'DELETE',
      }),
    attachToJob: (tagId: string, jobId: string) =>
      this.request<MessageResponse>('/tags/' + tagId + '/jobs/' + jobId, { method: 'POST' }),
    detachFromJob: (tagId: string, jobId: string) =>
      this.request<MessageResponse>('/tags/' + tagId + '/jobs/' + jobId, { method: 'DELETE' }),
  };

  // ========================================================================
  // ACTIVITY FEED SERVICE
  // ========================================================================

  activity = {
    health: () => this.request<HealthResponse>('/activity/health'),
    list: (filters?: ActivityTypes.ActivityFilter) => {
      const params: Record<string, string> = {};
      if (!filters) return this.request<ActivityTypes.ActivityFeedResponse>('/activity/', { params });
      if (filters.actor_id) params.actor_id = filters.actor_id;
      if (filters.action) params.action = String(filters.action);
      if (filters.entity_type) params.entity_type = String(filters.entity_type);
      if (filters.target_id) params.target_id = filters.target_id;
      if (filters.target_type) params.target_type = String(filters.target_type);
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.search) params.search = filters.search;
      if (filters.page !== undefined) params.page = String(filters.page);
      if (filters.page_size !== undefined) params.page_size = String(filters.page_size);
      return this.request<ActivityTypes.ActivityFeedResponse>('/activity/', { params });
    },
    getTypes: () =>
      this.request<ActivityTypes.ActivityTypesResponse>('/activity/types'),
  };

  // ========================================================================
  // COMPLIANCE SERVICE
  // ========================================================================

  compliance = {
    health: () => this.request<HealthResponse>('/compliance/health'),
    getStatus: () => this.request<ComplianceTypes.ComplianceStatus>('/compliance/status'),
    listPolicies: () =>
      this.request<ComplianceTypes.CompliancePolicy[]>('/compliance/policies'),
    getRetention: () =>
      this.request<ComplianceTypes.RetentionPolicy>('/compliance/retention'),
    getAuditLog: (params?: Record<string, string>) =>
      this.request<ComplianceTypes.AuditLogResponse>('/compliance/audit-log', { params }),
    createAuditEntry: (data: ComplianceTypes.AuditEntryIn) =>
      this.request<ComplianceTypes.AuditEntry>('/compliance/audit-log', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    recordConsent: (data: ComplianceTypes.ConsentRecordRequest) =>
      this.request<ComplianceTypes.ConsentRecord>('/compliance/consent', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listConsent: (params?: Record<string, string>) =>
      this.request<ComplianceTypes.ConsentListResponse>('/compliance/consent', { params }),
    requestDataExport: (data: ComplianceTypes.DataExportRequest) =>
      this.request<ComplianceTypes.DataExportJob>('/compliance/data-export', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getDataExport: (exportId: string) =>
      this.request<ComplianceTypes.DataExportJob>(`/compliance/data-export/${exportId}`),
    requestDataDeletion: (data: ComplianceTypes.DataDeletionRequestIn) =>
      this.request<ComplianceTypes.DataExportJob>('/compliance/data-deletion', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    runCheck: (data?: ComplianceTypes.ComplianceCheckRequest) =>
      this.request<ComplianceTypes.ComplianceCheckResult>('/compliance/check', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
    getReport: () =>
      this.request<ComplianceTypes.ComplianceReport>('/compliance/report'),
  };

  // ========================================================================
  // BILLING SERVICE
  // ========================================================================

  billing = {
    health: () => this.request<HealthResponse>('/billing/health'),

    // Plans
    listPlans: () => this.request<BillingTypes.PlanListResponse>('/billing/plans'),
    getPlan: (planId: string) => this.request<BillingTypes.Plan>(`/billing/plans/${planId}`),

    // Customer
    getCustomer: () => this.request<BillingTypes.BillingCustomer>('/billing/customer'),
    updateCustomer: (data: BillingTypes.CustomerUpdateRequest) =>
      this.request<BillingTypes.BillingCustomer>('/billing/customer', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    // Payment methods
    setupPaymentMethod: () =>
      this.request<BillingTypes.SetupIntentResponse>('/billing/payment-methods/setup', {
        method: 'POST',
      }),
    listMyPaymentMethods: () =>
      this.request<BillingTypes.PaymentMethod[]>('/billing/payment-methods/mine'),
    addMyPaymentMethod: (data: BillingTypes.AddPaymentMethodBody) =>
      this.request<BillingTypes.PaymentMethod>('/billing/payment-methods/mine', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    removeMyPaymentMethod: (pmId: string) =>
      this.request<MessageResponse>(`/billing/payment-methods/mine/${pmId}`, {
        method: 'DELETE',
      }),
    setDefaultPaymentMethod: (pmId: string) =>
      this.request<BillingTypes.PaymentMethod>(
        `/billing/payment-methods/mine/${pmId}/default`,
        { method: 'PUT' },
      ),

    // Invoices
    listMyInvoices: () =>
      this.request<BillingTypes.InvoiceListResponse>('/billing/invoices/mine'),
    getMyInvoice: (invoiceId: string) =>
      this.request<BillingTypes.Invoice>(`/billing/invoices/mine/${invoiceId}`),
    getMyInvoicePdf: (invoiceId: string) =>
      this.request<{ url: string } | Blob>(`/billing/invoices/mine/${invoiceId}/pdf`).catch(
        () => ({ url: '' } as { url: string }),
      ),

    // Usage
    getMyUsage: () => this.request<BillingTypes.UsageRecord[]>('/billing/usage/me'),
    recordUsage: (data: BillingTypes.UsageEvent) =>
      this.request<MessageResponse>('/billing/usage/record', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // Coupons / Portal / Trial
    applyCoupon: (data: BillingTypes.CouponRequest) =>
      this.request<BillingTypes.CouponResult>('/billing/coupon', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getPortalUrl: () => this.request<BillingTypes.PortalResponse>('/billing/portal'),
    startTrial: (data: BillingTypes.TrialRequest) =>
      this.request<BillingTypes.Subscription>('/billing/trial', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // Admin
    adminListSubscriptions: (params?: Record<string, string>) =>
      this.request<PaginatedResponse<BillingTypes.AdminSubscription>>(
        '/billing/admin/subscriptions',
        { params },
      ),
    adminRefund: (data: BillingTypes.RefundRequest) =>
      this.request<MessageResponse>('/billing/admin/refund', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adminCredit: (data: BillingTypes.CreditRequest) =>
      this.request<MessageResponse>('/billing/admin/credit', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    adminForceCancel: (subscriptionId: string) =>
      this.request<MessageResponse>(`/billing/admin/cancel/${subscriptionId}`, {
        method: 'POST',
      }),

    // Webhook
    stripeWebhook: (data: Record<string, unknown>) =>
      this.request<BillingTypes.WebhookResponse>('/billing/webhook', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // Legacy endpoints
    getSubscriptionLegacy: () =>
      this.request<BillingTypes.Subscription>('/billing/subscription'),
    subscribeLegacy: (data: BillingTypes.CheckoutRequest) =>
      this.request<BillingTypes.CheckoutResponse>('/billing/subscribe', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listInvoicesLegacy: () =>
      this.request<BillingTypes.InvoiceListResponse>('/billing/invoices'),
    getInvoiceLegacy: (invoiceId: string) =>
      this.request<BillingTypes.Invoice>(`/billing/invoices/${invoiceId}`),
    getUsageLegacy: () => this.request<BillingTypes.UsageRecord[]>('/billing/usage'),
    listPaymentMethodsLegacy: () =>
      this.request<BillingTypes.PaymentMethod[]>('/billing/payment-methods'),
    addPaymentMethodLegacy: (data: BillingTypes.AddPaymentMethodBody) =>
      this.request<BillingTypes.PaymentMethod>('/billing/payment-methods', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deletePaymentMethodLegacy: (methodId: string) =>
      this.request<MessageResponse>(`/billing/payment-methods/${methodId}`, {
        method: 'DELETE',
      }),

    // Checkout
    createCheckout: (data: BillingTypes.CheckoutRequest) =>
      this.request<BillingTypes.CheckoutResponse>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // My subscription
    getMySubscription: () =>
      this.request<BillingTypes.Subscription>('/billing/subscription/me'),
    updateMySubscription: (data: BillingTypes.SubscriptionUpdateRequest) =>
      this.request<BillingTypes.Subscription>('/billing/subscription/me', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    cancelMySubscription: (data?: BillingTypes.CancelSubscriptionRequest) =>
      this.request<BillingTypes.Subscription>('/billing/subscription/me', {
        method: 'DELETE',
        body: JSON.stringify(data || {}),
      }),
    resumeMySubscription: () =>
      this.request<BillingTypes.Subscription>('/billing/subscription/resume', {
        method: 'POST',
      }),
    pauseMySubscription: (data?: BillingTypes.PauseSubscriptionRequest) =>
      this.request<BillingTypes.Subscription>('/billing/subscription/pause', {
        method: 'POST',
        body: JSON.stringify(data || {}),
      }),
  };

  // ========================================================================
  // SUPPORT SERVICE
  // ========================================================================

  support = {
    health: () => this.request<HealthResponse>('/support/health'),
    stats: () => this.request<any>('/support/stats'),
    listTickets: (params?: { status?: string; priority?: string; limit?: number; offset?: number }) => {
      const p: Record<string, string> = {};
      if (params?.status) p.status = params.status;
      if (params?.priority) p.priority = params.priority;
      if (params?.limit) p.limit = String(params.limit);
      if (params?.offset) p.offset = String(params.offset);
      return this.request<any>('/support/tickets', { params: p });
    },
    getTicket: (id: string) => this.request<any>(`/support/tickets/${id}`),
    createTicket: (data: { subject: string; message: string; priority?: string; category?: string }) =>
      this.request<any>('/support/tickets', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateTicket: (id: string, data: any) =>
      this.request<any>(`/support/tickets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteTicket: (id: string) =>
      this.request<any>(`/support/tickets/${id}`, {
        method: 'DELETE',
      }),
    closeTicket: (id: string) =>
      this.request<any>(`/support/tickets/${id}/close`, {
        method: 'POST',
      }),
    reopenTicket: (id: string) =>
      this.request<any>(`/support/tickets/${id}/reopen`, {
        method: 'POST',
      }),
    addMessage: (id: string, message: string) =>
      this.request<any>(`/support/tickets/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    listMessages: (id: string) =>
      this.request<any>(`/support/tickets/${id}/messages`),
  };

  // Deprecated aliases
  listSupportTickets = this.support.listTickets;
  createSupportTicket = this.support.createTicket;

  // ========================================================================
  // SEARCH SERVICE (vector_search_service)
  // ========================================================================

  search = {
    health: () => this.request<HealthResponse>('/search/health'),
    searchCandidates: (data: SearchTypes.CandidateSearchRequest) =>
      this.request<SearchTypes.SearchResponse>('/search/candidates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    searchJobs: (data: SearchTypes.JobSearchRequest) =>
      this.request<SearchTypes.SearchResponse>('/search/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    generateEmbedding: (data: SearchTypes.EmbeddingRequest) =>
      this.request<SearchTypes.Embedding>('/search/embeddings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getEmbedding: (embeddingId: string) =>
      this.request<SearchTypes.Embedding>(`/search/embeddings/${embeddingId}`),
    similaritySearch: (data: SearchTypes.SimilarityRequest) =>
      this.request<SearchTypes.SearchResponse>('/search/similarity', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // ========================================================================
  // WEBSOCKET SERVICE
  // ========================================================================

  ws = {
    health: () => this.request<WebSocketTypes.WsHealth>('/ws/health'),
    broadcast: (data: WebSocketTypes.BroadcastRequest) =>
      this.request<MessageResponse>('/ws/broadcast', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    listConnections: () =>
      this.request<WebSocketTypes.WsConnectionList>('/ws/connections'),
    getBroadcastLog: () =>
      this.request<WebSocketTypes.BroadcastLog>('/ws/broadcast-log'),
  };

  // ========================================================================
  // RESUME ANALYSIS
  // ========================================================================

  resumeAnalysis = {
    health: () => this.request<HealthResponse>('/resume-analysis/health'),
    analyze: (data: ResumeAnalysisTypes.AnalyzeRequest) =>
      this.request<ResumeAnalysisTypes.ResumeAnalysis>('/resume-analysis/analyze', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    extract: (data: ResumeAnalysisTypes.ExtractRequest) =>
      this.request<ResumeAnalysisTypes.ExtractResponse>('/resume-analysis/extract', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    compare: (data: ResumeAnalysisTypes.ResumeCompareRequest) =>
      this.request<ResumeAnalysisTypes.ResumeCompareResponse>(
        '/resume-analysis/compare',
        { method: 'POST', body: JSON.stringify(data) },
      ),
  };

  // ========================================================================
  // SCHEDULING SERVICE
  // ========================================================================

  scheduling = {
    health: () => this.request<HealthResponse>('/scheduling/health'),
    suggest: (data: SchedulingTypes.SuggestRequest) =>
      this.request<SchedulingTypes.SuggestResponse>('/scheduling/suggest', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    optimize: (data: SchedulingTypes.OptimizeRequest) =>
      this.request<SchedulingTypes.OptimizeResponse>('/scheduling/optimize', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getAvailability: (interviewerId: string) =>
      this.request<SchedulingTypes.Availability>(
        `/scheduling/availability/${interviewerId}`,
      ),
    setAvailability: (data: SchedulingTypes.AvailabilitySetRequest) =>
      this.request<MessageResponse>('/scheduling/availability', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // ========================================================================
  // FRAUD DETECTION
  // ========================================================================

  fraud = {
    health: () => this.request<HealthResponse>('/fraud/health'),
    analyze: (data: FraudTypes.FraudAnalyzeRequest) =>
      this.request<FraudTypes.FraudAnalysis>('/fraud/analyze', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getPatterns: () => this.request<FraudTypes.FraudPatternList>('/fraud/patterns'),
    listAnalyses: (params?: Record<string, string>) =>
      this.request<FraudTypes.FraudAnalysisList>('/fraud/analyses', { params }),
  };

  // ========================================================================
  // COMPLIANCE AUTOMATION
  // ========================================================================

  complianceAutomation = {
    health: () => this.request<HealthResponse>('/compliance-automation/health'),
    getStatus: () =>
      this.request<ComplianceAutomationTypes.ComplianceStatus>(
        '/compliance-automation/status',
      ),
    runAudit: (data?: ComplianceAutomationTypes.AuditRequest) =>
      this.request<ComplianceAutomationTypes.AuditResult>(
        '/compliance-automation/audit',
        { method: 'POST', body: JSON.stringify(data || {}) },
      ),
    getRetention: () =>
      this.request<ComplianceAutomationTypes.RetentionPolicy>(
        '/compliance-automation/retention',
      ),
    processGdpr: (data: ComplianceAutomationTypes.GdprRequest) =>
      this.request<ComplianceAutomationTypes.GdprResult>(
        '/compliance-automation/gdpr',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    listAudits: () =>
      this.request<ComplianceAutomationTypes.AuditListResponse>(
        '/compliance-automation/audits',
      ),
  };

  // ========================================================================
  // AI EVALUATION SERVICE
  // ========================================================================

  aiEvaluation = {
    health: () => this.request<HealthResponse>('/ai-evaluation/health'),
    evaluate: (data: AiEvaluationTypes.EvaluationRequest) =>
      this.request<AiEvaluationTypes.Evaluation>('/ai-evaluation/evaluate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    list: (params?: Record<string, string>) =>
      this.request<PaginatedResponse<AiEvaluationTypes.Evaluation>>(
        '/ai-evaluation/list',
        { params },
      ),
    explain: (evaluationId: string) =>
      this.request<AiEvaluationTypes.EvaluationExplanation>(
        `/ai-evaluation/${evaluationId}/explain`,
      ),
    submitFeedback: (evaluationId: string, data: AiEvaluationTypes.EvaluationFeedbackRequest) =>
      this.request<MessageResponse>(`/ai-evaluation/${evaluationId}/feedback`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getFeedback: (evaluationId: string) =>
      this.request<AiEvaluationTypes.EvaluationFeedback>(
        `/ai-evaluation/${evaluationId}/feedback`,
      ),
    compare: (data: AiEvaluationTypes.CompareRequest) =>
      this.request<AiEvaluationTypes.CompareResponse>('/ai-evaluation/compare', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getBenchmarks: () =>
      this.request<AiEvaluationTypes.EvaluationBenchmark[]>(
        '/ai-evaluation/benchmarks',
      ),
  };

  // ========================================================================
  // TALENT INTELLIGENCE
  // ========================================================================

  talentIntelligence = {
    health: () => this.request<HealthResponse>('/talent-intelligence/health'),
    getMarketInsights: (params?: Record<string, string>) =>
      this.request<TalentIntelTypes.MarketInsights>('/talent-intelligence/market', {
        params,
      }),
    getCompetitorAnalysis: () =>
      this.request<TalentIntelTypes.CompetitorList>(
        '/talent-intelligence/competitors',
      ),
    getSalaryBenchmarks: (params?: Record<string, string>) =>
      this.request<TalentIntelTypes.SalaryBenchmark[]>(
        '/talent-intelligence/salary',
        { params },
      ),
    getTalentPool: (params?: Record<string, string>) =>
      this.request<TalentIntelTypes.TalentPool>('/talent-intelligence/pool', {
        params,
      }),
  };

  // ========================================================================
  // WORKFLOW AUTOMATION
  // ========================================================================

  workflowAutomation = {
    health: () => this.request<HealthResponse>('/workflow-automation/health'),
    listTemplates: () =>
      this.request<WorkflowAutomationTypes.TemplateList>(
        '/workflow-automation/templates',
      ),
    listAllTriggers: () =>
      this.request<WorkflowAutomationTypes.TriggerList>(
        '/workflow-automation/triggers',
      ),
    createTrigger: (data: WorkflowAutomationTypes.TriggerCreateRequest) =>
      this.request<WorkflowAutomationTypes.Trigger>(
        '/workflow-automation/triggers',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    listAllExecutions: (params?: Record<string, string>) =>
      this.request<WorkflowAutomationTypes.ExecutionListResponse>(
        '/workflow-automation/executions',
        { params },
      ),
    listExecutionsByWorkflow: (workflowId: string) =>
      this.request<WorkflowAutomationTypes.ExecutionListResponse>(
        `/workflow-automation/executions/${workflowId}`,
      ),
  };

  // ========================================================================
  // INNOVATIONS
  // ========================================================================

  innovations = {
    health: () => this.request<HealthResponse>('/innovations/health'),
    detectBias: (data: InnovationsTypes.BiasDetectionRequest) =>
      this.request<InnovationsTypes.BiasDetectionResult>(
        '/innovations/bias-detection',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    predictSuccess: (data: InnovationsTypes.PredictSuccessRequest) =>
      this.request<InnovationsTypes.SuccessPrediction>(
        '/innovations/predict-success',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    smartSchedule: (data: InnovationsTypes.SmartScheduleRequest) =>
      this.request<InnovationsTypes.SmartScheduleResponse>(
        '/innovations/smart-schedule',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    skillsGap: (data: InnovationsTypes.SkillsGapRequest) =>
      this.request<InnovationsTypes.SkillsGap>('/innovations/skills-gap', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    diversityReport: (params?: Record<string, string>) =>
      this.request<InnovationsTypes.DiversityReport>(
        '/innovations/diversity-report',
        { params },
      ),
    diversity: (params?: Record<string, string>) =>
      this.request<InnovationsTypes.DiversityReport>('/innovations/diversity', {
        params,
      }),
    videoAnalysis: (data: InnovationsTypes.VideoAnalysisRequest) =>
      this.request<InnovationsTypes.VideoAnalysisResult>(
        '/innovations/video-analysis',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    experiencePrediction: (data: InnovationsTypes.ExperiencePredictionRequest) =>
      this.request<InnovationsTypes.ExperiencePrediction>(
        '/innovations/experience-prediction',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    recruiterAssist: (data: InnovationsTypes.RecruiterAssistRequest) =>
      this.request<InnovationsTypes.RecruiterAssistResponse>(
        '/innovations/recruiter-assist',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    getCandidateExperience: (candidateId: string) =>
      this.request<InnovationsTypes.CandidateExperienceReport>(
        `/innovations/candidate-experience/${candidateId}`,
      ),
  };

  // ========================================================================
  // LEGACY FLAT METHODS (backward compat with existing stores/pages)
  // ========================================================================

  /** @deprecated use `api.auth.login()` */
  async login(email: string, password: string) {
    return this.auth.login(email, password);
  }
  /** @deprecated use `api.auth.register()` */
  async register(email: string, fullName: string, password: string) {
    return this.auth.register({ email, full_name: fullName, password });
  }
  /** @deprecated use `api.auth.logout()` */
  async logout() {
    return this.auth.logout();
  }

  /** @deprecated use `api.sso.listProviders()` */
  async getSSOProviders() {
    return this.sso.listProviders();
  }
  /** @deprecated use `api.sso.getAuthorizeUrl()` */
  async getSSOAuthorizeUrl(provider: string, redirectUri: string) {
    return this.sso.getAuthorizeUrl(provider, redirectUri);
  }
  /** @deprecated use `api.sso.callback()` */
  async ssoLogin(provider: string, code: string, redirectUri: string) {
    return this.sso.callback(provider, { provider, code, redirect_uri: redirectUri });
  }

  /** @deprecated use `api.candidates.list()` */
  async listCandidates(params?: Record<string, string>) {
    return this.candidates.list(params);
  }
  /** @deprecated use `api.candidates.get()` */
  async getCandidate(id: string) {
    return this.candidates.get(id);
  }
  /** @deprecated use `api.candidates.create()` */
  async createCandidate(data: any) {
    return this.candidates.create(data);
  }
  /** @deprecated use `api.candidates.update()` */
  async updateCandidate(id: string, data: any) {
    return this.candidates.update(id, data);
  }
  /** @deprecated use `api.candidates.enrich()` */
  async enrichCandidate(id: string) {
    return this.candidates.enrich(id);
  }
  /** @deprecated use `api.candidates.match()` */
  async matchCandidate(id: string) {
    return this.candidates.match(id);
  }

  /** @deprecated use `api.jobs.list()` */
  async listJobs(params?: Record<string, string>) {
    return this.jobs.list(params);
  }
  /** @deprecated use `api.jobs.get()` */
  async getJob(id: string) {
    return this.jobs.get(id);
  }
  /** @deprecated use `api.jobs.create()` */
  async createJob(data: any) {
    return this.jobs.create(data);
  }

  /** @deprecated use `api.interviews.list()` */
  async listInterviews(params?: Record<string, string>) {
    return this.interviews.list(params);
  }
  /** @deprecated use `api.interviews.create()` */
  async createInterview(data: any) {
    return this.interviews.create(data);
  }
  /** @deprecated use `api.interviews.start()` */
  async startInterview(id: string) {
    return this.interviews.start(id);
  }
  /** @deprecated use `api.interviews.complete()` */
  async completeInterview(id: string) {
    return this.interviews.complete(id);
  }

  /** @deprecated use `api.ppe.createSession()` */
  async createPPESession(data: any) {
    return this.ppe.createSession(data);
  }
  /** @deprecated use `api.ppe.getSession()` */
  async getPPESession(id: string) {
    return this.ppe.getSession(id);
  }
  /** @deprecated use `api.ppe.executeCode()` */
  async submitPPCode(sessionId: string, data: { code: string; language: string }) {
    return this.ppe.executeCode(sessionId, data);
  }
  /** @deprecated use `api.ppe.requestHint()` */
  async requestHint(sessionId: string) {
    return this.ppe.requestHint(sessionId);
  }
  /** @deprecated use `api.ppe.listProblems()` */
  async listPPEProblems() {
    return this.ppe.listProblems();
  }

  /** @deprecated use `api.ai.listAgents()` */
  async listAIAgents() {
    return this.ai.listAgents();
  }
  /** @deprecated use `api.ai.orchestrate()` */
  async orchestrate(data: any) {
    return this.ai.orchestrate(data);
  }

  /** @deprecated use `api.analytics.getDashboard()` */
  async getDashboard(timeRange: string = '7d') {
    return this.analytics.getDashboard(timeRange);
  }
  /** @deprecated use `api.analytics.getPipeline()` */
  async getPipelineAnalytics() {
    return this.analytics.getPipeline();
  }
  /** @deprecated use `api.analytics.getAiPerformance()` */
  async getAIPerformance() {
    return this.analytics.getAiPerformance();
  }

  /** @deprecated use `api.workflows.list()` */
  async listWorkflows() {
    return this.workflows.list();
  }
  /** @deprecated use `api.workflows.create()` */
  async createWorkflow(data: any) {
    return this.workflows.create(data);
  }

  /** @deprecated use `api.notifications.list()` */
  async listNotifications() {
    return this.notifications.list();
  }
  /** @deprecated use `api.notifications.markRead()` */
  async markNotificationRead(notificationId: string) {
    return this.notifications.markRead(notificationId);
  }
  /** @deprecated use `api.notifications.markAllRead()` */
  async markAllNotificationsRead() {
    return this.notifications.markAllRead();
  }

  /** @deprecated use `api.compliance.getStatus()` */
  async getComplianceStatus() {
    return this.compliance.getStatus();
  }

  /** @deprecated use `api.billing.getSubscriptionLegacy()` */
  async getSubscription() {
    return this.billing.getSubscriptionLegacy();
  }
  /** @deprecated use `api.billing.listInvoicesLegacy()` */
  async listInvoices() {
    return this.billing.listInvoicesLegacy();
  }
  /** @deprecated use `api.billing.getUsageLegacy()` */
  async getUsage() {
    return this.billing.getUsageLegacy();
  }

  /** @deprecated use `api.auth.getMe()` */
  async me() {
    return this.auth.getMe();
  }
  /** @deprecated use `api.users.update()` */
  async updateUser(id: string, data: any) {
    return this.users.update(id, data);
  }
  /** @deprecated use `api.auth.updateMyProfile()` */
  async updateMyProfile(data: any) {
    return this.auth.updateMyProfile(data);
  }
  /** @deprecated use `api.auth.changePassword()` */
  async changePassword(data: { current_password: string; new_password: string }) {
    return this.auth.changePassword(data);
  }
  /** @deprecated use `api.auth.enableMfa()` */
  async enableMFA() {
    return this.auth.enableMfa({} as any);
  }
  /** @deprecated use `api.notifications.getPreferences()` */
  async getNotificationPreferences() {
    return this.notifications.getPreferences();
  }
  /** @deprecated use `api.notifications.updatePreferences()` */
  async updateNotificationPreferences(data: any) {
    return this.notifications.updatePreferences(data);
  }

  /** @deprecated use `api.workflows.activate()` */
  async activateWorkflow(id: string) {
    return this.workflows.activate(id);
  }
  /** @deprecated use `api.workflows.deactivate()` */
  async deactivateWorkflow(id: string) {
    return this.workflows.deactivate(id);
  }
  /** @deprecated use `api.workflows.delete()` */
  async deleteWorkflow(id: string) {
    return this.workflows.delete(id);
  }
  /** @deprecated use `api.workflows.trigger()` */
  async triggerWorkflow(id: string, data?: any) {
    return this.workflows.trigger(id, data);
  }

  /** @deprecated use `api.search.searchCandidates()` */
  async searchCandidates(query: string) {
    return this.search.searchCandidates({ query });
  }

  /** @deprecated use `api.innovations.detectBias()` */
  async detectBias(text: string) {
    return this.innovations.detectBias({ text });
  }
  /** @deprecated use `api.innovations.predictSuccess()` */
  async predictSuccess(candidateId: string, jobId: string) {
    return this.innovations.predictSuccess({ candidate_id: candidateId, job_id: jobId });
  }

  /** @deprecated use `api.activity.list()` */
  async listActivityFeed(filters?: ActivityTypes.ActivityFilter) {
    return this.activity.list(filters);
  }
  /** @deprecated use `api.activity.getTypes()` */
  async getActivityTypes() {
    return this.activity.getTypes();
  }
}

class APIError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'APIError';
  }
}

export const api = new APIClient();
export { APIError };
export type { APIClient };
