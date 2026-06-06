import { test, expect } from '@playwright/test';
import { loginAsDemo } from './pages/auth.helper';

test.describe('Interviews page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('interviews list page loads with title and summary', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    await expect(page.getByRole('heading', { name: /interviews/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/total · .* upcoming/i)).toBeVisible({ timeout: 15_000 });
  });

  test('interviews table or empty state renders after data loads', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const table = page.locator('[data-tour="interviews-table"]');
    const empty = page.getByText(/no interviews (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('search and filter controls are present', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const search = page.getByPlaceholder(/search interviews/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    const statusFilter = page.getByLabel(/filter by status/i);
    await expect(statusFilter).toBeVisible();

    const typeFilter = page.getByLabel(/filter by type/i);
    await expect(typeFilter).toBeVisible();
  });

  test('search input filters interviews by name or job title', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const search = page.getByPlaceholder(/search interviews/i);
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.waitFor({ state: 'visible' });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no interviews (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    const table = page.locator('[data-tour="interviews-table"]');
    const empty = page.getByText(/no interviews (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('schedule interview button is visible', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const scheduleBtn = page.locator('[data-tour="interviews-schedule"]');
    await expect(scheduleBtn).toBeVisible({ timeout: 15_000 });
  });
});
