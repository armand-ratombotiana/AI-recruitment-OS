# AI-ROS Project Audit & Implementation Plan

**Date:** 2026-06-04
**Auditor:** Senior Architect & Product Owner
**Scope:** Deep audit of the AI-Native Recruitment Operating System
**Status:** Phase 1 Implementation

---

## 1. Executive Summary

AI-ROS is a multi-tenant AI-powered recruitment platform with **26 declared microservices** under a single FastAPI gateway, paired with a **Next.js 14 frontend**. The codebase is in the **80% complete** state typical of an ambitious platform: the auth foundation, identity layer, demo seeding, and PPE service are solid, but the majority of business-domain services are **in-memory stubs** that lose data on restart and never call any LLM, vector store, or external system.

The two most critical production-readiness gaps are:

1. **No multi-tenancy enforcement** — `tenant_id` is stored on every record but **never used as a filter** in any query.
2. **No real persistence in 18+ services** — they use `dict()` / `list()` in module scope, so data evaporates on every process restart.

These two gaps mean the platform is currently a working **demo** but not a deployable product. This audit identifies, prioritizes, and begins closing those gaps.

---

## 2. Architecture Overview

### 2.1 What is actually present

| Layer | Tech | Status |
|-------|------|--------|
| **Backend** | Python 3.12, FastAPI, SQLModel, asyncpg, Alembic | ✅ |
| **Database** | PostgreSQL 16 + pgvector | ✅ via Docker |
| **Cache** | Redis 7 | ✅ via Docker (in code: in-memory stubs) |
| **Queue** | Celery + Redis | ✅ declared (no real tasks) |
| **Frontend** | Next.js 14, TypeScript, Tailwind, Zustand | ✅ |
| **Observability** | Prometheus, Grafana, Jaeger, Alertmanager | ✅ via Docker |
| **Mailing** | aiosmtplib + Jinja2 templates (mock mode) | ✅ |
| **Auth** | JWT (HS256), bcrypt, refresh-token rotation, account lockout, MFA, password reset, email verification, demo seeding | ✅ solid |

### 2.2 Topology

```
Frontend (Next.js :3000)
  ↓
API Gateway (FastAPI :8000) ← loaders 26 routers via include_router_safe
  ├─ /api/v1/auth          (1 010 lines, hardened)
  ├─ /api/v1/mailing       ( 675 lines, full SMTP+mock)
  ├─ /api/v1/tenants       ( 192 lines, in-memory)
  ├─ /api/v1/users         ( 113 lines, in-memory)
  ├─ /api/v1/candidates    ( 407 lines, real DB CRUD, AI stubs)
  ├─ /api/v1/resumes       ( 147 lines, in-memory, no PDF parsing)
  ├─ /api/v1/jobs          ( 323 lines, in-memory)
  ├─ /api/v1/interviews    (  61 lines, in-memory)
  ├─ /api/v1/ppe           ( 271 lines, real session state, AI stub)
  ├─ /api/v1/ai            ( 523 lines, hardcoded response_map)
  ├─ /api/v1/analytics     ( 159 lines, random.random())
  ├─ /api/v1/workflows     ( 211 lines, in-memory)
  ├─ /api/v1/notifications ( 189 lines, in-memory)
  ├─ /api/v1/compliance    ( 203 lines, in-memory)
  ├─ /api/v1/billing       ( 150 lines, in-memory)
  ├─ /api/v1/search        ( 135 lines, in-memory)
  ├─ /api/v1/ws            ( 123 lines, real WS)
  ├─ /api/v1/resume-analysis, scheduling, fraud, compliance-automation,
  │   ai-evaluation, talent-intelligence, workflow-automation,
  │   sso, innovations    (all short stubs)
  └─ /api/v1/api-gateway   (  66 lines, alternate entry)
```

### 2.3 What's there but unused

- **Celery worker** declared in `docker-compose.yml` running 5 queues (default, ai, evaluation, ingestion, notification) but the `workers/*` packages are empty.
- **Shared event bus** (`shared/events/`) has dispatcher, outbox, store, tasks, handlers but no real publisher wired in.
- **Models** for APIKey, Credential, PPE, evaluations, workflows are defined in `shared/core/models/` but the `create_tables.py` script only creates a subset.
- **Observability middleware** emits `X-Response-Time` but no Prometheus counters; `metrics.py` defines 14 lines and that's all.

---

## 3. Feature Matrix (Spec vs Actual)

Legend: ✅ done · 🟡 partial · 🔴 missing

### 3.1 Identity & Access

