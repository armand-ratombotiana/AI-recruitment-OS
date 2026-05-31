import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI-ROS',
  description: 'AI-Native Recruitment Operating System',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
