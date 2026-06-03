# AI Recruitment OS — UI/UX Implementation Roadmap

**Date:** June 3, 2026
**Companion to:** `UI_UX_DEEP_ANALYSIS.md`
**Format:** Prioritized, actionable tasks with effort estimates and acceptance criteria

---

## How to Read This Document

- **Priority:** P0 (must-fix) → P1 (next sprint) → P2 (backlog) → P3 (nice-to-have)
- **Effort:** S (≤ 2h) · M (2-8h) · L (8-24h) · XL (> 24h)
- **Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done
- **Acceptance criteria:** Each task has a checklist that defines "done"

---

## PHASE 0: FOUNDATION (Week 1) — P0 Quick Wins

These are the highest-ROI changes. None of them should take more than 2 hours each, but they unlock every other improvement.

### 0.1 Design tokens for Tailwind [P0] · [S]
- [ ] Add `brand`, `accent`, `surface`, `ink`, `success`, `warning`, `danger`, `info` color scales to `tailwind.config.ts` (see `UI_UX_DEEP_ANALYSIS.md` Section 9)
- [ ] Add `display-*`, `title-*`, `body-*`, `caption` font sizes
- [ ] Add `section`, `page`, `card`, `field` spacing tokens
- [ ] Add `elevation-1` through `elevation-4` and `brand*` shadow tokens
- [ ] Add `out-quart`, `in-out-quart` easing tokens
- [ ] Add `darkMode: 'class'` configuration
- [ ] **Acceptance:** `grep -r "blue-600" src/` returns mostly `brand-600` (with documented exceptions for hover states etc.)

### 0.2 Fix sidebar nav icon bugs [P0] · [S]
- [ ] In `src/app/dashboard/layout.tsx:32`, change `WorkflowIcon` to `KanbanSquare` for `/dashboard/pipeline`
- [ ] In `src/app/dashboard/layout.tsx:34`, change `Calendar` to `CalendarDays` for `/dashboard/schedule`
- [ ] Update the import statement
- [ ] **Acceptance:** Visually verify each nav icon is unique and meaningful

### 0.3 Add skip-to-content link [P0] · [S]
- [ ] In `src/app/dashboard/layout.tsx`, before the `<aside>`, add:
  ```tsx
  <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:rounded-md focus:shadow-lg focus:ring-2 focus:ring-blue-500">
    Skip to main content
  </a>
  ```
- [ ] Add `id="main-content"` to the `<main>` element
- [ ] **Acceptance:** Tab key from page load → skip link appears → Enter jumps to main

### 0.4 Delete dead auth callback file [P0] · [S]
- [ ] Delete `src/app/(auth)/callback/page.tsx`
- [ ] Verify `src/app/(auth)/callback/[provider]/page.tsx` is the canonical version
- [ ] **Acceptance:** `git grep "/callback/"` returns no static file (only the dynamic one)

### 0.5 Replace raw buttons with `<Button>` [P0] · [M]
- [ ] `src/app/dashboard/settings/page.tsx:11-15` — replace 4 raw `<button>` Save/Generate with `<Button variant="primary">`
- [ ] `src/app/dashboard/workflows/page.tsx:17` — replace raw button with `<Button variant="primary" leftIcon={<Plus />}>` 
- [ ] `src/app/dashboard/analytics/page.tsx:22` — replace range buttons with `<Button size="sm" variant={range === r ? 'primary' : 'secondary'}>`
- [ ] `src/app/dashboard/ai-copilot/page.tsx:30` — replace send button with `<Button variant="primary">`
- [ ] `src/app/dashboard/matching/page.tsx` — any buttons
- [ ] `src/app/dashboard/schedule/page.tsx:16` — period picker buttons
- [ ] `src/app/dashboard/pipeline/page.tsx` — any buttons
- [ ] **Acceptance:** `grep -r 'class.*bg-blue-600' src/app/dashboard/` returns no buttons (only backgrounds)

