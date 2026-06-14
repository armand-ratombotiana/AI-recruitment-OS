'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Briefcase, FileText } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Breadcrumb,
  useToast,
  SelectField,
  TextareaField,
  Skeleton,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';

export default function NewReferralPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback((key: string, fb?: string) => translate(locale, key, fb), [locale]);
  const { push: showToast } = useToast();

  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.candidates.list(), api.jobs.list()])
      .then(([candRes, jobRes]) => {
        if (cancelled) return;
        setCandidates(
          (candRes as any)?.data?.map((c: any) => ({
            id: c.id,
            label: c.full_name || c.name || 'Unknown',
          })) || []
        );
        setJobs(
          (jobRes as any)?.data?.map((j: any) => ({
            id: j.id,
            label: j.title || 'Unknown',
          })) || []
        );
      })
      .catch(() => {
        if (!cancelled) showToast('error', t('referrals.loadFailed', 'Failed to load data'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast, t]);

  const handleSubmit = async () => {
    if (!candidateId || !jobId) return;
    setSubmitting(true);
    try {
      const referral = await api.referrals.create({
        candidate_id: candidateId,
        job_id: jobId,
        notes: notes.trim() || null,
      });
      showToast('success', t('referrals.created', 'Referral created successfully'));
      router.push(`/dashboard/referrals/${referral.id}`);
    } catch (err) {
      showToast(
        'error',
        err instanceof APIError ? err.message : t('referrals.createFailed', 'Failed to create referral')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const candidateOptions = [
    { value: '', label: t('referrals.placeholders.candidate', 'Select candidate…') },
    ...candidates.map((c) => ({ value: c.id, label: c.label })),
  ];

  const jobOptions = [
    { value: '', label: t('referrals.placeholders.job', 'Select job…') },
    ...jobs.map((j) => ({ value: j.id, label: j.label })),
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

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('referrals.newReferral', 'New referral')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('referrals.newReferralDesc', 'Refer a candidate for an open position')}
        </p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <User className="h-5 w-5 text-gray-400" />
              {t('referrals.selectCandidate', 'Select candidate')}
            </h2>
            <SelectField
              id="candidate"
              required
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              options={candidateOptions}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-gray-400" />
              {t('referrals.selectJob', 'Select job')}
            </h2>
            <SelectField
              id="job"
              required
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              options={jobOptions}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-400" />
              {t('referrals.notes', 'Notes')}
            </h2>
            <TextareaField
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('referrals.placeholders.notes', 'Why are you referring this candidate?')}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-surface-700">
            <Button
              variant="secondary"
              onClick={() => router.push('/dashboard/referrals')}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={submitting}
              disabled={submitting || !candidateId || !jobId}
            >
              {t('referrals.createReferral', 'Create referral')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
