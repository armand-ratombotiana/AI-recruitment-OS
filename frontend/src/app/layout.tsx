import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister, InstallPrompt } from '@/components/pwa';

export const metadata: Metadata = {
  metadataBase: new URL('https://airos.io'),
  title: {
    default: 'AI-ROS — AI-Native Recruitment Operating System',
    template: '%s | AI-ROS',
  },
  description:
    'Autonomous AI-native enterprise recruitment platform with multi-agent orchestration. Screen, interview, and hire top talent 4x faster.',
  keywords: [
    'AI recruitment',
    'recruitment OS',
    'hiring automation',
    'AI screening',
    'pair programming',
    'candidate matching',
    'HR tech',
    'autonomous hiring',
  ],
  authors: [{ name: 'AI-ROS' }],
  creator: 'AI-ROS',
  applicationName: 'AI-ROS',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'AI-ROS',
  },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://airos.io',
    title: 'AI-ROS — AI-Native Recruitment Operating System',
    description: 'Autonomous AI agents that screen, interview, and match candidates. Hire 4x faster.',
    siteName: 'AI-ROS',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'AI-ROS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI-ROS — AI-Native Recruitment OS',
    description: 'Autonomous AI agents that screen, interview, and match candidates.',
    images: ['/og.png'],
    creator: '@airos_io',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var t = localStorage.getItem('airos_theme');
    var mode = t ? JSON.parse(t).state ? JSON.parse(t).state.theme : null : null;
    if (!mode) mode = 'system';
    var resolved = mode;
    if (mode === 'system') {
      resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    if (resolved === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    var loc = localStorage.getItem('airos_locale');
    if (loc) {
      try {
        var locale = (JSON.parse(loc).state && JSON.parse(loc).state.locale) || 'en';
        root.lang = locale;
        var rtlLocales = ['ar', 'he', 'fa', 'ur'];
        root.dir = rtlLocales.indexOf(locale) !== -1 ? 'rtl' : 'ltr';
      } catch (e) { root.lang = 'en'; root.dir = 'ltr'; }
    } else {
      root.dir = 'ltr';
    }
  } catch (e) {}
})();
`;

const STRUCTURED_DATA = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://airos.io/#organization',
      name: 'AI-ROS',
      url: 'https://airos.io',
      logo: 'https://airos.io/favicon.svg',
      sameAs: ['https://twitter.com/airos_io'],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'AI-ROS — AI-Native Recruitment OS',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Autonomous AI-native enterprise recruitment platform with multi-agent orchestration. Screen, interview, and hire top talent 4x faster.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        category: 'Free trial',
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.8',
        ratingCount: '120',
      },
    },
  ],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="manifest" href="/manifest.json" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA }}
        />
      </head>
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
        <InstallPrompt />
      </body>
    </html>
  );
}