| Feature | Status | Evidence |
|---------|--------|----------|
| Register / Login / Logout | ✅ | `auth_service/main.py:296-525` |
| Refresh token rotation | ✅ | `auth_service/main.py:528-599` |
| Account lockout (exponential) | ✅ | `helpers.py:32-83` |
| Password complexity rules | ✅ | `auth_service/main.py:65-83` |
| Generic error messages (no user leak) | ✅ | `auth_service/main.py:438-446` |
| Email verification | ✅ | `auth_service/main.py:647-712` + `mailing_service` |
| Password reset flow | ✅ | `auth_service/main.py:718-798` |
| Account deactivation / reactivation | ✅ | `auth_service/main.py:804-879` |
| MFA enable endpoint | 🟡 | returns static secret, no QR, no persistence (`main.py:885-898`) |
| MFA verify endpoint | 🔴 | always returns `verified=True` (`main.py:907`) |
| SSO (Google/LinkedIn/MS/Apple) | 🟡 | router exists in `sso_service/main.py:208 lines`, but auth route in `auth_service/main.py:972-984` returns placeholder tokens |
| **Multi-tenancy filter in queries** | 🔴 | `tenant_id` is stored but every list endpoint reads the whole table |
| **RBAC enforcement** | 🔴 | `UserRole` enum exists; no `require_role()` dependency, no per-route checks |
| **Per-user/per-tenant rate limiting** | 🟡 | Auth has a per-key limiter; global one is in-memory only |
| **Audit log endpoint** | 🟡 | `compliance_service` has `POST /audit` but it logs to a local dict |

### 3.2 Candidates / Resumes / Jobs

| Feature | Status | Evidence |
|---------|--------|----------|
| Candidate CRUD with PostgreSQL | ✅ | `candidate_service/main.py:159-372` (real DB) |
| Candidate search & filters | 🟡 | name/email only; `seniority` filter is buggy (queries `location` not `seniority_level`) |
| AI candidate enrichment | 🔴 | returns hardcoded `task_id`, no real LLM call |
| Candidate ↔ Job matching | 🔴 | returns `matches: []` placeholder |
| Resume upload endpoint | 🟡 | accepts metadata only, no file bytes |
| **Real PDF / DOCX text extraction** | 🔴 | `requirements.txt` lists PyMuPDF + python-docx but no service uses them |
| Resume parse (structured sections) | 🔴 | `GET /resumes/{id}/parsed` returns canned hardcoded data |
| Job CRUD | 🟡 | in-memory (`job_service/main.py`) |
| Job match candidates | 🟡 | partial — needs checking |

### 3.3 Interviews & PPE

| Feature | Status | Evidence |
|---------|--------|----------|
| Interview CRUD | 🟡 | in-memory |
| PPE session lifecycle | ✅ | `ppe_service/main.py:152-271` — create / get / execute / hint all real |
| PPE problem bank | ✅ | 5 real problems with hints, starter code, constraints |
| PPE code execution | 🟡 | string match heuristic, not real sandbox |
| PPE hint progression | ✅ | real, uses problem hints |
| WebSocket real-time | 🟡 | generic `/ws/{client_id}` works but no PPE-specific message types |

### 3.4 AI

| Feature | Status | Evidence |
|---------|--------|----------|
| AI Orchestrator routing | 🟡 | `ai_orchestrator/main.py` has 11 hardcoded agent types in a `response_map` |
| Reasoning chains | 🟡 | templated per agent_type — not generated by an LLM |
| LLM provider routing | 🟡 | `shared/ai/llm_router.py:29 lines` — declared, not invoked |
| Bias detection | 🟡 | in `innovation_service`, returns canned output |
| Talent intelligence | 🟡 | in `talent_intelligence_service` — short, no real data |
| Vector search | 🟡 | in-memory list of embeddings, no real pgvector call |

### 3.5 Workflows & Notifications

| Feature | Status | Evidence |
|---------|--------|----------|
| Workflow CRUD | 🟡 | in-memory `workflow_engine/main.py` |
| Workflow trigger & execute | 🟡 | marks all steps completed immediately, no real action execution |
| Notification CRUD | 🟡 | in-memory; `mark_all_read` is hardcoded to 3 demo items |
| Notification delivery (email/push/SMS) | 🔴 | no actual delivery wired in |

### 3.6 Compliance, Billing, Analytics

| Feature | Status | Evidence |
|---------|--------|----------|
| Compliance policies | 🟡 | 3 hardcoded policies in a dict |
| Consent recording | 🟡 | stores in dict, no real export |
| **GDPR data export** | 🔴 | returns `export_id: "exp_..."` with `status: "processing"` and no implementation |
| **GDPR data deletion** | 🔴 | same — accepts request, does nothing |
| Audit log | 🟡 | endpoint exists, no service writes to it |
| Billing subscription | 🟡 | in-memory |
| Analytics dashboard | 🟡 | `random.seed(hash)` returns different numbers per call — non-deterministic |
| Analytics pipeline | 🟡 | random |
| Analytics AI performance | 🟡 | random |

