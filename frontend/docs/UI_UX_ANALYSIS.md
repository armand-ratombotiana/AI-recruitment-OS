# AI-ROS Frontend — UI/UX Deep Analysis

> Comprehensive audit of every page and component in `frontend/`. Each section
> captures **current state**, **issues found**, **improvement recommendations**,
> and a **priority** rating.

---

## 1. Pages Audit

### 1.1 Landing Page — `src/app/page.tsx`

**Current state**
- 727-line marketing page. Sticky nav, hero with animated gradient mesh + floating cards,
  animated stat counters (intersection-observer driven), features grid, 3-step "How It
  Works", testimonials, 3-tier pricing, CTA, footer.
- Counts to 500 / 50 000 / 95 / 3 on scroll; uses Tailwind transitions, mesh blob keyframes.
- Pricing is highlighted via gradient border and "Most Popular" pill.
- Footer is a 5-column link grid with social SVGs.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Hero font sizes jump from 5xl to 7xl with no intermediate `6xl` on tablets | medium |
| 2 | No "Trusted by" logo bar above the fold | high |
| 3 | No FAQ section — high-intent visitors leave with unanswered questions | high |
| 4 | Testimonials have no photo/role/company logos — hard to verify | medium |
| 5 | Mobile menu has no enter animation (only a wrapper class with no keyframes) | low |
| 6 | No FAQ schema or OpenGraph metadata in `layout.tsx` | high |
| 7 | Pricing has no monthly/yearly toggle | medium |
| 8 | No "Compare plans" feature table | medium |
| 9 | CTA "Enter your email" form is decorative (no `onSubmit`, no validation) | medium |
| 10 | Footer copy is thin; missing language switcher, region, status link | low |

**Recommendations**
- Add a "Trusted by" logo strip directly under the hero (logos as inline SVG/text).
- Add a FAQ section with `<details>/<summary>` for accessibility and SEO.
- Add `metadata` for OpenGraph and Twitter cards in `layout.tsx`.
- Add a billing-period toggle (monthly/yearly) that updates prices live.
- Wire the CTA form to a `mailto:` or `/api/leads` endpoint.
- Add a feature comparison matrix under pricing.

**Priority**: **HIGH** — this is the first impression and primary conversion surface.

---

### 1.2 Login — `src/app/(auth)/login/page.tsx`

**Current state**
- Two-column layout (branding panel + form), email + password fields, show/hide password,
  remember me, 4 SSO buttons (Google, Microsoft, LinkedIn, Apple), "Forgot password?" link.
- Inline validation (regex email, 6-char minimum), `aria-invalid` + `aria-describedby`.
- Spinner + "Signing in..." loading state, generic error banner.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Submit button uses raw `<button>` with class soup instead of `<Button>` component | medium |
| 2 | "Forgot password?" link is a `preventDefault` stub | low |
| 3 | No rate-limit / lockout messaging | low |
| 4 | No "What is AI-ROS?" tooltip near SSO section | low |
| 5 | Form is auto-focused but doesn't select existing value on re-visit | low |
| 6 | SSO error uses red banner that visually matches the success state — confusing | medium |
| 7 | `noValidate` disables native browser validation — the inline errors are good but a
       hint text under each field would help first-time users | medium |

**Recommendations**
- Replace native `<button>` with `<Button variant="primary" loading={isLoading}>`.
- Add a one-line tooltip under the SSO cluster: "Single sign-on uses your existing
  identity provider — no separate password required."
- Add a "Sign in with email link" magic-link alternative.
- Surface field-level success after validation (green ring) in addition to error state.
- Add a "Use demo credentials" link for evaluators.

**Priority**: **HIGH** — blocks the entire product.

---

### 1.3 Register — `src/app/(auth)/register/page.tsx`

