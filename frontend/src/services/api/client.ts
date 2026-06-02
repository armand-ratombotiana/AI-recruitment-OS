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

  async getSSOProviders() {
    return this.request<{ providers: Array<{ id: string; name: string; icon: string; auth_url: string }> }>('/sso/providers');
  }
  async getSSOAuthorizeUrl(provider: string, redirectUri: string) {
    return this.request<{ authorization_url: string; state: string }>(`/sso/providers/${provider}/authorize`, { params: { redirect_uri: redirectUri } });
  }
  async ssoLogin(provider: string, code: string, redirectUri: string) {
    const data = await this.request<{ access_token: string; user: any }>(`/sso/providers/${provider}/callback`, {
      method: 'POST',
      body: JSON.stringify({ provider, code, redirect_uri: redirectUri }),
    });
    this.setToken(data.access_token);
    return data;
  }

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

  async listJobs(params?: Record<string, string>) {
    return this.request<{ data: any[]; total: number }>('/jobs/', { params });
  }
  async getJob(id: string) {
    return this.request<any>(`/jobs/${id}`);
  }
  async createJob(data: any) {
    return this.request<any>('/jobs', { method: 'POST', body: JSON.stringify(data) });
  }

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

  async listAIAgents() {
    return this.request<{ data: any[] }>('/ai/agents');
  }
  async orchestrate(data: any) {
    return this.request<any>('/ai/orchestrate', { method: 'POST', body: JSON.stringify(data) });
  }

  async getDashboard(timeRange: string = '7d') {
    return this.request<any>('/analytics/dashboard', { params: { time_range: timeRange } });
  }
  async getPipelineAnalytics() {
    return this.request<any>('/analytics/pipeline');
  }
  async getAIPerformance() {
    return this.request<any>('/analytics/ai-performance');
  }

  async listWorkflows() {
    return this.request<{ data: any[] }>('/workflows/');
  }
  async createWorkflow(data: any) {
    return this.request<any>('/workflows', { method: 'POST', body: JSON.stringify(data) });
  }

  async listNotifications() {
    return this.request<{ data: any[] }>('/notifications/');
  }

  async getComplianceStatus() {
    return this.request<any>('/compliance/status');
  }

  async getSubscription() {
    return this.request<any>('/billing/subscription');
  }

  async searchCandidates(query: string) {
    return this.request<any>('/search/candidates', { method: 'POST', body: JSON.stringify({ query }) });
  }

  async detectBias(text: string) {
    return this.request<any>('/innovations/bias-detection', { method: 'POST', body: JSON.stringify({ text }) });
  }
  async predictSuccess(candidateId: string, jobId: string) {
    return this.request<any>('/innovations/predict-success', { method: 'POST', body: JSON.stringify({ candidate_id: candidateId, job_id: jobId }) });
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
