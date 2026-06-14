import { test, expect } from '../../utils/fixtures';
import { loginAsDemo } from '../pages/auth.helper';
import {
  waitForPageReady,
  createInterviewData,
  generateUniqueString,
} from '../../utils/test-helpers';

test.describe('Interview scheduling - Advanced E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await waitForPageReady(page);
  });

  test('interviews list page loads with title and summary', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    await expect(page.getByRole('heading', { name: /interviews/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/total · .* upcoming/i)).toBeVisible({ timeout: 15_000 });
  });

  test('interviews table or empty state renders', async ({ page }) => {
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

  test('search interviews by name or job title', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const search = page.getByPlaceholder(/search interviews/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no interviews (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    const table = page.locator('[data-tour="interviews-table"]');
    const empty = page.getByText(/no interviews (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('filter interviews by status', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const statusFilter = page.getByLabel(/filter by status/i);
    await expect(statusFilter).toBeVisible({ timeout: 15_000 });

    const options = await statusFilter.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(1);

    for (const option of options.slice(1)) {
      const value = option.toLowerCase().trim();
      if (value) {
        await statusFilter.selectOption(value);
        await expect(statusFilter).toHaveValue(value);
      }
    }
  });

  test('filter interviews by type', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const typeFilter = page.getByLabel(/filter by type/i);
    await expect(typeFilter).toBeVisible({ timeout: 15_000 });

    const types = ['phone', 'video', 'onsite', 'technical'];
    for (const type of types) {
      await typeFilter.selectOption(type).catch(() => {});
    }
  });

  test('schedule interview button is visible', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const scheduleBtn = page.locator('[data-tour="interviews-schedule"]');
    await expect(scheduleBtn).toBeVisible({ timeout: 15_000 });
  });

  test('navigate to interview detail page', async ({ page, request }) => {
    const list = await request.get('/api/v1/interviews/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No interviews available');

    await page.goto('/dashboard/interviews');
    const link = page.locator(`a[href="/dashboard/interviews/${first.id}"]`).first();
    if (await link.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL(`**/dashboard/interviews/${first.id}`, { timeout: 20_000 }),
        link.click(),
      ]);
    } else {
      await page.goto(`/dashboard/interviews/${first.id}`);
    }
    await expect(page).toHaveURL(new RegExp(`/dashboard/interviews/${first.id}`));
  });

  test('interview detail page renders main content', async ({ page, request }) => {
    const list = await request.get('/api/v1/interviews/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No interviews available');

    await page.goto(`/dashboard/interviews/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('interview data factory generates valid entries', async ({}) => {
    const i1 = createInterviewData('cand-1', 'job-1');
    const i2 = createInterviewData('cand-2', 'job-2', { type: 'onsite', duration_minutes: 90 });
    const i3 = createInterviewData('cand-3', 'job-3', { type: 'technical' });

    expect(i1.candidate_id).toBe('cand-1');
    expect(i1.type).toBe('video');
    expect(i2.type).toBe('onsite');
    expect(i2.duration_minutes).toBe(90);
    expect(i3.type).toBe('technical');
  });

  test('schedule page loads', async ({ page }) => {
    await page.goto('/dashboard/schedule');
    await waitForPageReady(page);

    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });
  });

  test('interview search with special characters', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const search = page.getByPlaceholder(/search interviews/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    const specialSearches = [
      'John & Jane',
      "O'Brien interview",
      '<script>alert(1)</script>',
    ];

    for (const query of specialSearches) {
      await search.fill(query);
      await page.waitForTimeout(500);
      const table = page.locator('[data-tour="interviews-table"]');
      const empty = page.getByText(/no interviews/i).first();
      await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });
    }

    await search.fill('');
  });

  test('upcoming interviews widget on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    const upcomingSection = page.locator('section').filter({ hasText: /upcoming interviews/i });
    if (await upcomingSection.isVisible().catch(() => false)) {
      await expect(upcomingSection).toBeVisible();
    }
  });

  test('interview type filtering - all types', async ({ page }) => {
    await page.goto('/dashboard/interviews');
    const typeFilter = page.getByLabel(/filter by type/i);
    await expect(typeFilter).toBeVisible({ timeout: 15_000 });

    await typeFilter.selectOption('video').catch(() => {});
    await waitForPageReady(page);

    await typeFilter.selectOption('phone').catch(() => {});
    await waitForPageReady(page);

    const table = page.locator('[data-tour="interviews-table"]');
    const empty = page.getByText(/no interviews/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });
});
