'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useLocaleStore, type Locale } from '@/stores/locale-store';
import { isRTLLocale, getDirection, setDirection } from '@/utils/rtl';

export function useRTL() {
  const locale = useLocaleStore((s) => s.locale);
  const isRTL = useMemo(() => isRTLLocale(locale), [locale]);
  const direction = useMemo(() => getDirection(locale), [locale]);

  useEffect(() => {
    setDirection(locale);
  }, [locale]);

  return { isRTL, direction, locale };
}

export function useDirection() {
  const { direction, isRTL } = useRTL();

  const toggleDirection = useCallback(() => {
    const newLocale = isRTL ? 'en' : 'ar';
    useLocaleStore.getState().setLocale(newLocale as Locale);
  }, [isRTL]);

  return { direction, isRTL, toggleDirection };
}

export function useLocaleWithRTL() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const isRTL = useMemo(() => isRTLLocale(locale), [locale]);
  const direction = useMemo(() => getDirection(locale), [locale]);

  const changeLocale = useCallback(
    (newLocale: Locale) => {
      setLocale(newLocale);
      setDirection(newLocale);
    },
    [setLocale]
  );

  return { locale, setLocale: changeLocale, isRTL, direction };
}
