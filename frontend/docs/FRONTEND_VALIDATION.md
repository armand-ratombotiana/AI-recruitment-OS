# Frontend Validation Report

**Date:** 2026-05-31
**Scope:** Deep review of all frontend pages for AI-Native Recruitment OS

---

## Executive Summary

**Overall Status: WARNING — Dual Route System with Inconsistent API Integration**

The frontend has **two separate dashboard route systems** serving different URLs. The `(dashboard)` route group (serving `/`, `/candidates`, `/jobs`, etc.) has proper API integration. The `dashboard` route group (serving `/dashboard/*`) uses **hardcoded mock data** with zero backend connectivity. This is the single most critical issue in the codebase.

---

## Architecture: Two Route Groups

| Route Group | URL Pattern | Layout File | Data Source | Status |
|-------------|-------------|-------------|-------------|--------|
| `(dashboard)` | `/`, `/candidates`, `/jobs`, `/interviews`, etc. | `app/(dashboard)/layout.tsx` | **Real API** | Functional |
| `dashboard` | `/dashboard/recruiter`, `/dashboard/candidates`, etc. | `app/dashboard/layout.tsx` | **Mock data** | Not connected |

Both route groups have their own `layout.tsx` with full sidebar navigation. The `(dashboard)` group links to root-level paths; the `dashboard` group links to `/dashboard/*` paths.

---

## Task 1: API Client Verification (`src/services/api/client.ts`)

### Backend Routes (from `backend/main.py`)

| Backend Route | Frontend API Method | Covered? |
|---------------|-------------------|----------|
| `/api/v1/auth` | `login()`, `register()`, `logout()` | Yes |
| `/api/v1/sso` | `getSSOProviders()`, `getSSOAuthorizeUrl()`, `ssoLogin()` | Yes |
| `/api/v1/candidates` | `listCandidates()`, `getCandidate()`, `createCandidate()`, `updateCandidate()`, `enrichCandidate()`, `matchCandidate()` | Yes |
| `/api/v1/jobs` | `listJobs()`, `getJob()`, `createJob()` | Yes |
| `/api/v1/interviews` | `listInterviews()`, `createInterview()`, `startInterview()`, `completeInterview()` | Yes |
| `/api/v1/ppe` | `createPPESession()`, `getPPESession()`, `submitPPCode()`, `requestHint()`, `listPPEProblems()` | Yes |
| `/api/v1/ai` | `listAIAgents()`, `orchestrate()` | Yes |
| `/api/v1/analytics` | `getDashboard()`, `getPipelineAnalytics()`, `getAIPerformance()` | Yes |
| `/api/v1/workflows` | `listWorkflows()`, `createWorkflow()` | Yes |
| `/api/v1/notifications` | `listNotifications()` | Yes |
| `/api/v1/compliance` | `getComplianceStatus()` | Yes |
| `/api/v1/billing` | `getSubscription()` | Yes |
| `/api/v1/search` | `searchCandidates()` | Yes |
| `/api/v1/innovations` | `detectBias()`, `predictSuccess()` | Yes |

### Missing API Methods (backend routes not in client)

| Backend Route | Frontend API Method | Notes |
|---------------|-------------------|-------|
| `/api/v1/tenants` | None | Tenant management not exposed |
| `/api/v1/users` | None | User management not exposed |
| `/api/v1/resumes` | None | Resume upload/parsing not exposed |
| `/api/v1/scheduling` | None | Dedicated scheduling API not used |
| `/api/v1/resume-analysis` | None | Resume analysis not exposed |
| `/api/v1/fraud` | None | Fraud detection not exposed |
| `/api/v1/compliance-automation` | None | Compliance automation not exposed |
| `/api/v1/ai-evaluation` | None | AI evaluation not exposed |
| `/api/v1/talent-intelligence` | None | Talent intelligence not exposed |
| `/api/v1/workflow-automation` | None | Workflow automation not exposed |
| `/api/v1/ws` | None | WebSocket client not implemented |

**API Client Score: 14/25 backend routes covered (56%)**

---

## Task 2: Page-by-Page Verification

### `(dashboard)` Route Group — Real API Pages

