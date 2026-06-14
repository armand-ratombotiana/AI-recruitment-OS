'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Users, UserCheck, Clock, DollarSign, Settings, FileText } from 'lucide-react';
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
import { useLocaleStore, translate } from '@/stores/locale-store';
import { ReferralCard } from '@/components/referrals/referral-card';
import type { ReferralTypes } from '@/services/api/types';

export default function ReferralsPage() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const [referrals, setReferrals] = useState<ReferralTypes.Referral[]>([]);
  const [stats, setStats] = useState<ReferralTypes.ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [referrerFilter, setReferrerFilter] = useState<string>('all');
  const [jobFilter, setJobFilter] = useState<string>('all');

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.referrals.list(),
      api.referrals.getStats().catch(() => null),
    ])
      .then(([listRes, statsRes]) => {
        setReferrals(listRes.data || []);
        if (statsRes) setStats(statsRes);
      })
      .catch((err) => {
        setError(err instanceof APIError ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const uniqueReferrers = useMemo(() => {
    const map = new Map<string, string>();
    referrals.forEach((r) => map.set(r.referrer_id, r.referrer_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [referrals]);

  const uniqueJobs = useMemo(() => {
    const map = new Map<string, string>();
    referrals.forEach((r) => map.set(r.job_id, r.job_title));
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  }, [referrals]);

  const filtered = useMemo(() => {
    return referrals.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (referrerFilter !== 'all' && r.referrer_id !== referrerFilter) return false;
      if (jobFilter !== 'all' && r.job_id !== jobFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          r.candidate_name.toLowerCase().includes(q) ||
          r.job_title.toLowerCase().includes(q) ||
          r.referrer_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [referrals, statusFilter, referrerFilter, jobFilter, search]);

  const handleUpdateStatus = async (id: string, status: ReferralTypes.ReferralStatus) => {
    try {
      await api.referrals.update(id, { status });
      loadData();
    } catch {
      /* noop */
    }
  };

  const statusOptions = [
    { value: 'all', label: t('referrals.allStatuses', 'All statuses') },
    { value: 'pending', label: t('referrals.statuses.pending', 'Pending') },
    { value: 'reviewing', label: t('referrals.statuses.reviewing', 'Reviewing') },
    { value: 'qualified', label: t('referrals.statuses.qualified', 'Qualified') },
    { value: 'interviewed', label: t('referrals.statuses.interviewed', 'Interviewed') },
    { value: 'offered', label: t('referrals.statuses.offered', 'Offered') },
    { value: 'hired', label: t('referrals.statuses.hired', 'Hired') },
    { value: 'rejected', label: t('referrals.statuses.rejected', 'Rejected') },
    { value: 'expired', label: t('referrals.statuses.expired', 'Expired') },
  ];

  const referrerOptions = [
    { value: 'all', label: t('referrals.allReferrers', 'All referrers') },
    ...uniqueReferrers.map((r) => ({ value: r.id, label: r.name })),
  ];

  const jobOptions = [
    { value: 'all', label: t('referrals.allJobs', 'All jobs') },
    ...uniqueJobs.map((j) => ({ value: j.id, label: j.title })),
  ];

  const rewardSymbol = '$';

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('referrals.title', 'Referrals')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {referrals.length} {t('referrals.totalReferrals', 'total referrals')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/referrals/program">
            <Button variant="secondary">
              <Settings className="h-4 w-4 mr-2" />
              {t('referrals.programConfig', 'Program config')}
            </Button>
          </Link>
          <Link href="/dashboard/referrals/new">
            <Button variant="primary">
              <Plus className="h-4 w-4 mr-2" />
              {t('referrals.createReferral', 'Create referral')}
            </Button>
          </Link>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_referrals}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('referrals.stats.total', 'Total referrals')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-500/20">
                <UserCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.hired}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('referrals.stats.hired', 'Hired')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-500/20">
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.pending}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('referrals.stats.pending', 'Pending')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-500/20">
                <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {rewardSymbol}{stats.total_rewards_paid.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('referrals.stats.rewardsPaid', 'Rewards paid')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <InputField
                id="search-referrals"
                type="text"
                placeholder={t('referrals.search', 'Search by candidate, job, or referrer…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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
              id="filter-referrer"
              value={referrerFilter}
              onChange={(e) => setReferrerFilter(e.target.value)}
              options={referrerOptions}
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
              title={t('referrals.couldntLoad', "Couldn't load referrals")}
              error={error}
              onRetry={loadData}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title={
                referrals.length === 0
                  ? t('referrals.noReferralsYet', 'No referrals yet')
                  : t('referrals.noReferralsFound', 'No referrals found')
              }
              description={
                referrals.length === 0
                  ? t('referrals.noReferralsDesc', 'Create your first referral to get started.')
                  : t('referrals.tryAdjusting', 'Try adjusting your filters.')
              }
              action={
                referrals.length === 0 ? (
                  <Link href="/dashboard/referrals/new">
                    <Button variant="primary">
                      <Plus className="h-4 w-4 mr-2" />
                      {t('referrals.createReferral', 'Create referral')}
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3">
              {filtered.map((referral) => (
                <ReferralCard
                  key={referral.id}
                  referral={referral}
                  onUpdateStatus={handleUpdateStatus}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
