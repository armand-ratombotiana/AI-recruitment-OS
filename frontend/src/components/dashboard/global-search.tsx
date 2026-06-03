'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Search, Users, Briefcase, Calendar, FileText, X, Loader2 } from 'lucide-react';
import { useClickOutside, useDebouncedValue } from '@/hooks';
import { api } from '@/services/api/client';

interface Result {
  type: 'candidate' | 'job' | 'interview' | 'page';
  label: string;
  sublabel?: string;
  href: string;
}

const PAGE_INDEX: Result[] = [
  { type: 'page', label: 'Dashboard', href: '/dashboard' },
  { type: 'page', label: 'Candidates', href: '/dashboard/candidates' },
  { type: 'page', label: 'Jobs', href: '/dashboard/jobs' },
  { type: 'page', label: 'Interviews', href: '/dashboard/interviews' },
  { type: 'page', label: 'PPE', href: '/dashboard/ppe' },
  { type: 'page', label: 'Analytics', href: '/dashboard/analytics' },
  { type: 'page', label: 'AI Copilot', href: '/dashboard/ai-copilot' },
  { type: 'page', label: 'Workflows', href: '/dashboard/workflows' },
  { type: 'page', label: 'Pipeline', href: '/dashboard/pipeline' },
  { type: 'page', label: 'Matching', href: '/dashboard/matching' },
  { type: 'page', label: 'Schedule', href: '/dashboard/schedule' },
  { type: 'page', label: 'Settings', href: '/dashboard/settings' },
];

const ICON: Record<Result['type'], React.ComponentType<{ className?: string }>> = {
  candidate: Users,
  job: Briefcase,
  interview: Calendar,
  page: FileText,
};

const COLOR: Record<Result['type'], string> = {
  candidate: 'text-blue-600 bg-blue-50',
  job: 'text-green-600 bg-green-50',
  interview: 'text-purple-600 bg-purple-50',
  page: 'text-gray-600 bg-gray-50',
};

export function GlobalSearch() {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(value, 250);

  useClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    Promise.allSettled([
      api.searchCandidates(q).catch(() => null),
      api.listJobs({ q, limit: '3' }).catch(() => null),
    ]).then(([c, j]) => {
      if (cancelled) return;
      const results: Result[] = [];
      const cData: any = c.status === 'fulfilled' ? c.value : null;
      const cands = (cData?.data || cData?.results || []) as any[];
      for (const cand of cands.slice(0, 4)) {
        results.push({
          type: 'candidate',
          label: cand.full_name || cand.name || 'Candidate',
          sublabel: cand.email,
          href: '/dashboard/candidates',
        });
      }
      const jData: any = j.status === 'fulfilled' ? j.value : null;
      const jobs = (jData?.data || []) as any[];
      for (const job of jobs.slice(0, 3)) {
        results.push({
          type: 'job',
          label: job.title || 'Job',
          sublabel: job.department || job.location,
          href: '/dashboard/jobs',
        });
      }
      for (const p of PAGE_INDEX.filter((p) => p.label.toLowerCase().includes(q.toLowerCase())).slice(0, 3)) {
        results.push(p);
      }
      setSearchResults(results);
      setSearching(false);
    });
    return () => { cancelled = true; };
  }, [debounced]);

  const results: Result[] = debounced.trim()
    ? (searchResults.length > 0
        ? searchResults
        : PAGE_INDEX.filter((p) => p.label.toLowerCase().includes(debounced.toLowerCase())).slice(0, 5))
    : PAGE_INDEX.slice(0, 5);

  return (
    <div className="relative flex-1 max-w-md" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="searchbox"
          aria-label="Search"
          placeholder="Search candidates, jobs, interviews..."
          value={value}
          onChange={(e) => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full pl-9 pr-16 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
        />
        {value ? (
          <button
            type="button"
            onClick={() => setValue('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-gray-400 bg-white border border-gray-200 rounded">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (results.length > 0 || searching) && (
        <div
          role="listbox"
          className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden fade-in-scale z-40 max-h-80 overflow-y-auto scrollbar-thin"
        >
          <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            {searching && <Loader2 className="h-3 w-3 animate-spin" />}
            {debounced ? (searching ? 'Searching…' : 'Matches') : 'Quick navigation'}
          </p>
          {results.map((r) => {
            const Icon = ICON[r.type];
            return (
              <Link
                key={r.href + r.label}
                href={r.href}
                onClick={() => { setOpen(false); setValue(''); }}
                role="option"
                aria-selected="false"
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition"
              >
                <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${COLOR[r.type]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.label}</p>
                  {r.sublabel && <p className="text-xs text-gray-500 truncate">{r.sublabel}</p>}
                </div>
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{r.type}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
