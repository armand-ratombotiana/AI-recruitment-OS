'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, FileText, User, Briefcase, Settings } from 'lucide-react';
import { api, APIError } from '@/services/api/client';
import {
  Button,
  Card,
  CardContent,
  Breadcrumb,
  useToast,
  SelectField,
  InputField,
  TextareaField,
} from '@/components';
import { useLocaleStore, translate } from '@/stores/locale-store';
import type { OfferTypes } from '@/services/api/types';

const STEPS = ['select', 'configure', 'review'] as const;
type Step = (typeof STEPS)[number];

export default function NewOfferPage() {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('select');
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([]);
  const [jobs, setJobs] = useState<Array<{ id: string; label: string }>>([]);
  const [templates, setTemplates] = useState<OfferTypes.OfferTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [candidateId, setCandidateId] = useState('');
  const [jobId, setJobId] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [equity, setEquity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.candidates.list(),
      api.jobs.list(),
      api.offers.listTemplates().catch(() => ({ data: [] })),
    ])
      .then(([candRes, jobRes, tmplRes]) => {
        if (cancelled) return;
        setCandidates(
          (candRes as any)?.data?.map((c: any) => ({ id: c.id, label: c.full_name || c.name || 'Unknown' })) || []
        );
        setJobs(
          (jobRes as any)?.data?.map((j: any) => ({ id: j.id, label: j.title || 'Unknown' })) || []
        );
        setTemplates(tmplRes.data || []);
      })
      .catch(() => {
        if (!cancelled) showToast(t('offers.loadFailed', 'Failed to load data'), 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canNext = () => {
    if (step === 'select') return candidateId && jobId;
    if (step === 'configure') return true;
    return true;
  };

  const handleNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const handleBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const offer = await api.offers.create({
        candidate_id: candidateId,
        job_id: jobId,
        salary_min: salaryMin ? Number(salaryMin) : null,
        salary_max: salaryMax ? Number(salaryMax) : null,
        currency,
        equity_percent: equity ? Number(equity) : null,
        start_date: startDate || null,
        expiration_date: expirationDate || null,
        template_id: templateId || null,
        notes: notes.trim() || null,
      });
      showToast(t('offers.created', 'Offer created successfully'), 'success');
      router.push(`/dashboard/offers/${offer.id}`);
    } catch (err) {
      showToast(
        err instanceof APIError ? err.message : t('offers.createFailed', 'Failed to create offer'),
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const candidateOptions = [
    { value: '', label: t('offers.placeholders.candidate', 'Select candidate…') },
    ...candidates.map((c) => ({ value: c.id, label: c.label })),
  ];

  const jobOptions = [
    { value: '', label: t('offers.placeholders.job', 'Select job…') },
    ...jobs.map((j) => ({ value: j.id, label: j.label })),
  ];

  const templateOptions = [
    { value: '', label: t('offers.placeholders.template', 'Select template…') },
    ...templates.map((t) => ({ value: t.id, label: t.name })),
  ];

  const currencyOptions = [
    { value: 'USD', label: 'USD ($)' },
    { value: 'EUR', label: 'EUR (€)' },
    { value: 'GBP', label: 'GBP (£)' },
    { value: 'CAD', label: 'CAD ($)' },
  ];

  const selectedCandidate = candidates.find((c) => c.id === candidateId);
  const selectedJob = jobs.find((j) => j.id === jobId);
  const selectedTemplate = templates.find((t) => t.id === templateId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Breadcrumb
          items={[
            { label: t('nav.dashboard', 'Dashboard'), href: '/dashboard' },
            { label: t('offers.title', 'Offers'), href: '/dashboard/offers' },
            { label: t('offers.newOffer', 'New offer') },
          ]}
        />
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {t('common.loading', 'Loading…')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: t('nav.dashboard', 'Dashboard'), href: '/dashboard' },
          { label: t('offers.title', 'Offers'), href: '/dashboard/offers' },
          { label: t('offers.newOffer', 'New offer') },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t('offers.newOffer', 'New offer')}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('offers.newOfferDesc', 'Create and send an offer to a candidate')}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, idx) => {
          const active = STEPS.indexOf(step) >= idx;
          const Icon = s === 'select' ? User : s === 'configure' ? Settings : Check;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  active
                    ? 'bg-blue-600 text-white dark:bg-brand-500'
                    : 'bg-gray-200 text-gray-500 dark:bg-surface-700 dark:text-gray-400'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={`text-sm font-medium ${
                  active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {t(`offers.steps.${s}`, s)}
              </span>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${active ? 'bg-blue-600 dark:bg-brand-500' : 'bg-gray-200 dark:bg-surface-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          {step === 'select' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('offers.step1.title', 'Select candidate and job')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('offers.step1.description', 'Choose who will receive the offer and for which position.')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SelectField
                  id="candidate"
                  label={t('offers.fields.candidate', 'Candidate *')}
                  required
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  options={candidateOptions}
                />
                <SelectField
                  id="job"
                  label={t('offers.fields.job', 'Job *')}
                  required
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                  options={jobOptions}
                />
              </div>
            </div>
          )}

          {step === 'configure' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('offers.step2.title', 'Configure offer terms')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('offers.step2.description', 'Set compensation, dates, and other terms.')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  id="salary-min"
                  type="number"
                  label={t('offers.fields.salaryMin', 'Salary min')}
                  min={0}
                  step={1000}
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="50000"
                />
                <InputField
                  id="salary-max"
                  type="number"
                  label={t('offers.fields.salaryMax', 'Salary max')}
                  min={0}
                  step={1000}
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="80000"
                />
                <SelectField
                  id="currency"
                  label={t('offers.fields.currency', 'Currency')}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  options={currencyOptions}
                />
                <InputField
                  id="equity"
                  type="number"
                  label={t('offers.fields.equity', 'Equity (%)')}
                  min={0}
                  max={100}
                  step={0.1}
                  value={equity}
                  onChange={(e) => setEquity(e.target.value)}
                  placeholder="0.5"
                />
                <InputField
                  id="start-date"
                  type="date"
                  label={t('offers.fields.startDate', 'Start date')}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <InputField
                  id="expiration-date"
                  type="date"
                  label={t('offers.fields.expirationDate', 'Expiration date')}
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
                <div className="sm:col-span-2">
                  <SelectField
                    id="template"
                    label={t('offers.fields.template', 'Template')}
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    options={templateOptions}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextareaField
                    id="notes"
                    label={t('offers.fields.notes', 'Notes')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('offers.placeholders.notes', 'Internal notes…')}
                    rows={4}
                    maxLength={2000}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {t('offers.step3.title', 'Review and create')}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('offers.step3.description', 'Double-check the details before creating the offer.')}
              </p>
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-surface-800 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('offers.fields.candidate', 'Candidate')}
                  </span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {selectedCandidate?.label || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('offers.fields.job', 'Job')}
                  </span>
                  <span className="text-sm text-gray-900 dark:text-gray-100">
                    {selectedJob?.label || '—'}
                  </span>
                </div>
                {(salaryMin || salaryMax) && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('offers.fields.salary', 'Salary')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {salaryMin && salaryMax
                        ? `${currency} ${salaryMin} - ${salaryMax}`
                        : salaryMin
                        ? `${currency} ${salaryMin}+`
                        : `Up to ${currency} ${salaryMax}`}
                    </span>
                  </div>
                )}
                {equity && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('offers.fields.equity', 'Equity')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">{equity}%</span>
                  </div>
                )}
                {startDate && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('offers.fields.startDate', 'Start date')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">{startDate}</span>
                  </div>
                )}
                {expirationDate && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('offers.fields.expirationDate', 'Expiration')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">{expirationDate}</span>
                  </div>
                )}
                {selectedTemplate && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('offers.fields.template', 'Template')}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">{selectedTemplate.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6 pt-4 border-t border-gray-200 dark:border-surface-700">
            <Button
              variant="secondary"
              onClick={step === 'select' ? () => router.push('/dashboard/offers') : handleBack}
              disabled={submitting}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {step === 'select' ? t('common.cancel', 'Cancel') : t('common.back', 'Back')}
            </Button>
            {step !== 'review' ? (
              <Button variant="primary" onClick={handleNext} disabled={!canNext()}>
                {t('common.next', 'Next')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button variant="primary" onClick={handleSubmit} loading={submitting} disabled={submitting}>
                <Check className="h-4 w-4 mr-2" />
                {t('offers.createOffer', 'Create offer')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
