# API Integration Map

This document maps every frontend page and component to its real backend endpoint(s).

**Backend base URL:** `http://localhost:8000`
**All paths are prefixed with `/api/v1` automatically by `apiClient`.**

## Page → Endpoint Map

### 1. `dashboard/page.tsx` — Dashboard Home
| UI Section | Endpoint | Method | Notes |
|------------|----------|--------|-------|
| Top stat cards | `/analytics/dashboard?time_range=7d` | GET | Returns `total_candidates`, `active_jobs`, `interviews_this_week`, `pass_rate` |
| Weekly bar chart | `/analytics/dashboard?time_range=7d` | GET | Reuses `weekly_data` array |
| Pipeline funnel | `/analytics/pipeline` | GET | Returns `stages: [{stage, count, color}]` |
| Recent activity | `/analytics/activity?limit=5` | GET | Graceful fallback if endpoint not exposed (TODO `BACKEND_GAPS.md`) |
| Today's events | `/interviews/?upcoming=true&limit=5` | GET | Filters by `scheduled_at >= now()` |
| Recent candidates | `/candidates/?limit=5&sort=-created_at` | GET | |

### 2. `dashboard/candidates/page.tsx` — Candidates
| UI Section | Endpoint | Method | Notes |
|------------|----------|--------|-------|
| List table | `/candidates/?status=&skill=&min_score=&q=` | GET | Server-side filters |
| Create candidate | `/candidates/` | POST | Body: `{full_name, email, phone, location, skills[], experience_years, status}` |
| AI enrichment | `/candidates/{id}/enrich` | POST | Triggered from row menu |
| AI matching | `/candidates/{id}/match` | POST | Triggered from row menu |
| Semantic search | `/search/candidates` | POST | Body: `{query}` |
| Export CSV | Client-side | — | Uses API result, no network |

### 3. `dashboard/jobs/page.tsx` — Jobs
| UI Section | Endpoint | Method | Notes |
|------------|----------|--------|-------|
| List table | `/jobs/?status=&q=` | GET | |
| Create job | `/jobs/` | POST | Body: `{title, department, location, type, salary_min, salary_max, description, requirements, skills[]}` |
| Top stats | `/analytics/dashboard?time_range=7d` | GET | For "Avg Time" |

### 4. `dashboard/interviews/page.tsx` — Interviews
| UI Section | Endpoint | Method | Notes |
|------------|----------|--------|-------|
| List table | `/interviews/?status=&type=&q=` | GET | |
| Create interview | `/interviews/` | POST | Body: `{candidate_id, job_id, scheduled_at, duration_min, type, panel[], location}` |
| Start interview | `/interviews/{id}/start` | POST | From row menu |
| Complete interview | `/interviews/{id}/complete` | POST | From row menu |

### 5. `dashboard/ai-copilot/page.tsx` — AI Copilot Chat
| Action | Endpoint | Method | Body |
|--------|----------|--------|------|
| Send message | `/ai/orchestrate` | POST | `{agent_type: 'recruiting_copilot', input: {query, context}}` |
| (Future) Stream | `/ai/tasks/{id}/stream` | GET SSE | Polled; backend gap noted in `BACKEND_GAPS.md` |

### 6. `dashboard/ppe/page.tsx` — Pair Programming Evaluation
| Action | Endpoint | Method | Body |
|--------|----------|--------|------|
| List problems | `/ppe/problems` | GET | |
| Create session | `/ppe/sessions` | POST | `{problem_id, candidate_id}` |
| Submit code | `/ppe/sessions/{id}/execute` | POST | `{code, language}` |
| Request hint | `/ppe/sessions/{id}/hint` | POST | — |

### 7. `dashboard/analytics/page.tsx` — Analytics
| Section | Endpoint | Method | Notes |
|---------|----------|--------|-------|
| Overview cards | `/analytics/dashboard?time_range=…` | GET | |
| Pipeline chart | `/analytics/pipeline` | GET | |
| AI performance | `/analytics/ai-performance` | GET | Per-agent metrics |
| Productivity | `/analytics/recruiter-productivity` | GET | (Optional) |
| Time-to-hire | `/analytics/time-to-hire` | GET | (Optional) |

### 8. `dashboard/workflows/page.tsx` — Workflows
| Action | Endpoint | Method |
|--------|----------|--------|
| List | `/workflows/` | GET |
| Create | `/workflows/` | POST |
| Activate | `/workflows/{id}/activate` | POST |
| Deactivate | `/workflows/{id}/deactivate` | POST |
| Trigger | `/workflows/{id}/trigger` | POST |

### 9. `dashboard/pipeline/page.tsx` — Pipeline (Kanban)
| Action | Endpoint | Method |
|--------|----------|--------|
| Get candidates by status | `/candidates/?limit=200` | GET — grouped client-side |
| Move candidate | `/candidates/{id}` | PUT — `{status}` |

### 10. `dashboard/schedule/page.tsx` — Schedule
| Action | Endpoint | Method |
|--------|----------|--------|
| Today's events | `/interviews/?scheduled_after={today}&scheduled_before={tomorrow}` | GET |
| Week events | `/interviews/?scheduled_after={monday}&scheduled_before={sunday}` | GET |

### 11. `dashboard/matching/page.tsx` — AI Matching
| Action | Endpoint | Method | Notes |
|--------|----------|--------|-------|
| List candidates | `/candidates/?limit=10` | GET | |
| List jobs | `/jobs/?limit=10` | GET | |
| Compute matches | `/candidates/{id}/match` | POST | Returns `result.match_score` |

### 12. `dashboard/settings/page.tsx` — Settings
| Section | Endpoint | Method |
|---------|----------|--------|
| Profile | `/auth/me` | GET (display) |
| Save profile | `/users/{id}` | PUT |
| Notification prefs | `/notifications/preferences` | GET/PUT |
| Change password | `/auth/password` | POST (backend gap — see `BACKEND_GAPS.md`) |
| API keys | `/tenants/{id}/api-keys` | GET/POST (backend gap) |

## Component → Endpoint Map

### `components/ai-copilot/copilot-panel.tsx`
- **POST** `/ai/orchestrate` — `{agent_type: 'recruiting_copilot', input: {query}}`

### `components/interview/interview-chat.tsx`
- **POST** `/ai/orchestrate` — `{agent_type: 'technical_interview'|'hr_interview', input: {question, answer}, candidate_id, job_id}`
- **GET** `/interviews/{id}/transcript` — load conversation history

### `components/coding-editor/ppe-editor.tsx`
- **POST** `/ppe/sessions/{id}/execute` — `{code, language}`
- **POST** `/ppe/sessions/{id}/hint` — request hint

### `components/dashboard/notifications-bell.tsx`
- **GET** `/notifications/` — list notifications
- **POST** `/notifications/{id}/read` — mark as read
- **POST** `/notifications/read-all` — mark all read

### `components/dashboard/user-menu.tsx`
- **GET** `/auth/me` — load user profile
- **POST** `/auth/logout` — sign out

### `components/dashboard/global-search.tsx`
- **POST** `/search/candidates` — semantic search
- **POST** `/search/jobs` — semantic search
- (Static navigation index remains for fast ⌘K page jumps)

## Authentication Flow

`/auth/login` → returns `{access_token}` → stored in `localStorage['airos_token']` via `apiClient.setToken()`.
Every subsequent request automatically sends `Authorization: Bearer <token>`.

`apiClient` is a singleton at `src/services/api/client.ts`. All pages and stores import it directly.