**Current state**
- Two-column layout, fields: full name, email, password, confirm password.
- Password strength meter (weak / medium / strong) with color-coded bar.
- Mismatched password error, terms checkbox, 4 SSO buttons.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | No **requirements checklist** (8+ chars, upper, lower, number, symbol) | high |
| 2 | No email-confirmation step (industry-standard for B2B) | high |
| 3 | Strength meter doesn't explain *why* the score is low | high |
| 4 | No real-time feedback as user types — strength only updates on change | medium |
| 5 | Submit button is a raw `<button>` | medium |
| 6 | Terms checkbox errors use the generic `error` banner, not a field-level message | medium |
| 7 | No password manager support — `autoComplete="new-password"` is good but the
       name field lacks a `name` attribute on the visible label | low |
| 8 | No "Why we need this" microcopy for the full-name field | low |

**Recommendations**
- Build a real-time requirement checklist (✓ 8 characters, ✓ 1 uppercase, ✓ 1 number,
  ✓ 1 special) that turns green as each rule passes.
- Add a 2-step flow: (1) form, (2) "Check your inbox" confirmation screen.
- Use the `<Button>` component for the CTA and `<Badge>` for the strength label.
- Add inline field validation on blur with green check icons on success.
- Show password strength *score* (e.g. 4/5) instead of just weak/medium/strong.

**Priority**: **HIGH** — first-run UX is critical for activation.

---

### 1.4 Auth Callback — `src/app/(auth)/callback/page.tsx`

**Current state**
- Suspense-wrapped callback handler that reads `code` and `state` from `useSearchParams`,
  resolves the provider from `window.location.pathname`, and calls `ssoLogin`.
- Loading and error states are minimal but correct.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | No redirect countdown on error — user must click "Return to login" | low |
| 2 | Loading spinner is plain (no brand mark) | low |
| 3 | "Provider" is parsed from URL but the route uses `/callback/[provider]` — the file
       is in `/callback/` only, not `/callback/[provider]/`. SSO callback likely 404s. | **critical** |

**Recommendations**
- Create `src/app/(auth)/callback/[provider]/page.tsx` to match the redirect URI used by
  `handleSSO` in login/register.
- Add the AI-ROS logo above the spinner for brand presence.
- Add a 5-second auto-redirect with countdown on success.
- Log provider-specific error reasons (e.g. `access_denied`, `invalid_state`).

**Priority**: **HIGH** — currently broken in the SSO flow.

---

### 1.5 Dashboard Layout — `src/app/dashboard/layout.tsx`

**Current state**
- Fixed left sidebar (64px wide, 9 nav items, gradient logo).
- Sticky top bar: hamburger (mobile), search input, notification bell, user avatar.
- Mobile drawer toggles via `sidebarOpen` state with a black backdrop.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Search input is non-functional (no `onChange`, no submit) | high |
| 2 | User avatar is non-interactive (no dropdown menu, no logout) | high |
| 3 | Notification bell has no badge, no panel | medium |
| 4 | No breadcrumbs — users get lost in nested pages | medium |
| 5 | No "Quick Actions" FAB | low |
| 6 | Sidebar doesn't collapse to icon-only mode on medium screens | medium |
| 7 | Sidebar items lack descriptions/tooltips on collapsed view | low |
| 8 | No keyboard shortcut hints (e.g. ⌘K for search) | low |
| 9 | Header height feels cramped on mobile (h-16) | low |

**Recommendations**
- Wire the search to a `/api/v1/search?q=...` call with a debounced dropdown of
  candidates, jobs, interviews.
- Add a `<UserMenu>` dropdown with profile, settings, theme toggle, logout.
- Add a notifications panel that slides in from the right.
- Render a breadcrumb trail at the top of the main area.
- Add a floating action button (FAB) for "Add candidate" / "Create job" with quick
  actions.
- Add Lucide icons throughout the sidebar instead of raw SVG paths.

**Priority**: **HIGH** — every dashboard page lives inside this layout.

---

### 1.6 Dashboard Home — `src/app/dashboard/page.tsx`

