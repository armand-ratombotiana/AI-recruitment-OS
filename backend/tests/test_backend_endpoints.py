"""Comprehensive backend endpoint tests for AI-ROS.

Tests every microservice router endpoint against the unified API gateway.
Uses httpx AsyncClient with ASGI transport (no real server needed).
"""

from __future__ import annotations

import sys
import os
import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from httpx import ASGITransport, AsyncClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    import asyncio
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="module")
async def client():
    from main import app
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


# ============================================================================
# 1. Health Checks
# ============================================================================

class TestHealthEndpoints:
    @pytest.mark.asyncio
    async def test_root_health(self, client: AsyncClient):
        r = await client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] in ("healthy", "degraded")
        assert body["service"] == "unified-api"
        assert "checks" in body

    @pytest.mark.asyncio
    async def test_root(self, client: AsyncClient):
        r = await client.get("/", follow_redirects=True)
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_auth_health(self, client: AsyncClient):
        r = await client.get("/api/v1/auth/health")
        assert r.status_code == 200
        assert r.json()["service"] == "auth"

    @pytest.mark.asyncio
    async def test_tenant_health(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/health")
        assert r.status_code == 200
        assert r.json()["service"] == "tenant"

    @pytest.mark.asyncio
    async def test_user_health(self, client: AsyncClient):
        r = await client.get("/api/v1/users/health")
        assert r.status_code == 200
        assert r.json()["service"] == "user"

    @pytest.mark.asyncio
    async def test_candidate_health(self, client: AsyncClient):
        r = await client.get("/api/v1/candidates/health")
        assert r.status_code == 200
        assert r.json()["service"] == "candidate"

    @pytest.mark.asyncio
    async def test_resume_health(self, client: AsyncClient):
        r = await client.get("/api/v1/resumes/health")
        assert r.status_code == 200
        assert r.json()["service"] == "resume"

    @pytest.mark.asyncio
    async def test_job_health(self, client: AsyncClient):
        r = await client.get("/api/v1/jobs/health")
        assert r.status_code == 200
        assert r.json()["service"] == "job"

    @pytest.mark.asyncio
    async def test_interview_health(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/health")
        assert r.status_code == 200
        assert r.json()["service"] == "interview"

    @pytest.mark.asyncio
    async def test_ppe_health(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/health")
        assert r.status_code == 200
        assert r.json()["service"] == "ppe"

    @pytest.mark.asyncio
    async def test_ai_health(self, client: AsyncClient):
        r = await client.get("/api/v1/ai/health")
        assert r.status_code == 200
        assert r.json()["service"] == "ai-orchestrator"

    @pytest.mark.asyncio
    async def test_analytics_health(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/health")
        assert r.status_code == 200
        assert r.json()["service"] == "analytics"

    @pytest.mark.asyncio
    async def test_workflow_health(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/health")
        assert r.status_code == 200
        assert r.json()["service"] == "workflow-engine"

    @pytest.mark.asyncio
    async def test_notification_health(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/health")
        assert r.status_code == 200
        assert r.json()["service"] == "notification"

    @pytest.mark.asyncio
    async def test_compliance_health(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/health")
        assert r.status_code == 200
        assert r.json()["service"] == "compliance"

    @pytest.mark.asyncio
    async def test_billing_health(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/health")
        assert r.status_code == 200
        assert r.json()["service"] == "billing"

    @pytest.mark.asyncio
    async def test_search_health(self, client: AsyncClient):
        r = await client.get("/api/v1/search/health")
        assert r.status_code == 200
        assert r.json()["service"] == "vector-search"

    @pytest.mark.asyncio
    async def test_ws_health(self, client: AsyncClient):
        r = await client.get("/api/v1/ws/health")
        assert r.status_code == 200
        assert r.json()["service"] == "websocket"

    @pytest.mark.asyncio
    async def test_resume_analysis_health(self, client: AsyncClient):
        r = await client.get("/api/v1/resume-analysis/health")
        assert r.status_code == 200
        assert r.json()["service"] == "resume-analysis"

    @pytest.mark.asyncio
    async def test_scheduling_health(self, client: AsyncClient):
        r = await client.get("/api/v1/scheduling/health")
        assert r.status_code == 200
        assert r.json()["service"] == "scheduling"

    @pytest.mark.asyncio
    async def test_fraud_health(self, client: AsyncClient):
        r = await client.get("/api/v1/fraud/health")
        assert r.status_code == 200
        assert r.json()["service"] == "fraud-detection"

    @pytest.mark.asyncio
    async def test_compliance_automation_health(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance-automation/health")
        assert r.status_code == 200
        assert r.json()["service"] == "compliance-automation"

    @pytest.mark.asyncio
    async def test_ai_evaluation_health(self, client: AsyncClient):
        r = await client.get("/api/v1/ai-evaluation/health")
        assert r.status_code == 200
        assert r.json()["service"] == "ai-evaluation"

    @pytest.mark.asyncio
    async def test_talent_intelligence_health(self, client: AsyncClient):
        r = await client.get("/api/v1/talent-intelligence/health")
        assert r.status_code == 200
        assert r.json()["service"] == "talent-intelligence"

    @pytest.mark.asyncio
    async def test_workflow_automation_health(self, client: AsyncClient):
        r = await client.get("/api/v1/workflow-automation/health")
        assert r.status_code == 200
        assert r.json()["service"] == "workflow-automation"

    @pytest.mark.asyncio
    async def test_sso_health(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/health")
        assert r.status_code == 200
        assert r.json()["service"] == "sso"

    @pytest.mark.asyncio
    async def test_innovation_health(self, client: AsyncClient):
        r = await client.get("/api/v1/innovations/health")
        assert r.status_code == 200
        assert r.json()["service"] == "innovation"


# ============================================================================
# 2. Auth Service
# ============================================================================

class TestAuthEndpoints:
    @pytest.mark.asyncio
    async def test_register(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/register", json={
            "email": "user@acme.com",
            "full_name": "Jane Recruiter",
            "password": "SecureP@ss123",
            "role": "candidate",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["created"] is True
        assert body["email"] == "user@acme.com"

    @pytest.mark.asyncio
    async def test_login(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/login", json={
            "email": "user@acme.com",
            "password": "SecureP@ss123",
        })
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_refresh(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/refresh")
        assert r.status_code == 200
        assert "access_token" in r.json()

    @pytest.mark.asyncio
    async def test_logout(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/logout")
        assert r.status_code == 200
        assert r.json()["logged_out"] is True

    @pytest.mark.asyncio
    async def test_mfa_enable(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/mfa/enable")
        assert r.status_code == 200
        body = r.json()
        assert "secret" in body
        assert "qr_code" in body
        assert "backup_codes" in body

    @pytest.mark.asyncio
    async def test_mfa_verify(self, client: AsyncClient):
        r = await client.post("/api/v1/auth/mfa/verify")
        assert r.status_code == 200
        assert r.json()["verified"] is True


# ============================================================================
# 3. Tenant Service
# ============================================================================

class TestTenantEndpoints:
    @pytest.mark.asyncio
    async def test_list_tenants(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_create_tenant(self, client: AsyncClient):
        r = await client.post("/api/v1/tenants/", json={
            "name": "Test Corp",
            "slug": "test-corp",
            "plan": "pro",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_get_tenant(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/t1")
        assert r.status_code == 200
        assert r.json()["id"] == "t1"

    @pytest.mark.asyncio
    async def test_update_tenant(self, client: AsyncClient):
        r = await client.put("/api/v1/tenants/t1", json={"name": "Acme Updated"})
        assert r.status_code == 200
        assert r.json()["updated"] is True

    @pytest.mark.asyncio
    async def test_delete_tenant(self, client: AsyncClient):
        r = await client.delete("/api/v1/tenants/t1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_get_tenant_settings(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/t1/settings")
        assert r.status_code == 200
        assert "settings" in r.json()

    @pytest.mark.asyncio
    async def test_update_tenant_settings(self, client: AsyncClient):
        r = await client.put("/api/v1/tenants/t1/settings", json={"ai_enabled": True})
        assert r.status_code == 200
        assert "settings" in r.json()

    @pytest.mark.asyncio
    async def test_get_branding(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/t1/branding")
        assert r.status_code == 200
        assert "branding" in r.json()

    @pytest.mark.asyncio
    async def test_update_branding(self, client: AsyncClient):
        r = await client.put("/api/v1/tenants/t1/branding", json={"primary_color": "#ff0000"})
        assert r.status_code == 200
        assert "branding" in r.json()

    @pytest.mark.asyncio
    async def test_get_usage(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/t1/usage")
        assert r.status_code == 200
        assert "ai_tokens_used" in r.json()

    @pytest.mark.asyncio
    async def test_get_usage_history(self, client: AsyncClient):
        r = await client.get("/api/v1/tenants/t1/usage/history")
        assert r.status_code == 200
        assert "history" in r.json()


# ============================================================================
# 4. User Service
# ============================================================================

class TestUserEndpoints:
    @pytest.mark.asyncio
    async def test_list_users(self, client: AsyncClient):
        r = await client.get("/api/v1/users/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_user(self, client: AsyncClient):
        r = await client.get("/api/v1/users/u1")
        assert r.status_code == 200
        assert r.json()["id"] == "u1"

    @pytest.mark.asyncio
    async def test_update_user(self, client: AsyncClient):
        r = await client.put("/api/v1/users/u1")
        assert r.status_code == 200
        assert r.json()["updated"] is True

    @pytest.mark.asyncio
    async def test_delete_user(self, client: AsyncClient):
        r = await client.delete("/api/v1/users/u1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_user_activity(self, client: AsyncClient):
        r = await client.get("/api/v1/users/u1/activity")
        assert r.status_code == 200
        assert "activity" in r.json()


# ============================================================================
# 5. Candidate Service
# ============================================================================

class TestCandidateEndpoints:
    @pytest.mark.asyncio
    async def test_list_candidates(self, client: AsyncClient):
        r = await client.get("/api/v1/candidates/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_create_candidate(self, client: AsyncClient):
        r = await client.post("/api/v1/candidates/", json={
            "email": "new@email.com",
            "full_name": "New Candidate",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_get_candidate(self, client: AsyncClient):
        r = await client.get("/api/v1/candidates/c1")
        assert r.status_code == 200
        assert r.json()["id"] == "c1"

    @pytest.mark.asyncio
    async def test_update_candidate(self, client: AsyncClient):
        r = await client.put("/api/v1/candidates/c1")
        assert r.status_code == 200
        assert r.json()["updated"] is True

    @pytest.mark.asyncio
    async def test_delete_candidate(self, client: AsyncClient):
        r = await client.delete("/api/v1/candidates/c1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_enrich_candidate(self, client: AsyncClient):
        r = await client.post("/api/v1/candidates/c1/enrich")
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

    @pytest.mark.asyncio
    async def test_enrichment_status(self, client: AsyncClient):
        r = await client.get("/api/v1/candidates/c1/enrichment-status")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_match_candidate(self, client: AsyncClient):
        r = await client.post("/api/v1/candidates/c1/match")
        assert r.status_code == 200
        assert "matches" in r.json()

    @pytest.mark.asyncio
    async def test_candidate_skills(self, client: AsyncClient):
        r = await client.get("/api/v1/candidates/c1/skills")
        assert r.status_code == 200
        assert "skills" in r.json()


# ============================================================================
# 6. Resume Service
# ============================================================================

class TestResumeEndpoints:
    @pytest.mark.asyncio
    async def test_upload_resume(self, client: AsyncClient):
        r = await client.post("/api/v1/resumes/upload")
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_get_resume(self, client: AsyncClient):
        r = await client.get("/api/v1/resumes/r1")
        assert r.status_code == 200
        assert r.json()["id"] == "r1"

    @pytest.mark.asyncio
    async def test_get_parsed_resume(self, client: AsyncClient):
        r = await client.get("/api/v1/resumes/r1/parsed")
        assert r.status_code == 200
        assert "sections" in r.json()

    @pytest.mark.asyncio
    async def test_reparse_resume(self, client: AsyncClient):
        r = await client.post("/api/v1/resumes/r1/reparse")
        assert r.status_code == 200
        assert r.json()["status"] == "reparsing"


# ============================================================================
# 7. Job Service
# ============================================================================

class TestJobEndpoints:
    @pytest.mark.asyncio
    async def test_list_jobs(self, client: AsyncClient):
        r = await client.get("/api/v1/jobs/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_create_job(self, client: AsyncClient):
        r = await client.post("/api/v1/jobs/", json={
            "title": "New Job",
            "description": "Job description",
            "department": "Engineering",
            "location": "Remote",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_get_job(self, client: AsyncClient):
        r = await client.get("/api/v1/jobs/j1")
        assert r.status_code == 200
        assert r.json()["id"] == "j1"

    @pytest.mark.asyncio
    async def test_update_job(self, client: AsyncClient):
        r = await client.put("/api/v1/jobs/j1")
        assert r.status_code == 200
        assert r.json()["updated"] is True

    @pytest.mark.asyncio
    async def test_delete_job(self, client: AsyncClient):
        r = await client.delete("/api/v1/jobs/j1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_get_matched_candidates(self, client: AsyncClient):
        r = await client.get("/api/v1/jobs/j1/candidates")
        assert r.status_code == 200
        assert "matched_candidates" in r.json()


# ============================================================================
# 8. Interview Service
# ============================================================================

class TestInterviewEndpoints:
    @pytest.mark.asyncio
    async def test_list_interviews(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body

    @pytest.mark.asyncio
    async def test_list_interviews_filter(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/?candidate_id=c1")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_get_interview(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/i1")
        assert r.status_code == 200
        assert r.json()["id"] == "i1"

    @pytest.mark.asyncio
    async def test_create_interview(self, client: AsyncClient):
        r = await client.post("/api/v1/interviews/", json={
            "candidate_id": "c1",
            "job_id": "j1",
            "interview_type": "technical",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_start_interview(self, client: AsyncClient):
        r = await client.post("/api/v1/interviews/i1/start")
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    @pytest.mark.asyncio
    async def test_complete_interview(self, client: AsyncClient):
        r = await client.post("/api/v1/interviews/i1/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_submit_feedback(self, client: AsyncClient):
        r = await client.post("/api/v1/interviews/i1/feedback")
        assert r.status_code == 200
        assert r.json()["feedback_submitted"] is True

    @pytest.mark.asyncio
    async def test_get_transcript(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/i1/transcript")
        assert r.status_code == 200
        assert "transcript" in r.json()

    @pytest.mark.asyncio
    async def test_get_interview_analytics(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/i1/analytics")
        assert r.status_code == 200
        assert "analytics" in r.json()


# ============================================================================
# 9. PPE Service
# ============================================================================

class TestPPEEndpoints:
    @pytest.mark.asyncio
    async def test_create_session(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions", json={
            "interview_id": "i1",
            "language": "python",
            "difficulty": "medium",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "created"

    @pytest.mark.asyncio
    async def test_get_session(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/sessions/ppe1")
        assert r.status_code == 200
        assert r.json()["id"] == "ppe1"

    @pytest.mark.asyncio
    async def test_start_session(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions/ppe1/start")
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_execute_code(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions/ppe1/execute")
        assert r.status_code == 200
        assert "execution" in r.json()

    @pytest.mark.asyncio
    async def test_request_hint(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions/ppe1/hint")
        assert r.status_code == 200
        assert "hint" in r.json()

    @pytest.mark.asyncio
    async def test_complete_session(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions/ppe1/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_get_evaluation(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/sessions/ppe1/evaluation")
        assert r.status_code == 200
        assert "overall_score" in r.json()

    @pytest.mark.asyncio
    async def test_list_problems(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/problems")
        assert r.status_code == 200
        assert "problems" in r.json()

    @pytest.mark.asyncio
    async def test_get_problem(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/problems/p1")
        assert r.status_code == 200
        assert r.json()["id"] == "p1"

    @pytest.mark.asyncio
    async def test_get_progress(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/sessions/ppe1/progress")
        assert r.status_code == 200
        assert "progress" in r.json()


# ============================================================================
# 10. AI Orchestrator
# ============================================================================

class TestAIOrchestratorEndpoints:
    @pytest.mark.asyncio
    async def test_list_agents(self, client: AsyncClient):
        r = await client.get("/api/v1/ai/agents")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_agent(self, client: AsyncClient):
        r = await client.get("/api/v1/ai/agents/a1")
        assert r.status_code == 200
        assert r.json()["id"] == "a1"

    @pytest.mark.asyncio
    async def test_orchestrate(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "task_type": "resume_parse",
            "input_data": {"resume_id": "r1"},
        })
        assert r.status_code == 200
        assert "task_id" in r.json()

    @pytest.mark.asyncio
    async def test_submit_task(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/tasks", json={
            "task_type": "skill_extract",
            "payload": {"text": "Python, PostgreSQL, Kubernetes"},
        })
        assert r.status_code == 200
        assert r.json()["status"] == "queued"

    @pytest.mark.asyncio
    async def test_get_task(self, client: AsyncClient):
        r = await client.get("/api/v1/ai/tasks/task_1")
        assert r.status_code == 200
        assert "status" in r.json()


# ============================================================================
# 11. Analytics Service
# ============================================================================

class TestAnalyticsEndpoints:
    @pytest.mark.asyncio
    async def test_dashboard(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/dashboard")
        assert r.status_code == 200
        assert "metrics" in r.json()

    @pytest.mark.asyncio
    async def test_dashboard_time_range(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/dashboard?time_range=30d")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_pipeline(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/pipeline")
        assert r.status_code == 200
        assert "pipeline" in r.json()

    @pytest.mark.asyncio
    async def test_ai_performance(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/ai-performance")
        assert r.status_code == 200
        assert "metrics" in r.json()

    @pytest.mark.asyncio
    async def test_recruiter_productivity(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/recruiter-productivity")
        assert r.status_code == 200
        assert "recruiters" in r.json()

    @pytest.mark.asyncio
    async def test_time_to_hire(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/time-to-hire")
        assert r.status_code == 200
        assert "average_days" in r.json()

    @pytest.mark.asyncio
    async def test_generate_report(self, client: AsyncClient):
        r = await client.post("/api/v1/analytics/reports")
        assert r.status_code == 200
        assert r.json()["status"] == "generating"

    @pytest.mark.asyncio
    async def test_get_report(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/reports/report_1")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


# ============================================================================
# 12. Workflow Engine
# ============================================================================

class TestWorkflowEndpoints:
    @pytest.mark.asyncio
    async def test_list_workflows(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_workflow(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/w1")
        assert r.status_code == 200
        assert r.json()["id"] == "w1"

    @pytest.mark.asyncio
    async def test_create_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/")
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_trigger_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/w1/trigger")
        assert r.status_code == 200
        assert r.json()["status"] == "running"

    @pytest.mark.asyncio
    async def test_activate_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/w1/activate")
        assert r.status_code == 200
        assert r.json()["status"] == "active"


# ============================================================================
# 13. Notification Service
# ============================================================================

class TestNotificationEndpoints:
    @pytest.mark.asyncio
    async def test_send_notification(self, client: AsyncClient):
        r = await client.post("/api/v1/notifications/", json={
            "title": "Test Notification",
            "message": "Hello World",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "sent"

    @pytest.mark.asyncio
    async def test_list_notifications(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_mark_read(self, client: AsyncClient):
        r = await client.put("/api/v1/notifications/n1/read")
        assert r.status_code == 200
        assert r.json()["read"] is True

    @pytest.mark.asyncio
    async def test_get_preferences(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/preferences")
        assert r.status_code == 200
        assert "email" in r.json()

    @pytest.mark.asyncio
    async def test_update_preferences(self, client: AsyncClient):
        r = await client.put("/api/v1/notifications/preferences")
        assert r.status_code == 200
        assert r.json()["updated"] is True


# ============================================================================
# 14. Compliance Service
# ============================================================================

class TestComplianceEndpoints:
    @pytest.mark.asyncio
    async def test_compliance_status(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/status")
        assert r.status_code == 200
        assert r.json()["overall_status"] == "compliant"

    @pytest.mark.asyncio
    async def test_list_policies(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/policies")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_create_policy(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/policies", json={
            "name": "Test Policy",
            "type": "data_retention",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_list_consent(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/consent")
        assert r.status_code == 200
        assert "data" in r.json()

    @pytest.mark.asyncio
    async def test_record_consent(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/consent", json={
            "candidate_id": "c1",
            "type": "data_processing",
            "granted": True,
        })
        assert r.status_code == 200
        assert r.json()["recorded"] is True

    @pytest.mark.asyncio
    async def test_validate_consent(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/consent/validate?candidate_id=c1&consent_type=data_processing")
        assert r.status_code == 200
        assert r.json()["is_valid"] is True

    @pytest.mark.asyncio
    async def test_audit_log(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/audit-log")
        assert r.status_code == 200
        assert "data" in r.json()

    @pytest.mark.asyncio
    async def test_create_audit_log(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/audit-log", json={
            "action": "test.action",
            "actor": "test@acme.com",
            "resource": "candidate",
        })
        assert r.status_code == 200
        assert r.json()["id"] == "a_new"

    @pytest.mark.asyncio
    async def test_data_retention(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/data-retention")
        assert r.status_code == 200
        assert "policies" in r.json()

    @pytest.mark.asyncio
    async def test_data_export(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/data-export", json={
            "candidate_id": "c1",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

    @pytest.mark.asyncio
    async def test_data_deletion(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/data-deletion", json={
            "candidate_id": "c1",
            "confirm": True,
        })
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

    @pytest.mark.asyncio
    async def test_compliance_check(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/check?framework=gdpr")
        assert r.status_code == 200
        assert r.json()["passed"] > 0

    @pytest.mark.asyncio
    async def test_compliance_report(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/reports?period=2025-01")
        assert r.status_code == 200
        assert "overall_score" in r.json()


# ============================================================================
# 15. Billing Service
# ============================================================================

class TestBillingEndpoints:
    @pytest.mark.asyncio
    async def test_list_plans(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/plans")
        assert r.status_code == 200
        assert r.json()["total"] == 4

    @pytest.mark.asyncio
    async def test_get_subscription(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/subscription")
        assert r.status_code == 200
        assert r.json()["plan"] == "enterprise"

    @pytest.mark.asyncio
    async def test_create_subscription(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/subscription", json={
            "plan": "pro",
            "seats": 10,
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_update_subscription(self, client: AsyncClient):
        r = await client.put("/api/v1/billing/subscription", json={
            "plan": "enterprise",
        })
        assert r.status_code == 200
        assert r.json()["updated"] is True

    @pytest.mark.asyncio
    async def test_cancel_subscription(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/subscription/cancel")
        assert r.status_code == 200
        assert r.json()["canceled"] is True

    @pytest.mark.asyncio
    async def test_reactivate_subscription(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/subscription/reactivate")
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_list_invoices(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/invoices")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_invoice(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/invoices/inv_001")
        assert r.status_code == 200
        assert "line_items" in r.json()

    @pytest.mark.asyncio
    async def test_pay_invoice(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/invoices/inv_001/pay", json={
            "invoice_id": "inv_001",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "paid"

    @pytest.mark.asyncio
    async def test_get_usage(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/usage")
        assert r.status_code == 200
        assert "ai_tokens" in r.json()

    @pytest.mark.asyncio
    async def test_usage_breakdown(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/usage/breakdown")
        assert r.status_code == 200
        assert "items" in r.json()

    @pytest.mark.asyncio
    async def test_list_payment_methods(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/payment-methods")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_add_payment_method(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/payment-methods", json={
            "type": "card",
            "last_four": "1234",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_delete_payment_method(self, client: AsyncClient):
        r = await client.delete("/api/v1/billing/payment-methods/pm_1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_set_default_payment_method(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/payment-methods/pm_1/default")
        assert r.status_code == 200
        assert r.json()["is_default"] is True

    @pytest.mark.asyncio
    async def test_process_payment(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/payments/process?amount=100")
        assert r.status_code == 200
        assert r.json()["status"] == "succeeded"


# ============================================================================
# 16. Vector Search Service
# ============================================================================

class TestVectorSearchEndpoints:
    @pytest.mark.asyncio
    async def test_search_candidates(self, client: AsyncClient):
        r = await client.post("/api/v1/search/candidates")
        assert r.status_code == 200
        assert "results" in r.json()

    @pytest.mark.asyncio
    async def test_search_jobs(self, client: AsyncClient):
        r = await client.post("/api/v1/search/jobs")
        assert r.status_code == 200
        assert "results" in r.json()

    @pytest.mark.asyncio
    async def test_generate_embedding(self, client: AsyncClient):
        r = await client.post("/api/v1/search/embeddings")
        assert r.status_code == 200
        assert r.json()["dimension"] == 3072

    @pytest.mark.asyncio
    async def test_get_embedding(self, client: AsyncClient):
        r = await client.get("/api/v1/search/embeddings/emb_1")
        assert r.status_code == 200
        assert "dimension" in r.json()

    @pytest.mark.asyncio
    async def test_similarity_search(self, client: AsyncClient):
        r = await client.post("/api/v1/search/similarity")
        assert r.status_code == 200
        assert "results" in r.json()


# ============================================================================
# 17. Resume Analysis Service
# ============================================================================

class TestResumeAnalysisEndpoints:
    @pytest.mark.asyncio
    async def test_analyze_resume(self, client: AsyncClient):
        r = await client.post("/api/v1/resume-analysis/analyze?candidate_id=c1")
        assert r.status_code == 200
        assert "analysis" in r.json()

    @pytest.mark.asyncio
    async def test_extract_skills(self, client: AsyncClient):
        r = await client.post("/api/v1/resume-analysis/extract-skills?text=Python+and+Kubernetes")
        assert r.status_code == 200
        assert r.json()["total_skills"] >= 1

    @pytest.mark.asyncio
    async def test_compare_resumes(self, client: AsyncClient):
        r = await client.get("/api/v1/resume-analysis/comparison/c1/c2")
        assert r.status_code == 200
        assert "recommendation" in r.json()


# ============================================================================
# 18. Scheduling Service
# ============================================================================

class TestSchedulingEndpoints:
    @pytest.mark.asyncio
    async def test_suggest_slots(self, client: AsyncClient):
        r = await client.post("/api/v1/scheduling/suggest-slots?candidate_id=c1&job_id=j1&interview_type=technical")
        assert r.status_code == 200
        assert "suggested_slots" in r.json()

    @pytest.mark.asyncio
    async def test_optimize_schedule(self, client: AsyncClient):
        r = await client.post("/api/v1/scheduling/optimize-schedule")
        assert r.status_code == 200
        assert "efficiency_score" in r.json()

    @pytest.mark.asyncio
    async def test_get_availability(self, client: AsyncClient):
        r = await client.get("/api/v1/scheduling/availability/int1")
        assert r.status_code == 200
        assert "available_slots" in r.json()


# ============================================================================
# 19. Fraud Detection Service
# ============================================================================

class TestFraudDetectionEndpoints:
    @pytest.mark.asyncio
    async def test_analyze_candidate(self, client: AsyncClient):
        r = await client.post("/api/v1/fraud/analyze?candidate_id=c1")
        assert r.status_code == 200
        assert r.json()["risk_level"] == "low"

    @pytest.mark.asyncio
    async def test_get_fraud_patterns(self, client: AsyncClient):
        r = await client.get("/api/v1/fraud/patterns")
        assert r.status_code == 200
        assert "patterns" in r.json()


# ============================================================================
# 20. Compliance Automation Service
# ============================================================================

class TestComplianceAutomationEndpoints:
    @pytest.mark.asyncio
    async def test_get_compliance_status(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance-automation/status")
        assert r.status_code == 200
        assert r.json()["overall_status"] == "compliant"

    @pytest.mark.asyncio
    async def test_run_audit(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance-automation/audit")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_data_retention(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance-automation/data-retention")
        assert r.status_code == 200
        assert "policies" in r.json()

    @pytest.mark.asyncio
    async def test_gdpr_export(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance-automation/gdpr/export?candidate_id=c1")
        assert r.status_code == 200
        assert "export_url" in r.json()


# ============================================================================
# 21. AI Evaluation Service
# ============================================================================

class TestAIEvaluationEndpoints:
    @pytest.mark.asyncio
    async def test_evaluate_candidate(self, client: AsyncClient):
        r = await client.post("/api/v1/ai-evaluation/evaluate", json={
            "candidate_id": "c1",
        })
        assert r.status_code == 200
        assert "overall_score" in r.json()

    @pytest.mark.asyncio
    async def test_get_candidate_evaluations(self, client: AsyncClient):
        r = await client.get("/api/v1/ai-evaluation/evaluations/c1")
        assert r.status_code == 200
        assert "evaluations" in r.json()

    @pytest.mark.asyncio
    async def test_explain_evaluation(self, client: AsyncClient):
        r = await client.get("/api/v1/ai-evaluation/evaluations/eval_1/explain")
        assert r.status_code == 200
        assert "reasoning" in r.json()

    @pytest.mark.asyncio
    async def test_compare_candidates(self, client: AsyncClient):
        r = await client.post("/api/v1/ai-evaluation/compare", json=["c1", "c2"])
        assert r.status_code == 200
        assert "comparison" in r.json()

    @pytest.mark.asyncio
    async def test_get_benchmarks(self, client: AsyncClient):
        r = await client.get("/api/v1/ai-evaluation/benchmarks")
        assert r.status_code == 200
        assert "benchmarks" in r.json()


# ============================================================================
# 22. Talent Intelligence Service
# ============================================================================

class TestTalentIntelligenceEndpoints:
    @pytest.mark.asyncio
    async def test_market_insights(self, client: AsyncClient):
        r = await client.get("/api/v1/talent-intelligence/market-insights")
        assert r.status_code == 200
        assert "insights" in r.json()

    @pytest.mark.asyncio
    async def test_competitor_analysis(self, client: AsyncClient):
        r = await client.get("/api/v1/talent-intelligence/competitor-analysis")
        assert r.status_code == 200
        assert "competitors" in r.json()

    @pytest.mark.asyncio
    async def test_salary_benchmarks(self, client: AsyncClient):
        r = await client.get("/api/v1/talent-intelligence/salary-benchmarks")
        assert r.status_code == 200
        assert "benchmarks" in r.json()

    @pytest.mark.asyncio
    async def test_talent_pool(self, client: AsyncClient):
        r = await client.get("/api/v1/talent-intelligence/talent-pool")
        assert r.status_code == 200
        assert "total_candidates" in r.json()


# ============================================================================
# 23. Workflow Automation Service
# ============================================================================

class TestWorkflowAutomationEndpoints:
    @pytest.mark.asyncio
    async def test_list_templates(self, client: AsyncClient):
        r = await client.get("/api/v1/workflow-automation/templates")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_triggers(self, client: AsyncClient):
        r = await client.get("/api/v1/workflow-automation/triggers")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_executions(self, client: AsyncClient):
        r = await client.get("/api/v1/workflow-automation/executions/w1")
        assert r.status_code == 200
        assert "executions" in r.json()


# ============================================================================
# 24. SSO Service
# ============================================================================

class TestSSOEndpoints:
    @pytest.mark.asyncio
    async def test_list_providers(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/providers")
        assert r.status_code == 200
        assert len(r.json()["providers"]) >= 1

    @pytest.mark.asyncio
    async def test_authorize_url(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/providers/google/authorize?redirect_uri=http://localhost&state=test")
        assert r.status_code == 200
        assert "authorization_url" in r.json()

    @pytest.mark.asyncio
    async def test_sso_callback(self, client: AsyncClient):
        r = await client.post("/api/v1/sso/providers/google/callback", json={
            "provider": "google",
            "code": "test_code",
            "redirect_uri": "http://localhost",
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    @pytest.mark.asyncio
    async def test_get_userinfo(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/providers/google/userinfo")
        assert r.status_code == 200
        assert "userinfo" in r.json()

    @pytest.mark.asyncio
    async def test_unlink_provider(self, client: AsyncClient):
        r = await client.post("/api/v1/sso/providers/google/unlink?user_id=u1")
        assert r.status_code == 200
        assert r.json()["unlinked"] is True


# ============================================================================
# 25. Innovation Service
# ============================================================================

class TestInnovationEndpoints:
    @pytest.mark.asyncio
    async def test_detect_bias(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/bias-detection?text=He+is+a+strong+candidate")
        assert r.status_code == 200
        assert "bias_score" in r.json()

    @pytest.mark.asyncio
    async def test_predict_success(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/predict-success?candidate_id=c1&job_id=j1")
        assert r.status_code == 200
        assert "success_probability" in r.json()

    @pytest.mark.asyncio
    async def test_smart_schedule(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/smart-schedule?candidate_id=c1&job_id=j1&interview_type=technical")
        assert r.status_code == 200
        assert "optimal_slots" in r.json()

    @pytest.mark.asyncio
    async def test_skills_gap(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/skills-gap?candidate_id=c1&job_id=j1")
        assert r.status_code == 200
        assert "missing_skills" in r.json()

    @pytest.mark.asyncio
    async def test_diversity_report(self, client: AsyncClient):
        r = await client.get("/api/v1/innovations/diversity-report")
        assert r.status_code == 200
        assert "gender_distribution" in r.json()

    @pytest.mark.asyncio
    async def test_video_analysis(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/video-analysis?interview_id=i1")
        assert r.status_code == 200
        assert r.json()["consent_verified"] is True

    @pytest.mark.asyncio
    async def test_recruiter_assist(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/recruiter-assist?recruiter_id=u1&task_type=email_drafting")
        assert r.status_code == 200
        assert "suggestions" in r.json()

    @pytest.mark.asyncio
    async def test_candidate_experience(self, client: AsyncClient):
        r = await client.get("/api/v1/innovations/candidate-experience/c1")
        assert r.status_code == 200
        assert "timeline" in r.json()
