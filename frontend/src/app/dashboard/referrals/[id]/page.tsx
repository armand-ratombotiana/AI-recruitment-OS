'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  User,
  Briefcase,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  CreditCard,
} from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Badge,
  Skeleton,
  ErrorState,
  Breadcrumb,
  useToast,
  ConfirmDialog,
  Timeline,
  SelectField,
} from '@/components';
import type { TimelineItem } from '@/components';
import { useLocaleStore, translate, formatDate } from '@/stores/locale-store';
import type { ReferralTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  pending: 'warning',
  reviewing: 'info',
  qualified: 'info',
  interviewed: 'purple',
  offered: 'purple',
  hired: 'success',
  rejected: 'danger',
  expired: 'default',
};

const STATUS_FLOW: ReferralTypes.ReferralStatus[] = [
  'pending',
  'reviewing',
  'qualified',
  'interviewed',
  'offered',
  'hired',
];

export default function ReferralDetailPage() {
  const params = useParams();
  const router = useRouter();
  const referralId = params.id as string;
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { push: showToast } = useToast();

  const [referral, setReferral] = useState<ReferralTypes.Referral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    desc: string;
    action: () => void;
  } | null>(null);

  const loadReferral = useCallback(() => {
    setLoading(true);
    setError(null);
    api.referrals
      .get(referralId)
      .then((data) => setReferral(data))
      .catch((err) => setError(err instanceof APIError ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [referralId]);

  useEffect(() => {
    loadReferral();
  }, [loadReferral]);

  const handleStatusUpdate = async (status: ReferralTypes.ReferralStatus) => {
    setActionLoading(true);
    try {
      await api.referrals.update(referralId, { status });
      showToast('success', t('referrals.statusUpdated', 'Status updated'));
      loadReferral();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('referrals.updateFailed', 'Failed to update'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkRewardPaid = async () => {
    setActionLoading(true);
    try {
      await api.referrals.update(referralId, { reward_paid: true });
      showToast('success', t('referrals.rewardMarkedPaid', 'Reward marked as paid'));
      loadReferral();
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('referrals.updateFailed', 'Failed to update'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await api.referrals.delete(referralId);
      showToast('success', t('referrals.deleted', 'Referral deleted'));
      router.push('/dashboard/referrals');
    } catch (err) {
      showToast('error', err instanceof APIError ? err.message : t('referrals.deleteFailed', 'Failed to delete'));
      setActionLoading(false);
    }
  };

  const rewardSymbol = referral
    ? referral.reward_currency === 'EUR'
      ? '€'
      : referral.reward_currency === 'GBP'
      ? '£'
      : '$'
    : '$';

  const timelineItems: TimelineItem[] = referral
    ? [
        {
          id: 'created',
          title: t('referrals.timeline.created', 'Referral created'),
          timestamp: referral.created_at,
          icon: <Clock className="h-4 w-4" />,
        },
        ...(referral.status !== 'pending'
          ? [
              {
                id: 'status-change',
                title: t(`referrals.timeline.movedTo`, 'Moved to') + ` ${referral.status}`,
                timestamp: referral.updated_at,
                icon: <CheckCircle className="h-4 w-4" />,
              },
            ]
          : []),
        ...(referral.hired_at
          ? [
              {
                id: 'hired',
                title: t('referrals.timeline.hired', 'Candidate hired'),
                timestamp: referral.hired_at,
                icon: <CheckCircle className="h-4 w-4" />,
              },
            ]
          : []),
        ...(referral.reward_paid_at
          ? [
              {
                id: 'reward-paid',
                title: t('referrals.timeline.rewardPaid', 'Reward paid'),
                timestamp: referral.reward_paid_at,
                icon: <CreditCard className="h-4 w-4" />,
              },
            ]
          : []),
      ]
    : [];

  const nextStatuses = referral
    ? STATUS_FLOW.filter((s) => {
        const currentIdx = STATUS_FLOW.indexOf(referral.status);
        const nextIdx = STATUS_FLOW.indexOf(s);
        return nextIdx === currentIdx + 1;
      })
    : [];

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (error || !referral) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <ErrorState
          title={t('referrals.couldntLoad', "Couldn't load referral")}
          error={error || t('referrals.notFound', 'Referral not found')}
          onRetry={loadReferral}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {referral.candidate_name}
            </h1>
            <Badge variant={STATUS_VARIANT[referral.status] || 'default'}>
              {t(`referrals.statuses.${referral.status}`, referral.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {referral.job_title} — {t('referrals.referredBy', 'referred by')} {referral.referrer_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((ns) => (
            <Button
              key={ns}
              variant="primary"
              onClick={() => handleStatusUpdate(ns)}
              loading={actionLoading}
              disabled={actionLoading}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {t(`referrals.actions.moveTo`, 'Move to')} {t(`referrals.statuses.${ns}`, ns)}
            </Button>
          ))}
          {referral.status === 'rejected' && (
            <Button
              variant="secondary"
              onClick={() => handleStatusUpdate('pending')}
              loading={actionLoading}
              disabled={actionLoading}
            >
              {t('referrals.actions.reopen', 'Reopen')}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              setConfirmAction({
                title: t('referrals.confirmDeleteTitle', 'Delete referral?'),
                desc: t('referrals.confirmDeleteDesc', 'This action cannot be undone.'),
                action: handleDelete,
              })
            }
            disabled={actionLoading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete', 'Delete')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('referrals.details', 'Referral details')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('referrals.fields.candidate', 'Candidate')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {referral.candidate_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{referral.candidate_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Briefcase className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('referrals.fields.job', 'Job')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {referral.job_title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('referrals.fields.referrer', 'Referrer')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {referral.referrer_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{referral.referrer_email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('referrals.fields.reward', 'Reward')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {rewardSymbol}{referral.reward_amount.toLocaleString()} ({referral.reward_type})
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {referral.reward_paid
                        ? t('referrals.rewardPaidOn', 'Paid on') + ' ' + formatDate(referral.reward_paid_at!, locale)
                        : t('referrals.rewardNotPaid', 'Not paid yet')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('referrals.fields.createdAt', 'Created')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {formatDate(referral.created_at, locale)}
                    </p>
                  </div>
                </div>
              </div>
              {referral.notes && (
                <div className="pt-4 border-t border-gray-100 dark:border-surface-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    {t('referrals.fields.notes', 'Notes')}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {referral.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {referral.status === 'hired' && !referral.reward_paid && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  {t('referrals.rewardPayment', 'Reward payment')}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  {t('referrals.rewardPaymentDesc', 'Mark the referral reward as paid once processed.')}
                </p>
                <Button
                  variant="primary"
                  onClick={handleMarkRewardPaid}
                  loading={actionLoading}
                  disabled={actionLoading}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  {t('referrals.markRewardPaid', 'Mark reward as paid')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {t('referrals.timeline.title', 'Status timeline')}
              </h3>
              {timelineItems.length > 0 ? (
                <Timeline items={timelineItems} />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('referrals.timeline.empty', 'No events yet.')}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('referrals.updateStatus', 'Update status')}
              </h3>
              <SelectField
                id="status-select"
                value={referral.status}
                onChange={(e) => handleStatusUpdate(e.target.value as ReferralTypes.ReferralStatus)}
                options={STATUS_FLOW.map((s) => ({
                  value: s,
                  label: t(`referrals.statuses.${s}`, s),
                })).concat([
                  { value: 'rejected', label: t('referrals.statuses.rejected', 'Rejected') },
                  { value: 'expired', label: t('referrals.statuses.expired', 'Expired') },
                ])}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {t('referrals.dates', 'Dates')}
              </h3>
              <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p>
                  {t('referrals.fields.createdAt', 'Created')}: {formatDate(referral.created_at, locale)}
                </p>
                <p>
                  {t('referrals.fields.updatedAt', 'Updated')}: {formatDate(referral.updated_at, locale)}
                </p>
                {referral.hired_at && (
                  <p>
                    {t('referrals.fields.hiredAt', 'Hired')}: {formatDate(referral.hired_at, locale)}
                  </p>
                )}
                {referral.reward_paid_at && (
                  <p>
                    {t('referrals.fields.rewardPaidAt', 'Reward paid')}: {formatDate(referral.reward_paid_at, locale)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {confirmAction && (
        <ConfirmDialog
          isOpen={!!confirmAction}
          title={confirmAction.title}
          description={confirmAction.desc}
          confirmLabel={t('common.confirm', 'Confirm')}
          cancelLabel={t('common.cancel', 'Cancel')}
          onConfirm={() => {
            confirmAction.action();
            setConfirmAction(null);
          }}
          onClose={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
