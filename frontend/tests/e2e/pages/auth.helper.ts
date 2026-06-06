import type { Page } from '@playwright/test';
import { LoginPage, DEMO_EMAIL, DEMO_PASSWORD } from './login.page';

export async function loginAsDemo(page: Page): Promise<void> {
  const login = new LoginPage(page);
  await login.goto();
  await login.useDemoCredentials();
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
    login.submitButton.click(),
  ]);
  await page.waitForLoadState('domcontentloaded');
}

export async function loginWithCredentials(
  page: Page,
  email: string = DEMO_EMAIL,
  password: string = DEMO_PASSWORD,
): Promise<void> {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(email, password);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  await page.waitForLoadState('domcontentloaded');
}
