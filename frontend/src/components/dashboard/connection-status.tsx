'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle } from 'lucide-react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useNotification } from '@/components/ui/notification';
import { useLocaleStore, translate } from '@/stores/locale-store';

const STATE_STYLES: Record<string, { dot: string; bg: string; text: string; icon: typeof Wifi }> = {
  open: { dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', icon: Wifi },
  connecting: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', icon: RefreshCw },
  reconnecting: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', icon: RefreshCw },
  closed: { dot: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-surface-800', text: 'text-gray-600 dark:text-gray-300', icon: WifiOff },
  idle: { dot: 'bg-gray-400', bg: 'bg-gray-50 dark:bg-surface-800', text: 'text-gray-600 dark:text-gray-300', icon: WifiOff },
  error: { dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-500/10', text: 'text-red-700 dark:text-red-300', icon: AlertCircle },
};

const STATE_LABELS: Record<string, { en: string; fr: string; es: string }> = {
  open: { en: 'Live', fr: 'En direct', es: 'En vivo' },
  connecting: { en: 'Connecting', fr: 'Connexion', es: 'Conectando' },
  reconnecting: { en: 'Reconnecting', fr: 'Reconnexion', es: 'Reconectando' },
  closed: { en: 'Offline', fr: 'Hors ligne', es: 'Sin conexión' },
  idle: { en: 'Offline', fr: 'Hors ligne', es: 'Sin conexión' },
  error: { en: 'Disconnected', fr: 'Déconnecté', es: 'Desconectado' },
};

export function ConnectionStatus() {
  const locale = useLocaleStore((s) => s.locale);
  const t = (k: string, fb: string) => translate(locale, k, fb);
  const { state, stateInfo, reconnect } = useWebSocket();
  const { warning, info } = useNotification();
  const [lastNotified, setLastNotified] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'closed' || state === 'error') {
      if (lastNotified !== state) {
        warning(
          t('ws.lost.title', 'Real-time connection lost'),
          t('ws.lost.desc', 'Attempting to reconnect…'),
        );
        setLastNotified(state);
      }
    } else if (state === 'reconnecting') {
      if (lastNotified !== 'reconnecting') {
        info(
          t('ws.reconnecting.title', 'Reconnecting'),
          t('ws.reconnecting.desc', 'Restoring real-time updates…'),
        );
        setLastNotified('reconnecting');
      }
    } else if (state === 'open') {
      if (lastNotified !== null) {
        setLastNotified(null);
      }
    }
  }, [state, lastNotified, t, warning, info]);

  const style = STATE_STYLES[state] || STATE_STYLES.idle;
  const labels = STATE_LABELS[state] || STATE_LABELS.idle;
  const label = labels[locale as keyof typeof labels] || labels.en;
  const Icon = style.icon;
  const isAnimated = state === 'connecting' || state === 'reconnecting';

  const tooltipParts = [label];
  if (state === 'reconnecting' && stateInfo.reconnectAttempt) {
    tooltipParts.push(
      t('ws.attempt', 'Attempt {n}').replace('{n}', String(stateInfo.reconnectAttempt)),
    );
  }
  if ((state === 'closed' || state === 'error') && stateInfo.error) {
    tooltipParts.push(stateInfo.error);
  }

  return (
    <button
      type="button"
      onClick={state === 'closed' || state === 'error' ? reconnect : undefined}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${style.bg} ${style.text} hover:opacity-80`}
      aria-label={`${t('ws.statusLabel', 'Realtime status')}: ${label}`}
      title={tooltipParts.join(' · ')}
      data-state={state}
    >
      <span className="relative inline-flex items-center justify-center">
        {state === 'open' ? (
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot} pulse-dot`} aria-hidden="true" />
        ) : (
          <Icon
            className={`h-3.5 w-3.5 ${isAnimated ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
        )}
      </span>
      <span aria-live="polite">{label}</span>
    </button>
  );
}
