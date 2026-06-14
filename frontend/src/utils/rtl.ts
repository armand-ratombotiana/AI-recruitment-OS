'use client';

export const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'] as const;
export type RTLLocale = (typeof RTL_LOCALES)[number];

export function isRTLLocale(locale: string): boolean {
  return RTL_LOCALES.includes(locale as RTLLocale);
}

export function getDirection(locale: string): 'ltr' | 'rtl' {
  return isRTLLocale(locale) ? 'rtl' : 'ltr';
}

export function setDirection(locale: string): void {
  if (typeof document === 'undefined') return;
  const dir = getDirection(locale);
  document.documentElement.dir = dir;
  document.documentElement.lang = locale;
}

export function getOppositeDirection(dir: 'ltr' | 'rtl'): 'ltr' | 'rtl' {
  return dir === 'ltr' ? 'rtl' : 'ltr';
}

export const logicalProperties = {
  marginInlineStart: (value: string) => ({ marginInlineStart: value }),
  marginInlineEnd: (value: string) => ({ marginInlineEnd: value }),
  paddingInlineStart: (value: string) => ({ paddingInlineStart: value }),
  paddingInlineEnd: (value: string) => ({ paddingInlineEnd: value }),
  insetInlineStart: (value: string) => ({ insetInlineStart: value }),
  insetInlineEnd: (value: string) => ({ insetInlineEnd: value }),
  borderInlineStart: (value: string) => ({ borderInlineStart: value }),
  borderInlineEnd: (value: string) => ({ borderInlineEnd: value }),
  textAlign: (align: 'start' | 'end' | 'center' | 'justify') => ({ textAlign: align }),
} as const;

export function rtlStyles(isRTL: boolean): React.CSSProperties {
  return {
    direction: isRTL ? 'rtl' : 'ltr',
    textAlign: isRTL ? 'right' : 'left',
  };
}

export function flipForRTL<T extends Record<string, unknown>>(
  styles: T,
  isRTL: boolean
): T {
  if (!isRTL) return styles;

  const flipped: Record<string, unknown> = { ...styles };

  if ('left' in flipped) {
    flipped.right = flipped.left;
    delete flipped.left;
  }
  if ('right' in flipped) {
    flipped.left = flipped.right;
    delete flipped.right;
  }
  if ('marginLeft' in flipped) {
    flipped.marginRight = flipped.marginLeft;
    delete flipped.marginLeft;
  }
  if ('marginRight' in flipped) {
    flipped.marginLeft = flipped.marginRight;
    delete flipped.marginRight;
  }
  if ('paddingLeft' in flipped) {
    flipped.paddingRight = flipped.paddingLeft;
    delete flipped.paddingLeft;
  }
  if ('paddingRight' in flipped) {
    flipped.paddingLeft = flipped.paddingRight;
    delete flipped.paddingRight;
  }
  if ('borderLeft' in flipped) {
    flipped.borderRight = flipped.borderLeft;
    delete flipped.borderLeft;
  }
  if ('borderRight' in flipped) {
    flipped.borderLeft = flipped.borderRight;
    delete flipped.borderRight;
  }

  return flipped as T;
}

export const RTL_CSS_CLASSES = {
  sidebar: 'rtl:left-auto rtl:right-0',
  marginLeft: 'rtl:ml-0',
  marginRight: 'rtl:mr-0',
  paddingLeft: 'rtl:pl-0',
  paddingRight: 'rtl:pr-0',
  textAlignLeft: 'rtl:text-right',
  textAlignRight: 'rtl:text-left',
  floatLeft: 'rtl:float-right',
  floatRight: 'rtl:float-left',
  roundedLeft: 'rtl:rounded-r-lg rtl:rounded-l-none',
  roundedRight: 'rtl:rounded-l-lg rtl:rounded-r-none',
} as const;