### 0.6 Use `<InputField>` family in AddCandidateForm [P0] · [M]
- [ ] In `src/app/dashboard/candidates/page.tsx:374-420`, replace all 6 raw inputs with `<InputField>` / `<SelectField>`
- [ ] Wire up error states to a single error state
- [ ] Add `<FormField>` validation (email format, required)
- [ ] **Acceptance:** Form has consistent error UX matching login page

### 0.7 Make demo credentials env-conditional [P0] · [S]
- [ ] In `src/app/(auth)/login/page.tsx:78-84` and `:147-149`:
  ```ts
  const SHOW_DEMO = process.env.NEXT_PUBLIC_ENABLE_DEMO === 'true';
  ```
- [ ] Wrap the demo button in `{SHOW_DEMO && (...)}`
- [ ] Document the env var in README
- [ ] **Acceptance:** Setting `NEXT_PUBLIC_ENABLE_DEMO=false` hides the button in build

### 0.8 Use `router.push` instead of `window.location.href` in login [P0] · [S]
- [ ] In `src/app/(auth)/login/page.tsx:55`, replace `window.location.href = '/dashboard'` with `router.push('/dashboard')` (import `useRouter` from `next/navigation`)
- [ ] **Acceptance:** Login navigates without full page reload (verify with React DevTools — state preserved)

### 0.9 Connect UserMenu to real auth state [P0] · [S]
- [ ] In `src/app/dashboard/user-menu.tsx:42, 53-54`, replace hardcoded "John Doe" / "Pro Plan" with `useAuthStore((s) => s.user)`
- [ ] Add a default placeholder when no user data
- [ ] **Acceptance:** UserMenu shows actual logged-in user info

### 0.10 Add page title to dashboard header [P0] · [M]
- [ ] Create `src/components/dashboard/page-title.tsx` that reads `usePathname()` and returns the right title
- [ ] In `src/app/dashboard/layout.tsx:122-135`, add `<PageTitle />` between the search and the bell/user
- [ ] **Acceptance:** Each dashboard page shows its name in the top bar (e.g., "Candidates", "Jobs", "Interviews")

### 0.11 Make `<StatsCard>` clickable [P0] · [S]
- [ ] In `src/components/dashboard/stats-card.tsx`, add an optional `href` prop
- [ ] When `href` is provided, wrap the card in `<Link href={href}>`
- [ ] Update dashboard (`page.tsx:145-174`) to pass `href` to each StatsCard
- [ ] **Acceptance:** Clicking a KPI card navigates to the relevant page (e.g., "Total Candidates" → `/dashboard/candidates`)

### 0.12 Use `<Badge>` in sidebar nav [P0] · [S]
- [ ] In `src/app/dashboard/layout.tsx:95-101`, replace the raw `<span>` for badges with `<Badge variant={...} size="sm">`
- [ ] **Acceptance:** Sidebar badges match the badge style used elsewhere in the app

### 0.13 Fix calendar week-start bug [P0] · [S]
- [ ] In `src/app/dashboard/interviews/page.tsx:266`, replace:
  ```ts
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);
  ```
  with:
  ```ts
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;  // Sunday → -6, Mon → 0
  startOfWeek.setDate(today.getDate() + diff);
  ```
- [ ] **Acceptance:** Calendar week is Mon-Sun on every day of the week

### 0.14 Remove dead `e.preventDefault()` on links [P0] · [S]
- [ ] In `src/app/(auth)/login/page.tsx:196` ("Forgot password?") — either wire to `/forgot-password` or remove
- [ ] In `src/app/(auth)/register/page.tsx:295` (Terms/Privacy/DPA) — either wire to pages or remove
- [ ] **Acceptance:** No links that don't go anywhere

