import type { MetadataRoute } from 'next';

const SITE_URL = 'https://airos.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    '',
    '/login',
    '/register',
    '/offline',
  ].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: p === '' ? 1 : 0.7,
  }));

  const dashboardRoutes = [
    'dashboard',
    'dashboard/candidates',
    'dashboard/jobs',
    'dashboard/interviews',
    'dashboard/ppe',
    'dashboard/analytics',
    'dashboard/ai-copilot',
    'dashboard/workflows',
    'dashboard/pipeline',
    'dashboard/matching',
    'dashboard/schedule',
    'dashboard/settings',
  ].map((p) => ({
    url: `${SITE_URL}/${p}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...dashboardRoutes];
}
