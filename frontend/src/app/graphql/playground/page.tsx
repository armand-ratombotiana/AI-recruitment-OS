'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  Database,
  Play,
  Key,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ArrowLeft,
  Code2,
  History,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { useThemeStore } from '@/stores/theme-store';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageToggle } from '@/components/ui/language-toggle';

const GRAPHQL_URL =
  process.env.NEXT_PUBLIC_GRAPHQL_URL ||
  (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/graphql';

const EXAMPLE_QUERIES = [
  {
    name: 'List Candidates',
    query: `query ListCandidates($limit: Int, $offset: Int) {
  candidates(limit: $limit, offset: $offset) {
    items {
      id
      firstName
      lastName
      email
      status
      createdAt
    }
    total
  }
}`,
    variables: `{ "limit": 10, "offset": 0 }`,
  },
  {
    name: 'List Jobs',
    query: `query ListJobs($status: String) {
  jobs(status: $status) {
    items {
      id
      title
      department
      location
      status
      createdAt
    }
    total
  }
}`,
    variables: `{ "status": "open" }`,
  },
  {
    name: 'Create Job',
    query: `mutation CreateJob($input: JobCreateInput!) {
  createJob(input: $input) {
    id
    title
    department
    status
    createdAt
  }
}`,
    variables: `{
  "input": {
    "title": "Senior Frontend Engineer",
    "department": "Engineering",
    "location": "Remote",
    "description": "Build next-gen recruitment tools"
  }
}`,
  },
  {
    name: 'Candidate Search',
    query: `query SearchCandidates($query: String!, $limit: Int) {
  searchCandidates(query: $query, limit: $limit) {
    items {
      id
      firstName
      lastName
      email
      skills
      matchScore
    }
    total
  }
}`,
    variables: `{ "query": "react typescript", "limit": 20 }`,
  },
  {
    name: 'Dashboard Stats',
    query: `query DashboardStats {
  dashboardStats {
    totalCandidates
    totalJobs
    openJobs
    interviewsThisWeek
    offersPending
    pipelineByStage {
      stage
      count
    }
  }
}`,
    variables: `{}`,
  },
];

interface HistoryEntry {
  id: string;
  query: string;
  variables: string;
  timestamp: number;
}

export default function GraphQLPlaygroundPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const initTheme = useThemeStore((s) => s._init);

  const [query, setQuery] = useState(EXAMPLE_QUERIES[0].query);
  const [variables, setVariables] = useState(EXAMPLE_QUERIES[0].variables);
  const [token, setToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [response, setResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'query' | 'variables'>('query');

  const queryRef = useRef<HTMLTextAreaElement>(null);
  const responseRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    initTheme();
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('airos_token');
      if (stored) setToken(stored);
      const hist = localStorage.getItem('airos_graphql_history');
      if (hist) {
        try { setHistory(JSON.parse(hist)); } catch { /* noop */ }
      }
    }
  }, [initTheme]);

  const executeQuery = useCallback(async () => {
    setLoading(true);
    setResponse('');
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('airos_token') : null);
      if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

      let parsedVars: Record<string, unknown> = {};
      if (variables.trim()) {
        try { parsedVars = JSON.parse(variables); } catch {
          setResponse(JSON.stringify({ error: 'Invalid JSON in variables' }, null, 2));
          setLoading(false);
          return;
        }
      }

      const res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: parsedVars }),
      });

      const data = await res.json();
      const duration = Date.now() - startTime;
      const result = {
        ...data,
        _meta: { status: res.status, duration: `${duration}ms` },
      };
      setResponse(JSON.stringify(result, null, 2));

      const entry: HistoryEntry = {
        id: Date.now().toString(36),
        query,
        variables,
        timestamp: Date.now(),
      };
      setHistory((prev) => {
        const updated = [entry, ...prev].slice(0, 50);
        try { localStorage.setItem('airos_graphql_history', JSON.stringify(updated)); } catch { /* noop */ }
        return updated;
      });
    } catch (err) {
      const duration = Date.now() - startTime;
      setResponse(JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
        _meta: { duration: `${duration}ms` },
      }, null, 2));
    } finally {
      setLoading(false);
    }
  }, [query, variables, token]);

  const loadExample = useCallback((idx: number) => {
    const ex = EXAMPLE_QUERIES[idx];
    setQuery(ex.query);
    setVariables(ex.variables);
    setShowExamples(false);
  }, []);

  const copyResponse = useCallback(() => {
    if (response) {
      navigator.clipboard.writeText(response).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [response]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('airos_graphql_history');
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeQuery();
    }
  }, [executeQuery]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-surface-950">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-surface-700 dark:bg-surface-900/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-purple-600">
              <Database className="h-4.5 w-4.5 text-white" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {t('graphql.playground.title', 'GraphQL Playground')}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {GRAPHQL_URL}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
            <Link
              href="/dev"
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-surface-600 dark:text-gray-300 dark:hover:bg-surface-800"
            >
              {t('graphql.backToDev', 'Back to Dev Tools')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={executeQuery}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-pink-600 hover:to-purple-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {loading
              ? t('graphql.executing', 'Executing...')
              : t('graphql.execute', 'Execute')}
          </button>

          <button
            type="button"
            onClick={() => setShowExamples((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
              'border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-surface-600 dark:text-gray-300 dark:hover:bg-surface-800'
            )}
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            {t('graphql.examples', 'Examples')}
            {showExamples ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>

          <button
            type="button"
            onClick={() => setShowTokenInput((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
              token
                ? 'border-green-200 text-green-700 dark:border-green-800 dark:text-green-400'
                : 'border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-surface-600 dark:text-gray-300 dark:hover:bg-surface-800'
            )}
          >
            <Key className="h-4 w-4" aria-hidden="true" />
            {token
              ? t('graphql.authSet', 'Auth set')
              : t('graphql.setToken', 'Set Token')}
          </button>

          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition',
              'border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-surface-600 dark:text-gray-300 dark:hover:bg-surface-800'
            )}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            {t('graphql.history', 'History')}
            {history.length > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold dark:bg-surface-700">
                {history.length}
              </span>
            )}
          </button>
        </div>

        {showTokenInput && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('graphql.tokenLabel', 'JWT Bearer Token')}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={t('graphql.tokenPlaceholder', 'Paste your JWT token...')}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-900 placeholder:text-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400/20 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              {t('graphql.tokenHint', 'Token is stored locally and sent as Authorization: Bearer header.')}
            </p>
          </div>
        )}

        {showExamples && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
            <h3 className="mb-3 text-xs font-semibold text-gray-700 dark:text-gray-300">
              {t('graphql.exampleQueries', 'Example Queries')}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {EXAMPLE_QUERIES.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => loadExample(i)}
                  className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-left text-sm text-gray-700 transition hover:border-pink-300 hover:bg-pink-50 dark:border-surface-600 dark:text-gray-300 dark:hover:border-pink-500/30 dark:hover:bg-pink-500/5"
                >
                  <Code2 className="h-3.5 w-3.5 shrink-0 text-pink-500" />
                  {ex.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('graphql.queryHistory', 'Query History')}
              </h3>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={clearHistory}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('graphql.clearHistory', 'Clear')}
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('graphql.noHistory', 'No queries executed yet.')}
              </p>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(entry.query);
                        setVariables(entry.variables);
                        setShowHistory(false);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-left text-xs font-mono text-gray-600 transition hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-surface-800"
                    >
                      <span className="text-gray-400 dark:text-gray-500">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>{' '}
                      {entry.query.split('\n')[0].slice(0, 60)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
            <div className="flex border-b border-gray-200 dark:border-surface-700">
              <button
                type="button"
                onClick={() => setActiveTab('query')}
                className={cn(
                  'flex-1 px-4 py-2.5 text-xs font-semibold transition',
                  activeTab === 'query'
                    ? 'border-b-2 border-pink-500 text-pink-600 dark:text-pink-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                {t('graphql.queryTab', 'Query')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('variables')}
                className={cn(
                  'flex-1 px-4 py-2.5 text-xs font-semibold transition',
                  activeTab === 'variables'
                    ? 'border-b-2 border-pink-500 text-pink-600 dark:text-pink-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                {t('graphql.variablesTab', 'Variables')}
              </button>
            </div>
            <div className="relative flex-1">
              {activeTab === 'query' ? (
                <textarea
                  ref={queryRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="h-96 w-full resize-none bg-transparent p-4 font-mono text-sm text-gray-900 focus:outline-none dark:text-gray-100"
                  placeholder={t('graphql.queryPlaceholder', 'Enter your GraphQL query...')}
                  aria-label={t('graphql.queryAria', 'GraphQL query editor')}
                />
              ) : (
                <textarea
                  value={variables}
                  onChange={(e) => setVariables(e.target.value)}
                  onKeyDown={handleKeyDown}
                  spellCheck={false}
                  className="h-96 w-full resize-none bg-transparent p-4 font-mono text-sm text-gray-900 focus:outline-none dark:text-gray-100"
                  placeholder={t('graphql.variablesPlaceholder', '{ "key": "value" }')}
                  aria-label={t('graphql.variablesAria', 'GraphQL variables editor')}
                />
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-2 dark:border-surface-700">
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                {t('graphql.shortcut', 'Ctrl+Enter to execute')}
              </p>
            </div>
          </div>

          <div className="flex flex-col rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5 dark:border-surface-700">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {t('graphql.response', 'Response')}
              </span>
              {response && (
                <button
                  type="button"
                  onClick={copyResponse}
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-surface-800"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-green-500" />
                      {t('graphql.copied', 'Copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      {t('graphql.copy', 'Copy')}
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="relative flex-1 overflow-auto">
              <pre
                ref={responseRef}
                className="h-96 overflow-auto p-4 font-mono text-sm text-gray-900 dark:text-gray-100"
                aria-label={t('graphql.responseAria', 'GraphQL response')}
                aria-live="polite"
              >
                {loading ? (
                  <span className="animate-pulse text-gray-400 dark:text-gray-500">
                    {t('graphql.loading', 'Loading...')}
                  </span>
                ) : response ? (
                  response
                ) : (
                  <span className="text-gray-400 dark:text-gray-500">
                    {t('graphql.noResponse', 'Execute a query to see the response')}
                  </span>
                )}
              </pre>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-900">
          <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('graphql.introspection', 'Schema Introspection')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {t('graphql.introspectionDesc', 'Run this query to explore the available schema types and fields.')}
          </p>
          <pre className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700 dark:bg-surface-800 dark:text-gray-300 overflow-x-auto">
{`{
  __schema {
    queryType { name }
    mutationType { name }
    types {
      name
      kind
      fields {
        name
        type { name kind }
      }
    }
  }
}`}
          </pre>
        </div>
      </main>
    </div>
  );
}