### 0.15 Consolidate toasts [P0] · [M]
- [ ] Move `<ToastContainer />` rendering to `src/app/dashboard/layout.tsx` (once, via `<NotificationProvider>` or `useToast` singleton)
- [ ] Remove `<ToastContainer />` from individual pages: candidates, jobs, interviews, dashboard
- [ ] **Acceptance:** Only one toast container renders; toasts work on all pages

---

## PHASE 1: ESSENTIAL FIXES (Week 1-2) — P0/P1

### 1.1 Error boundary [P0] · [M]
- [ ] Create `src/components/error-boundary.tsx` (class component with `componentDidCatch`)
- [ ] Wrap `<main>` in `src/app/dashboard/layout.tsx` with `<ErrorBoundary>`
- [ ] Show a friendly error UI with "Try again" and "Go home" actions
- [ ] Log to console (and to a future error reporting service)
- [ ] **Acceptance:** Throwing an error in a child component shows the error UI, not a blank page

### 1.2 API client: 401 + better errors [P0] · [M]
- [ ] In `src/services/api/client.ts:25`, parse error response body:
  ```ts
  const body = await response.json().catch(() => ({}));
  throw new APIError(body.detail || `API error: ${response.status}`, response.status, body);
  ```
- [ ] Add 401 interceptor: on 401, clear token, redirect to `/login`
- [ ] Add request timeout (10s default) using `AbortController`
- [ ] **Acceptance:** Expired token → automatic redirect; 500 with detail message → toast with server message

### 1.3 Wire dashboard data to API [P1] · [M]
- [ ] In `src/app/dashboard/page.tsx:26-71`, remove the hardcoded ACTIVITY, TODAY, RECENT, QUICK, BAR_DATA, FUNNEL
- [ ] Fetch them from API: `api.getRecentActivity()`, `api.getTodayEvents()`, `api.getRecentCandidates()`, `api.getFunnelData()`
- [ ] Add to `src/services/api/client.ts`
- [ ] **Acceptance:** Dashboard shows real data; loading state is consistent

### 1.4 Add onboarding flow [P0] · [L]
- [ ] Create `src/app/onboarding/page.tsx` with 4 steps:
  1. Company profile (name, size, industry)
  2. Team invitations (multi-email)
  3. First job creation (pre-filled wizard)
  4. Job board connections (LinkedIn, Indeed) or skip
- [ ] After signup + email verify, redirect to `/onboarding` instead of `/dashboard`
- [ ] Persist progress in `useLocalStorage`
- [ ] Add an onboarding checklist widget on the dashboard for users who skip
- [ ] **Acceptance:** New users have a clear path to value; returning users see checklist

### 1.5 Add empty states with illustrations [P1] · [M]
- [ ] Create SVG illustrations for common empty states (empty folder, empty inbox, empty calendar, no results)
- [ ] Store them in `src/components/empty-states/`
- [ ] Enhance `<EmptyState>` to accept an `illustration` prop
- [ ] Add EmptyState to PPE, Analytics, AI Copilot, Workflows, Matching
- [ ] **Acceptance:** Every page has a designed empty state

### 1.6 Make all forms use `<InputField>` family [P1] · [L]
- [ ] Login page (`login/page.tsx:158-225`) — migrate to InputField
- [ ] Register page (`register/page.tsx:178-285`) — migrate to InputField
- [ ] Candidates page (AddCandidateForm) — already in 0.6
- [ ] Jobs page (CreateJobWizard) — migrate
- [ ] Interviews page (ScheduleForm) — migrate
- [ ] Settings page — migrate
- [ ] **Acceptance:** All forms have consistent error UX, password show/hide, success checkmarks

### 1.7 Build out the placeholder pages [P0] · [XL] (multi-day)
This is the single biggest piece of work. Each of these pages needs a full redesign:

