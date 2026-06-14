'use client';

import { useState, useCallback } from 'react';
import { Search, Send, Copy, Check, Trash2, ChevronDown, ChevronRight, Globe, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';

interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  auth: boolean;
  category: string;
}

interface RequestState {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  params: Record<string, string>;
}

interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number;
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20',
  POST: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
  PUT: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
  PATCH: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20',
  DELETE: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
};

const SAMPLE_ENDPOINTS: ApiEndpoint[] = [
  { method: 'GET', path: '/api/candidates', description: 'List all candidates', auth: true, category: 'Candidates' },
  { method: 'POST', path: '/api/candidates', description: 'Create a candidate', auth: true, category: 'Candidates' },
  { method: 'GET', path: '/api/candidates/:id', description: 'Get candidate by ID', auth: true, category: 'Candidates' },
  { method: 'PATCH', path: '/api/candidates/:id', description: 'Update a candidate', auth: true, category: 'Candidates' },
  { method: 'DELETE', path: '/api/candidates/:id', description: 'Delete a candidate', auth: true, category: 'Candidates' },
  { method: 'GET', path: '/api/jobs', description: 'List all jobs', auth: true, category: 'Jobs' },
  { method: 'POST', path: '/api/jobs', description: 'Create a job', auth: true, category: 'Jobs' },
  { method: 'GET', path: '/api/jobs/:id', description: 'Get job by ID', auth: true, category: 'Jobs' },
  { method: 'GET', path: '/api/interviews', description: 'List interviews', auth: true, category: 'Interviews' },
  { method: 'POST', path: '/api/interviews', description: 'Schedule an interview', auth: true, category: 'Interviews' },
  { method: 'GET', path: '/api/offers', description: 'List offers', auth: true, category: 'Offers' },
  { method: 'POST', path: '/api/offers', description: 'Create an offer', auth: true, category: 'Offers' },
  { method: 'POST', path: '/api/auth/login', description: 'Authenticate user', auth: false, category: 'Auth' },
  { method: 'POST', path: '/api/auth/logout', description: 'Logout user', auth: true, category: 'Auth' },
  { method: 'GET', path: '/api/analytics/dashboard', description: 'Dashboard metrics', auth: true, category: 'Analytics' },
  { method: 'GET', path: '/api/matching/scores', description: 'Get match scores', auth: true, category: 'Matching' },
  { method: 'POST', path: '/api/matching/run', description: 'Run matching algorithm', auth: true, category: 'Matching' },
];

