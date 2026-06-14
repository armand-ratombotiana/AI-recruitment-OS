'use client';

import { useLocaleStore, translate } from '@/stores/locale-store';
import { cn } from '@/lib/utils';

interface SkipLink {
  href: string;
  labelKey: string;
  fallback: string;
}

const DEFAULT_LINKS: SkipLink[] = [
  { href: '#main-content', labelKey: 'accessibility.skipToContent', fallback: 'Skip to main content' },
  { href: '#primary-nav', labelKey: 'accessibility.skipToNav', fallback: 'Skip to navigation' },
];

interface SkipLinksProps {
  links?: SkipLink[];
  className?: string;
}

export function SkipLinks({ links = DEFAULT_LINKS, className }: SkipLinksProps) {
  const locale = useLocaleStore((s) => s.locale);

  return (
    <div
      className={cn('sr-only focus-within:not-sr-only focus-within:fixed focus-within:left-4 focus-within:top-4 focus-within:z-[60] focus-within:flex focus-within:flex-col focus-within:gap-2', className)}
      role="navigation"
      aria-label="Skip links"
    >
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white dark:bg-brand-500"
        >
          {translate(locale, link.labelKey, link.fallback)}
        </a>
      ))}
    </div>
  );
}