| Page | File | API Import | Data Fetching | Loading State | Error Handling | Status |
|------|------|-----------|--------------|--------------|----------------|--------|
| Dashboard | `(dashboard)/page.tsx` | Yes (`api`) | `api.getDashboard()` + `api.listCandidates()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Candidates | `(dashboard)/candidates/page.tsx` | Yes (`api`) | `api.listCandidates()` | Yes (`loading`) | Yes (`error` state) | **PASS** |
| Jobs | `(dashboard)/jobs/page.tsx` | Yes (`api`) | `api.listJobs()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Job Detail | `(dashboard)/jobs/[id]/page.tsx` | Yes (`api`) | `api.getJob(id)` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Interviews | `(dashboard)/interviews/page.tsx` | Yes (`api`) | `api.listInterviews()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Interview Detail | `(dashboard)/interviews/[id]/page.tsx` | Yes (`api`) | `api.listInterviews()` + filter | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Pipeline | `(dashboard)/pipeline/page.tsx` | Yes (`api`) | `api.listCandidates()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Matching | `(dashboard)/matching/page.tsx` | Yes (`api`) | `api.listJobs()` + `api.listCandidates()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Schedule | `(dashboard)/schedule/page.tsx` | Yes (`api`) | `api.listInterviews()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| PPE | `(dashboard)/ppe/page.tsx` | **No** | None (mock data) | N/A | None | **FAIL** |
| AI Copilot | `(dashboard)/ai-copilot/page.tsx` | Yes (`api`) | None (simulated responses) | Yes (`isTyping`) | None | **PARTIAL** |
| Analytics | `(dashboard)/analytics/page.tsx` | Yes (`api`) | `api.getDashboard()` + `api.getPipelineAnalytics()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Workflows | `(dashboard)/workflows/page.tsx` | Yes (`api`) | `api.listWorkflows()` | Yes (`loading`) | Partial (console.error only) | **PASS** |
| Settings | `(dashboard)/settings/page.tsx` | Yes (`api`) | `api.getComplianceStatus()` + `api.getSubscription()` | No explicit loading | Partial (console.error only) | **PARTIAL** |
| Recruiter | `(dashboard)/recruiter/page.tsx` | Yes (`api`) | `api.getDashboard()` + `api.listCandidates()` | Yes (`loading`) | Partial (console.error only) | **PASS** |

### `dashboard` Route Group — Mock Data Pages

| Page | File | API Import | Data Fetching | Loading State | Error Handling | Status |
|------|------|-----------|--------------|--------------|----------------|--------|
| Dashboard Redirect | `dashboard/page.tsx` | No | N/A (redirect) | N/A | N/A | N/A |
| Recruiter | `dashboard/recruiter/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Candidates | `dashboard/candidates/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Candidate Detail | `dashboard/candidates/[id]/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Jobs | `dashboard/jobs/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Job Detail | `dashboard/jobs/[id]/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Interviews | `dashboard/interviews/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Pipeline | `dashboard/pipeline/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Matching | `dashboard/matching/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Schedule | `dashboard/schedule/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| PPE | `dashboard/ppe/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| AI Copilot | `dashboard/ai-copilot/page.tsx` | **No** | None (mock) | Yes (`isTyping`) | None | **MOCK** |
| Analytics | `dashboard/analytics/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Workflows | `dashboard/workflows/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Settings | `dashboard/settings/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| Reports | `dashboard/reports/page.tsx` | **No** | None (mock) | None | None | **MOCK** |

### Interview Route Group

| Page | File | API Import | Data Fetching | Loading State | Error Handling | Status |
|------|------|-----------|--------------|--------------|----------------|--------|
| PPE Interview | `(interview)/ppe/page.tsx` | **No** | None (mock) | None | None | **MOCK** |
| AI Interview | `(interview)/ai-interview/page.tsx` | **No** | None (simulated) | Yes (`isTyping`) | None | **MOCK** |

### Auth Route Group

| Page | File | API Import | Data Fetching | Loading State | Error Handling | Status |
|------|------|-----------|--------------|--------------|----------------|--------|
| Login | `(auth)/login/page.tsx` | Yes (via store) | `useAuthStore.login()` | Yes (`isLoading`) | Yes (`error` state) | **PASS** |