**Current state**
- 50-line page with 4 hard-coded stat cards, one pipeline progress section.
- Uses `api.getDashboard('7d')`, falls back to `0` on error.
- Loading state is 4 grey rectangles.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Stats use the inline `<div>` not the existing `<StatsCard>` component | medium |
| 2 | Numbers are static — no animated count-up | medium |
| 3 | No activity feed (recent candidates, interviews, evaluations) | high |
| 4 | No "Today" / "Upcoming" section | high |
| 5 | No quick-action cards (Add candidate, Schedule interview, Create job) | high |
| 6 | No charts (CSS-based bars) for trend visualization | medium |
| 7 | Pipeline progress uses hard-coded values (100/75/45/20) | medium |
| 8 | No empty state when no data | medium |
| 9 | No date range selector | low |
| 10 | Page has no H1 hierarchy or sub-heading | low |

**Recommendations**
- Replace inline stats with the existing `<StatsCard>` and add a `useCountUp` hook.
- Fetch `api.getActivity()` and render a real-time activity feed with avatars.
- Add a "Today" column with upcoming interviews and PPE deadlines.
- Add 4 quick-action tiles (Add candidate, Create job, Schedule interview, Ask Copilot).
- Add 2 CSS-only bar charts (candidates/week, interviews/week) with hover tooltips.
- Add a "Recent candidates" carousel.

**Priority**: **HIGH** — first screen after login.

---

### 1.7 Candidates — `src/app/dashboard/candidates/page.tsx`

**Current state**
- 34-line page: title, "Add Candidate" button (no handler), search input, plain `<table>`.
- Calls `api.listCandidates()` with a single search filter (name or email).
- No pagination, no sorting, no filters, no bulk actions, no detail view.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Uses raw `<table>` instead of the existing `<DataTable>` | high |
| 2 | No status / skills / experience / location filters | high |
| 3 | No bulk actions (select all, export, delete) | high |
| 4 | No view toggle (table ↔ grid) | medium |
| 5 | "Add Candidate" button has no `onClick` — dead control | high |
| 6 | No pagination — breaks on >50 candidates | high |
| 7 | No column sorting | medium |
| 8 | No candidate detail modal/page | high |
| 9 | Status badge is hard-coded to "active" | low |
| 10 | Skills are joined with comma — no chips | medium |

**Recommendations**
- Replace `<table>` with `<DataTable columns={...} data={filtered} searchable={false} />`.
- Add a filter strip: status (multi-select), skills (tag input), experience range, location.
- Add a "Grid view" toggle that renders `<CandidateCard>` components.
- Add an "Add Candidate" modal with full form (name, email, phone, resume URL, skills).
- Add bulk-select checkboxes and a "Bulk actions" toolbar.
- Add an "Export CSV" button using `Blob` + `URL.createObjectURL`.
- Add a candidate detail modal with tabs (Profile, Evaluations, Interviews, Notes).

**Priority**: **MEDIUM** — works but limited at scale.

---

### 1.8 Jobs — `src/app/dashboard/jobs/page.tsx`

**Current state**
- 30-line page: title, "Create Job" button (no handler), 4-column table.
- Calls `api.listJobs()`, no search, no filters.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | No search/filter | high |
| 2 | "Create Job" button has no `onClick` | high |
| 3 | No applications count column | medium |
| 4 | No job detail view | high |
| 5 | No status filter (open/closed/draft) | medium |
| 6 | Salary column is "—" when only one of min/max is set | low |
| 7 | No sort on columns | medium |

**Recommendations**
- Add a filter bar: status, department, location, type.
- Add a "Create Job" multi-step modal: (1) basics, (2) requirements, (3) pipeline.
- Add a "Job detail" panel with applications and pipeline breakdown.
- Show "X candidates" badge next to each job.
- Add sort on all columns.

**Priority**: **MEDIUM**.

---

### 1.9 Interviews — `src/app/dashboard/interviews/page.tsx`