#### 1.7.1 PPE Page [P0] · [L]
- [ ] Install `@monaco-editor/react` (or use `<PPEEditor>` from `coding-editor/`)
- [ ] Build problem browser (card grid with difficulty, topic)
- [ ] Add timer (start, pause, resume)
- [ ] Add language selector
- [ ] Add run/submit with test case results
- [ ] Add AI hint button (uses `api.requestHint`)
- [ ] Add session history view
- [ ] Show candidate context (which candidate is being evaluated)
- [ ] **Acceptance:** Recruiters can run a real coding session

#### 1.7.2 Analytics Page [P0] · [L]
- [ ] Add line chart: candidates over time (using `<LineChart>` or Recharts)
- [ ] Add funnel chart (matches dashboard, reusable)
- [ ] Add source breakdown (pie or bar)
- [ ] Add job-level performance table
- [ ] Add AI performance metrics section
- [ ] Add time-to-hire distribution
- [ ] Add comparison vs previous period
- [ ] Add export to CSV/PDF
- [ ] **Acceptance:** Recruiters can answer "where are we losing candidates?" from this page

#### 1.7.3 AI Copilot Page [P0] · [L]
- [ ] Add conversation sidebar (history)
- [ ] Add suggested prompts
- [ ] Add agent selector
- [ ] Add streaming responses (use `EventSource` or `fetch` with reader)
- [ ] Add markdown rendering (`react-markdown`)
- [ ] Add code block syntax highlighting
- [ ] Add context bar (which candidate/job am I viewing?)
- [ ] Add file attachments (resume upload)
- [ ] Add copy/regenerate/thumbs up-down on each message
- [ ] Add "Stop generating" button
- [ ] **Acceptance:** AI Copilot is actually useful, not a toy

#### 1.7.4 Workflows Page [P0] · [XL]
- [ ] Add template gallery (5-10 starter workflows)
- [ ] Add visual workflow builder (drag-drop with `@dnd-kit/core`)
- [ ] Add trigger types (new application, status change, time, manual)
- [ ] Add action types (send email, move stage, notify, call AI)
- [ ] Add run history with logs
- [ ] Add test mode
- [ ] Add enable/disable toggle
- [ ] Add duplicate/version
- [ ] **Acceptance:** A recruiter can build a workflow without engineering help

#### 1.7.5 Pipeline Page [P0] · [L]
- [ ] Use `<Kanban>` component (expand it for drag-drop with `@dnd-kit/core`)
- [ ] Add real API integration
- [ ] Add job selector
- [ ] Add candidate cards (avatar, name, score, days-in-stage)
- [ ] Add summary footer
- [ ] **Acceptance:** Drag a candidate between stages; it updates the API and persists

#### 1.7.6 Matching Page [P0] · [L]
- [ ] Replace `Math.random()` with real `api.matchCandidate` / `api.predictSuccess`
- [ ] Show match explanations ("96% match because...")
- [ ] Build a 2D match matrix (candidates × jobs, color cells by score)
- [ ] Add "Auto-match all" button
- [ ] **Acceptance:** Recruiter can see "for Job X, top 5 candidates are..." with reasoning

#### 1.7.7 Schedule Page [P0] · [M]
- [ ] Option A: Delete this page, redirect to Interviews
- [ ] Option B: Rebuild as unified calendar (interviews + PPE + deadlines + team events)
- [ ] **Acceptance:** No placeholder page remains

### 1.8 Delete unused components or wire them up [P0] · [M]
- [ ] Audit `src/components/ui/` and `src/components/dashboard/`
- [ ] For each unused component, either:
  - Wire it into a page, OR
  - Delete it (with git history)
- [ ] Specific decisions:
  - `<Tooltip>` — wire into IconButton, StatsCard, badges
  - `<Progress>` — wire into detail modals, AI Copilot loading
  - `<Avatar>` — wire into all candidate/team displays
  - `<Tabs>` — wire into Settings (replace raw buttons)
  - `<BarChart/LineChart/PieChart>` — wire into Analytics
  - `<Search>` — replace `<GlobalSearch>` in header (more features)
  - `<Pagination>` — replace DataTable's inline pagination
  - `<FileUpload>` — wire into AddCandidate (resume upload)
  - `<Calendar>` — wire into Interviews page
  - `<Kanban>` — wire into Pipeline page
  - `useWebSocket` — wire into dashboard for real-time activity
  - `useLocalStorage` — wire into onboarding progress, sidebar collapsed state
