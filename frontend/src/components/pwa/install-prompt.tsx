'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const STORAGE_KEY = 'airos_install_dismissed';

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!visible || !evt) return null;

  const install = async () => {
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === 'accepted') {
        setVisible(false);
      }
    } catch {
      /* noop */
    }
  };

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
  };

  return (
    <div
      role="dialog"
      aria-label="Install AI-ROS"
      className="fixed bottom-4 left-4 z-50 max-w-sm rounded-xl border border-blue-200 dark:border-brand-500/30 bg-white dark:bg-surface-900 shadow-xl p-3 flex items-start gap-3 animate-fade-in"
    >
      <div className="h-9 w-9 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0">
        <Download className="h-4 w-4 text-white" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Install AI-ROS</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Get one-click access from your home screen.</p>
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={install}
            className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Install
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium px-2.5 py-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-surface-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Not now
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-surface-800 text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
