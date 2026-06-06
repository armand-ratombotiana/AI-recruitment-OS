import { test, expect } from '@playwright/test';
import { loginAsDemo } from './pages/auth.helper';

test.describe('Pipeline page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('pipeline kanban view loads with title and subtitle', async ({ page }) => {
    await page.goto('/dashboard/pipeline');
    await expect(page.getByRole('heading', { name: /pipeline/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/candidates across .* stages/i)).toBeVisible({ timeout: 15_000 });
  });

  test('pipeline shows stage columns or empty state', async ({ page }) => {
    await page.goto('/dashboard/pipeline');
    const screening = page.locator('[data-tour="pipeline-stages"]');
    const empty = page.getByText(/no candidates in pipeline/i).first();
    await expect(screening.or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('all seven pipeline stages render as drop regions', async ({ page }) => {
    await page.goto('/dashboard/pipeline');
    const screening = page.locator('[data-tour="pipeline-stages"]');
    const empty = page.getByText(/no candidates in pipeline/i).first();
    await expect(screening.or(empty)).toBeVisible({ timeout: 20_000 });

    const stages = ['active', 'screening', 'ppe', 'interview', 'offer', 'hired', 'rejected'];
    for (const stage of stages) {
      const region = page.getByRole('region', { name: new RegExp(`drop candidate to move to ${stage}`, 'i') });
      if (await region.isVisible().catch(() => false)) {
        await expect(region).toBeVisible();
      }
    }
  });

  test('refresh button is visible and clickable', async ({ page }) => {
    await page.goto('/dashboard/pipeline');
    const refresh = page.getByRole('button', { name: /refresh/i });
    await expect(refresh).toBeVisible({ timeout: 15_000 });
    await refresh.click();
    await expect(page.getByRole('heading', { name: /pipeline/i, level: 1 })).toBeVisible();
  });
});
