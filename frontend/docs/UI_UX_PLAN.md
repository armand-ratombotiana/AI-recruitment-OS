# AI-ROS Frontend — UI/UX Implementation Plan

> Phased rollout of the improvements identified in `UI_UX_ANALYSIS.md`.
> Each phase ends with a build + manual smoke test.

---

## Phase 1 — High priority (conversion-critical + broken paths)

**Goal**: Make the landing page a true sales asset, fix the SSO callback 404,
elevate the auth forms to production quality, and turn the dashboard shell into
a polished product surface.

### 1.1 Landing page (`src/app/page.tsx`)

- [x] Add `<TrustedByBar />` directly under the hero (6 inline-SVG company wordmarks)
- [x] Add `<FAQ />` section with `<details>/<summary>` for accessibility + SEO
- [x] Add `<PricingToggle />` (monthly / yearly) that animates prices
- [x] Add `<FeatureComparisonTable />` under pricing
- [x] Wire the CTA email input to a client-side `onSubmit` (toast confirmation)
- [x] Upgrade testimonials with role avatars + 5-star SVG clusters
- [x] Add footer improvements: status pill, language switcher placeholder, newsletter

### 1.2 Auth callback fix (broken)

- [x] Create `src/app/(auth)/callback/[provider]/page.tsx` so the dynamic SSO route exists
- [x] Update the existing `src/app/(auth)/callback/page.tsx` to redirect to the new
      dynamic route (or merge the two — keep the static one as a fallback)
- [x] Update `handleSSO` in login/register to navigate to the dynamic path

### 1.3 Login page (`src/app/(auth)/login/page.tsx`)

- [x] Migrate submit button to `<Button variant="primary" loading={isLoading}>`
- [x] Add a "What is single sign-on?" tooltip near the SSO cluster
- [x] Add field-level success state (green ring) on blur-valid input
- [x] Add a "Use demo credentials" link that pre-fills `demo@airos.io / demo123`
- [x] Add `aria-describedby` for help text below each field
- [x] Add `Enter` key submission (already works on form submit, document it)
- [x] Add a "Sign in with email link" placeholder (visual only)

### 1.4 Register page (`src/app/(auth)/register/page.tsx`)

- [x] Build a **password requirements checklist** (5 rules) with real-time green ticks
- [x] Strength meter shows score `0/5 ... 5/5` with color gradient
- [x] Add a 2-step flow: step 1 = form, step 2 = "Check your inbox" confirmation
- [x] Migrate submit button to `<Button variant="primary" loading={isLoading}>`
- [x] Add field-level validation on blur with success indicators
- [x] Add microcopy "We never share your email" under the email field
- [x] Replace generic error banner with field-level error under each field

### 1.5 Dashboard layout (`src/app/dashboard/layout.tsx`)

- [x] Replace raw SVG icons in sidebar with Lucide icons
- [x] Add a `<UserMenu />` dropdown (avatar click → profile, settings, logout)
- [x] Add a `<NotificationsBell />` with badge + slide-in panel
- [x] Add a `<Breadcrumb />` strip below the header
- [x] Add a `<QuickActionsFab />` floating button (bottom-right)
- [x] Wire the search to `useState` + a debounced `/api/v1/search` call with a
      dropdown of results (candidates, jobs, interviews)
- [x] Add a "Tip of the day" tooltip in the sidebar footer
- [x] Add `aria-current="page"` to the active sidebar item
- [x] Improve focus styles and keyboard navigation

### 1.6 Dashboard home (`src/app/dashboard/page.tsx`)

- [x] Replace inline stats with `<StatsCard>` + animated `useCountUp`
- [x] Add a `<TodayPanel />` with upcoming interviews and PPE deadlines
- [x] Add an `<ActivityFeed />` with avatars + relative timestamps
- [x] Add a `<QuickActionsRow />` with 4 large clickable cards
- [x] Add a `<RecentCandidates />` strip with avatar + name + status
- [x] Add 2 CSS-only bar charts (candidates/week, interviews/week)
- [x] Add a "Pipeline funnel" mini chart (5-stage stacked horizontal bar)
- [x] Add a date range selector (7d / 30d / 90d)
- [x] Use `<EmptyState>` when no data
- [x] Use `<Skeleton>` and `<SkeletonCard>` during loading

---

## Phase 2 — Medium priority (core workflows)

**Goal**: Make Candidates, Jobs, and Interviews feel like real products with
search, filters, detail views, and creation flows.

### 2.1 Candidates page (`src/app/dashboard/candidates/page.tsx`)

