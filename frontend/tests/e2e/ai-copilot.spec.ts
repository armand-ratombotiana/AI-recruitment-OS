import { test, expect } from '@playwright/test';
import { loginAsDemo } from './pages/auth.helper';

test.describe('AI Copilot page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('AI Copilot page loads with title and chat region', async ({ page }) => {
    await page.goto('/dashboard/ai-copilot');
    await expect(page.getByRole('heading', { name: /ai copilot/i, level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(/ask the copilot/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('log', { name: /conversation/i })).toBeVisible();
  });

  test('welcome message is shown on first visit', async ({ page }) => {
    await page.goto('/dashboard/ai-copilot');
    const conversation = page.getByRole('log', { name: /conversation/i });
    await expect(conversation).toBeVisible({ timeout: 15_000 });
    await expect(conversation).toContainText(/recruiting copilot|hello/i, { timeout: 10_000 });
  });

  test('message input accepts text and is typeable', async ({ page }) => {
    await page.goto('/dashboard/ai-copilot');
    const input = page.getByLabel(/ask the copilot/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.waitFor({ state: 'visible' });

    await input.fill('How many candidates are in my pipeline?');
    await expect(input).toHaveValue('How many candidates are in my pipeline?');
  });

  test('typing in the input enables the send button', async ({ page }) => {
    await page.goto('/dashboard/ai-copilot');
    const input = page.getByLabel(/ask the copilot/i);
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(input).toBeVisible({ timeout: 15_000 });

    await expect(sendButton).toBeDisabled();
    await input.fill('Tell me about my top candidates');
    await expect(sendButton).toBeEnabled();
  });

  test('suggested prompt chips render and are clickable', async ({ page }) => {
    await page.goto('/dashboard/ai-copilot');
    const prompts = page.locator('[data-tour="copilot-prompts"]');
    await expect(prompts).toBeVisible({ timeout: 15_000 });
    const firstPrompt = prompts.getByRole('button').first();
    await expect(firstPrompt).toBeVisible();
  });

  test('sending a message adds the user message to the conversation', async ({ page }) => {
    await page.goto('/dashboard/ai-copilot');
    const input = page.getByLabel(/ask the copilot/i);
    const sendButton = page.getByRole('button', { name: /send message/i });
    await expect(input).toBeVisible({ timeout: 15_000 });

    const message = `Test question ${Date.now()}`;
    await input.fill(message);
    await sendButton.click();

    const conversation = page.getByRole('log', { name: /conversation/i });
    await expect(conversation).toContainText(message, { timeout: 10_000 });
  });
});
