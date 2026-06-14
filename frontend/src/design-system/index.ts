export const colors = {
  brand: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  accent: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
    950: '#2e1065',
  },
  surface: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  ink: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#64748b',
    disabled: '#94a3b8',
    inverse: '#ffffff',
  },
  success: { 50: '#f0fdf4', 500: '#22c55e', 600: '#16a34a', 700: '#15803d' },
  warning: { 50: '#fffbeb', 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
  danger:  { 50: '#fef2f2', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
  info:    { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
} as const;

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  3.5: '0.875rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
  section: '4rem',
  page: '2rem',
  card: '1.5rem',
  field: '0.75rem',
} as const;

export const typography = {
  fontFamily: {
    sans: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif',
    mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
  },
  fontSize: {
    'display-2xl': { size: '3.75rem', lineHeight: '1', fontWeight: '800', letterSpacing: '-0.02em' },
    'display-xl':  { size: '3rem',    lineHeight: '1.05', fontWeight: '800', letterSpacing: '-0.02em' },
    'display-lg':  { size: '2.25rem', lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.01em' },
    'display-md':  { size: '1.875rem', lineHeight: '1.15', fontWeight: '700' },
    'display-sm':  { size: '1.5rem',  lineHeight: '1.2', fontWeight: '700' },
    'body-lg':     { size: '1.125rem', lineHeight: '1.6' },
    'body-md':     { size: '1rem',    lineHeight: '1.6' },
    'body-sm':     { size: '0.875rem', lineHeight: '1.55' },
    'caption':     { size: '0.75rem', lineHeight: '1.4', fontWeight: '500' },
  },
} as const;

export const shadows = {
  'elevation-1': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  'elevation-2': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  'elevation-3': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.05)',
  'elevation-4': '0 20px 25px -5px rgb(0 0 0 / 0.12), 0 8px 10px -6px rgb(0 0 0 / 0.05)',
  brand: '0 8px 24px -8px rgb(37 99 235 / 0.4)',
  'brand-lg': '0 16px 40px -8px rgb(37 99 235 / 0.5)',
} as const;

export const borders = {
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.25rem',
    '3xl': '1.5rem',
    full: '9999px',
  },
  width: {
    none: '0px',
    thin: '1px',
    medium: '2px',
    thick: '4px',
  },
} as const;

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '250ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  'out-expo': 'cubic-bezier(0.19, 1, 0.22, 1)',
  'in-out-expo': 'cubic-bezier(0.87, 0, 0.13, 1)',
} as const;

export const zIndex = {
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
} as const;

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const cssVariables = `
:root {
  --color-brand-50: ${colors.brand[50]};
  --color-brand-100: ${colors.brand[100]};
  --color-brand-200: ${colors.brand[200]};
  --color-brand-300: ${colors.brand[300]};
  --color-brand-400: ${colors.brand[400]};
  --color-brand-500: ${colors.brand[500]};
  --color-brand-600: ${colors.brand[600]};
  --color-brand-700: ${colors.brand[700]};
  --color-brand-800: ${colors.brand[800]};
  --color-brand-900: ${colors.brand[900]};
  --color-brand-950: ${colors.brand[950]};

  --color-accent-50: ${colors.accent[50]};
  --color-accent-500: ${colors.accent[500]};
  --color-accent-600: ${colors.accent[600]};

  --color-surface-0: ${colors.surface[0]};
  --color-surface-50: ${colors.surface[50]};
  --color-surface-100: ${colors.surface[100]};
  --color-surface-200: ${colors.surface[200]};
  --color-surface-300: ${colors.surface[300]};
  --color-surface-400: ${colors.surface[400]};
  --color-surface-500: ${colors.surface[500]};
  --color-surface-600: ${colors.surface[600]};
  --color-surface-700: ${colors.surface[700]};
  --color-surface-800: ${colors.surface[800]};
  --color-surface-900: ${colors.surface[900]};
  --color-surface-950: ${colors.surface[950]};

  --color-ink-primary: ${colors.ink.primary};
  --color-ink-secondary: ${colors.ink.secondary};
  --color-ink-muted: ${colors.ink.muted};
  --color-ink-disabled: ${colors.ink.disabled};
  --color-ink-inverse: ${colors.ink.inverse};

  --color-success-50: ${colors.success[50]};
  --color-success-500: ${colors.success[500]};
  --color-success-600: ${colors.success[600]};
  --color-warning-50: ${colors.warning[50]};
  --color-warning-500: ${colors.warning[500]};
  --color-warning-600: ${colors.warning[600]};
  --color-danger-50: ${colors.danger[50]};
  --color-danger-500: ${colors.danger[500]};
  --color-danger-600: ${colors.danger[600]};
  --color-info-50: ${colors.info[50]};
  --color-info-500: ${colors.info[500]};
  --color-info-600: ${colors.info[600]};

  --font-sans: ${typography.fontFamily.sans};
  --font-mono: ${typography.fontFamily.mono};

  --shadow-elevation-1: ${shadows['elevation-1']};
  --shadow-elevation-2: ${shadows['elevation-2']};
  --shadow-elevation-3: ${shadows['elevation-3']};
  --shadow-elevation-4: ${shadows['elevation-4']};
  --shadow-brand: ${shadows.brand};

  --radius-sm: ${borders.radius.sm};
  --radius-md: ${borders.radius.md};
  --radius-lg: ${borders.radius.lg};
  --radius-xl: ${borders.radius.xl};
  --radius-2xl: ${borders.radius['2xl']};
  --radius-full: ${borders.radius.full};

  --transition-fast: ${transitions.fast};
  --transition-normal: ${transitions.normal};
  --transition-slow: ${transitions.slow};

  --z-dropdown: ${zIndex.dropdown};
  --z-sticky: ${zIndex.sticky};
  --z-overlay: ${zIndex.overlay};
  --z-modal: ${zIndex.modal};
  --z-popover: ${zIndex.popover};
  --z-toast: ${zIndex.toast};
  --z-tooltip: ${zIndex.tooltip};
}

.dark {
  --color-surface-0: ${colors.surface[900]};
  --color-surface-50: ${colors.surface[800]};
  --color-surface-100: ${colors.surface[700]};
  --color-surface-200: ${colors.surface[600]};
  --color-surface-300: ${colors.surface[500]};
  --color-surface-400: ${colors.surface[400]};
  --color-surface-500: ${colors.surface[300]};
  --color-surface-600: ${colors.surface[200]};
  --color-surface-700: ${colors.surface[100]};
  --color-surface-800: ${colors.surface[50]};
  --color-surface-900: ${colors.surface[0]};
  --color-surface-950: ${colors.surface[50]};

  --color-ink-primary: ${colors.surface[50]};
  --color-ink-secondary: ${colors.surface[200]};
  --color-ink-muted: ${colors.surface[400]};
  --color-ink-disabled: ${colors.surface[600]};
  --color-ink-inverse: ${colors.surface[900]};

  --shadow-elevation-1: 0 1px 2px 0 rgb(0 0 0 / 0.2);
  --shadow-elevation-2: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
  --shadow-elevation-3: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.2);
  --shadow-elevation-4: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.2);
}
`;

export type ColorToken = typeof colors;
export type SpacingToken = typeof spacing;
export type TypographyToken = typeof typography;
export type ShadowToken = typeof shadows;
export type BorderToken = typeof borders;
export type TransitionToken = typeof transitions;
export type ZIndexToken = typeof zIndex;
export type BreakpointToken = typeof breakpoints;
