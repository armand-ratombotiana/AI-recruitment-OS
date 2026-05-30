"""Comprehensive feature test for AI-Native Recruitment OS.

Exercises all major backend features end-to-end using the unified API gateway.
"""

from __future__ import annotations

from typing import AsyncGenerator
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


pytestmark = [pytest.mark.integration, pytest.mark.features]


@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator[AsyncClient, None]:
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Health & Root
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["service"] == "unified-api"


@pytest.mark.asyncio
async def test_root_returns_html(client: AsyncClient):
    resp = await client.get("/", follow_redirects=False)
    assert resp.status_code == 200
    assert "AI-Native Recruitment Operating System" in resp.text


# ---------------------------------------------------------------------------
# Auth Flow
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_auth_register(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "newuser@test.com",
        "full_name": "New User",
        "password": "SecurePass123!",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["created"] is True
    assert body["email"] == "newuser@test.com"


@pytest.mark.asyncio
async def test_auth_login(client: AsyncClient):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "TestPassword123!",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_auth_refresh_token(client: AsyncClient):
    resp = await client.post("/api/v1/auth/refresh")
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_auth_logout(client: AsyncClient):
    resp = await client.post("/api/v1/auth/logout")
    assert resp.status_code == 200
    assert resp.json()["logged_out"] is True


@pytest.mark.asyncio
async def test_auth_mfa_enable(client: AsyncClient):
    resp = await client.post("/api/v1/auth/mfa/enable")
    assert resp.status_code == 200
    body = resp.json()
    assert "secret" in body
    assert "backup_codes" in body


@pytest.mark.asyncio
async def test_auth_mfa_verify(client: AsyncClient):
    resp = await client.post("/api/v1/auth/mfa/verify")
    assert resp.status_code == 200
    assert resp.json()["verified"] is True


# ---------------------------------------------------------------------------
# Tenant CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_tenant(client: AsyncClient):
    resp = await client.post("/api/v1/tenants/")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_get_tenant(client: AsyncClient):
    resp = await client.get("/api/v1/tenants/t_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "t_123"


@pytest.mark.asyncio
async def test_update_tenant(client: AsyncClient):
    resp = await client.put("/api/v1/tenants/t_123")
    assert resp.status_code == 200
    assert resp.json()["updated"] is True


@pytest.mark.asyncio
async def test_get_tenant_settings(client: AsyncClient):
    resp = await client.get("/api/v1/tenants/t_123/settings")
    assert resp.status_code == 200
    assert "settings" in resp.json()


@pytest.mark.asyncio
async def test_get_tenant_branding(client: AsyncClient):
    resp = await client.get("/api/v1/tenants/t_123/branding")
    assert resp.status_code == 200
    assert "branding" in resp.json()


# ---------------------------------------------------------------------------
# User CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_users(client: AsyncClient):
    resp = await client.get("/api/v1/users/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_get_user(client: AsyncClient):
    resp = await client.get("/api/v1/users/u_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "u_123"


@pytest.mark.asyncio
async def test_update_user(client: AsyncClient):
    resp = await client.put("/api/v1/users/u_123")
    assert resp.status_code == 200
    assert resp.json()["updated"] is True


@pytest.mark.asyncio
async def test_delete_user(client: AsyncClient):
    resp = await client.delete("/api/v1/users/u_123")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_user_activity(client: AsyncClient):
    resp = await client.get("/api/v1/users/u_123/activity")
    assert resp.status_code == 200
    assert "activity" in resp.json()


# ---------------------------------------------------------------------------
# Candidate CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_candidates(client: AsyncClient):
    resp = await client.get("/api/v1/candidates/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_get_candidate(client: AsyncClient):
    resp = await client.get("/api/v1/candidates/c_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "c_123"


@pytest.mark.asyncio
async def test_create_candidate(client: AsyncClient):
    resp = await client.post("/api/v1/candidates/")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_update_candidate(client: AsyncClient):
    resp = await client.put("/api/v1/candidates/c_123")
    assert resp.status_code == 200
    assert resp.json()["updated"] is True


@pytest.mark.asyncio
async def test_delete_candidate(client: AsyncClient):
    resp = await client.delete("/api/v1/candidates/c_123")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_enrich_candidate(client: AsyncClient):
    resp = await client.post("/api/v1/candidates/c_123/enrich")
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"


@pytest.mark.asyncio
async def test_get_candidate_skills(client: AsyncClient):
    resp = await client.get("/api/v1/candidates/c_123/skills")
    assert resp.status_code == 200
    assert "skills" in resp.json()


# ---------------------------------------------------------------------------
# Resume Service
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_upload_resume(client: AsyncClient):
    resp = await client.post("/api/v1/resumes/upload")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_get_resume(client: AsyncClient):
    resp = await client.get("/api/v1/resumes/r_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "r_123"


@pytest.mark.asyncio
async def test_get_parsed_resume(client: AsyncClient):
    resp = await client.get("/api/v1/resumes/r_123/parsed")
    assert resp.status_code == 200
    assert "sections" in resp.json()


@pytest.mark.asyncio
async def test_reparse_resume(client: AsyncClient):
    resp = await client.post("/api/v1/resumes/r_123/reparse")
    assert resp.status_code == 200
    assert resp.json()["status"] == "reparsing"


# ---------------------------------------------------------------------------
# Job CRUD
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_jobs(client: AsyncClient):
    resp = await client.get("/api/v1/jobs/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_get_job(client: AsyncClient):
    resp = await client.get("/api/v1/jobs/j_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "j_123"


@pytest.mark.asyncio
async def test_create_job(client: AsyncClient):
    resp = await client.post("/api/v1/jobs/")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_update_job(client: AsyncClient):
    resp = await client.put("/api/v1/jobs/j_123")
    assert resp.status_code == 200
    assert resp.json()["updated"] is True


@pytest.mark.asyncio
async def test_delete_job(client: AsyncClient):
    resp = await client.delete("/api/v1/jobs/j_123")
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_get_matched_candidates(client: AsyncClient):
    resp = await client.get("/api/v1/jobs/j_123/candidates")
    assert resp.status_code == 200
    assert "matched_candidates" in resp.json()


# ---------------------------------------------------------------------------
# Interview Scheduling
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_interviews(client: AsyncClient):
    resp = await client.get("/api/v1/interviews/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1


@pytest.mark.asyncio
async def test_get_interview(client: AsyncClient):
    resp = await client.get("/api/v1/interviews/i_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "i_123"


@pytest.mark.asyncio
async def test_create_interview(client: AsyncClient):
    resp = await client.post("/api/v1/interviews/")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_start_interview(client: AsyncClient):
    resp = await client.post("/api/v1/interviews/i_123/start")
    assert resp.status_code == 200
    assert resp.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_complete_interview(client: AsyncClient):
    resp = await client.post("/api/v1/interviews/i_123/complete")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_submit_feedback(client: AsyncClient):
    resp = await client.post("/api/v1/interviews/i_123/feedback")
    assert resp.status_code == 200
    assert resp.json()["feedback_submitted"] is True


# ---------------------------------------------------------------------------
# PPE Session Creation & Execution
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_ppe_session(client: AsyncClient):
    resp = await client.post("/api/v1/ppe/sessions")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "created"
    assert "room_id" in body


@pytest.mark.asyncio
async def test_get_ppe_session(client: AsyncClient):
    resp = await client.get("/api/v1/ppe/sessions/s_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "s_123"


@pytest.mark.asyncio
async def test_start_ppe_session(client: AsyncClient):
    resp = await client.post("/api/v1/ppe/sessions/s_123/start")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert "problem" in body


@pytest.mark.asyncio
async def test_execute_ppe_code(client: AsyncClient):
    resp = await client.post("/api/v1/ppe/sessions/s_123/execute")
    assert resp.status_code == 200
    body = resp.json()
    assert "execution" in body
    assert "agent_response" in body


@pytest.mark.asyncio
async def test_ppe_hint(client: AsyncClient):
    resp = await client.post("/api/v1/ppe/sessions/s_123/hint")
    assert resp.status_code == 200
    assert "hint" in resp.json()


@pytest.mark.asyncio
async def test_complete_ppe_session(client: AsyncClient):
    resp = await client.post("/api/v1/ppe/sessions/s_123/complete")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "completed"
    assert "evaluation" in body


@pytest.mark.asyncio
async def test_get_ppe_evaluation(client: AsyncClient):
    resp = await client.get("/api/v1/ppe/sessions/s_123/evaluation")
    assert resp.status_code == 200
    body = resp.json()
    assert "overall_score" in body
    assert "hiring_recommendation" in body


# ---------------------------------------------------------------------------
# AI Orchestrator
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_ai_orchestrate(client: AsyncClient):
    resp = await client.post("/api/v1/ai/orchestrate")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "processing"
    assert "agents_assigned" in body


@pytest.mark.asyncio
async def test_list_ai_agents(client: AsyncClient):
    resp = await client.get("/api/v1/ai/agents")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_ai_agent(client: AsyncClient):
    resp = await client.get("/api/v1/ai/agents/a_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "a_123"


@pytest.mark.asyncio
async def test_submit_ai_task(client: AsyncClient):
    resp = await client.post("/api/v1/ai/tasks")
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued"


@pytest.mark.asyncio
async def test_get_ai_task(client: AsyncClient):
    resp = await client.get("/api/v1/ai/tasks/t_123")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


# ---------------------------------------------------------------------------
# Analytics Dashboard
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_analytics_dashboard(client: AsyncClient):
    resp = await client.get("/api/v1/analytics/dashboard")
    assert resp.status_code == 200
    assert "metrics" in resp.json()


@pytest.mark.asyncio
async def test_analytics_pipeline(client: AsyncClient):
    resp = await client.get("/api/v1/analytics/pipeline")
    assert resp.status_code == 200
    assert "pipeline" in resp.json()


@pytest.mark.asyncio
async def test_analytics_ai_performance(client: AsyncClient):
    resp = await client.get("/api/v1/analytics/ai-performance")
    assert resp.status_code == 200
    assert "metrics" in resp.json()


@pytest.mark.asyncio
async def test_generate_report(client: AsyncClient):
    resp = await client.post("/api/v1/analytics/reports")
    assert resp.status_code == 200
    assert resp.json()["status"] == "generating"


# ---------------------------------------------------------------------------
# Workflow Engine
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_workflows(client: AsyncClient):
    resp = await client.get("/api/v1/workflows/")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_workflow(client: AsyncClient):
    resp = await client.get("/api/v1/workflows/w_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "w_123"


@pytest.mark.asyncio
async def test_create_workflow(client: AsyncClient):
    resp = await client.post("/api/v1/workflows/")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_trigger_workflow(client: AsyncClient):
    resp = await client.post("/api/v1/workflows/w_123/trigger")
    assert resp.status_code == 200
    assert resp.json()["status"] == "running"


@pytest.mark.asyncio
async def test_activate_workflow(client: AsyncClient):
    resp = await client.post("/api/v1/workflows/w_123/activate")
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_send_notification(client: AsyncClient):
    resp = await client.post("/api/v1/notifications/")
    assert resp.status_code == 200
    assert resp.json()["status"] == "sent"


@pytest.mark.asyncio
async def test_list_notifications(client: AsyncClient):
    resp = await client.get("/api/v1/notifications/")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_mark_notification_read(client: AsyncClient):
    resp = await client.put("/api/v1/notifications/n_123/read")
    assert resp.status_code == 200
    assert resp.json()["read"] is True


@pytest.mark.asyncio
async def test_get_notification_preferences(client: AsyncClient):
    resp = await client.get("/api/v1/notifications/preferences")
    assert resp.status_code == 200
    assert "email" in resp.json()


# ---------------------------------------------------------------------------
# Compliance
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_list_compliance_policies(client: AsyncClient):
    resp = await client.get("/api/v1/compliance/policies")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_create_compliance_policy(client: AsyncClient):
    resp = await client.post("/api/v1/compliance/policies")
    assert resp.status_code == 200
    assert resp.json()["created"] is True


@pytest.mark.asyncio
async def test_record_consent(client: AsyncClient):
    resp = await client.post("/api/v1/compliance/consent")
    assert resp.status_code == 200
    assert resp.json()["recorded"] is True


@pytest.mark.asyncio
async def test_get_audit_log(client: AsyncClient):
    resp = await client.get("/api/v1/compliance/audit-log")
    assert resp.status_code == 200
    assert "data" in resp.json()


@pytest.mark.asyncio
async def test_export_data(client: AsyncClient):
    resp = await client.post("/api/v1/compliance/data-export")
    assert resp.status_code == 200
    assert resp.json()["status"] == "processing"


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_subscription(client: AsyncClient):
    resp = await client.get("/api/v1/billing/subscription")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert "plan" in body


@pytest.mark.asyncio
async def test_list_invoices(client: AsyncClient):
    resp = await client.get("/api/v1/billing/invoices")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


@pytest.mark.asyncio
async def test_get_usage(client: AsyncClient):
    resp = await client.get("/api/v1/billing/usage")
    assert resp.status_code == 200
    assert "ai_tokens" in resp.json()


# ---------------------------------------------------------------------------
# Vector Search
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_search_candidates(client: AsyncClient):
    resp = await client.post("/api/v1/search/candidates")
    assert resp.status_code == 200
    assert "results" in resp.json()


@pytest.mark.asyncio
async def test_search_jobs(client: AsyncClient):
    resp = await client.post("/api/v1/search/jobs")
    assert resp.status_code == 200
    assert "results" in resp.json()


@pytest.mark.asyncio
async def test_generate_embedding(client: AsyncClient):
    resp = await client.post("/api/v1/search/embeddings")
    assert resp.status_code == 200
    assert resp.json()["dimension"] == 3072


@pytest.mark.asyncio
async def test_get_embedding(client: AsyncClient):
    resp = await client.get("/api/v1/search/embeddings/emb_123")
    assert resp.status_code == 200
    assert resp.json()["id"] == "emb_123"


# ---------------------------------------------------------------------------
# Middleware verification
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_request_id_header(client: AsyncClient):
    resp = await client.get("/health")
    assert "x-request-id" in resp.headers


@pytest.mark.asyncio
async def test_response_time_header(client: AsyncClient):
    resp = await client.get("/health")
    assert "x-response-time" in resp.headers
    assert resp.headers["x-response-time"].endswith("ms")


@pytest.mark.asyncio
async def test_cors_headers(client: AsyncClient):
    resp = await client.options(
        "/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert resp.status_code in [200, 405]
