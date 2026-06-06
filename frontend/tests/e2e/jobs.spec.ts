import { test, expect } from '@playwright/test';
import { loginAsDemo } from './pages/auth.helper';

test.describe('Jobs page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('jobs list page loads with title and stats', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/open · .* total applicants/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-tour="jobs-stats"]')).toBeVisible();
  });

  test('jobs table or empty state renders after data loads', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const table = page.locator('[data-tour="jobs-row"]');
    const empty = page.getByText(/no jobs (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('search input filters jobs by title', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const search = page.getByPlaceholder(/search jobs by title/i);
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.waitFor({ state: 'visible' });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no jobs (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    const table = page.locator('[data-tour="jobs-row"]');
    const empty = page.getByText(/no jobs (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('status filter dropdown is present and selectable', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const filter = page.getByLabel(/filter by status/i);
    await expect(filter).toBeVisible({ timeout: 15_000 });
    await filter.selectOption('open');
    await expect(filter).toHaveValue('open');
  });

  test('create job button is visible', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const createBtn = page.locator('[data-tour="jobs-create"]');
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
  });
});
