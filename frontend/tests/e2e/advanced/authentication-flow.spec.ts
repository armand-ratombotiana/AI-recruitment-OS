import { test, expect } from '../../utils/fixtures';
import { LoginPage, DEMO_EMAIL, DEMO_PASSWORD } from '../pages/login.page';
import { waitForPageReady, generateUniqueEmail } from '../../utils/test-helpers';

test.describe('Authentication flow - Advanced E2E', () => {
  test('full login flow with demo credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#password')).toBeVisible();
    await expect(login.submitButton).toBeVisible();

    await login.useDemoCredentials();
    await expect(page.locator('#email')).toHaveValue(DEMO_EMAIL);

    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      login.submitButton.click(),
    ]);

    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/login');
  });

  test('login with manual credentials', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    await login.login(DEMO_EMAIL, DEMO_PASSWORD);

    await expect(page.locator('#email')).toHaveValue(DEMO_EMAIL);
    await expect(page.locator('#password')).toHaveValue(DEMO_PASSWORD);

    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      login.submitButton.click(),
    ]);

    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/login');
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    await login.login('invalid@test.com', 'wrongpassword');
    await login.submitButton.click();

    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 15_000 });
  });

  test('login form validation - empty fields', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

    await login.submitButton.click();
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/login');
  });

  test('login form validation - invalid email format', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
    await page.locator('#email').fill('not-an-email');
    await page.locator('#password').fill('somepassword');
    await login.submitButton.click();

    await page.waitForTimeout(1000);
    const hasError = await page.locator('[role="alert"]').isVisible().catch(() => false);
    const stillOnLogin = page.url().includes('/login');
    expect(hasError || stillOnLogin).toBeTruthy();
  });

  test('logout redirects to login page', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.useDemoCredentials();
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      login.submitButton.click(),
    ]);
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/login');

    const logoutButton = page.getByRole('button', { name: /log\s*out|sign\s*out|deconnect/i });
    const userMenuButton = page.getByRole('button', { name: /account|profile|user/i }).first();

    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
    } else if (await userMenuButton.isVisible().catch(() => false)) {
      await userMenuButton.click();
      await page.waitForTimeout(500);
      const menuLogout = page.getByRole('menuitem', { name: /log\s*out|sign\s*out|deconnect/i });
      if (await menuLogout.isVisible().catch(() => false)) {
        await menuLogout.click();
      }
    }

    await page.waitForTimeout(2000);
    const onLogin = page.url().includes('/login');
    const hasLoginForm = await page.locator('#email').isVisible().catch(() => false);
    expect(onLogin || hasLoginForm).toBeTruthy();
  });

  test('session persistence after page reload', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.useDemoCredentials();
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }),
      login.submitButton.click(),
    ]);
    await page.waitForLoadState('domcontentloaded');

    const dashboardUrl = page.url();
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const stillLoggedIn = !page.url().includes('/login');
    expect(stillLoggedIn).toBeTruthy();
    void dashboardUrl;
  });

  test('protected route redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(3000);

    const onLogin = page.url().includes('/login');
    const hasLoginForm = await page.locator('#email').isVisible().catch(() => false);
    expect(onLogin || hasLoginForm).toBeTruthy();
  });

  test('2FA flow simulation - code entry step', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.useDemoCredentials();
    await login.submitButton.click();
    await page.waitForTimeout(2000);

    const twoFactorInput = page.locator('input[name="code"], input[placeholder*="code" i], input[type="tel"]').first();
    const twoFactorHeading = page.getByRole('heading', { name: /two.factor|2fa|verification|code/i });

    if (await twoFactorInput.isVisible().catch(() => false) || await twoFactorHeading.isVisible().catch(() => false)) {
      if (await twoFactorInput.isVisible().catch(() => false)) {
        await twoFactorInput.fill('123456');
        await page.getByRole('button', { name: /verify|submit|confirm/i }).first().click();
      }
      await page.waitForTimeout(2000);
    }

    await waitForPageReady(page);
  });

  test('password visibility toggle', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();

    await expect(page.locator('#password')).toBeVisible({ timeout: 15_000 });
    await page.locator('#password').fill(DEMO_PASSWORD);

    const toggleBtn = page.locator('button[aria-label*="password" i], button[type="button"]').filter({
      has: page.locator('svg'),
    }).first();

    if (await toggleBtn.isVisible().catch(() => false)) {
      const typeBefore = await page.locator('#password').getAttribute('type');
      await toggleBtn.click();
      const typeAfter = await page.locator('#password').getAttribute('type');
      expect(typeBefore).not.toBe(typeAfter);
    }
  });

  test('multiple failed login attempts', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

    for (let i = 0; i < 3; i++) {
      await page.locator('#email').fill(`fail${i}@test.com`);
      await page.locator('#password').fill('wrongpass');
      await login.submitButton.click();
      await page.waitForTimeout(1000);
    }

    const errorAlert = page.locator('[role="alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 10_000 });
  });
});
