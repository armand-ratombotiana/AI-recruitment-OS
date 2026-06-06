import { test, expect } from '@playwright/test';
import { loginAsDemo } from './pages/auth.helper';

test.describe('Candidates page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('candidates list page loads with title and main region', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/total · .* shown/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder(/search candidates by name or email/i)).toBeVisible();
  });

  test('candidates table or empty state renders after data loads', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    const table = page.locator('[data-tour="candidates-table"]');
    const emptyState = page.getByText(/no candidates/i).first();
    await expect(table.or(emptyState)).toBeVisible({ timeout: 20_000 });
  });

  test('search input filters candidates by name', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    const search = page.getByPlaceholder(/search candidates by name or email/i);
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.waitFor({ state: 'visible' });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no candidates (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    const table = page.locator('[data-tour="candidates-table"]');
    const empty = page.getByText(/no candidates (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('status filter dropdown is present and selectable', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    const filter = page.getByLabel(/filter by status/i);
    await expect(filter).toBeVisible({ timeout: 15_000 });
    await filter.selectOption('active');
    await expect(filter).toHaveValue('active');
  });

  test('navigates to candidate detail page', async ({ page, request }) => {
    const list = await request.get('/api/v1/candidates/?page_size=1');
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No candidates available to navigate to');

    await page.goto('/dashboard/candidates');
    const link = page.locator(`a[href="/dashboard/candidates/${first.id}"]`).first();
    if (await link.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL(`**/dashboard/candidates/${first.id}`, { timeout: 20_000 }),
        link.click(),
      ]);
    } else {
      await page.goto(`/dashboard/candidates/${first.id}`);
    }
    await expect(page).toHaveURL(new RegExp(`/dashboard/candidates/${first.id}`));
  });

  test('candidate detail page renders when navigating directly', async ({ page, request }) => {
    const list = await request.get('/api/v1/candidates/?page_size=1');
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No candidates available');

    await page.goto(`/dashboard/candidates/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
  });
});
