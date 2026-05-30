const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

  private async request<T>(endpoint: string, options: RequestInit & { params?: Record<string, string> } = {}): Promise<T> {
    const { params, ...fetchOptions } = options;
    let url = `${API_BASE}/api/v1${endpoint}`;
    if (params) url += `?${new URLSearchParams(params).toString()}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(fetchOptions.headers as Record<string, string>) };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { ...fetchOptions, headers });
    if (!response.ok) throw new APIError(`API error: ${response.status}`, response.status);
    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ access_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setToken(data.access_token);
    return data;
  }
  async register(email: string, fullName: string, password: string) {
    return this.request<any>('/auth/register', { method: 'POST', body: JSON.stringify({ email, full_name: fullName, password }) });
  }
  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.setToken(null);
  }

  // SSO
  async getSSOProviders() {
    return this.request<{ providers: any[] }>('/auth/providers');
  }
  async getSSOAuthorizeUrl(provider: string, redirectUri: string) {
    return this.request<any>(`/auth/providers/${provider}/authorize`, { params: { redirect_uri: redirectUri } });
  }
  async ssoCallback(provider: string, code: string, redirectUri: string) {
    const data = await this.request<any>(`/auth/sso/${provider}`, { method: 'POST', body: JSON.stringify({ code, redirect_uri: redirectUri }) });
    this.setToken(data.access_token);
    return data;
  }

  // Candidates
  async listCandidates(params?: Record<string, string>) {
    return this.request<{ data: any[]; total: number }>('/candidates/', { params });
  }
  async getCandidate(id: string) {
    return this.request<any>(`/candidates/${id}`);
  }
  async createCandidate(data: any) {
    return this.request<any>('/candidates', { method: 'POST', body: JSON.stringify(data) });
  }
  async updateCandidate(id: string, data: any) {
    return this.request<any>(`/candidates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }
  async enrichCandidate(id: string) {
    return this.request<any>(`/candidates/${id}/enrich`, { method: 'POST' });
  }
  async matchCandidate(id: string) {
    return this.request<any>(`/candidates/${id}/match`, { method: 'POST' });
  }

  // Jobs
  async listJobs(params?: Record<string, string>) {
    return this.request<{ data: any[]; total: number }>('/jobs/', { params });
  }
  async getJob(id: string) {
    return this.request<any>(`/jobs/${id}`);
  }
  async createJob(data: any) {
    return this.request<any>('/jobs', { method: 'POST', body: JSON.stringify(data) });
  }

  // Interviews
  async listInterviews(params?: Record<string, string>) {
    return this.request<{ data: any[]; total: number }>('/interviews/', { params });
  }
  async createInterview(data: any) {
    return this.request<any>('/interviews', { method: 'POST', body: JSON.stringify(data) });
  }
  async startInterview(id: string) {
    return this.request<any>(`/interviews/${id}/start`, { method: 'POST' });
  }
  async completeInterview(id: string) {
    return this.request<any>(`/interviews/${id}/complete`, { method: 'POST' });
  }

  // PPE
  async createPPESession(data: any) {
    return this.request<any>('/ppe/sessions', { method: 'POST', body: JSON.stringify(data) });
  }
  async getPPESession(id: string) {
    return this.request<any>(`/ppe/sessions/${id}`);
  }
  async submitPPCode(sessionId: string, data: { code: string; language: string }) {
    return this.request<any>(`/ppe/sessions/${sessionId}/execute`, { method: 'POST', body: JSON.stringify(data) });
  }
  async requestHint(sessionId: string) {
    return this.request<any>(`/ppe/sessions/${sessionId}/hint`, { method: 'POST' });
  }
  async listPPEProblems() {
    return this.request<any>('/ppe/problems');
  }

  // AI
  async listAIAgents() {
    return this.request<{ data: any[] }>('/ai/agents');
  }
  async orchestrate(data: any) {
    return this.request<any>('/ai/orchestrate', { method: 'POST', body: JSON.stringify(data) });
  }

  // Analytics
  async getDashboard(timeRange: string = '7d') {
    return this.request<any>('/analytics/dashboard', { params: { time_range: timeRange } });
  }
  async getPipelineAnalytics() {
    return this.request<any>('/analytics/pipeline');
  }
  async getAIPerformance() {
    return this.request<any>('/analytics/ai-performance');
  }

  // Workflows
  async listWorkflows() {
    return this.request<{ data: any[] }>('/workflows/');
  }
  async createWorkflow(data: any) {
    return this.request<any>('/workflows', { method: 'POST', body: JSON.stringify(data) });
  }

  // Notifications
  async listNotifications() {
    return this.request<{ data: any[] }>('/notifications/');
  }
  async markNotificationRead(id: string) {
    return this.request<any>(`/notifications/${id}/read`, { method: 'PUT' });
  }

  // Compliance
  async getComplianceStatus() {
    return this.request<any>('/compliance/status');
  }

  // Billing
  async getSubscription() {
    return this.request<any>('/billing/subscription');
  }
  async listInvoices() {
    return this.request<any>('/billing/invoices');
  }

  // Search
  async searchCandidates(query: string) {
    return this.request<any>('/search/candidates', { method: 'POST', body: JSON.stringify({ query }) });
  }
  async searchJobs(query: string) {
    return this.request<any>('/search/jobs', { method: 'POST', body: JSON.stringify({ query }) });
  }

  // Innovation
  async detectBias(text: string) {
    return this.request<any>('/innovation/bias-detection', { method: 'POST', body: JSON.stringify({ text }) });
  }
  async predictSuccess(candidateId: string, jobId: string) {
    return this.request<any>('/innovation/predict-success', { method: 'POST', body: JSON.stringify({ candidate_id: candidateId, job_id: jobId }) });
  }
  async getSkillsGap(candidateId: string, jobId: string) {
    return this.request<any>('/innovation/skills-gap', { method: 'POST', body: JSON.stringify({ candidate_id: candidateId, job_id: jobId }) });
  }

  // SSO (alternative endpoints)
  async getSSOProvidersList() {
    return this.request<any>('/sso/providers');
  }
  async getSSOAuthUrl(provider: string, redirectUri: string) {
    return this.request<any>(`/sso/providers/${provider}/authorize`, { params: { redirect_uri: redirectUri } });
  }
  async ssoLogin(provider: string, code: string, redirectUri: string) {
    const data = await this.request<any>(`/sso/providers/${provider}/callback`, { method: 'POST', body: JSON.stringify({ provider, code, redirect_uri: redirectUri }) });
    this.setToken(data.access_token);
    return data;
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