**Current state**
- 30-line page: title, "Schedule Interview" button (no handler), 4-column table.
- Calls `api.listInterviews()`, no search, no filters, no calendar.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | No calendar view — flat list is hard to scan | high |
| 2 | "Schedule Interview" button has no `onClick` | high |
| 3 | No status filter | medium |
| 4 | No "upcoming" highlight | medium |
| 5 | No interview detail page (transcript, score, recording) | high |
| 6 | Date column shows "—" for missing dates | low |

**Recommendations**
- Add a calendar/timeline view with month/week/day tabs.
- Add a "Schedule Interview" modal (candidate, job, date, type, panel).
- Add an "Upcoming this week" sticky section.
- Add a detail view with tabs: Overview, Transcript, AI Evaluation, Notes.

**Priority**: **MEDIUM**.

---

### 1.10 PPE — `src/app/dashboard/ppe/page.tsx`

**Current state**
- 36-line page: title, problem `<select>`, two-column split (problem description + code editor).
- No run, no submit, no hint button, no test results, no language selector.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | "Run" and "Submit" actions are missing | **critical** |
| 2 | No language selector (Python/JS/Go/Java) | high |
| 3 | No test cases panel | high |
| 4 | No AI hint button (API exists: `requestHint`) | high |
| 5 | No live preview of code execution | medium |
| 6 | No timer / attempt counter | medium |
| 7 | No session creation flow | high |
| 8 | Editor is a plain `<textarea>` — no syntax highlighting, no line numbers | medium |

**Recommendations**
- Add a real code editor (use a simple `<textarea>` with monospace + line numbers; keep
  no external deps).
- Add language selector, test cases panel, "Run", "Submit", "Hint" actions.
- Wire actions to `api.submitPPCode` and `api.requestHint`.
- Add a timer that starts on first run.

**Priority**: **LOW** — works as a placeholder.

---

### 1.11 Analytics — `src/app/dashboard/analytics/page.tsx`

**Current state**
- 32-line page with 3 stat tiles, no real charts.
- Fetches `dashboard + pipeline + ai` in parallel, has 7d/30d/90d toggle.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | No charts — just 3 stat tiles | high |
| 2 | No data visualization for pipeline funnel | high |
| 3 | No AI performance breakdown (agent response time, success rate) | high |
| 4 | No export to CSV/PDF | medium |
| 5 | No comparison period (vs last month) | medium |

**Recommendations**
- Add CSS bar/line charts for time-series metrics.
- Add a funnel chart for pipeline stages.
- Add a heatmap or radar for AI agent performance.
- Add CSV export.

**Priority**: **LOW** — needs real backend data first.

---

### 1.12 AI Copilot — `src/app/dashboard/ai-copilot/page.tsx`

**Current state**
- 35-line chat page: title, message list, input bar.
- Calls `api.orchestrate({agent_type: 'recruiting_copilot', input: msg})`.
- Typing indicator (3 bouncing dots), auto-scroll.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | No agent selector (only "recruiting_copilot") | high |
| 2 | No conversation history sidebar | high |
| 3 | No message feedback (thumbs up/down) | medium |
| 4 | No streaming response — full reply at once | medium |
| 5 | No code block formatting in assistant messages | medium |
| 6 | No suggested prompts / quick actions | medium |
| 7 | Plain `<input>` — no `Shift+Enter` for new line | low |

**Recommendations**
- Add an agent selector dropdown with 5+ agents (screener, matcher, interviewer, etc.).
- Add a conversation list with rename/delete.
- Add thumbs up/down with optional comment.
- Render markdown/code blocks in assistant messages.
- Add 4 suggested prompt chips on first load.

**Priority**: **LOW** — works as a basic chat.

---

### 1.13 Workflows — `src/app/dashboard/workflows/page.tsx`

