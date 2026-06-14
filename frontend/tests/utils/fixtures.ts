import { test as base, expect, type Page } from '@playwright/test';
import { loginAsDemo, loginWithCredentials } from '../e2e/pages/auth.helper';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../e2e/pages/login.page';
import {
  waitForPageReady,
  setViewportToDesktop,
  dismissModals,
  createCandidateData,
  createJobData,
  type CandidateData,
  type JobData,
} from './test-helpers';

interface AuthFixture {
  authenticatedPage: Page;
}

interface TenantFixture {
  tenantId: string;
  tenantName: string;
}

interface TestUserFixture {
  email: string;
  password: string;
  role: 'admin' | 'recruiter' | 'hiring_manager' | 'viewer';
}

interface CandidateFixture {
  candidate: CandidateData;
}

interface JobFixture {
  job: JobData;
}

interface VisualFixture {
  desktopPage: Page;
  tabletPage: Page;
  mobilePage: Page;
}

export const test = base.extend<AuthFixture & TenantFixture & TestUserFixture & CandidateFixture & JobFixture & VisualFixture>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsDemo(page);
    await waitForPageReady(page);
    await use(page);
  },

  tenantId: 'tenant_test_001',
  tenantName: 'AI-ROS Test Tenant',

  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
  role: 'admin' as const,

  candidate: async ({}, use) => {
    const candidate = createCandidateData();
    await use(candidate);
  },

  job: async ({}, use) => {
    const job = createJobData();
    await use(job);
  },

  desktopPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await loginAsDemo(page);
    await waitForPageReady(page);
    await use(page);
    await context.close();
  },

  tabletPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
    });
    const page = await context.newPage();
    await loginAsDemo(page);
    await waitForPageReady(page);
    await use(page);
    await context.close();
  },

  mobilePage: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
    });
    const page = await context.newPage();
    await loginAsDemo(page);
    await waitForPageReady(page);
    await use(page);
    await context.close();
  },
});

export { expect };

export const testAuthenticated = base.extend<AuthFixture>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsDemo(page);
    await waitForPageReady(page);
    await dismissModals(page);
    await use(page);
  },
});

export const testWithCredentials = base.extend<{ credentialEmail: string; credentialPassword: string }>({
  credentialEmail: DEMO_EMAIL,
  credentialPassword: DEMO_PASSWORD,
});

export function createAuthenticatedTest(description: string, testFn: (page: Page) => Promise<void>) {
  return testAuthenticated(description, async ({ authenticatedPage }) => {
    await testFn(authenticatedPage);
  });
}

export const ADMIN_CREDENTIALS = {
  email: 'admin@airos.io',
  password: 'admin1234',
};

export const RECRUITER_CREDENTIALS = {
  email: 'recruiter@airos.io',
  password: 'recruiter1234',
};

export const VIEWER_CREDENTIALS = {
  email: 'viewer@airos.io',
  password: 'viewer1234',
};
