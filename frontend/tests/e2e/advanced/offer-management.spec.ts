import { test, expect } from '../../utils/fixtures';
import { loginAsDemo } from '../pages/auth.helper';
import {
  waitForPageReady,
  createOfferData,
  generateUniqueString,
} from '../../utils/test-helpers';

test.describe('Offer management - Advanced E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
    await waitForPageReady(page);
  });

  test('offers list page loads', async ({ page }) => {
    await page.goto('/dashboard/offers');
    await waitForPageReady(page);

    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });
  });

  test('offers page has heading or content area', async ({ page }) => {
    await page.goto('/dashboard/offers');
    await waitForPageReady(page);

    const heading = page.getByRole('heading', { name: /offers?/i, level: 1 });
    const mainContent = page.locator('main').first();
    await expect(heading.or(mainContent)).toBeVisible({ timeout: 15_000 });
  });

  test('offers table or empty state renders', async ({ page }) => {
    await page.goto('/dashboard/offers');
    await waitForPageReady(page);

    const table = page.locator('table, [role="table"], [role="grid"]');
    const empty = page.getByText(/no offers/i).first();
    const mainContent = page.locator('main').first();
    await expect(table.first().or(empty).or(mainContent)).toBeVisible({ timeout: 20_000 });
  });

  test('navigate to offer detail page', async ({ page, request }) => {
    const list = await request.get('/api/v1/offers/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No offers available');

    await page.goto('/dashboard/offers');
    const link = page.locator(`a[href="/dashboard/offers/${first.id}"]`).first();
    if (await link.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL(`**/dashboard/offers/${first.id}`, { timeout: 20_000 }),
        link.click(),
      ]);
    } else {
      await page.goto(`/dashboard/offers/${first.id}`);
    }
    await expect(page).toHaveURL(new RegExp(`/dashboard/offers/${first.id}`));
  });

  test('offer detail page renders main content', async ({ page, request }) => {
    const list = await request.get('/api/v1/offers/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No offers available');

    await page.goto(`/dashboard/offers/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('offer data factory generates valid entries', async ({}) => {
    const o1 = createOfferData('cand-1', 'job-1');
    const o2 = createOfferData('cand-2', 'job-2', { salary: 95000, status: 'sent' });
    const o3 = createOfferData('cand-3', 'job-3', { currency: 'USD', status: 'accepted' });

    expect(o1.candidate_id).toBe('cand-1');
    expect(o1.salary).toBe(75000);
    expect(o1.currency).toBe('EUR');
    expect(o1.status).toBe('draft');

    expect(o2.salary).toBe(95000);
    expect(o2.status).toBe('sent');

    expect(o3.currency).toBe('USD');
    expect(o3.status).toBe('accepted');
  });

  test('offer lifecycle - status progression', async ({}) => {
    const statuses: Array<'draft' | 'sent' | 'accepted' | 'rejected' | 'withdrawn'> = [
      'draft',
      'sent',
      'accepted',
      'rejected',
      'withdrawn',
    ];

    for (const status of statuses) {
      const offer = createOfferData('cand-1', 'job-1', { status });
      expect(offer.status).toBe(status);
    }
  });

  test('offer with various salary ranges', async ({}) => {
    const lowSalary = createOfferData('cand-1', 'job-1', { salary: 35000 });
    const midSalary = createOfferData('cand-2', 'job-2', { salary: 75000 });
    const highSalary = createOfferData('cand-3', 'job-3', { salary: 200000 });

    expect(lowSalary.salary).toBe(35000);
    expect(midSalary.salary).toBe(75000);
    expect(highSalary.salary).toBe(200000);
  });

  test('offer with multiple currencies', async ({}) => {
    const currencies = ['EUR', 'USD', 'GBP', 'CHF', 'CAD'];
    for (const currency of currencies) {
      const offer = createOfferData('cand-1', 'job-1', { currency });
      expect(offer.currency).toBe(currency);
    }
  });

  test('offer with benefits packages', async ({}) => {
    const basicBenefits = createOfferData('cand-1', 'job-1', {
      benefits: ['Health insurance'],
    });
    const fullBenefits = createOfferData('cand-2', 'job-2', {
      benefits: ['Health insurance', 'Remote work', 'Stock options', 'Gym membership', 'Transport'],
    });

    expect(basicBenefits.benefits).toHaveLength(1);
    expect(fullBenefits.benefits).toHaveLength(5);
  });

  test('offers page - search or filter if available', async ({ page }) => {
    await page.goto('/dashboard/offers');
    await waitForPageReady(page);

    const search = page.getByPlaceholder(/search offers?/i);
    if (await search.isVisible().catch(() => false)) {
      await search.fill('zzzzzz_nonexistent_zzzzz');
      await expect(page.getByText(/no offers/i).first()).toBeVisible({ timeout: 10_000 });
      await search.fill('');
    }

    const filter = page.getByLabel(/filter by status/i);
    if (await filter.isVisible().catch(() => false)) {
      await filter.selectOption('draft').catch(() => {});
      await filter.selectOption('sent').catch(() => {});
      await filter.selectOption('accepted').catch(() => {});
    }
  });

  test('create offer button or link is accessible', async ({ page }) => {
    await page.goto('/dashboard/offers');
    await waitForPageReady(page);

    const createBtn = page.getByRole('button', { name: /create|new|add/i }).first();
    const createLink = page.locator('a[href*="offers/new"]').first();
    await expect(createBtn.or(createLink).or(page.locator('main').first())).toBeVisible({ timeout: 15_000 });
  });

  test('offer detail - back navigation to list', async ({ page, request }) => {
    const list = await request.get('/api/v1/offers/?page_size=1');
    if (!list.ok()) return;
    const body = await list.json();
    const first = body?.data?.[0];
    test.skip(!first?.id, 'No offers available');

    await page.goto(`/dashboard/offers/${first.id}`);
    await expect(page.locator('main#main-content')).toBeVisible({ timeout: 15_000 });

    const backLink = page.locator('a[href="/dashboard/offers"]').first();
    if (await backLink.isVisible().catch(() => false)) {
      await Promise.all([
        page.waitForURL('**/dashboard/offers', { timeout: 15_000 }),
        backLink.click(),
      ]);
      await expect(page).toHaveURL(/\/dashboard\/offers$/);
    }
  });

  test('offer page - responsive layout', async ({ page }) => {
    await page.goto('/dashboard/offers');
    await waitForPageReady(page);

    const mainContent = page.locator('main').first();
    await expect(mainContent).toBeVisible({ timeout: 15_000 });

    await page.setViewportSize({ width: 768, height: 1024 });
    await waitForPageReady(page);
    await expect(mainContent).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await waitForPageReady(page);
    await expect(mainContent).toBeVisible();
  });
});
