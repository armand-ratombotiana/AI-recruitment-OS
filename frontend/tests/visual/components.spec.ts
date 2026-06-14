import { test, expect } from '../utils/fixtures';
import {
  compareVisualSnapshot,
  setViewportToDesktop,
  waitForPageReady,
} from '../utils/test-helpers';

test.describe('Key components - Visual regression', () => {
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

  test('login page - visual snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

    await compareVisualSnapshot(page, 'login-page.png');
  });

  test('login page - with filled credentials', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

    await page.locator('#email').fill('demo@airos.io');
    await page.locator('#password').fill('demo1234');

    await compareVisualSnapshot(page, 'login-page-filled.png');
  });

  test('login page - with error state', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

    await page.locator('#email').fill('invalid@test.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).first().click();

    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible({ timeout: 15_000 });

    await compareVisualSnapshot(page, 'login-page-error.png');
  });

  test('pipeline page - kanban board snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/pipeline');
    await expect(page.getByRole('heading', { name: /pipeline/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'pipeline-kanban.png');
  });

  test('interviews page - list snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/interviews');
    await expect(page.getByRole('heading', { name: /interviews/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'interviews-list.png');
  });

  test('AI copilot page - chat interface snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/ai-copilot');
    await expect(page.getByRole('heading', { name: /ai copilot/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await waitForPageReady(page);

    await compareVisualSnapshot(page, 'ai-copilot-interface.png');
  });

  test('AI copilot - with typed message', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/ai-copilot');
    await expect(page.getByLabel(/ask the copilot/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/ask the copilot/i).fill('How many candidates are in my pipeline?');

    await compareVisualSnapshot(page, 'ai-copilot-with-message.png');
  });

  test('settings page - snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/settings');
    await waitForPageReady(page);

    const mainContent = page.locator('main').first();
    if (await mainContent.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await compareVisualSnapshot(page, 'settings-page.png');
    }
  });

  test('navigation sidebar - snapshot', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /welcome back/i, level: 1 })).toBeVisible({ timeout: 15_000 });

    const sidebar = page.locator('nav').first();
    if (await sidebar.isVisible().catch(() => false)) {
      await compareVisualSnapshot(page, 'navigation-sidebar.png');
    }
  });

  test('empty state component - candidates empty', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/candidates');
    const search = page.getByPlaceholder(/search candidates by name or email/i);
    await expect(search).toBeVisible({ timeout: 15_000 });

    await search.fill('absolutely_no_results_here_xyz');
    await expect(page.getByText(/no candidates (found|yet)/i)).toBeVisible({ timeout: 10_000 });

    await compareVisualSnapshot(page, 'empty-state-candidates.png');
  });

  test('badge component - pipeline stages', async ({ page }) => {
    await setViewportToDesktop(page);
    await page.goto('/dashboard/pipeline');
    await waitForPageReady(page);

    const stages = page.locator('[data-tour="pipeline-stages"]');
    const empty = page.getByText(/no candidates in pipeline/i).first();
    await expect(stages.or(empty)).toBeVisible({ timeout: 20_000 });

    await compareVisualSnapshot(page, 'pipeline-badges.png');
  });
});
