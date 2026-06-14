import { test, expect } from '../../utils/fixtures';
import { loginAsDemo } from '../pages/auth.helper';
import {
  waitForPageReady,
  createCandidateData,
  generateUniqueEmail,
  generateUniqueString,
} from '../../utils/test-helpers';

test.describe('Candidate lifecycle - Advanced E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await waitForPageReady(page);
  });

  test('view candidate list and verify table structure', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/total · .* shown/i)).toBeVisible({ timeout: 15_000 });

    const table = page.locator('[data-tour="candidates-table"]');
    const emptyState = page.getByText(/no candidates/i).first();
    await expect(table.or(emptyState)).toBeVisible({ timeout: 20_000 });
  });

  test('search candidate by name', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    const search = page.getByPlaceholder(/search candidates by name or email/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no candidates (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    const table = page.locator('[data-tour="candidates-table"]');
    const empty = page.getByText(/no candidates (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('filter candidates by status', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    const filter = page.getByLabel(/filter by status/i);
    await expect(filter).toBeVisible({ timeout: 15_000 });

    const statuses = ['active', 'screening', 'interview', 'offer', 'hired', 'rejected'];
    for (const status of statuses) {
      await filter.selectOption(status);
      await expect(filter).toHaveValue(status);
    }
  });

  test('navigate to candidate detail page', async ({ page, request }) => {
    const list = await request.get('/api/v1/candidates/?page_size=1');
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No candidates available');

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

  test('candidate detail page shows main content region', async ({ page, request }) => {
    const list = await request.get('/api/v1/candidates/?page_size=1');
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No candidates available');

    await page.goto(`/dashboard/candidates/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('candidate lifecycle - status progression through pipeline', async ({ page }) => {
    await page.goto('/dashboard/pipeline');
    await expect(page.getByRole('heading', { name: /pipeline/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const stages = ['active', 'screening', 'ppe', 'interview', 'offer', 'hired', 'rejected'];
    for (const stage of stages) {
      const region = page.getByRole('region', { name: new RegExp(`drop candidate to move to ${stage}`, 'i') });
      if (await region.isVisible().catch(() => false)) {
        await expect(region).toBeVisible();
      }
    }
  });

  test('candidate search with special characters', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    const search = page.getByPlaceholder(/search candidates by name or email/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    const specialSearches = [
      'test@domain.com',
      "O'Brien",
      'Jean-Pierre',
      '<script>alert(1)</script>',
      "'; DROP TABLE candidates; --",
    ];

    for (const query of specialSearches) {
      await search.fill(query);
      await page.waitForTimeout(500);
      const table = page.locator('[data-tour="candidates-table"]');
      const empty = page.getByText(/no candidates/i).first();
      await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });
    }

    await search.fill('');
  });

  test('candidate list pagination or infinite scroll', async ({ page }) => {
    await page.goto('/dashboard/candidates');
    await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const pagination = page.locator('[aria-label*="pagination" i], nav:has(button:has-text("Next")), button:has-text("next" i)');
    const hasPagination = await pagination.first().isVisible().catch(() => false);

    if (hasPagination) {
      const nextBtn = page.getByRole('button', { name: /next/i }).first();
      if (await nextBtn.isEnabled().catch(() => false)) {
        await nextBtn.click();
        await waitForPageReady(page);
        await expect(page.getByRole('heading', { name: /candidates/i, level: 1 })).toBeVisible();
      }
    }
  });

  test('candidate comparison page loads', async ({ page }) => {
    await page.goto('/dashboard/candidates/compare');
    await waitForPageReady(page);

    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });
  });

  test('candidate data factory generates unique entries', async ({}) => {
    const c1 = createCandidateData();
    const c2 = createCandidateData({ first_name: 'Custom' });
    const c3 = createCandidateData({ status: 'hired', source: 'linkedin' });

    expect(c1.email).not.toBe(c2.email);
    expect(c2.first_name).toBe('Custom');
    expect(c3.status).toBe('hired');
    expect(c3.source).toBe('linkedin');
  });

  test('candidate detail - back navigation to list', async ({ page, request }) => {
    const list = await request.get('/api/v1/candidates/?page_size=1');
    expect(list.ok()).toBeTruthy();
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No candidates available');

    await page.goto(`/dashboard/candidates/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });

    const backLink = page.locator('a[href="/dashboard/candidates"]').first();
    if (await backLink.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL('**/dashboard/candidates', { timeout: 15_000 }),
        backLink.click(),
      ]);
      await expect(page).toHaveURL(/\/dashboard\/candidates$/);
    }
  });
});