### 3.7 Cross-Cutting

| Feature | Status | Evidence |
|---------|--------|----------|
| API versioning | ✅ | `/api/v1/` prefix throughout |
| OpenAPI docs | ✅ | `/docs`, `/redoc`, `/openapi.json` |
| Health checks | ✅ | `/health` aggregates DB + Redis |
| Structured logging | 🟡 | declared in `shared/observability/logging.py` (5 lines) but not used |
| Distributed tracing | 🟡 | OTEL packages in `requirements.txt` but not wired |
| Prometheus metrics | 🟡 | `metrics.py` declared, no `/metrics` endpoint |
| WebSocket | 🟡 | generic; no PPE/NOTIF/AI streaming |
| File storage (S3) | 🔴 | settings declare `S3_*` but no implementation |
| Local file storage | 🔴 | no `uploads/` handler |
| Celery async tasks | 🔴 | queues declared, no tasks registered |
| Kafka events | 🔴 | declared, no producer |
| Elasticsearch | 🔴 | declared, no client |

---

## 4. Top 10 Gaps (Priority-Ordered)

| # | Gap | Impact | Effort | Priority |
|---|-----|--------|--------|----------|
| 1 | **Multi-tenancy filter is not enforced** — any authenticated user can read/write any tenant's data | **P0 — security/data leak** | M | **P0** |
| 2 | **18+ services use in-memory dicts** — data loss on restart, no scaling | **P0 — data loss** | XL (many files) | **P0** (selective) |
| 3 | **No real PDF/DOCX resume parsing** — core value prop is a stub | **P0 — feature broken** | S | **P0** |
| 4 | **No audit logging** — compliance claim is false | **P0 — compliance** | M | **P0** |
| 5 | **MFA verify always returns true** — security hole | **P0 — security** | S | **P0** |
| 6 | **Rate limiting is in-memory** — won't work across workers/pods | **P1 — production** | M | **P1** |
| 7 | **Caching is in-memory** — defeats the purpose | **P1 — performance** | M | **P1** |
| 8 | **API key model exists but no endpoints** | **P1 — integrations** | S | **P1** |
| 9 | **Settings: change-password / profile-update endpoints missing** (frontend needs) | **P1 — UX blocker** | S | **P1** |
| 10 | **No persistent notifications / GDPR export** | **P1 — compliance** | M | **P1** |

---

## 5. Implementation Plan

### Phase 1 (this PR): Critical P0/P1 fixes

1. **Enforce multi-tenancy** — add a `require_tenant()` FastAPI dependency + `BaseRepository.get/get_multi` tenant filter, and add a `get_tenant_id_from_token()` helper. Apply to the services that already use the DB (auth, candidate).
2. **Real resume parsing** — use `PyMuPDF` for PDFs and `python-docx` for DOCX; produce a structured `ParsedSections` object with email, phone, sections, skills (regex + heuristic).
3. **Real audit logging** — wire `compliance_service/audit` to a real DB model; emit audit entries from auth, candidate, and resume mutations.
4. **Redis-backed cache + rate limiter** — replace the in-memory implementations in `shared/core/caching.py` and `shared/core/ratelimit.py` with Redis-backed versions, falling back to in-memory if Redis is unavailable.
5. **MFA TOTP verify** — replace the `verified=True` stub with `pyotp`-based verification that uses the user's stored `mfa_secret`.
6. **API key management** — add CRUD endpoints for API keys (list, create, revoke) using the existing `APIKey` model.
7. **Change password + profile update** — endpoints the frontend already needs (`/auth/change-password`, `PUT /auth/me`).
8. **GDPR data export + deletion** — implement actual export of candidate data and an anonymize-or-delete path that respects retention policies.

### Phase 2 (next): Important P1

- Persist notifications in DB and add real email delivery
- Persist workflows + execute steps via Celery
- Real LLM calls in the AI orchestrator (gated on `OPENAI_API_KEY`)
- Real pgvector search
- Persistent PPE session state
- RBAC `require_role()` dependency
- Prometheus `/metrics` endpoint

### Phase 3 (later): P2 nice-to-haves

- File storage abstraction (local + S3)
- Real calendar integration (Google/Outlook)
- Webhook delivery system
- Per-tenant feature flags

### Phase 4 (future): P3