- [ ] **Acceptance:** All defined components are used; bundle size is smaller

### 1.9 Consolidate to one notification system [P0] · [M]
- [ ] Pick `<NotificationProvider>` (advanced) as canonical
- [ ] Make `useToast` a thin wrapper around it (for backward compat)
- [ ] Wrap `src/app/dashboard/layout.tsx` in `<NotificationProvider>`
- [ ] Remove `<ToastContainer />` from individual pages
- [ ] **Acceptance:** Toasts work globally; descriptions and actions supported

### 1.10 Build `<Switch>` / `<Toggle>` component [P0] · [S]
- [ ] Create `src/components/ui/switch.tsx` (accessible, with labels)
- [ ] Use it in Settings (line 13)
- [ ] **Acceptance:** Settings toggles are accessible, with proper labels

### 1.11 Add a "useToast" wrapper around NotificationProvider [P1] · [S]
- [ ] In `src/hooks/index.ts`, update `useToast` to use NotificationProvider context
- [ ] Support `description` and `action` parameters
- [ ] **Acceptance:** `push('success', 'Saved', { description: '...', action: { label: 'Undo', onClick: ... } })` works

### 1.12 Add confirmation dialogs for destructive actions [P1] · [M]
- [ ] In Candidates page, wrap `bulkDelete` in a confirmation modal
- [ ] In Settings, add a "Delete account" with confirmation (requires typing "DELETE")
- [ ] **Acceptance:** No accidental data loss

---

## PHASE 2: UX ENHANCEMENTS (Week 2-3) — P1

### 2.1 Group sidebar nav into sections [P1] · [M]
- [ ] In `src/app/dashboard/layout.tsx`, group nav items:
  - **Workspace:** Dashboard, Candidates, Jobs, Interviews, PPE
  - **Automate:** AI Copilot, Workflows, AI Matching, Pipeline
  - **Insights:** Analytics, Schedule
  - **Account:** Settings
- [ ] Add section headers
- [ ] Visually separate "Account" with a top border
- [ ] **Acceptance:** 12 nav items are organized into 4 logical groups

### 2.2 Make sidebar collapsible [P1] · [M]
- [ ] Add a collapse button in the sidebar header
- [ ] Persist collapsed state with `useLocalStorage('sidebar-collapsed', false)`
- [ ] In collapsed state, show icons only (56px wide), tooltip on hover
- [ ] Add `Cmd/Ctrl+B` keyboard shortcut to toggle
- [ ] **Acceptance:** Users can reclaim horizontal space; state persists across reloads

### 2.3 Add keyboard shortcuts [P1] · [M]
- [ ] Create `src/hooks/use-keyboard-shortcuts.ts`
- [ ] `Cmd/Ctrl+K` — focus search (already in GlobalSearch)
- [ ] `Cmd/Ctrl+B` — toggle sidebar
- [ ] `Cmd/Ctrl+N` — quick add (candidate, job, etc. — context-aware)
- [ ] `Cmd/Ctrl+/` — show shortcuts palette
- [ ] `g` then `d` — go to Dashboard
- [ ] `g` then `c` — go to Candidates
- [ ] `?` — show shortcuts
- [ ] Display a "?" button in the header that opens a shortcuts modal
- [ ] **Acceptance:** Power users can navigate without mouse

### 2.4 Add a "What's new" announcement bar [P1] · [M]
- [ ] Create `src/components/announcement-bar.tsx`
- [ ] Show at top of dashboard when there are unread announcements
- [ ] Dismissible, persisted in `useLocalStorage`
- [ ] Backend-driven (new endpoint or hardcoded for v1)
- [ ] **Acceptance:** Users see new feature announcements

