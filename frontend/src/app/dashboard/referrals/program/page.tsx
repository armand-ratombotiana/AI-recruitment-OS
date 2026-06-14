'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Breadcrumb,
  useToast,
  InputField,
  SelectField,
  TextareaField,
  Switch,
  Skeleton,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { ReferralTypes } from '@/services/api/types';

export default function ReferralProgramPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ReferralTypes.ReferralProgramConfig | null>(null);

  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardType, setRewardType] = useState<ReferralTypes.RewardType>('cash');
  const [rewardCurrency, setRewardCurrency] = useState('USD');
  const [conditions, setConditions] = useState('');
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.referrals
      .getProgramConfig()
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setRewardAmount(String(data.reward_amount));
        setRewardType(data.reward_type);
        setRewardCurrency(data.reward_currency);
        setConditions(data.conditions || '');
        setIsActive(data.is_active);
      })
      .catch(() => {
        if (!cancelled) showToast('error', t('referrals.loadConfigFailed', 'Failed to load program config'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast, t]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.referrals.updateProgramConfig({
        reward_amount: Number(rewardAmount) || 0,
        reward_type: rewardType,
        reward_currency: rewardCurrency,
        conditions: conditions.trim(),
        is_active: isActive,
      });
      showToast('success', t('referrals.configSaved', 'Program configuration saved'));
    } catch (err) {
      showToast(
        'error',
        err instanceof APIError ? err.message : t('referrals.saveConfigFailed', 'Failed to save configuration')
      );
    } finally {
      setSaving(false);
    }
  };

  const rewardTypeOptions = [
    { value: 'cash', label: t('referrals.rewardTypes.cash', 'Cash') },
    { value: 'gift_card', label: t('referrals.rewardTypes.giftCard', 'Gift card') },
    { value: 'bonus', label: t('referrals.rewardTypes.bonus', 'Bonus') },
    { value: 'time_off', label: t('referrals.rewardTypes.timeOff', 'Time off') },
    { value: 'other', label: t('referrals.rewardTypes.other', 'Other') },
  ];

  const currencyOptions = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'CAD', label: 'CAD ($)' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('referrals.programTitle', 'Referral program configuration')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('referrals.programDesc', 'Configure reward amounts, conditions, and program status')}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => router.push('/dashboard/referrals')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('common.back', 'Back')}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-surface-800">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t('referrals.programActive', 'Program active')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('referrals.programActiveDesc', 'Enable or disable the referral program')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                isActive
                  ? 'bg-blue-600 dark:bg-brand-500'
                  : 'bg-gray-300 dark:bg-surface-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField
              id="reward-amount"
              type="number"
              label={t('referrals.fields.rewardAmount', 'Reward amount')}
              min={0}
              step={100}
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
              placeholder="1000"
            />
            <SelectField
              id="reward-currency"
              label={t('referrals.fields.rewardCurrency', 'Currency')}
              value={rewardCurrency}
              onChange={(e) => setRewardCurrency(e.target.value)}
              options={currencyOptions}
            />
            <SelectField
              id="reward-type"
              label={t('referrals.fields.rewardType', 'Reward type')}
              value={rewardType}
              onChange={(e) => setRewardType(e.target.value as ReferralTypes.RewardType)}
              options={rewardTypeOptions}
            />
          </div>

          <div>
            <TextareaField
              id="conditions"
              label={t('referrals.fields.conditions', 'Conditions')}
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              placeholder={t(
                'referrals.placeholders.conditions',
                'e.g. Candidate must pass probation period (90 days) before reward is paid.'
              )}
              rows={6}
              maxLength={5000}
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-surface-700">
            <Button
              variant="primary"
              onClick={handleSave}
              loading={saving}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              {t('referrals.saveConfig', 'Save configuration')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
