'use client';

import { useCallback, useState, useMemo } from 'react';
import { gql } from '@apollo/client';
import {
  Users,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Mail,
  MapPin,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore, translate, interpolate, formatDate } from '@/stores/locale-store';
import { useGraphQLQuery } from '@/hooks/use-graphql';

const LIST_CANDIDATES_QUERY = gql`
  query ListCandidates($limit: Int, $offset: Int, $search: String, $status: String) {
    candidates(limit: $limit, offset: $offset, search: $search, status: $status) {
      items {
        id
        firstName
        lastName
        email
        phone
        location
        status
        createdAt
      }
      total
    }
  }
`;

interface CandidateItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  status: string;
  createdAt: string;
}

interface CandidatesData {
  candidates: {
    items: CandidateItem[];
    total: number;
  };
}

interface CandidateListProps {
  className?: string;
  pageSize?: number;
}

const STATUSES = ['New', 'Active', 'Archived', 'Hired'] as const;

const STATUS_STYLES: Record<string, string> = {
  New: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  Active: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
  Archived: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400',
  Hired: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400',
};

export function CandidateList({ className, pageSize = 10 }: CandidateListProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, loading, error, refetch } = useGraphQLQuery<CandidatesData>(
    LIST_CANDIDATES_QUERY,
    {
      variables: {
        limit: pageSize,
        offset: page * pageSize,
        search: search || undefined,
        status: statusFilter || undefined,
      },
      notifyOnNetworkStatusChange: true,
    }
  );

  const candidates = data?.candidates?.items ?? [];
  const total = data?.candidates?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setPage(0);
      setSearch(searchInput);
    },
    [searchInput]
  );

  const handleStatusChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPage(0);
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const statusLabel = useMemo(
    () =>
      (status: string): string => {
        const key = `graphql.candidates.status${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}`;
        return t(key, status);
      },
    [t]
  );

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white dark:border-surface-700 dark:bg-surface-900',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-surface-700">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-pink-500" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('graphql.candidates.title', 'Candidates')}
          </h2>
          {total > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-surface-700 dark:text-gray-400">
              {total}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-surface-600 dark:text-gray-400 dark:hover:bg-surface-800"
          aria-label={t('graphql.candidates.refresh', 'Refresh')}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {t('graphql.candidates.refresh', 'Refresh')}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-3 dark:border-surface-700">
        <form onSubmit={handleSearch} className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('graphql.candidates.searchPlaceholder', 'Search...')}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400/20 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            aria-label={t('graphql.candidates.searchPlaceholder', 'Search...')}
          />
        </form>

        <select
          value={statusFilter}
          onChange={handleStatusChange}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-400/20 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
          aria-label={t('graphql.candidates.statusFilter', 'Filter by status')}
        >
          <option value="">{t('graphql.candidates.allStatuses', 'All')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s.toLowerCase()}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div className="px-5 py-3">
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error.message}
          </div>
        )}

        {loading && candidates.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-pink-500" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
              {t('graphql.loading', 'Loading...')}
            </span>
          </div>
        )}

        {!loading && !error && candidates.length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('graphql.candidates.empty', 'No candidates found')}
            </p>
          </div>
        )}

        {candidates.length > 0 && (
          <>
            <div className="hidden sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-surface-700">
                    <th className="pb-2 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t('candidates.table.candidate', 'Candidate')}
                    </th>
                    <th className="pb-2 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t('graphql.candidates.location', 'Location')}
                    </th>
                    <th className="pb-2 pr-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t('candidates.table.status', 'Status')}
                    </th>
                    <th className="pb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {t('graphql.candidates.added', 'Added')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-50 last:border-0 dark:border-surface-800"
                    >
                      <td className="py-3 pr-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Mail className="h-3 w-3" aria-hidden="true" />
                          {c.email}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {c.location ? (
                          <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {c.location}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_STYLES[c.status] ?? STATUS_STYLES.Active
                          )}
                        >
                          {statusLabel(c.status)}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          {formatDate(c.createdAt, locale, { dateStyle: 'short' })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 sm:hidden">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-gray-100 p-3 dark:border-surface-700"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {c.firstName} {c.lastName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Mail className="h-3 w-3" aria-hidden="true" />
                        {c.email}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                        STATUS_STYLES[c.status] ?? STATUS_STYLES.Active
                      )}
                    >
                      {statusLabel(c.status)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {c.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {c.location}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" aria-hidden="true" />
                      {formatDate(c.createdAt, locale, { dateStyle: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-surface-700">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:border-surface-600 dark:text-gray-400 dark:hover:bg-surface-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t('graphql.candidates.prev', 'Prev')}
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {interpolate(
              t('graphql.candidates.pageInfo', `Page ${page + 1} of ${totalPages}`),
              { page: page + 1, total: totalPages }
            )}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:border-surface-600 dark:text-gray-400 dark:hover:bg-surface-800"
          >
            {t('graphql.candidates.next', 'Next')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default CandidateList;
