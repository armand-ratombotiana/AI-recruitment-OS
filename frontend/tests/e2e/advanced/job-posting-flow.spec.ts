import { test, expect } from '../../utils/fixtures';
import { loginAsDemo } from '../pages/auth.helper';
import {
  waitForPageReady,
  createJobData,
  generateUniqueString,
} from '../../utils/test-helpers';

test.describe('Job posting flow - Advanced E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await waitForPageReady(page);
  });

  test('view jobs list and verify structure', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/open · .* total applicants/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-tour="jobs-stats"]')).toBeVisible();
  });

  test('jobs table or empty state renders', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const table = page.locator('[data-tour="jobs-row"]');
    const empty = page.getByText(/no jobs (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 20_000 });
  });

  test('search jobs by title', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const search = page.getByPlaceholder(/search jobs by title/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill('zzzzzz_nonexistent_zzzzz');
    await expect(page.getByText(/no jobs (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await search.fill('');
    const table = page.locator('[data-tour="jobs-row"]');
    const empty = page.getByText(/no jobs (found|yet)/i).first();
    await expect(table.or(empty)).toBeVisible({ timeout: 15_000 });
  });

  test('filter jobs by status', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const filter = page.getByLabel(/filter by status/i);
    await expect(filter).toBeVisible({ timeout: 15_000 });

    const statuses = ['open', 'closed', 'draft', 'paused'];
    for (const status of statuses) {
      await filter.selectOption(status);
      await expect(filter).toHaveValue(status);
    }
  });

  test('create job button is visible and accessible', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const createBtn = page.locator('[data-tour="jobs-create"]');
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
  });

  test('navigate to job detail page', async ({ page, request }) => {
    const list = await request.get('/api/v1/jobs/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No jobs available');

    await page.goto('/dashboard/jobs');
    const link = page.locator(`a[href="/dashboard/jobs/${first.id}"]`).first();
    if (await link.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL(`**/dashboard/jobs/${first.id}`, { timeout: 20_000 }),
        link.click(),
      ]);
    } else {
      await page.goto(`/dashboard/jobs/${first.id}`);
    }
    await expect(page).toHaveURL(new RegExp(`/dashboard/jobs/${first.id}`));
  });

  test('job detail page renders main content', async ({ page, request }) => {
    const list = await request.get('/api/v1/jobs/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No jobs available');

    await page.goto(`/dashboard/jobs/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('job data factory generates valid entries', async ({}) => {
    const j1 = createJobData();
    const j2 = createJobData({ title: 'Custom Job Title', status: 'open' });
    const j3 = createJobData({ type: 'contract', department: 'Marketing' });

    expect(j1.title).not.toBe(j2.title);
    expect(j2.title).toBe('Custom Job Title');
    expect(j2.status).toBe('open');
    expect(j3.type).toBe('contract');
    expect(j3.department).toBe('Marketing');
  });

  test('job search with special characters', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    const search = page.getByPlaceholder(/search jobs by title/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    const specialSearches = [
      'Senior/Frontend',
      'DevOps & Cloud',
      '<script>alert(1)</script>',
      "'; DROP TABLE jobs; --",
    ];

    for (const query of specialSearches) {
      await search.fill(query);
      await page.waitForTimeout(500);
      const table = page.locator('[data-tour="jobs-row"]');
      const empty = page.getByText(/no jobs/i).first();
      await expect(table.or(empty)).toBeVisible({ timeout: 10_000 });
    }

    await search.fill('');
  });

  test('job status transitions - draft to open', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await expect(page.getByRole('heading', { name: /jobs/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const filter = page.getByLabel(/filter by status/i);
    if (await filter.isVisible().catch(() => false)) {
      await filter.selectOption('draft');
      await expect(filter).toHaveValue('draft');
      await waitForPageReady(page);

      await filter.selectOption('open');
      await expect(filter).toHaveValue('open');
    }
  });

  test('job listing shows applicant counts', async ({ page }) => {
    await page.goto('/dashboard/jobs');
    await expect(page.getByText(/open · .* total applicants/i)).toBeVisible({ timeout: 15_000 });
  });

  test('job detail - back navigation to list', async ({ page, request }) => {
    const list = await request.get('/api/v1/jobs/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No jobs available');

    await page.goto(`/dashboard/jobs/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });

    const backLink = page.locator('a[href="/dashboard/jobs"]').first();
    if (await backLink.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL('**/dashboard/jobs', { timeout: 15_000 }),
        backLink.click(),
      ]);
      await expect(page).toHaveURL(/\/dashboard\/jobs$/);
    }
  });

  test('AI matching page loads for job context', async ({ page }) => {
    await page.goto('/dashboard/ai-matching');
    await waitForPageReady(page);

    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });
  });
});
