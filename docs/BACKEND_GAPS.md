# Backend Gaps — Frontend Integration Findings

This document tracks backend endpoints that the frontend integration audit determined are needed but not yet exposed (or differ in contract from the docs).

## Status: 🟡 In progress

## 1. SSE / Streaming for AI Copilot

**What frontend needs:**
Real token-by-token streaming responses for the AI Copilot chat (and ideally for the interview chat), so the UI can render "AI is thinking..." → text appears progressively.

**Current state:**
- `POST /api/v1/ai/orchestrate` returns the full response in one shot.
- `GET /api/v1/ai/tasks/{id}` returns a snapshot, not a stream.

**Suggested backend endpoints:**
- `GET /api/v1/ai/tasks/{id}/stream` (Server-Sent Events) — emits `data: {token, done}` events
- OR `POST /api/v1/ai/orchestrate/stream` with `Accept: text/event-stream`

**Frontend fallback used in the meantime:**
- Calls `/ai/orchestrate` and shows a `BouncingDots` loading indicator for the full request duration, then renders the complete response.

## 2. Activity Feed Endpoint

**What frontend needs:**
`GET /api/v1/analytics/activity?limit=N` returning structured recent activity events (AI screener, AI interview, workflow run, etc.).

**Current state:**
- Not exposed. The home dashboard renders the structured response if it exists, otherwise shows an empty state.

**Suggested response shape:**
```json
{
  "data": [
    {"id":"a1","user":"AI Screener","action":"screened","target":"Sarah Chen","meta":"Senior Engineer","created_at":"2026-06-03T13:22:00Z","color":"blue"}
  ]
}
```

## 3. Notification Preferences Save

**What frontend needs:**
- `GET /notifications/preferences` ✅ (exists)
- `PUT /notifications/preferences` ✅ (exists)

**Status:** Already exposed. Frontend uses it.

## 4. Candidate → Job Match Result Pagination

**What frontend needs:**
When a recruiter runs `/candidates/{id}/match`, the response should include structured `top_jobs: [{job_id, title, match_score, factors}]`.

**Current state:**
The candidate match endpoint exists, but the response shape is not standardized across jobs.

**Suggested addition:**
Include in the response from `POST /candidates/{id}/match`:
```json
{
  "data": {
    "matches": [
      {"job_id": "j1", "title": "Senior Engineer", "match_score": 0.92, "factors": {...}}
    ]
  }
}
```

## 5. PPE Evaluation Real-time Updates

**What frontend needs:**
After `POST /ppe/sessions/{id}/execute`, the response is currently returned once. The frontend wants a "Run tests" button that polls for incremental results as the runner executes test cases one by one (so the user sees each test pass/fail live).

**Suggested backend addition:**
- `GET /ppe/sessions/{id}/executions/{execution_id}/stream` — SSE emitting per-test pass/fail
- OR poll `GET /ppe/sessions/{id}/executions/{execution_id}` and return per-test status

## 6. Settings — Change Password

**What frontend needs:**
`POST /auth/change-password` with `{current_password, new_password}`.

**Current state:**
Not in the API_ENDPOINTS.md. Frontend renders the form but the submit currently surfaces a "feature coming soon" toast.

**Suggested addition:**
`POST /api/v1/auth/change-password` returning `{success: true}`.

## 7. Settings — API Keys

**What frontend needs:**
`GET /tenants/{id}/api-keys` and `POST /tenants/{id}/api-keys` to manage API keys.

**Current state:**
Not exposed. Frontend shows a placeholder.

## 8. Auth Profile Update

**What frontend needs:**
`PUT /auth/me` to update `{full_name, email, phone}`.

**Current state:**
Only `GET /auth/me` is in the API docs. Frontend does a local-only save for now.

## 9. Schedule Grouped by Day

**What frontend needs:**
`GET /interviews/?from=YYYY-MM-DD&to=YYYY-MM-DD` returning all interviews in a date range, ordered by `scheduled_at`.

**Current state:**
The interview listing endpoint already supports date filters via `params`. The schedule page uses this pattern.

## 10. Pipeline Status Update

**What frontend needs:**
When a recruiter drags a candidate from "Screening" to "Interview" in the Kanban, the frontend calls `PUT /candidates/{id}` with `{status: 'interviewing'}`.

**Current state:**
Update endpoint exists. No change required, but ensure the candidate `status` field accepts the values used in the UI: `active`, `screening`, `ppe`, `interviewing`, `offer`, `hired`, `rejected`.

---

## Priority Order for Backend Team

1. 🔴 **High** — AI Orchestrator streaming (item 1) — significantly improves perceived UX
2. 🟠 **Med** — Activity feed endpoint (item 2) — required for home dashboard
3. 🟠 **Med** — Change password (item 6) — required for Settings page
4. 🟡 **Low** — API keys (item 7), profile update (item 8) — nice to have
5. 🟢 **Already working** — All other endpoints

Frontend is fully functional with current backend; gaps are marked with proper empty/placeholder states.