**Current state**
- 27-line page: title, "Create Workflow" button (no handler), 3-column card grid.
- Calls `api.listWorkflows()`, no detail view.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | "Create Workflow" button has no `onClick` | high |
| 2 | No workflow editor (visual builder) | high |
| 3 | No "Run" / "Pause" / "Duplicate" actions | medium |
| 4 | No execution history | medium |

**Recommendations**
- Add a visual workflow builder (nodes + edges using HTML5 canvas or SVG).
- Add actions: Run, Pause, Edit, Duplicate, Delete.
- Add an "Executions" tab with a log of last 20 runs.

**Priority**: **LOW**.

---

### 1.14 Settings — `src/app/dashboard/settings/page.tsx`

**Current state**
- 18-line page: title, 4-tab strip (profile, notifications, security, api).
- Each tab is an inline form with raw inputs and toggle switches.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Tabs use raw buttons instead of the existing `<Tabs>` component | high |
| 2 | No save / cancel logic — inputs are uncontrolled | high |
| 3 | No "team" or "billing" tab | medium |
| 4 | No real form validation | medium |
| 5 | API key is hard-coded `sk-xxx` — feels fake | medium |
| 6 | No avatar upload on profile | medium |
| 7 | No dark mode toggle | low |

**Recommendations**
- Use the `<Tabs>` component for the tab strip.
- Add a "Team" tab with member list and role management.
- Add a "Billing" tab with subscription info.
- Add real save/cancel flows and validation.
- Replace hard-coded key with a "Generate new key" CTA that copies to clipboard.
- Add an avatar uploader (file → base64 preview).

**Priority**: **LOW**.

---

### 1.15 Pipeline — `src/app/dashboard/pipeline/page.tsx`

**Current state**
- 33-line page: title, 4-column Kanban (Applied / Screening / Interview / Offer).
- Hard-coded candidate names — no API integration.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Hard-coded data — no real API call | high |
| 2 | No drag-and-drop | high |
| 3 | No stage counts / WIP limits | medium |
| 4 | No "Add candidate to pipeline" action | medium |
| 5 | No filter by job | medium |

**Recommendations**
- Wire to `api.listPipeline()` (or fallback to candidates grouped by status).
- Add HTML5 drag-and-drop between columns with optimistic update.
- Show stage counts and WIP limits (e.g. "Interview: 5 / 10").
- Add a per-card menu: move, reject, schedule, view.

**Priority**: **LOW**.

---

### 1.16 Matching — `src/app/dashboard/matching/page.tsx`

**Current state**
- 50-line page: title, two columns (Top Candidates, Open Positions).
- Calls `api.listCandidates()` and `api.listJobs()`, slices top 5.
- Match score is `Math.floor(Math.random() * 20) + 80` — random.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Match score is **random** — not real | **critical** |
| 2 | No way to trigger a fresh match | high |
| 3 | No job selection to scope matches | high |
| 4 | No filters (skills, experience) | medium |
| 5 | No explainability for scores | medium |

**Recommendations**
- Call `api.matchCandidate(candidateId)` or a new `/matching/run` endpoint.
- Add a job selector at the top — matching is candidate ↔ job.
- Replace random scores with real ones from the backend.
- Add an "Explain" button that shows the top matching skills.

**Priority**: **MEDIUM** — random scores are misleading.

---

### 1.17 Schedule — `src/app/dashboard/schedule/page.tsx`

**Current state**
- 34-line page: title, period toggle (Today / This Week / This Month), 4 hard-coded events.

**Issues found**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Hard-coded events — no API call | high |
| 2 | Period toggle is non-functional | high |
| 3 | No week/month calendar view | high |
| 4 | No "New event" action | medium |
| 5 | No color legend for event types | low |

**Recommendations**
- Fetch real events from the API.
- Add a proper calendar grid (CSS grid, 7 columns).
- Add "New event" button that opens a quick-create modal.
- Add a color legend.

**Priority**: **LOW**.

---

## 2. Components Audit

