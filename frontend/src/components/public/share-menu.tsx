'use client';

import { useEffect, useRef, useState } from 'react';
import { Share2, Linkedin, Twitter, Mail, Link2, Check, X } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

interface ShareMenuProps {
  url: string;
  title: string;
  description?: string;
  className?: string;
  buttonClassName?: string;
  align?: 'left' | 'right';
  iconOnly?: boolean;
  size?: 'sm' | 'md';
}

export function ShareMenu({
  url,
  title,
  description,
  className,
  buttonClassName,
  align = 'right',
  iconOnly = false,
  size = 'md',
}: ShareMenuProps) {
  const locale = useLocaleStore((s) => s.locale);
  const t = (key: string, fb?: string) => translate(locale, key, fb);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const safeUrl = encodeURIComponent(url);
  const safeTitle = encodeURIComponent(title);
  const safeBody = encodeURIComponent(
    description ? `${title}\n\n${description}\n\n${url}` : `${title}\n\n${url}`,
  );

  const linkedinHref = `https://www.linkedin.com/sharing/share-offsite/?url=${safeUrl}`;
  const twitterHref = `https://twitter.com/intent/tweet?url=${safeUrl}&text=${safeTitle}`;
  const mailHref = `mailto:?subject=${safeTitle}&body=${safeBody}`;

  const copyLink = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const tryNativeShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title,
          text: description || title,
          url,
        });
        setOpen(false);
        return true;
      } catch {
        /* user cancelled or unsupported — fall back to menu */
      }
    }
    return false;
  };

  const handleToggle = async () => {
    if (!open) {
      const used = await tryNativeShare();
      if (used) return;
    }
    setOpen((o) => !o);
  };

  return (
    <div ref={containerRef} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={handleToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('public.jobs.share.openMenu', 'Share this job')}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-50 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:bg-surface-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-11 px-5 text-sm',
          iconOnly && (size === 'sm' ? 'h-8 w-8 px-0' : 'h-10 w-10 px-0'),
          buttonClassName,
        )}
      >
        <Share2 className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
        {!iconOnly && <span>{t('public.jobs.detail.share', 'Share')}</span>}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('public.jobs.share.openMenu', 'Share this job')}
          className={cn(
            'absolute z-50 mt-2 w-56 origin-top rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl shadow-gray-900/10 dark:border-surface-700 dark:bg-surface-900 dark:shadow-black/40',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {t('public.jobs.share.title', 'Share')}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.cancel', 'Close')}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-surface-800 dark:hover:text-gray-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <a
            href={linkedinHref}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#0a66c2]/10 text-[#0a66c2] dark:bg-[#0a66c2]/20">
              <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {t('public.jobs.share.linkedin', 'LinkedIn')}
          </a>

          <a
            href={twitterHref}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-500/10 text-sky-500 dark:bg-sky-500/20">
              <Twitter className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {t('public.jobs.share.twitter', 'Twitter / X')}
          </a>

          <a
            href={mailHref}
            onClick={() => setOpen(false)}
            role="menuitem"
            className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300">
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {t('public.jobs.share.email', 'Email')}
          </a>

          <button
            type="button"
            onClick={copyLink}
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-surface-800"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300">
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <span>
              {copied
                ? t('public.jobs.share.copied', 'Link copied')
                : t('public.jobs.share.copyLink', 'Copy link')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
