import type { Metadata, Viewport } from 'next';
import './globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
