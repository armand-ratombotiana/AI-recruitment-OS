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

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE}/api/v1${endpoint}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json();
  }

  async login(email: string, password: string) {
    const data = await this.request<{ access_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setToken(data.access_token);
    return data;
  }

  async listCandidates() { return this.request<{ data: any[]; total: number }>('/candidates/'); }
  async getCandidate(id: string) { return this.request<any>(`/candidates/${id}`); }
  async listJobs() { return this.request<{ data: any[]; total: number }>('/jobs/'); }
  async getJob(id: string) { return this.request<any>(`/jobs/${id}`); }
  async listInterviews() { return this.request<{ data: any[]; total: number }>('/interviews/'); }
  async getDashboard() { return this.request<any>('/analytics/dashboard'); }
  async listWorkflows() { return this.request<{ data: any[]; total: number }>('/workflows/'); }
}

export const api = new APIClient();
