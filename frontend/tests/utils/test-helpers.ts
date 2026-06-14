import type { Page, APIRequestContext, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export interface CandidateData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  experience_years: number;
  skills: string[];
  status: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
  source: 'linkedin' | 'indeed' | 'referral' | 'direct' | 'agency';
}

export interface JobData {
  title: string;
  department: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract' | 'internship';
  status: 'draft' | 'open' | 'closed' | 'paused';
  description: string;
  requirements: string[];
  salary_min: number;
  salary_max: number;
}

export interface InterviewData {
  candidate_id: string;
  job_id: string;
  type: 'phone' | 'video' | 'onsite' | 'technical';
  scheduled_at: string;
  duration_minutes: number;
  interviewers: string[];
  location?: string;
  notes?: string;
}

export interface OfferData {
  candidate_id: string;
  job_id: string;
  salary: number;
  currency: string;
  start_date: string;
  expiration_date: string;
  benefits: string[];
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'withdrawn';
}

let candidateCounter = 0;
let jobCounter = 0;

export function createCandidateData(overrides: Partial<CandidateData> = {}): CandidateData {
  candidateCounter++;
  return {
    first_name: `Test`,
    last_name: `Candidate${candidateCounter}`,
    email: `test.candidate${candidateCounter}@airos-test.io`,
    phone: `+3360000${String(candidateCounter).padStart(4, '0')}`,
    position: 'Software Engineer',
    experience_years: 5,
    skills: ['TypeScript', 'React', 'Node.js'],
    status: 'applied',
    source: 'direct',
    ...overrides,
  };
}

export function createJobData(overrides: Partial<JobData> = {}): JobData {
  jobCounter++;
  return {
    title: `Test Job ${jobCounter}`,
    department: 'Engineering',
    location: 'Paris, France',
    type: 'full-time',
    status: 'draft',
    description: `Automated test job posting #${jobCounter} for AI-ROS E2E testing.`,
    requirements: ['5+ years experience', 'TypeScript proficiency', 'Team player'],
    salary_min: 60000,
    salary_max: 90000,
    ...overrides,
  };
}

export function createInterviewData(
  candidateId: string,
  jobId: string,
  overrides: Partial<InterviewData> = {},
): InterviewData {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  return {
    candidate_id: candidateId,
    job_id: jobId,
    type: 'video',
    scheduled_at: tomorrow.toISOString(),
    duration_minutes: 60,
    interviewers: ['interviewer@airos.io'],
    notes: 'Automated test interview',
    ...overrides,
  };
}

export function createOfferData(
  candidateId: string,
  jobId: string,
  overrides: Partial<OfferData> = {}): OfferData {
  const start = new Date();
  start.setMonth(start.getMonth() + 1);
  const expiration = new Date();
  expiration.setDate(expiration.getDate() + 14);

  return {
    candidate_id: candidateId,
    job_id: jobId,
    salary: 75000,
    currency: 'EUR',
    start_date: start.toISOString().split('T')[0],
    expiration_date: expiration.toISOString().split('T')[0],
    benefits: ['Health insurance', 'Remote work', 'Stock options'],
    status: 'draft',
    ...overrides,
  };
}

export async function mockCandidatesList(
  request: APIRequestContext,
  candidates: CandidateData[] = [],
): Promise<void> {
  const data = candidates.length > 0
    ? candidates
    : [
        createCandidateData({ first_name: 'Alice', last_name: 'Martin', status: 'screening' }),
        createCandidateData({ first_name: 'Bob', last_name: 'Dupont', status: 'interview' }),
        createCandidateData({ first_name: 'Claire', last_name: 'Bernard', status: 'offer' }),
      ];

  await request.storageState();
  void data;
}

export async function mockJobsList(
  request: APIRequestContext,
  jobs: JobData[] = [],
): Promise<void> {
  const data = jobs.length > 0
    ? jobs
    : [
        createJobData({ title: 'Senior Frontend Developer', status: 'open' }),
        createJobData({ title: 'Backend Engineer', status: 'open' }),
        createJobData({ title: 'DevOps Specialist', status: 'closed' }),
      ];

  await request.storageState();
  void data;
}

export async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});
}

export async function waitForDataLoad(
  page: Page,
  selector: string,
  timeout = 15_000,
): Promise<Locator> {
  const locator = page.locator(selector);
  await locator.first().waitFor({ state: 'visible', timeout });
  return locator;
}

export async function dismissModals(page: Page): Promise<void> {
  const closeButtons = page.locator('[aria-label="Close"], button:has-text("×"), button:has-text("Close")');
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    const btn = closeButtons.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
    }
  }
}

export async function setViewportToDesktop(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
}

export async function setViewportToTablet(page: Page): Promise<void> {
  await page.setViewportSize({ width: 768, height: 1024 });
}

export async function setViewportToMobile(page: Page): Promise<void> {
  await page.setViewportSize({ width: 375, height: 812 });
}

export async function expectNoConsoleErrors(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
}

export async function captureFullPageScreenshot(
  page: Page,
  options?: { animations?: 'disabled' | 'allow' },
): Promise<Buffer> {
  return page.screenshot({
    fullPage: true,
    animations: options?.animations ?? 'disabled',
  });
}

export async function compareVisualSnapshot(
  page: Page,
  name: string,
  options?: {
    threshold?: number;
    maxDiffPixelRatio?: number;
    mask?: Locator[];
  },
): Promise<void> {
  await expect(page).toHaveScreenshot(name, {
    maxDiffPixelRatio: options?.maxDiffPixelRatio ?? 0.01,
    threshold: options?.threshold ?? 0.2,
    mask: options?.mask,
    animations: 'disabled',
  });
}

export function generateUniqueEmail(prefix = 'test'): string {
  return `${prefix}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@airos-test.io`;
}

export function generateUniqueString(prefix = 'str'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function fillFormField(
  page: Page,
  labelOrPlaceholder: string,
  value: string,
): Promise<void> {
  const input = page.getByLabel(labelOrPlaceholder).or(page.getByPlaceholder(labelOrPlaceholder));
  await input.first().fill(value);
}

export async function selectDropdownOption(
  page: Page,
  label: string,
  value: string,
): Promise<void> {
  const select = page.getByLabel(label);
  await select.selectOption(value);
}

export async function clickAndWaitForNavigation(
  page: Page,
  locator: Locator,
): Promise<void> {
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    locator.click(),
  ]);
}
