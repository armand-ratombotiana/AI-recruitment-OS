import { test, expect } from '../utils/fixtures';
import {
  compareVisualSnapshot,
  setViewportToDesktop,
  setViewportToTablet,
  setViewportToMobile,
  waitForPageReady,
} from '../utils/test-helpers';

test.describe('Candidates page - Visual regression', () => {
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

  test('candidates page - desktop full page snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'candidates-page-desktop.png', {
      mask: [page.locator('[data-tour="candidates-table"]')],
    });
  });

  test('candidates page - header and controls snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const header = page.locator('header, [role="banner"]').first();
    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible({ timeout: 10_000 });

    await compareVisualSnapshot(page, 'candidates-header-desktop.png');
  });

  test('candidates page - search and filter area', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByPlaceholder(/search candidates by name or email/i)).toBeVisible({ timeout: 15_000 });

    const searchArea = page.getByPlaceholder(/search candidates by name or email/i).locator('..').locator('..');
    await compareVisualSnapshot(page, 'candidates-search-area.png');
  });

  test('candidates page - with active filter', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByLabel(/filter by status/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/filter by status/i).selectOption('active');
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'candidates-filtered-active.png');
  });

  test('candidates page - empty search results state', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    const search = page.getByPlaceholder(/search candidates by name or email/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no candidates (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await compareVisualSnapshot(page, 'candidates-empty-search.png');
  });

  test('candidates page - tablet viewport', async ({ page }) => {
    await setViewportToTablet(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'candidates-page-tablet.png');
  });

  test('candidates page - mobile viewport', async ({ page }) => {
    await setViewportToMobile(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'candidates-page-mobile.png');
  });

  test('candidates page - dark mode', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(500);

    await compareVisualSnapshot(page, 'candidates-page-dark.png');
  });
});