### 2.5 Add `tone` prop to `<StatsCard>` [P1] · [S]
- [ ] In `src/components/dashboard/stats-card.tsx`, add `tone: 'blue' | 'green' | 'amber' | 'purple' | 'red'`
- [ ] Update icon container bg and color based on tone
- [ ] Use in dashboard: Pass Rate → green, Interviews → purple
- [ ] **Acceptance:** Stats cards visually differentiate

### 2.6 Add conversion rates to funnel chart [P1] · [S]
- [ ] In `src/app/dashboard/page.tsx:235-247`, add a label between stages: "248 → 184 (74%)"
- [ ] **Acceptance:** Users see drop-off rates at a glance

### 2.7 Add Y-axis to bar chart [P1] · [S]
- [ ] In `src/app/dashboard/page.tsx:207-219`, add Y-axis labels (0, 20, 40, 60)
- [ ] **Acceptance:** Bar chart is readable

### 2.8 Make bar chart tooltip work on touch [P1] · [M]
- [ ] Replace the CSS `::after` tooltip with a state-driven React tooltip
- [ ] Use the existing `<Tooltip>` component
- [ ] Handle click on touch devices
- [ ] **Acceptance:** Mobile users see values

### 2.9 Add candidate detail modal actions [P1] · [M]
- [ ] In `src/app/dashboard/candidates/page.tsx:367-369`, add actions:
  - "Send message" → email modal
  - "Schedule interview" → interview scheduler
  - "Enrich with AI" → triggers `enrichCandidate`
  - "Move to stage" → status dropdown
  - "Edit" → opens edit form
- [ ] **Acceptance:** All common actions accessible from candidate detail

### 2.10 Add edit candidate flow [P1] · [M]
- [ ] In Candidates page, add an "Edit" button in the detail modal
- [ ] Opens the AddCandidateForm pre-filled
- [ ] Saves via `api.updateCandidate`
- [ ] **Acceptance:** Recruiters can correct candidate info

### 2.11 Add resume upload to Add Candidate [P1] · [M]
- [ ] Use the existing `<FileUpload>` component
- [ ] On upload, call `api.enrichCandidate(id)` to auto-populate
- [ ] Show a progress indicator
- [ ] **Acceptance:** Recruiters can upload a resume instead of typing

### 2.12 Add URL state sync for filters [P1] · [M]
- [ ] In Candidates, Jobs, Interviews pages, sync `search`, `statusFilter`, etc. to URL params
- [ ] On page load, read from URL
- [ ] On filter change, update URL
- [ ] **Acceptance:** Filter state is shareable via URL

### 2.13 Add skill typeahead in candidate filters [P1] · [M]
- [ ] When skills > 8, show "Show all" button or typeahead
- [ ] Use the existing `<Search>` component
- [ ] **Acceptance:** Users can filter by any skill

### 2.14 Add bulk actions to Jobs and Interviews [P1] · [M]
- [ ] In Jobs page, add bulk: archive, delete, change status
- [ ] In Interviews page, add bulk: reschedule, cancel
- [ ] **Acceptance:** Recruiters can manage multiple items at once

### 2.15 Add job board connections [P1] · [L]
- [ ] Create a "Job Boards" page (or tab in Settings)
- [ ] LinkedIn, Indeed, Glassdoor integrations
- [ ] OAuth flows for each
- [ ] Show last sync, errors
- [ ] **Acceptance:** Recruiters can publish to job boards

### 2.16 Add team management [P1] · [L]
- [ ] Create a "Team" tab in Settings
- [ ] List of team members with role, status
- [ ] Invite by email (with role selector)
- [ ] Resend invite, revoke, change role
- [ ] **Acceptance:** Admins can manage their team

