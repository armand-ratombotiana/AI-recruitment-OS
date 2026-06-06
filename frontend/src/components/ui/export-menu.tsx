'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { useLocaleStore, translate } from '@/stores/locale-store';

interface ExportMenuProps {
  onExport: (format: 'csv' | 'xlsx' | 'pdf') => void | Promise<void>;
  disabled?: boolean;
}

export function ExportMenu({ onExport, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const locale = useLocaleStore((s) => s.locale);

  const handle = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setOpen(false);
    setLoading(true);
    try {
      await onExport(format);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || loading}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-accent disabled:opacity-50 transition"
      >
        <Download className="h-4 w-4" />
        {loading ? translate(locale, 'common.exporting', 'Exporting...') : translate(locale, 'common.export', 'Export')}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 rounded-md border border-border bg-popover shadow-md z-10">
          {(['csv', 'xlsx', 'pdf'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => handle(fmt)}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-accent uppercase first:rounded-t-md last:rounded-b-md"
            >
              {fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