---

## Task 3: Store Verification (`src/stores/index.ts`)

| Store | Backend Coverage | Status |
|-------|-----------------|--------|
| `useAuthStore` | Auth + SSO | **Complete** |
| `useCandidateStore` | Candidates CRUD + enrich + match + search | **Complete** |
| `useJobStore` | Jobs CRUD | **Complete** (missing update/delete) |
| `useInterviewStore` | Interviews CRUD + start/complete | **Complete** |
| `useAnalyticsStore` | Dashboard + Pipeline + AI Performance | **Complete** |
| `usePPEStore` | Problems + Sessions + Code execution + Hints | **Complete** |
| `useWorkflowStore` | Workflows list + create | **Complete** (missing update/delete) |
| `useNotificationStore` | Notifications list | **Complete** |
| `useAIStore` | Agents + Orchestrate + Bias detection + Predict success | **Complete** |
| `useBillingStore` | Subscription | **Complete** |

### Missing Stores

| Feature | Store | Notes |
|---------|-------|-------|
| Resume management | None | No store for resume upload/parsing |
| Scheduling | None | No dedicated scheduling store |
| Compliance | None | Compliance data fetched directly in settings |
| Search | None | Search is a one-off API call, no store |
| WebSocket | None | No real-time connection management |

---

## Task 4: Navigation Verification

### `(dashboard)/layout.tsx` Navigation (13 items)

| Nav Item | Href | Page Exists? | API Connected? |
|----------|------|-------------|----------------|
| Dashboard | `/` | Yes | Yes |
| Recruiter | `/recruiter` | Yes | Yes |
| Candidates | `/candidates` | Yes | Yes |
| Jobs | `/jobs` | Yes | Yes |
| Interviews | `/interviews` | Yes | Yes |
| Pipeline | `/pipeline` | Yes | Yes |
| Matching | `/matching` | Yes | Yes |
| Schedule | `/schedule` | Yes | Yes |
| PPE Coding | `/ppe` | Yes | **No** (mock) |
| AI Copilot | `/ai-copilot` | Yes | Partial |
| Analytics | `/analytics` | Yes | Yes |
| Workflows | `/workflows` | Yes | Yes |
| Settings | `/settings` | Yes | Partial |

### `dashboard/layout.tsx` Navigation (14 items)

| Nav Item | Href | Page Exists? | API Connected? |
|----------|------|-------------|----------------|
| Dashboard | `/dashboard` | Yes (redirect) | N/A |
| Recruiter | `/dashboard/recruiter` | Yes | **No** (mock) |
| Candidates | `/dashboard/candidates` | Yes | **No** (mock) |
| Candidate Detail | `/dashboard/candidates/[id]` | Yes | **No** (mock) |
| Jobs | `/dashboard/jobs` | Yes | **No** (mock) |
| Job Detail | `/dashboard/jobs/[id]` | Yes | **No** (mock) |
| Interviews | `/dashboard/interviews` | Yes | **No** (mock) |
| Pipeline | `/dashboard/pipeline` | Yes | **No** (mock) |
| Matching | `/dashboard/matching` | Yes | **No** (mock) |
| Schedule | `/dashboard/schedule` | Yes | **No** (mock) |
| PPE Coding | `/dashboard/ppe` | Yes | **No** (mock) |
| AI Copilot | `/dashboard/ai-copilot` | Yes | **No** (mock) |
| Analytics | `/dashboard/analytics` | Yes | **No** (mock) |
| Workflows | `/dashboard/workflows` | Yes | **No** (mock) |
| Reports | `/dashboard/reports` | Yes | **No** (mock) |
| Settings | `/dashboard/settings` | Yes | **No** (mock) |

---

## Task 5: Issues Summary

### CRITICAL Issues

1. **Dual Route System (CRITICAL)** — Two independent dashboard route groups exist: `(dashboard)` with API-connected pages and `dashboard` with mock-only pages. Users navigating to `/dashboard/*` URLs see mock data, not real data. This is the most significant architectural issue.

2. **PPE Page Not Connected (CRITICAL)** — `(dashboard)/ppe/page.tsx` does NOT import the API client. It uses hardcoded problems and `setTimeout` for simulated execution. The `api.submitPPCode()`, `api.requestHint()`, and `api.listPPEProblems()` methods exist in the client but are unused.