- Multi-region deployment
- Chaos engineering
- SOC2 audit trail exports
- Voice AI for interviews

---

## 6. Implementation Detail (Phase 1 work)

Each fix is a self-contained commit with its own tests. The pattern for every fix is:

1. **Add a unit test** that fails before the fix.
2. **Implement the fix** in the relevant file.
3. **Run the test** to confirm it passes.
4. **Add an integration test** that exercises the endpoint.
5. **Commit** with a descriptive message.

### Fix #1 — Multi-tenancy dependency & filter

**Files touched:**
- `backend/shared/core/security.py` — add `get_tenant_id_from_token()` and `require_tenant()` (FastAPI dependency).
- `backend/shared/core/repository.py` — `BaseRepository` filters by `tenant_id` if the model has it.
- `backend/apps/candidate_service/main.py` — apply the dependency and pass `tenant_id` to reads.
- `backend/tests/unit/test_multi_tenancy.py` — new test.

### Fix #2 — Real PDF/DOCX resume parsing

**Files touched:**
- `backend/apps/resume_service/main.py` — new `POST /resumes/upload` that accepts multipart file, stores content, parses via `PyMuPDF` or `python-docx`, returns a structured `ParsedSections`.
- `backend/apps/resume_service/parser.py` — new helper with `parse_pdf()` and `parse_docx()`.
- `backend/tests/unit/test_resume_parser.py` — new test with sample PDF and DOCX fixtures (or generated text).

### Fix #3 — Audit logging

**Files touched:**
- `backend/shared/core/models/audit.py` — new `AuditEntry` SQLModel table.
- `backend/apps/compliance_service/main.py` — replace in-memory dict with DB-backed CRUD; expose a `log_event()` helper.
- `backend/shared/audit.py` — new helper invoked from auth, candidate, and resume endpoints.

### Fix #4 — Redis cache + rate limiter

**Files touched:**
- `backend/shared/core/caching.py` — add optional `RedisCache` backend; `CacheManager` accepts a backend.
- `backend/shared/core/ratelimit.py` — add `RedisRateLimiter` with sliding-window algorithm; `rate_limiter` instance is now Redis-backed if `REDIS_URL` is reachable.
- `backend/tests/unit/test_cache_and_ratelimit.py` — tests that exercise both backends.

### Fix #5 — MFA TOTP verify

**Files touched:**
- `backend/apps/auth_service/main.py` — `mfa/enable` generates a real TOTP secret via `pyotp`, stores it on the user, returns a real otpauth:// URI QR code (as base64 PNG via `qrcode`).
- `backend/apps/auth_service/main.py` — `mfa/verify` actually verifies with `pyotp.TOTP(secret).verify(code, valid_window=1)`.
- `backend/tests/unit/test_mfa.py` — new tests.

### Fix #6 — API key management

**Files touched:**
- `backend/apps/auth_service/main.py` (or new `apps/api_keys_service/main.py`) — `GET /api-keys`, `POST /api-keys`, `DELETE /api-keys/{id}`.
- `backend/shared/core/security.py` — `generate_api_key()` already exists; add `verify_api_key()`.
- `backend/tests/integration/test_api_keys.py` — new tests.

### Fix #7 — Change password + profile update

**Files touched:**
- `backend/apps/auth_service/main.py` — `POST /auth/change-password`, `PUT /auth/me`.
- `backend/tests/integration/test_auth_self_service.py` — new tests.

### Fix #8 — GDPR export + deletion

**Files touched:**
- `backend/apps/compliance_service/main.py` — implement `GET /export/{id}` (returns actual JSON of all candidate data) and `POST /deletion` (anonymizes the candidate).
- `backend/tests/integration/test_gdpr.py` — new tests.

---

## 7. Risks & Caveats

- The platform claims 26 services; ~12 of them are short stubs. We are **not** rewriting those — Phase 1 focuses on cross-cutting safety features (multi-tenancy, audit, real parsing, MFA) and a few user-facing gaps.
- Some fixes (Redis cache, audit DB) require a DB and a Redis to be reachable. Tests will use an in-process SQLite and a mock Redis (or no-op fallback) so the suite still passes without infra.
- The `apps/*-service` and `apps/*_service` duplicate directory naming convention is messy; we keep both but only edit the underscored ones (the ones that actually have code).

---

## 8. Acceptance Criteria for Phase 1

- [ ] All new unit + integration tests pass.
- [ ] No existing tests regress.
- [ ] Every new endpoint appears in `/openapi.json`.
- [ ] Backend boots without external services (graceful degradation).
- [ ] Audit, multi-tenancy, and MFA can each be demonstrated end-to-end with a single test.
