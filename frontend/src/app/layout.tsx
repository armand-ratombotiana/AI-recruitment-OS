import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI-ROS — AI-Native Recruitment Operating System',
  description: 'Autonomous AI-native enterprise recruitment platform with multi-agent orchestration',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
