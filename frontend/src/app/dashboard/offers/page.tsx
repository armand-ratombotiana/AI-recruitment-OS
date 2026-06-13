'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, FileText, Search, Filter, Calendar, DollarSign, User, Briefcase } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  Breadcrumb,
  InputField,
  SelectField,
} from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import type { OfferTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  draft: 'default',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
};

function statusLabel(s: string, locale: string): string {
  return translate(locale as any, `offers.statuses.${s}`, s);
}

export default function OffersPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [offers, setOffers] = useState<OfferTypes.OfferSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [candidateFilter, setCandidateFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.offers
      .list()
      .then((res) => {
        if (!cancelled) setOffers(res.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof APIError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const uniqueCandidates = useMemo(() => {
    const map = new Map<string, string>();
    offers.forEach((o) => map.set(o.candidate_id, o.candidate_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [offers]);

  const uniqueJobs = useMemo(() => {
    const map = new Map<string, string>();
    offers.forEach((o) => map.set(o.job_id, o.job_title));
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [offers]);

  const filtered = useMemo(() => {
    return offers.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (candidateFilter !== 'all' && o.candidate_id !== candidateFilter) return false;
      if (jobFilter !== 'all' && o.job_id !== jobFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          o.candidate_name.toLowerCase().includes(q) ||
          o.job_title.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [offers, statusFilter, candidateFilter, jobFilter, search]);

  const statusOptions = [
    { value: 'all', label: t('offers.allStatuses', 'All statuses') },
    { value: 'draft', label: t('offers.statuses.draft', 'Draft') },
    { value: 'sent', label: t('offers.statuses.sent', 'Sent') },
    { value: 'accepted', label: t('offers.statuses.accepted', 'Accepted') },
    { value: 'declined', label: t('offers.statuses.declined', 'Declined') },
    { value: 'expired', label: t('offers.statuses.expired', 'Expired') },
  ];

  const candidateOptions = [
    { value: 'all', label: t('offers.allCandidates', 'All candidates') },
    ...uniqueCandidates.map((c) => ({ value: c.id, label: c.name })),
  ];

  const jobOptions = [
    { value: 'all', label: t('offers.allJobs', 'All jobs') },
    ...uniqueJobs.map((j) => ({ value: j.id, label: j.title })),
  ];

  const formatSalary = (min: number | null, max: number | null, currency: string) => {
    if (min == null && max == null) return '—';
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
    if (min != null && max != null) return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}`;
    if (min != null) return `${symbol}${min.toLocaleString()}+`;
    return `Up to ${symbol}${max?.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: t('nav.dashboard', 'Dashboard'), href: '/dashboard' },
          { label: t('offers.title', 'Offers') },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('offers.title', 'Offers')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('offers.subtitle', '{total} total offers', { total: String(offers.length) })}
          </p>
        </div>
        <Link href="/dashboard/offers/new">
          <Button variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            {t('offers.createOffer', 'Create offer')}
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <InputField
                id="search-offers"
                type="text"
                placeholder={t('offers.search', 'Search by candidate or job…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4" />}
              />
            </div>
            <SelectField
              id="filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={statusOptions}
              className="sm:w-40"
            />
            <SelectField
              id="filter-candidate"
              value={candidateFilter}
              onChange={(e) => setCandidateFilter(e.target.value)}
              options={candidateOptions}
              className="sm:w-48"
            />
            <SelectField
              id="filter-job"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              options={jobOptions}
              className="sm:w-48"
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title={t('offers.couldntLoad', "Couldn't load offers")}
              message={error}
              onRetry={() => window.location.reload()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title={
                offers.length === 0
                  ? t('offers.noOffersYet', 'No offers yet')
                  : t('offers.noOffersFound', 'No offers found')
              }
              description={
                offers.length === 0
                  ? t('offers.noOffersDesc', 'Create your first offer to get started.')
                  : t('offers.tryAdjusting', 'Try adjusting your filters.')
              }
              action={
                offers.length === 0 ? (
                  <Link href="/dashboard/offers/new">
                    <Button variant="primary">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('offers.createOffer', 'Create offer')}
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((offer) => (
                <Link
                  key={offer.id}
                  href={`/dashboard/offers/${offer.id}`}
                  className="block p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {offer.candidate_name}
                        </h3>
                        <Badge variant={STATUS_VARIANT[offer.status] || 'default'}>
                          {statusLabel(offer.status, locale)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5" />
                          <span className="truncate">{offer.job_title}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span>{formatSalary(offer.salary_min, offer.salary_max, offer.currency)}</span>
                        </div>
                        {offer.sent_at && (
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{formatDate(offer.sent_at, locale)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
