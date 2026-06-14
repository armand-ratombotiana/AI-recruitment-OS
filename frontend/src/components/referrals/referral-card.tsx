'use client';

import Link from 'next/link';
import { Eye, ArrowRightLeft, User, Briefcase, DollarSign } from 'lucide-react';
import { Badge, Button } from '@/components';
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

interface ReferralCardProps {
  referral: ReferralTypes.Referral;
  onUpdateStatus?: (id: string, status: ReferralTypes.ReferralStatus) => void;
}

export function ReferralCard({ referral, onUpdateStatus }: ReferralCardProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);

  const rewardSymbol = referral.reward_currency === 'EUR' ? '€' : referral.reward_currency === 'GBP' ? '£' : '$';

  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {referral.candidate_name}
            </h3>
            <Badge variant={STATUS_VARIANT[referral.status] || 'default'}>
              {t(`referrals.statuses.${referral.status}`, referral.status)}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" />
              <span className="truncate">{referral.job_title}</span>
            </div>
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              <span className="truncate">{referral.referrer_name}</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              <span>{rewardSymbol}{referral.reward_amount.toLocaleString()}</span>
              {referral.reward_paid && (
                <span className="text-xs text-green-600 dark:text-green-400 ml-1">
                  ({t('referrals.paid', 'paid')})
                </span>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {formatDate(referral.created_at, locale)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/dashboard/referrals/${referral.id}`}>
            <Button variant="secondary" size="sm">
              <Eye className="h-3.5 w-3.5 mr-1" />
              {t('common.viewDetails', 'View details')}
            </Button>
          </Link>
          {onUpdateStatus && referral.status === 'pending' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onUpdateStatus(referral.id, 'reviewing')}
            >
              <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />
              {t('referrals.review', 'Review')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
