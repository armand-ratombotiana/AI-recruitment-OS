# Frontend Mock Data Audit Report

**Date:** 2026-06-03
**Auditor:** Frontend Integration Specialist
**Scope:** All dashboard pages, AI components, and shared UI components

## Executive Summary

A complete audit of the AI Recruitment OS frontend identified **27 mock/fake data locations** across **12 files** (8 pages, 4 components). All have been replaced with real API integrations or proper empty/loading states. The frontend now uses the existing `apiClient` consistently and renders authentic data from the backend.

## Findings by File

### 1. `src/app/dashboard/page.tsx` (Dashboard Home) — 5 mock locations

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 26–32 | `ACTIVITY` | Hardcoded array of 5 fake activity items | Replaced with real `api.getActivityFeed` + loading/empty states |
| 34–38 | `TODAY` | Hardcoded array of 3 fake events | Replaced with real upcoming interviews from API |
| 40–46 | `RECENT` | Hardcoded array of 5 fake candidates | Replaced with real recent candidates from API |
| 55–63 | `BAR_DATA` | Hardcoded daily values for chart | Replaced with real weekly chart data from analytics |
| 65–71 | `FUNNEL` | Hardcoded pipeline funnel data | Replaced with real funnel data from analytics API |
| 115–118 | Fallback numbers | `?? 1248`, `?? 23`, `?? 47`, `?? 68` | Removed; show 0 or hide when null |

### 2. `src/app/dashboard/candidates/page.tsx` — 2 mock locations

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 60–69 | `SAMPLE` | 8 hardcoded fake candidates | Replaced with proper empty state; data only from API |
| 347–364 | `onComplete` | Creates fake candidate locally with `id: String(Date.now())` | Now calls `api.createCandidate` (POST `/candidates/`) |

### 3. `src/app/dashboard/jobs/page.tsx` — 3 mock locations

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 34–42 | `SAMPLE` | 7 hardcoded fake jobs | Replaced with proper empty state; data only from API |
| 152 | `12d` | Hardcoded "Avg Time" | Computed from real API data or shown as `—` |
| 200–207 | `onComplete` | Creates fake job locally with `id: String(Date.now())` | Now calls `api.createJob` (POST `/jobs/`) |

### 4. `src/app/dashboard/interviews/page.tsx` — 2 mock locations

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 47–55 | `SAMPLE` | 7 hardcoded fake interviews | Replaced with proper empty state; data only from API |
| 250–256 | `onComplete` | Creates fake interview locally with `id: String(Date.now())` | Now calls `api.createInterview` (POST `/interviews/`) |

### 5. `src/app/dashboard/ai-copilot/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 15 | `send()` | Wrong payload format (`input: msg` is string but backend expects `input: dict`) | Fixed to `input: { query: msg }` and added better UX |
| 16 | `catch` | Fake fallback "I can help with candidate screening…" | Now surfaces a real error toast |

### 6. `src/app/dashboard/ppe/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 5–35 | Whole page | Page has no real session creation, no code execution, no result handling | Now creates a session, submits code, and renders real evaluation result |

### 7. `src/app/dashboard/analytics/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 17–30 | Whole page | Only 3 hardcoded summary cards; no chart, no per-AI-agent breakdown | Now renders real dashboard + pipeline + AI performance sections with real data |

### 8. `src/app/dashboard/workflows/page.tsx` — minor

- Already calls `api.listWorkflows` correctly. Added a "Create workflow" button that calls `api.createWorkflow` and a detail panel with activate/deactivate actions.

### 9. `src/app/dashboard/pipeline/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 3–8 | `COLUMNS` | Entire page is a hardcoded Kanban with fake names | Now fetches real candidates from API and groups by status dynamically |

### 10. `src/app/dashboard/schedule/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 3–8 | `EVENTS` | Entire page is a hardcoded schedule | Now fetches real interviews from API grouped by date |

### 11. `src/app/dashboard/matching/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 29 | `Math.floor(Math.random() * 20) + 80` | Random fake match score | Now calls `api.matchCandidate(id)` per candidate and renders the real `match_score` |
| 10–14 | `Promise.all` | Only lists jobs/candidates, no actual matching | Now triggers `/candidates/{id}/match` for each candidate and shows the structured response |

### 12. `src/app/dashboard/settings/page.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 12 | `defaultValue="John Doe"` and `defaultValue="john@example.com"` | Hardcoded user data | Now fetches `/auth/me` and shows real profile |

## Components

### 13. `src/components/ai-copilot/copilot-panel.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 22–37 | `setTimeout` + `responses` | Fake hardcoded responses triggered by keyword matching | Now calls `api.orchestrate({ agent_type: 'recruiting_copilot', input: { query } })` and shows the real result |

### 14. `src/components/interview/interview-chat.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 22–29 | `setTimeout` + canned "follow-up question" | Fake interviewer | Now calls `api.orchestrate({ agent_type: 'technical_interview' or 'hr_interview' })` and renders the real result |

### 15. `src/components/coding-editor/ppe-editor.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 26–34 | `setTimeout` + hardcoded test results | Fake evaluation | Now calls `api.submitPPCode(sessionId, { code, language })` and renders real test outcomes |

### 16. `src/components/dashboard/notifications-bell.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 16–22 | `INITIAL` | 5 hardcoded fake notifications | Now calls `api.listNotifications()` and renders real items |

### 17. `src/components/dashboard/user-menu.tsx` — 1 mock location

| Line | Symbol | Type | Issue |
|------|--------|------|-------|
| 53–54 | "John Doe" / "john@company.com" | Hardcoded user | Now shows real name/email from auth state; loads `/auth/me` on mount |

## Summary

- **Total mock data locations found:** 27
- **Total mock data locations fixed:** 27
- **Files changed:** 17
- **New integration features added:** SSE-ready streaming, real match-score computation, real PPE evaluation flow, real notification feed, real profile

## What Was Kept (intentionally)

The following static constants were intentionally **kept** because they are not "mock data" but UI/UX state, navigation, or empty-state copy:

- `STATUS_VARIANT` maps in pages — UI styling, not data.
- `STATUSES`, `TYPES` arrays in filters — UI options.
- `PAGE_INDEX` in `global-search.tsx` — internal app navigation, not domain data.
- `ACTIONS` in `quick-actions-fab.tsx` — static quick action links.
- `QUICK` in dashboard — static shortcuts.
- `setTimeout` in `hooks/index.ts` (`useDebouncedValue`, `useToast`) — pure utility code, not domain data.
- `setTimeout` in `components/ui/tooltip.tsx` — pure UI delay.
- `Bar` chart layout in dashboard — used to render the real API payload shape, not hardcoded data.
- "AI-ROS" branding, "Pro tip" copy — marketing/UX copy.
