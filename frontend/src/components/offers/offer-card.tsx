'use client';

import Link from 'next/link';
import { Calendar, DollarSign, Briefcase, Eye, Edit, Send } from 'lucide-react';
import { Badge, Button } from '@/components';
import { translate, formatDate } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';
import type { OfferTypes } from '@/services/api/types';

const STATUS_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'default' | 'danger' | 'purple'> = {
  draft: 'default',
  sent: 'info',
  accepted: 'success',
  declined: 'danger',
  expired: 'warning',
};

export interface OfferCardProps {
  offer: OfferTypes.OfferSummary;
  locale: Locale;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onSend?: (id: string) => void;
}

function formatSalary(min: number | null, max: number | null, currency: string): string {
  if (min == null && max == null) return '—';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$';
  if (min != null && max != null) return `${symbol}${min.toLocaleString()} - ${symbol}${max.toLocaleString()}`;
  if (min != null) return `${symbol}${min.toLocaleString()}+`;
  return `Up to ${symbol}${max?.toLocaleString()}`;
}

export function OfferCard({ offer, locale, onView, onEdit, onSend }: OfferCardProps) {
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const statusLabel = t(`offers.statuses.${offer.status}`, offer.status);

  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-surface-700 hover:border-blue-300 dark:hover:border-brand-500 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href={`/dashboard/offers/${offer.id}`}
              className="font-semibold text-gray-900 dark:text-gray-100 truncate hover:underline"
            >
              {offer.candidate_name}
            </Link>
            <Badge variant={STATUS_VARIANT[offer.status] || 'default'}>{statusLabel}</Badge>
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
            {offer.expiration_date && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatDate(offer.expiration_date, locale)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/dashboard/offers/${offer.id}`}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('common.view', 'View')}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          </Link>
          {offer.status === 'draft' && onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(offer.id)}
              aria-label={t('common.edit', 'Edit')}
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
          )}
          {offer.status === 'draft' && onSend && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSend(offer.id)}
              aria-label={t('offers.actions.send', 'Send')}
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