### 2.16 Add team calendar / "View team schedule" [P1] · [M]
- [ ] In Interviews or Schedule, add a "Team view" tab
- [ ] Show other team members' schedules
- [ ] Color-coded by person
- [ ] **Acceptance:** Recruiters can avoid double-booking

### 2.17 Add offer management [P1] · [L]
- [ ] Create a "Offers" page (or extend Candidates detail)
- [ ] Track offer status (draft, sent, accepted, declined)
- [ ] Generate offer letter (PDF)
- [ ] E-signature integration
- [ ] **Acceptance:** Full offer workflow

### 2.18 Add a candidate portal [P2] · [L]
- [ ] Public-facing page candidates can use to check application status
- [ ] Branded with company logo
- [ ] Magic link login
- [ ] **Acceptance:** Candidates can self-serve

---

## PHASE 3: POLISH (Week 3-4) — P1/P2

### 3.1 Dark mode [P2] · [M]
- [ ] Add a `<ThemeToggle>` in the user menu
- [ ] Add `dark:` variants throughout (focus on `bg-white` → `dark:bg-surface-800`, `text-gray-900` → `dark:text-white`)
- [ ] Persist preference in `useLocalStorage('theme', 'system')`
- [ ] **Acceptance:** Toggle works, persists, respects system preference

### 3.2 Add a "Loading" fullscreen state [P2] · [S]
- [ ] Use the existing `<Loading fullscreen>` component
- [ ] Show on initial app load (after auth check)
- [ ] **Acceptance:** Brief loading screen while auth is checked

### 3.3 Add offline indicator [P2] · [S]
- [ ] Listen to `online`/`offline` events
- [ ] Show a small banner at top when offline
- [ ] **Acceptance:** Users know when they're offline

### 3.4 Add page transitions [P2] · [M]
- [ ] Use Next.js view transitions or framer-motion
- [ ] Subtle fade/slide on route change
- [ ] Respect `prefers-reduced-motion`
- [ ] **Acceptance:** Routes feel smooth, not jumpy

### 3.5 Add microinteractions [P2] · [M]
- [ ] Hover lift on cards (subtle)
- [ ] Click ripple on buttons (optional, modern apps skip this)
- [ ] Skeleton-to-content transition (fade)
- [ ] Toast slide-in (already done)
- [ ] **Acceptance:** App feels alive without being noisy

### 3.6 Add rich text editor for job descriptions [P2] · [L]
- [ ] Use TipTap or Lexical
- [ ] Toolbar: bold, italic, link, list, heading
- [ ] Markdown shortcuts
- [ ] **Acceptance:** Job descriptions can be formatted

### 3.7 Add analytics events [P2] · [M]
- [ ] Pick analytics provider (PostHog, Mixpanel, Amplitude)
- [ ] Track key events: signup, login, candidate_created, job_created, interview_scheduled, etc.
- [ ] **Acceptance:** Founders can see what users do

### 3.8 Add error reporting [P2] · [M]
- [ ] Pick error reporter (Sentry)
- [ ] Wire up `ErrorBoundary` to report
- [ ] **Acceptance:** Production errors are caught

### 3.9 Add a Help/Docs page [P2] · [M]
- [ ] Create `/help` page
- [ ] Link from user menu ("Help & docs")
- [ ] Categorized: Getting started, Features, Troubleshooting
- [ ] **Acceptance:** Users can self-serve common questions

---

## PHASE 4: ADVANCED (Week 4+) — P2/P3

### 4.1 Customizable dashboard [P3] · [L]
- [ ] Drag-drop widget reordering
- [ ] Show/hide widgets
- [ ] Per-user preferences
- [ ] **Acceptance:** Each user can tailor their dashboard

### 4.2 Saved searches [P3] · [M]
- [ ] Save current filter state as a named search
- [ ] List of saved searches in sidebar or filter bar
- [ ] **Acceptance:** Power users can re-use complex filters

