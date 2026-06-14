import { test, expect } from '../utils/fixtures';
import {
  compareVisualSnapshot,
  setViewportToDesktop,
  setViewportToTablet,
  setViewportToMobile,
  waitForPageReady,
} from '../utils/test-helpers';

test.describe('Dashboard page - Visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    const demoBtn = page.getByRole('button', { name: /use demo credentials/i });
    await demoBtn.click();
    const submitBtn = page.getByRole('button', { name: /sign in/i }).first();
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      submitBtn.click(),
    ]);
    await page.waitForLoadState('domcontentloaded');
  });

  test('dashboard - desktop full page snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'dashboard-desktop.png');
  });

  test('dashboard - welcome header area', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    await compareVisualSnapshot(page, 'dashboard-header.png');
  });

  test('dashboard - stats widgets', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    const statsSection = page.locator('section').first();
    if (await statsSection.isVisible().catch(() => false)) {
      await compareVisualSnapshot(page, 'dashboard-stats-widgets.png');
    }
  });

  test('dashboard - with 30 day range selected', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const range30d = page.getByRole('button', { name: /30 days?/i });
    if (await range30d.isVisible().catch(() => false)) {
      await range30d.click();
      await waitForPageReady(page);
    }

    await compareVisualSnapshot(page, 'dashboard-30d-range.png');
  });

  test('dashboard - with 90 day range selected', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const range90d = page.getByRole('button', { name: /90 days?/i });
    if (await range90d.isVisible().catch(() => false)) {
      await range90d.click();
      await waitForPageReady(page);
    }

    await compareVisualSnapshot(page, 'dashboard-90d-range.png');
  });

  test('dashboard - tablet viewport', async ({ page }) => {
    await setViewportToTablet(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'dashboard-tablet.png');
  });

  test('dashboard - mobile viewport', async ({ page }) => {
    await setViewportToMobile(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'dashboard-mobile.png');
  });

  test('dashboard - dark mode', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    await compareVisualSnapshot(page, 'dashboard-dark.png');
  });

  test('dashboard - loading skeleton state', async ({ page }) => {
    await setViewportToDesktop(page);

    await page.route('**/api/**', (route) => {
      route.abort();
    });

    await page.goto('/dashboard');
    await page.waitForTimeout(500);

    await compareVisualSnapshot(page, 'dashboard-loading-skeleton.png');

    await page.unroute('**/api/**');
  });
});
