'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CheckStatus = 'pass' | 'fail' | 'warning';
export type CheckCategory = 'SOC2' | 'GDPR' | 'CCPA' | 'HIPAA' | 'Security';

export interface ComplianceCheck {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  description: string;
  evidence: string;
  lastChecked?: string;
  control?: string;
  source?: string;
}

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  text: string;
  bg: string;
  border: string;
  ring: string;
}

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  text: string;
  bg: string;
}

const STATUS_META: Record<CheckStatus, StatusMeta> = {
  pass: {
    label: 'Pass',
    icon: CheckCircle2,
    text: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-500/15',
    border: 'border-green-200 dark:border-green-500/30',
    ring: 'ring-green-200 dark:ring-green-500/30',
  },
  fail: {
    label: 'Fail',
    icon: XCircle,
    text: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-50 dark:bg-red-500/15',
    border: 'border-red-200 dark:border-red-500/30',
    ring: 'ring-red-200 dark:ring-red-500/30',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-500/15',
    border: 'border-amber-200 dark:border-amber-500/30',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
  },
};

const CATEGORY_META: Record<CheckCategory, CategoryMeta> = {
  SOC2: {
    label: 'SOC 2',
    icon: ShieldCheck,
    text: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-500/15',
  },
  GDPR: {
    label: 'GDPR',
    icon: Lock,
    text: 'text-purple-700 dark:text-purple-300',
    bg: 'bg-purple-50 dark:bg-purple-500/15',
  },
  CCPA: {
    label: 'CCPA',
    icon: Lock,
    text: 'text-indigo-700 dark:text-indigo-300',
    bg: 'bg-indigo-50 dark:bg-indigo-500/15',
  },
  HIPAA: {
    label: 'HIPAA',
    icon: Lock,
    text: 'text-teal-700 dark:text-teal-300',
    bg: 'bg-teal-50 dark:bg-teal-500/15',
  },
  Security: {
    label: 'Security',
    icon: ShieldAlert,
    text: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-50 dark:bg-rose-500/15',
  },
};

export function statusLabel(status: CheckStatus, t: (key: string, fb?: string) => string): string {
  if (status === 'pass') return t('compliance.status.pass', 'Pass');
  if (status === 'fail') return t('compliance.status.fail', 'Fail');
  return t('compliance.status.warning', 'Warning');
}

export function categoryLabel(category: CheckCategory): string {
  return CATEGORY_META[category].label;
}

interface CheckCardProps {
  check: ComplianceCheck;
  t: (key: string, fb?: string) => string;
  defaultExpanded?: boolean;
}

export function CheckCard({ check, t, defaultExpanded = false }: CheckCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const status = STATUS_META[check.status];
  const cat = CATEGORY_META[check.category];
  const StatusIcon = status.icon;
  const CatIcon = cat.icon;

  return (
    <article
      className={cn(
        'group rounded-xl border bg-white dark:bg-surface-900 p-4 transition-shadow',
        'hover:shadow-sm focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-white dark:focus-within:ring-offset-surface-900',
        status.border,
        check.status === 'pass' && 'focus-within:ring-green-500 dark:focus-within:ring-green-400',
        check.status === 'fail' && 'focus-within:ring-red-500 dark:focus-within:ring-red-400',
        check.status === 'warning' && 'focus-within:ring-amber-500 dark:focus-within:ring-amber-400'
      )}
      aria-label={`${check.name} — ${statusLabel(check.status, t)}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ring-1',
            status.bg,
            status.ring
          )}
          aria-hidden="true"
        >
          <StatusIcon className={cn('h-5 w-5', status.text)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {check.name}
            </h3>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                cat.text,
                cat.bg
              )}
            >
              <CatIcon className="h-3 w-3" aria-hidden="true" />
              {cat.label}
            </span>
            {check.control && (
              <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-surface-800">
                {check.control}
              </span>
            )}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {check.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                status.bg,
                status.text
              )}
            >
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {statusLabel(check.status, t)}
            </span>

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
                'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
                'dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-surface-800',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
              )}
              aria-expanded={expanded}
              aria-controls={`evidence-${check.id}`}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {expanded
                ? t('compliance.evidence.hide', 'Hide evidence')
                : t('compliance.evidence.show', 'View evidence')}
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  expanded && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </button>
          </div>

          {expanded && (
            <div
              id={`evidence-${check.id}`}
              className="mt-3 rounded-lg border border-gray-200 dark:border-surface-700 bg-gray-50 dark:bg-surface-800/60 p-3 animate-fade-in"
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Info className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" aria-hidden="true" />
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  {t('compliance.evidence.title', 'Evidence')}
                </p>
              </div>
              <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-mono leading-relaxed">
                {check.evidence}
              </pre>
              {(check.lastChecked || check.source) && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-surface-700 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
                  {check.lastChecked && (
                    <span>
                      {t('compliance.lastChecked', 'Last checked: {date}').replace(
                        '{date}',
                        check.lastChecked
                      )}
                    </span>
                  )}
                  {check.source && <span>· {check.source}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
