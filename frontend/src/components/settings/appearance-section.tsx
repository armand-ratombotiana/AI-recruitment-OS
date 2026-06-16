import { useEffect, useState, type ComponentType } from 'react';
import { Calendar, Globe, Monitor, Moon, Save, Sun } from 'lucide-react';
import { Button, useNotification } from '@/components';
import { useLocalStorage } from '@/hooks';
import { useLocaleStore, type Locale } from '@/stores/locale-store';
import { useThemeStore, type ThemeMode } from '@/stores/theme-store';
import { cn } from '@/lib/utils';

type TFunc = (key: string, fallback?: string) => string;

function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const TIMEZONES: string[] = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const DATE_FORMATS: { value: string; label: string; example: string }[] = [
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD', example: '2026-06-06' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY', example: '06/06/2026' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY', example: '06/06/2026' },
  { value: 'MMM D, YYYY', label: 'MMM D, YYYY', example: 'Jun 6, 2026' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY', example: '6 Jun 2026' },
];

export function AppearanceSection({ tt, locale }: { tt: TFunc; locale: Locale }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const { success } = useNotification();

  const [timezone, setTimezone] = useLocalStorage<string>('airos_timezone', 'UTC');
  const [dateFormat, setDateFormat] = useLocalStorage<string>('airos_date_format', 'YYYY-MM-DD');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const save = () => {
    success(
      tt('appearance.saved', 'Appearance updated'),
      tt('appearance.savedDesc', 'Your appearance preferences have been saved.')
    );
  };

  const themeCards: { value: ThemeMode; label: string; Icon: ComponentType<{ className?: string }> }[] = [
    { value: 'light', label: tt('appearance.themeLight', 'Light'), Icon: Sun },
    { value: 'dark', label: tt('appearance.themeDark', 'Dark'), Icon: Moon },
    { value: 'system', label: tt('appearance.themeSystem', 'System'), Icon: Monitor },
  ];

  const languageOptions = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
  ];

  return (
    <div className="space-y-6">
      <Section
        title={tt('appearance.theme', 'Theme')}
        description={tt(
          'appearance.themeDesc',
          'Choose how AI-ROS looks for you. System follows your OS preference.'
        )}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {themeCards.map(({ value, label, Icon }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-surface-700 dark:bg-surface-800 dark:text-gray-200 dark:hover:border-surface-600'
                )}
              >
                <Icon className="h-6 w-6" aria-hidden />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title={tt('appearance.language', 'Language')}
        description={tt(
          'appearance.languageDesc',
          'Set the language used across AI-ROS.'
        )}
      >
        <div className="max-w-xs">
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
            aria-label={tt('appearance.language', 'Language')}
          >
            {languageOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section
        title={tt('appearance.timezone', 'Timezone')}
        description={tt(
          'appearance.timezoneDesc',
          'Times and dates will be shown in this timezone.'
        )}
      >
        <div className="max-w-xs">
          <div className="relative">
            <Globe
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <select
              value={hydrated ? timezone : 'UTC'}
              onChange={(e) => setTimezone(e.target.value)}
              className="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-surface-600 dark:bg-surface-800 dark:text-gray-100"
              aria-label={tt('appearance.timezone', 'Timezone')}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section
        title={tt('appearance.dateFormat', 'Date format')}
        description={tt(
          'appearance.dateFormatDesc',
          'How dates are displayed in lists and tables.'
        )}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {DATE_FORMATS.map((df) => {
            const active = (hydrated ? dateFormat : 'YYYY-MM-DD') === df.value;
            return (
              <button
                key={df.value}
                type="button"
                onClick={() => setDateFormat(df.value)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  active
                    ? 'border-blue-500 bg-blue-50 dark:border-brand-400 dark:bg-brand-500/10'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-surface-600'
                )}
              >
                <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-700 dark:text-gray-200">
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                  {df.label}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{df.example}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <div className="flex justify-end">
        <Button
          variant="primary"
          leftIcon={<Save className="h-4 w-4" />}
          onClick={save}
        >
          {tt('appearance.save', 'Save appearance')}
        </Button>
      </div>
    </div>
  );
}