### 4.3 Saved views [P3] · [L]
- [ ] Save current page state (filters, sort, columns hidden) as a view
- [ ] Default views ("My candidates", "Needs review", etc.)
- [ ] **Acceptance:** Users can have personal default views

### 4.4 Custom workflows builder [P3] · [XL]
- [ ] Drag-drop visual builder
- [ ] Conditional logic (if-then-else)
- [ ] Loops (for-each)
- [ ] Integrations (Slack, email, webhook)
- [ ] **Acceptance:** Non-technical users can build complex workflows

### 4.5 AI-powered insights [P3] · [XL]
- [ ] Surface "anomalies" ("Hiring for Engineer role is 30% slower than last quarter")
- [ ] Surface "recommendations" ("You have 12 candidates stuck in screening for 7+ days — review?")
- [ ] **Acceptance:** Recruiters get proactive coaching

### 4.6 Mobile native apps [P3] · [XL]
- [ ] React Native port
- [ ] Push notifications
- [ ] Offline mode
- [ ] **Acceptance:** Recruiters can review candidates from their phone

---

## Dependencies & Blockers

| Task | Blocked by |
|---|---|
| 1.6 (migrate forms) | 0.1 (design tokens) — for consistent styling |
| 1.7.1 (PPE rewrite) | Need to verify `<PPEEditor>` has the features; if not, expand first |
| 1.7.4 (Workflows) | External library decision (React Flow vs. custom) |
| 1.7.5 (Pipeline drag-drop) | Install `@dnd-kit/core` |
| 1.8 (delete unused) | Should be done after 1.7 so we know what's still needed |
| 1.9 (notification consolidation) | 0.15 (move ToastContainer) |
| 2.2 (collapsible sidebar) | 0.1 (design tokens for proper width) |
| 3.1 (dark mode) | 0.1 (design tokens) — every component needs dark variant |

---

## Effort Summary

| Phase | Tasks | Total Effort | Calendar |
|---|---|---|---|
| Phase 0 (Quick wins) | 15 | ~2 days | Week 1 |
| Phase 1 (Essentials) | 12 | ~10 days | Week 1-2 |
| Phase 2 (UX) | 18 | ~15 days | Week 2-3 |
| Phase 3 (Polish) | 9 | ~8 days | Week 3-4 |
| Phase 4 (Advanced) | 6 | ~30+ days | Week 4+ |

**Total to launch a v1.5 with placeholder pages fixed:** ~4-5 weeks with 1-2 frontend engineers.

---

## Success Metrics

After Phase 1, track:

- [ ] **Bounce rate on PPE, Workflows, Matching pages** — should drop (users don't see "broken" pages)
- [ ] **Time to first value** — time from signup to first job created (target: < 5 min)
- [ ] **Form error rate** — % of form submissions with validation errors (target: < 10%)
- [ ] **WCAG AA compliance** — % of pages passing automated a11y audit (target: 100%)
- [ ] **Page load time** — Largest Contentful Paint on dashboard (target: < 2s on 3G)
- [ ] **Bundle size** — JS bundle (target: < 300KB gzipped)

After Phase 2, track:

- [ ] **Daily active users**
- [ ] **Feature adoption** — % of users using each major feature
- [ ] **NPS / CSAT**
- [ ] **Support tickets** (should decrease as UX improves)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Design token migration breaks existing styles | Medium | High | Migrate incrementally; visual regression tests |
| PPE page rewrite requires backend changes | High | High | Confirm API has run/submit endpoints; if not, add to backend sprint |
| Workflow builder is a multi-month project | High | Medium | Phase it; start with templates, then simple triggers/actions |
| Timeline slips due to scope creep | High | Medium | Strict Phase 0/1/2 priority order; defer Phase 3/4 to v2 |
| Users resist the new UI | Low | Medium | Beta with power users; A/B test if needed |

---

*End of roadmap.*