export function ApiExplorer() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Candidates', 'Jobs']));
  const [request, setRequest] = useState<RequestState>({
    method: 'GET',
    url: '/api/candidates',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer <token>' },
    body: '',
    params: {},
  });
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'headers' | 'body' | 'params'>('body');

  const filteredEndpoints = SAMPLE_ENDPOINTS.filter(
    (ep) =>
      ep.path.toLowerCase().includes(search.toLowerCase()) ||
      ep.description.toLowerCase().includes(search.toLowerCase()) ||
      ep.category.toLowerCase().includes(search.toLowerCase())
  );

  const groupedEndpoints = filteredEndpoints.reduce<Record<string, ApiEndpoint[]>>((acc, ep) => {
    if (!acc[ep.category]) acc[ep.category] = [];
    acc[ep.category].push(ep);
    return acc;
  }, {});

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const selectEndpoint = (ep: ApiEndpoint) => {
    setRequest((prev) => ({
      ...prev,
      method: ep.method,
      url: ep.path,
      body: ep.method === 'GET' || ep.method === 'DELETE' ? '' : '{\n  \n}',
    }));
    setResponse(null);
  };

  const sendRequest = async () => {
    setLoading(true);
    const start = performance.now();

    try {
      const mockResponse = generateMockResponse(request.method, request.url);
      const duration = performance.now() - start;
      setResponse({
        status: mockResponse.status,
        statusText: mockResponse.statusText,
        headers: {
          'content-type': 'application/json',
          'x-request-id': crypto.randomUUID?.() || 'mock-id',
          'x-response-time': `${Math.round(duration)}ms`,
        },
        body: JSON.stringify(mockResponse.data, null, 2),
        duration,
      });
    } catch {
      setResponse({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {},
        body: JSON.stringify({ error: 'Request failed' }, null, 2),
        duration: performance.now() - start,
      });
    } finally {
      setLoading(false);
    }
  };

  const generateMockResponse = (method: string, url: string) => {
    if (url.includes('/candidates') && method === 'GET') {
      return {
        status: 200,
        statusText: 'OK',
        data: {
          data: [
            { id: '1', full_name: 'Jane Smith', email: 'jane@example.com', status: 'active', score: 87 },
            { id: '2', full_name: 'John Doe', email: 'john@example.com', status: 'screening', score: 72 },
          ],
          total: 24,
          page: 1,
        },
      };
    }
    if (url.includes('/jobs') && method === 'GET') {
      return {
        status: 200,
        statusText: 'OK',
        data: {
          data: [
            { id: '1', title: 'Senior React Engineer', department: 'Engineering', status: 'open', applicants: 12 },
            { id: '2', title: 'Product Designer', department: 'Design', status: 'open', applicants: 8 },
          ],
          total: 5,
          page: 1,
        },
      };
    }
    if (method === 'POST') {
      return { status: 201, statusText: 'Created', data: { id: 'new-id', created: true } };
    }
    if (method === 'DELETE') {
      return { status: 204, statusText: 'No Content', data: {} };
    }
    return { status: 200, statusText: 'OK', data: { message: 'Success' } };
  };

  const generateCurl = () => {
    const headersStr = Object.entries(request.headers)
      .map(([k, v]) => `-H '${k}: ${v}'`)
      .join(' \\\n  ');
    const bodyStr = request.body ? `\\\n  -d '${request.body}'` : '';
    return `curl -X ${request.method} \\\n  '${request.url}' \\\n  ${headersStr}${bodyStr ? ' \\\n  ' + bodyStr : ''}`;
  };

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(generateCurl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const clearRequest = () => {
    setRequest({
      method: 'GET',
      url: '',
      headers: { 'Content-Type': 'application/json' },
      body: '',
      params: {},
    });
    setResponse(null);
  };

  return (
    <div className="flex h-full flex-col lg:flex-row gap-4">
      <aside className="w-full lg:w-72 shrink-0 rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900 overflow-hidden flex flex-col">
        <div className="border-b border-gray-200 p-3 dark:border-surface-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('dev.api.searchEndpoints', 'Search endpoints...')}
              className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
              aria-label={t('dev.api.searchEndpoints', 'Search endpoints')}
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2" aria-label={t('dev.api.endpoints', 'API endpoints')}>
          {Object.entries(groupedEndpoints).map(([cat, endpoints]) => (
            <div key={cat} className="mb-1">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-800"
                aria-expanded={expandedCategories.has(cat)}
              >
                {expandedCategories.has(cat) ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                {cat}
                <span className="ml-auto text-[10px] text-gray-400">{endpoints.length}</span>
              </button>
              {expandedCategories.has(cat) && (
                <div className="ml-2 space-y-0.5">
                  {endpoints.map((ep, i) => (
                    <button
                      key={`${ep.method}-${ep.path}-${i}`}
                      type="button"
                      onClick={() => selectEndpoint(ep)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition',
                        request.method === ep.method && request.url === ep.path
                          ? 'bg-blue-50 dark:bg-brand-500/10'
                          : 'hover:bg-gray-50 dark:hover:bg-surface-800'
                      )}
                    >
                      <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold', METHOD_COLORS[ep.method])}>
                        {ep.method}
                      </span>
                      <span className="truncate text-xs text-gray-700 dark:text-gray-300">{ep.path}</span>
                      {ep.auth ? (
                        <Lock className="ml-auto h-3 w-3 shrink-0 text-gray-400" />
                      ) : (
                        <Unlock className="ml-auto h-3 w-3 shrink-0 text-gray-300" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className="rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-surface-700">
            <select
              value={request.method}
              onChange={(e) => setRequest((prev) => ({ ...prev, method: e.target.value }))}
              className={cn('rounded-md px-2 py-1 text-xs font-bold', METHOD_COLORS[request.method])}
              aria-label={t('dev.api.method', 'HTTP method')}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <div className="relative flex-1">
              <Globe className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={request.url}
                onChange={(e) => setRequest((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="/api/endpoint"
                className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 font-mono placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
                aria-label={t('dev.api.url', 'Request URL')}
              />
            </div>
            <button
              type="button"
              onClick={sendRequest}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-brand-500 dark:hover:bg-brand-600"
            >
              <Send className="h-3 w-3" />
              {loading ? t('dev.api.sending', 'Sending...') : t('dev.api.send', 'Send')}
            </button>
            <button
              type="button"
              onClick={clearRequest}
              className="inline-flex items-center rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-surface-800 dark:hover:text-gray-300"
              aria-label={t('dev.api.clear', 'Clear request')}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="border-b border-gray-200 dark:border-surface-700">
            <div className="flex gap-0 px-4" role="tablist">
              {(['headers', 'body', 'params'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    'border-b-2 px-3 py-2 text-xs font-medium capitalize transition',
                    activeTab === tab
                      ? 'border-blue-600 text-blue-600 dark:border-brand-400 dark:text-brand-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4">
            {activeTab === 'headers' && (
              <div className="space-y-2">
                {Object.entries(request.headers).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={key}
                      readOnly
                      className="w-1/3 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-mono text-gray-700 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-300"
                    />
                    <input
                      type="text"
                      value={value}
                      onChange={(e) =>
                        setRequest((prev) => ({
                          ...prev,
                          headers: { ...prev.headers, [key]: e.target.value },
                        }))
                      }
                      className="flex-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-mono text-gray-700 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-300"
                    />
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'body' && (
              <textarea
                value={request.body}
                onChange={(e) => setRequest((prev) => ({ ...prev, body: e.target.value }))}
                placeholder={'{\n  \n}'}
                rows={6}
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
                aria-label={t('dev.api.requestBody', 'Request body')}
              />
            )}
            {activeTab === 'params' && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('dev.api.noParams', 'No query parameters. Add them to the URL directly.')}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-surface-700 dark:bg-surface-800">
            <button
              type="button"
              onClick={copyCurl}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-surface-700"
            >
              {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
              {copied ? t('dev.api.copied', 'Copied!') : t('dev.api.copyCurl', 'Copy as cURL')}
            </button>
          </div>
        </div>

        {response && (
          <div className="rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900 overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-surface-700">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-bold',
                    response.status < 300
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : response.status < 400
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  )}
                >
                  {response.status} {response.statusText}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {Math.round(response.duration)}ms
                </span>
              </div>
            </div>
            <pre className="max-h-80 overflow-auto p-4 text-xs font-mono text-gray-800 dark:text-gray-200">
              <code>{response.body}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
