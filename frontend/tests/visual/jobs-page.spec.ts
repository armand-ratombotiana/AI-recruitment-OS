import { test, expect } from '../utils/fixtures';
import {
  compareVisualSnapshot,
  setViewportToDesktop,
  setViewportToTablet,
  setViewportToMobile,
  waitForPageReady,
} from '../utils/test-helpers';

test.describe('Jobs page - Visual regression', () => {
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

  test('jobs page - desktop full page snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'jobs-page-desktop.png', {
      mask: [page.locator('[data-tour="jobs-row"]')],
    });
  });

  test('jobs page - stats bar snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    await expect(page.locator('[data-tour="jobs-stats"]')).toBeVisible({ timeout: 15_000 });

    await compareVisualSnapshot(page, 'jobs-stats-bar.png');
  });

  test('jobs page - search and filter area', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    await expect(page.getByPlaceholder(/search jobs by title/i)).toBeVisible({ timeout: 15_000 });

    await compareVisualSnapshot(page, 'jobs-search-area.png');
  });

  test('jobs page - with open status filter', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    await expect(page.getByLabel(/filter by status/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/filter by status/i).selectOption('open');
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'jobs-filtered-open.png');
  });

  test('jobs page - empty search results state', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    const search = page.getByPlaceholder(/search jobs by title/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no jobs (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await compareVisualSnapshot(page, 'jobs-empty-search.png');
  });

  test('jobs page - create job button visible', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    await expect(page.locator('[data-tour="jobs-create"]')).toBeVisible({ timeout: 15_000 });

    await compareVisualSnapshot(page, 'jobs-create-button.png');
  });

  test('jobs page - tablet viewport', async ({ page }) => {
    await setViewportToTablet(page);
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'jobs-page-tablet.png');
  });

  test('jobs page - mobile viewport', async ({ page }) => {
    await setViewportToMobile(page);
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'jobs-page-mobile.png');
  });

  test('jobs page - dark mode', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    await compareVisualSnapshot(page, 'jobs-page-dark.png');
  });
});