- [x] Migrate to `<DataTable>` with sortable columns and pagination
- [x] Add a **filter strip**: status (multi), skills (chips), experience range, location
- [x] Add a **view toggle**: table ↔ grid
- [x] Add a working **"Add Candidate"** modal with full form
- [x] Add a **candidate detail modal** (tabs: Profile, Evaluations, Interviews, Notes)
- [x] Add **bulk actions** (select all, export CSV, delete)
- [x] Add **status badges** with color coding (Active, Interviewing, Offered, Hired, Rejected)
- [x] Add **skill chips** instead of comma-joined strings
- [x] Add an "Empty state" with illustration + CTA

### 2.2 Jobs page (`src/app/dashboard/jobs/page.tsx`)

- [x] Add a filter bar: status, department, location, type
- [x] Add a working **"Create Job"** multi-step modal (basics → requirements → pipeline)
- [x] Add a **"Job detail"** panel with applications + pipeline breakdown
- [x] Show **applications count** badge on each row
- [x] Add sort on all columns
- [x] Add status filters (open / closed / draft)
- [x] Show salary range formatted with currency

### 2.3 Interviews page (`src/app/dashboard/interviews/page.tsx`)

- [x] Add a **calendar view** (week / day toggle) using CSS grid
- [x] Add a working **"Schedule Interview"** modal (candidate, job, date, type, panel)
- [x] Add an **interview detail** view with tabs (Overview, Transcript, AI Eval, Notes)
- [x] Add status filters (Scheduled, In Progress, Completed, Cancelled)
- [x] Add an **"Upcoming this week"** sticky section
- [x] Highlight today's interviews

---

## Phase 3 — Lower priority (polish + integration)

**Goal**: Make PPE, Analytics, AI Copilot, Workflows, Settings, Pipeline,
Matching, and Schedule feel like first-class product surfaces.

### 3.1 PPE — real editor + run/submit
- Add language selector, test cases panel, Run / Submit / Hint buttons wired to the
  existing API (`submitPPCode`, `requestHint`). Add a session timer.

### 3.2 Analytics — real charts
- Add CSS bar/line charts, pipeline funnel, AI agent performance heatmap, CSV export.

### 3.3 AI Copilot — multi-agent + history
- Add agent selector, conversation sidebar, message feedback, markdown rendering,
  suggested prompts.

### 3.4 Workflows — visual builder
- Add a node-based visual builder (HTML5 + CSS), actions (Run / Pause / Duplicate),
  execution history.

### 3.5 Settings — full page
- Use `<Tabs>`, add Team / Billing tabs, real save/cancel flows, avatar upload,
  generate API key with copy-to-clipboard.

### 3.6 Pipeline — drag & drop
- Wire to real data, add HTML5 drag-and-drop between stages, WIP limits.

### 3.7 Matching — real scores
- Replace `Math.random()` with real API scores, add job selector, "Explain" action.

### 3.8 Schedule — real calendar
- Fetch real events, render a CSS grid calendar, add quick-create modal.

---

## Component additions

| Component | Purpose | Used in |
|-----------|---------|---------|
| `UserMenu` | Avatar dropdown in header | Dashboard layout |
| `NotificationsBell` | Notification badge + panel | Dashboard layout |
| `Breadcrumb` | Page trail | Dashboard layout |
| `QuickActionsFab` | Floating action button | Dashboard layout |
| `TrustedByBar` | Company logos | Landing |
| `FAQ` | Accordion section | Landing |
| `PricingToggle` | Monthly/yearly switch | Landing |
| `FeatureComparisonTable` | Plan matrix | Landing |
| `PasswordRequirements` | Live password rules | Register |
| `AddCandidateModal` | Candidate create form | Candidates |
| `AddJobModal` | Multi-step job create | Jobs |
| `ScheduleInterviewModal` | Interview create form | Interviews |
| `CandidateDetailModal` | Tabbed candidate view | Candidates |
| `EmptyState` (already exists) | No-data UI | Everywhere |

---

## Acceptance criteria

Each phase is "done" when:

1. `npx next build --no-lint` passes with zero errors.
2. Every modified page is reachable from the sidebar / nav.
3. Every dead CTA (Add, Create, Schedule) opens a working modal or shows a
   "coming soon" toast.
4. Every list view uses the existing `<DataTable>` or `<EmptyState>`.
5. Every form uses the existing `<Button>` with `loading` state.
6. Every page has a sensible `<Skeleton>` loading state.
7. No raw hard-coded mock data on production pages (PPE/Schedule can keep stubs
   for now).
8. Basic keyboard navigation works (Tab, Enter, Esc, arrow keys).
9. All interactive elements have `aria-*` attributes where needed.
