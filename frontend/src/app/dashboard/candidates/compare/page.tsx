'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, X, Award, Briefcase, GraduationCap, MapPin, Mail, Phone, Star, GitCompare } from 'lucide-react';
import { api } from '@/services/api/client';
import { useLocaleStore, translate, interpolate } from '@/stores/locale-store';
import Link from 'next/link';

interface Candidate {
  id: string;
  full_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  experience_years?: number;
  skills?: string[];
  status?: string;
  score?: number;
  ai_score?: number;
  title?: string;
  current_company?: string;
  education?: string;
  summary?: string;
}

function CompareContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam.split(',').filter(Boolean).slice(0, 4);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ids.length < 2) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      ids.map((id) =>
        api.candidates.get(id).then((data: any) => data?.data || data).catch(() => null)
      )
    )
      .then((results) => {
        if (cancelled) return;
        setCandidates(results.filter((c): c is Candidate => c !== null && typeof c === 'object'));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err?.message || err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idsParam, ids.length, ids.join(',')]);

  const removeCandidate = (id: string) => {
    const newIds = ids.filter((i) => i !== id);
    if (newIds.length < 2) {
      router.push('/dashboard/candidates');
    } else {
      router.push(`/dashboard/candidates/compare?ids=${newIds.join(',')}`);
    }
  };

  if (ids.length < 2) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 mb-4">
          <GitCompare className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold mb-2">{t('candidates.compare.title', 'Compare Candidates')}</h1>
        <p className="text-muted-foreground mb-6">
          {t('candidates.compare.selectHint', 'Select 2-4 candidates to compare side-by-side.')}
        </p>
        <Link
          href="/dashboard/candidates"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('candidates.compare.backToList', 'Back to candidates')}
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t('common.loading', 'Loading...')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-500">
          {t('common.error', 'Error')}: {error}
        </p>
      </div>
    );
  }

  const rows: { label: string; icon: React.ComponentType<{ className?: string }>; getValue: (c: Candidate) => string }[] = [
    { label: t('candidates.compare.name', 'Name'), icon: Award, getValue: (c) => c.full_name || c.name || '—' },
    { label: t('candidates.compare.email', 'Email'), icon: Mail, getValue: (c) => c.email || '—' },
    { label: t('candidates.compare.phone', 'Phone'), icon: Phone, getValue: (c) => c.phone || '—' },
    { label: t('candidates.compare.location', 'Location'), icon: MapPin, getValue: (c) => c.location || '—' },
    { label: t('candidates.compare.titleLabel', 'Title'), icon: Briefcase, getValue: (c) => c.title || c.current_company || '—' },
    { label: t('candidates.compare.experience', 'Experience'), icon: Briefcase, getValue: (c) => c.experience_years != null ? `${c.experience_years} ${t('candidates.years', 'yrs')}` : '—' },
    { label: t('candidates.compare.education', 'Education'), icon: GraduationCap, getValue: (c) => c.education || '—' },
    {
      label: t('candidates.compare.score', 'AI Score'),
      icon: Star,
      getValue: (c) => {
        const score = c.ai_score ?? c.score;
        return score != null ? `${Math.round(Number(score))}%` : '—';
      },
    },
    { label: t('candidates.compare.status', 'Status'), icon: Award, getValue: (c) => c.status || '—' },
    {
      label: t('candidates.compare.skills', 'Skills'),
      icon: Star,
      getValue: (c) => (c.skills || []).join(', ') || '—',
    },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitCompare className="h-6 w-6" />
            {t('candidates.compare.title', 'Compare Candidates')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {interpolate(t('candidates.compare.subtitle', 'Comparing {count} candidates'), {
              count: candidates.length,
            })}
          </p>
        </div>
        <Link
          href="/dashboard/candidates"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border hover:bg-accent text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back', 'Back')}
        </Link>
      </div>

      {candidates.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground border border-border rounded-lg">
          {t('candidates.compare.selectHint', 'Select 2-4 candidates to compare side-by-side.')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-sm sticky left-0 bg-muted/50 z-10 w-40 border-b border-border">
                  {t('candidates.compare.attribute', 'Attribute')}
                </th>
                {candidates.map((c) => (
                  <th
                    key={c.id}
                    className="text-left p-3 font-medium min-w-[200px] border-b border-border"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/dashboard/candidates/${c.id}`}
                        className="truncate hover:underline"
                      >
                        {c.full_name || c.name || '—'}
                      </Link>
                      <button
                        onClick={() => removeCandidate(c.id)}
                        className="p-1 hover:bg-accent rounded shrink-0"
                        aria-label={t('candidates.compare.remove', 'Remove from compare')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const values = candidates.map(row.getValue);
                const allSame = values.every((v) => v === values[0]);
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="p-3 font-medium text-sm sticky left-0 bg-background flex items-center gap-2">
                      <row.icon className="h-4 w-4 text-muted-foreground" />
                      <span>{row.label}</span>
                    </td>
                    {candidates.map((c, j) => (
                      <td
                        key={c.id}
                        className={`p-3 text-sm align-top ${!allSame ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}`}
                      >
                        {row.getValue(c)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {candidates.length < 4 && candidates.length > 0 && (
        <div className="mt-4 text-sm text-muted-foreground">
          {interpolate(t('candidates.compare.addMore', 'You can add up to {max} candidates.'), {
            max: 4,
          })}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <CompareContent />
    </Suspense>
  );
}