3. **AI Copilot Not Connected (CRITICAL)** — `(dashboard)/ai-copilot/page.tsx` imports the API client but does NOT use it. All responses are simulated with `setTimeout`. The `api.orchestrate()` method exists but is unused.

### HIGH Issues

4. **No Error UI on Most Pages** — 10 of 15 API-connected pages only `console.error` on failure. No user-facing error messages, retry buttons, or error states are shown. Only `candidates/page.tsx` and `login/page.tsx` display errors to users.

5. **No Loading State in Settings** — `(dashboard)/settings/page.tsx` fetches data but has no loading indicator while data is being fetched.

6. **Interview Detail Fetches All Interviews** — `(dashboard)/interviews/[id]/page.tsx` calls `api.listInterviews()` and filters client-side instead of fetching a single interview by ID. No `getInterview(id)` method exists in the API client.

7. **No Store for Resumes** — Backend has `/api/v1/resumes` and `/api/v1/resume-analysis` endpoints but no frontend store or API methods for them.

8. **No WebSocket Client** — Backend has `/api/v1/ws` but no frontend WebSocket connection management exists.

### MEDIUM Issues

9. **Missing API Methods** — 11 backend routes have no corresponding frontend API methods (tenants, users, resumes, scheduling, resume-analysis, fraud, compliance-automation, ai-evaluation, talent-intelligence, workflow-automation, websocket).

10. **No Delete Operations** — Jobs and Workflows stores only support list and create, not update or delete.

11. **Pipeline Drag-Drop Not Persisted** — Pipeline page allows drag-and-drop between stages but only updates local state. No API call to persist the change.

12. **Search Bar Non-Functional** — The global search input in the layout header has no onChange handler or search functionality.

13. **Duplicate Page Implementments** — Most pages exist twice (once in each route group), leading to code duplication and maintenance burden.

14. **Hardcoded Context in AI Copilot** — The "Context" sidebar shows hardcoded values ("24 candidates", "8 interviews") instead of fetching from the API.

---

## Statistics

| Metric | Count |
|--------|-------|
| Total unique page components | 30 |
| API-connected pages | 15 |
| Mock-only pages | 14 |
| Auth pages | 1 |
| API client methods | 28 |
| Backend routes covered | 14/25 (56%) |
| Zustand stores | 10 |
| Missing stores | 5 |
| Navigation items (total) | 27 (13 + 14) |

---

## Recommendations

### Immediate Fixes (Priority 1)

1. **Remove the `dashboard/` route group entirely** — It serves only mock data and duplicates the `(dashboard)` group. Consolidate all pages under `(dashboard)`.

2. **Connect PPE page to API** — Replace mock data with `api.listPPEProblems()`, `api.submitPPCode()`, and `api.requestHint()`.

3. **Connect AI Copilot to API** — Replace simulated responses with `api.orchestrate()`.

4. **Add error UI to all pages** — Display error messages with retry buttons instead of silent `console.error`.

### Short-Term (Priority 2)

5. **Add missing API methods** — Implement `getInterview(id)`, resume management, and scheduling methods.

6. **Add loading states** — Add loading indicators to Settings page and any page missing them.

7. **Implement search** — Wire up the global search bar to `api.searchCandidates()`.

8. **Persist pipeline changes** — Add API call when candidates are dragged between stages.

### Medium-Term (Priority 3)

9. **Add WebSocket support** — Implement real-time updates for live coding sessions and notifications.

10. **Add missing stores** — Create stores for resumes, scheduling, and compliance.

11. **Implement CRUD completeness** — Add update/delete operations for jobs and workflows.

---

## Overall Verdict

| Category | Rating |
|----------|--------|
| API Client Coverage | 56% — Partial |
| Page API Integration | 50% (15/30 pages connected) |
| Store Coverage | 70% — Good but incomplete |
| Navigation Completeness | 100% — All pages have nav entries |
| Error Handling Quality | 20% — Mostly silent failures |
| Loading States | 80% — Good coverage |
| **Overall** | **NEEDS WORK** — Core pages connected but critical gaps remain |
