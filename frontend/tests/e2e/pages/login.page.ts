import type { Page, Locator } from '@playwright/test';

export const DEMO_EMAIL = 'demo@airos.io';
export const DEMO_PASSWORD = 'demo1234';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorAlert: Locator;
  readonly demoButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('#email');
    this.passwordInput = page.locator('#password');
    this.submitButton = page.getByRole('button', { name: /sign in/i }).first();
    this.errorAlert = page.locator('[role="alert"]');
    this.demoButton = page.getByRole('button', { name: /use demo credentials/i });
  }

  async goto() {
    await this.page.goto('/login');
    await this.emailInput.waitFor({ state: 'visible' });
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async useDemoCredentials() {
    await this.demoButton.click();
  }

  async getError(): Promise<string | null> {
    if (await this.errorAlert.isVisible().catch(() => false)) {
      return (await this.errorAlert.textContent())?.trim() ?? null;
    }
    return null;
  }
}