### 2.1 Card (`components/ui/card.tsx`)
- Solid foundation: `Card`, `CardHeader`, `CardTitle`, `CardDescription`,
  `CardContent`, `CardFooter`.
- **Missing**: hover state variants, "interactive" variant (cursor + onClick),
  no padding control, no `as` prop on outer container.

### 2.2 Button (`components/ui/button.tsx`)
- Comprehensive: 6 variants, 4 sizes, `loading`, `leftIcon`, `rightIcon`, `fullWidth`.
- A11y: focus-visible ring, `aria-busy`, `aria-disabled`.
- **Missing**: tooltip prop, link variant, icon-only label, `as="a"`.

### 2.3 Badge (`components/ui/badge.tsx`)
- 11 variants + `dot` flag + `sm/md` size.
- **Missing**: `pill` shape option, `removable` (with X) for tag inputs, count variant.

### 2.4 Loading + Skeleton (`components/ui/loading.tsx`)
- 4 sizes, fullscreen mode, `Skeleton`, `SkeletonCard`.
- **Missing**: skeleton table row, skeleton chart, dot-pulse, progress spinner.

### 2.5 DataTable (`components/ui/data-table.tsx`)
- **Best component in the kit** — search, sort, paginate, column visibility, a11y.
- **Missing**: row selection (checkbox), bulk action bar, density toggle, export.

### 2.6 Progress (`components/ui/progress.tsx`)
- 4 variants, 3 sizes, optional label.
- **Missing**: indeterminate state, animated stripes, circular variant.

### 2.7 Avatar (`components/ui/avatar.tsx`)
- Initials fallback, 3 sizes.
- **Missing**: status dot (online/away/offline), group stack, src loading state.

### 2.8 Tabs (`components/ui/tabs.tsx`)
- 3 variants, keyboard navigation (arrows, Home, End), 2 orientations.
- **Missing**: lazy mount (always renders hidden panels — wastes DOM for heavy tabs).

### 2.9 Modal (`components/ui/modal.tsx`)
- 5 sizes, focus trap, Esc/backdrop close, body scroll lock, a11y.
- **Missing**: slide-from-side variant for drawers, animation variants.

### 2.10 EmptyState (`components/ui/empty-state.tsx`)
- 4 props, no illustration slot.
- **Missing**: built-in illustrations, action button shortcut, "request" CTA.

### 2.11 StatsCard (`components/dashboard/stats-card.tsx`)
- 28-line component already in kit — but not used anywhere on the dashboard home.
- **Missing**: trend sparkline, loading state.

---

## 3. Cross-cutting Themes

| Theme | Affected pages | Recommendation |
|-------|----------------|----------------|
| **Hard-coded mock data** | Pipeline, Schedule, Matching (random score) | Wire to real API or remove placeholders |
| **Dead CTAs** | Candidates, Jobs, Interviews, Workflows | Add handlers / "coming soon" toast |
| **Inconsistent button usage** | All pages mix raw `<button>` and `<Button>` | Migrate to `<Button>` |
| **No loading skeletons** | All pages use grey rectangles | Use `<Skeleton>` and `<SkeletonCard>` |
| **No empty states** | All tables | Use `<EmptyState>` |
| **No error states** | All pages | Add `try/catch` with friendly messages |
| **No SEO metadata** | Landing, all auth pages | Add per-page `metadata` export |
| **No keyboard shortcuts** | Dashboard | Add ⌘K palette |
| **No theme toggle** | All pages | Add light/dark mode |

---

## 4. Priority Matrix

| Priority | Pages |
|----------|-------|
| **HIGH** | Landing, Login, Register, Auth callback (broken), Dashboard layout, Dashboard home, Auth callback |
| **MEDIUM** | Candidates, Jobs, Interviews, Matching |
| **LOW** | PPE, Analytics, AI Copilot, Workflows, Settings, Pipeline, Schedule |

See `UI_UX_PLAN.md` for the phased implementation roadmap.
