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
from unittest.mock import AsyncMock, patch, MagicMock


@pytest.fixture(scope="session")
def event_loop():
    import asyncio
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


def _make_mock_session():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.delete = AsyncMock()
    session.add = MagicMock()
    return session


@pytest_asyncio.fixture(scope="module")
async def client():
    from main import app
    from shared.core.database import get_db_dependency

    mock_session = _make_mock_session()

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db_dependency] = override_db

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
    async def test_candidate_health(self, client: AsyncClient):
        r = await client.get("/api/v1/candidates/health")
        assert r.status_code == 200
        assert r.json()["service"] == "candidate"

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
    async def test_sso_health(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/health")
        assert r.status_code == 200
        assert r.json()["service"] == "sso"

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
        from shared.core.database import get_db_dependency

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_user = MagicMock()
        mock_user.id = "u_new"
        mock_user.email = "user@acme.com"
        mock_user.full_name = "Jane Recruiter"
        mock_user.role = MagicMock(value="candidate")

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()
        mock_session.refresh = AsyncMock()
        mock_session.add = MagicMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

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
    async def test_register_duplicate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_result = MagicMock()
        existing_user = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_user

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.post("/api/v1/auth/register", json={
            "email": "dup@acme.com",
            "full_name": "Dup User",
            "password": "SecureP@ss123",
            "role": "candidate",
        })
        assert r.status_code == 409

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
        r = await client.post("/api/v1/auth/mfa/verify", json={"code": "123456"})
        assert r.status_code == 200
        assert r.json()["verified"] is True


# ============================================================================
# 3. Candidate Service
# ============================================================================

class TestCandidateEndpoints:
    @pytest.mark.asyncio
    async def test_list_candidates(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0

        mock_list_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_list_result.scalars.return_value = mock_scalars

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_count_result, mock_list_result])

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/candidates/")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert body["total"] == 0

    @pytest.mark.asyncio
    async def test_create_candidate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_existing = MagicMock()
        mock_existing.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_existing)
        mock_session.flush = AsyncMock()
        mock_session.refresh = AsyncMock()
        mock_session.add = MagicMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.post("/api/v1/candidates/", json={
            "email": "new@email.com",
            "full_name": "New Candidate",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["created"] is True

    @pytest.mark.asyncio
    async def test_get_candidate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_candidate = MagicMock()
        mock_candidate.id = "c1"
        mock_candidate.email = "test@email.com"
        mock_candidate.full_name = "Test User"
        mock_candidate.phone = None
        mock_candidate.location = "NYC"
        mock_candidate.linkedin_url = None
        mock_candidate.status = MagicMock(value="new")
        mock_candidate.source = "linkedin"
        mock_candidate.notes = None
        mock_candidate.created_at = "2025-01-01T00:00:00Z"
        mock_candidate.updated_at = "2025-01-01T00:00:00Z"

        mock_candidate_result = MagicMock()
        mock_candidate_result.scalar_one_or_none.return_value = mock_candidate

        mock_profile = MagicMock()
        mock_profile.summary = "Senior engineer"
        mock_profile.seniority_level = "senior"
        mock_profile.years_experience = 8
        mock_profile.domains = '["backend", "distributed"]'
        mock_profile.education = "BS CS"
        mock_profile.languages = "English"

        mock_profile_result = MagicMock()
        mock_profile_result.scalar_one_or_none.return_value = mock_profile

        mock_skills_result = MagicMock()
        mock_skills_result.all.return_value = []

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_candidate_result, mock_profile_result, mock_skills_result])

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/candidates/c1")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == "c1"

    @pytest.mark.asyncio
    async def test_get_candidate_not_found(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/candidates/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_update_candidate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_candidate = MagicMock()
        mock_candidate.id = "c1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_candidate

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()
        mock_session.add = MagicMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.put("/api/v1/candidates/c1", json={"full_name": "Updated Name"})
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] is True

    @pytest.mark.asyncio
    async def test_delete_candidate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_candidate = MagicMock()
        mock_candidate.id = "c1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_candidate

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.delete = AsyncMock()
        mock_session.flush = AsyncMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.delete("/api/v1/candidates/c1")
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] is True

    @pytest.mark.asyncio
    async def test_enrich_candidate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_candidate = MagicMock()
        mock_candidate.id = "c1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_candidate

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.post("/api/v1/candidates/c1/enrich")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "processing"
        assert body["candidate_id"] == "c1"

    @pytest.mark.asyncio
    async def test_match_candidate(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_candidate = MagicMock()
        mock_candidate.id = "c1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_candidate

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.post("/api/v1/candidates/c1/match")
        assert r.status_code == 200
        body = r.json()
        assert "matches" in body
        assert body["candidate_id"] == "c1"


# ============================================================================
# 4. Job Service
# ============================================================================

class TestJobEndpoints:
    @pytest.mark.asyncio
    async def test_list_jobs(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_count_result = MagicMock()
        mock_count_result.scalar_one.return_value = 0

        mock_list_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_list_result.scalars.return_value = mock_scalars

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(side_effect=[mock_count_result, mock_list_result])

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/jobs/")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert body["total"] == 0

    @pytest.mark.asyncio
    async def test_create_job(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_existing = MagicMock()
        mock_existing.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_existing)
        mock_session.flush = AsyncMock()
        mock_session.refresh = AsyncMock()
        mock_session.add = MagicMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.post("/api/v1/jobs/", json={
            "title": "New Job",
            "description": "Job description",
            "department": "Engineering",
            "location": "Remote",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["created"] is True

    @pytest.mark.asyncio
    async def test_get_job(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_job = MagicMock()
        mock_job.id = "j1"
        mock_job.title = "Senior Engineer"
        mock_job.description = "Build things"
        mock_job.department = "Engineering"
        mock_job.location = "Remote"
        mock_job.remote_policy = "hybrid"
        mock_job.job_type = MagicMock(value="full_time")
        mock_job.seniority_required = "senior"
        mock_job.salary_min = 100000
        mock_job.salary_max = 200000
        mock_job.currency = "USD"
        mock_job.required_skills = "[]"
        mock_job.preferred_skills = "[]"
        mock_job.status = MagicMock(value="open")
        mock_job.applicants_count = 5
        mock_job.created_at = "2025-01-01T00:00:00Z"
        mock_job.updated_at = "2025-01-01T00:00:00Z"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/jobs/j1")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == "j1"

    @pytest.mark.asyncio
    async def test_get_job_not_found(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/jobs/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_update_job(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_job = MagicMock()
        mock_job.id = "j1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.flush = AsyncMock()
        mock_session.add = MagicMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.put("/api/v1/jobs/j1", json={"title": "Updated Title"})
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] is True

    @pytest.mark.asyncio
    async def test_delete_job(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_job = MagicMock()
        mock_job.id = "j1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.delete = AsyncMock()
        mock_session.flush = AsyncMock()

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.delete("/api/v1/jobs/j1")
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] is True

    @pytest.mark.asyncio
    async def test_get_matched_candidates(self, client: AsyncClient):
        from shared.core.database import get_db_dependency

        mock_job = MagicMock()
        mock_job.id = "j1"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_job

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(return_value=mock_result)

        async def override_db():
            yield mock_session

        client._transport.app.dependency_overrides[get_db_dependency] = override_db

        r = await client.get("/api/v1/jobs/j1/candidates")
        assert r.status_code == 200
        body = r.json()
        assert "matched_candidates" in body
        assert body["job_id"] == "j1"


# ============================================================================
# 5. Interview Service
# ============================================================================

class TestInterviewEndpoints:
    @pytest.mark.asyncio
    async def test_list_interviews(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert "total" in body

    @pytest.mark.asyncio
    async def test_list_interviews_filter_candidate(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/?candidate_id=c1")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_interviews_filter_job(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/?job_id=j1")
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
            "interview_type": "pair_programming",
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
        body = r.json()
        assert "transcript" in body
        assert "total_messages" in body

    @pytest.mark.asyncio
    async def test_get_interview_analytics(self, client: AsyncClient):
        r = await client.get("/api/v1/interviews/i1/analytics")
        assert r.status_code == 200
        assert "analytics" in r.json()


# ============================================================================
# 6. PPE Service
# ============================================================================

class TestPPEEndpoints:
    @pytest.mark.asyncio
    async def test_list_problems(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/problems")
        assert r.status_code == 200
        body = r.json()
        assert "problems" in body
        assert body["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_problems_filter_difficulty(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/problems?difficulty=easy")
        assert r.status_code == 200
        for p in r.json()["problems"]:
            assert p["difficulty"] == "easy"

    @pytest.mark.asyncio
    async def test_get_problem(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/problems/p1")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == "p1"
        assert body["title"] == "Two Sum"
        assert "starter_code" in body

    @pytest.mark.asyncio
    async def test_get_problem_not_found(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/problems/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_create_session(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "p1",
            "language": "python",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "created"
        assert body["problem_id"] == "p1"

    @pytest.mark.asyncio
    async def test_create_session_invalid_problem(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "nonexistent",
        })
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_session(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "p1",
            "language": "python",
        })
        session_id = create_resp.json()["id"]

        r = await client.get(f"/api/v1/ppe/sessions/{session_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == session_id
        assert body["problem_title"] == "Two Sum"

    @pytest.mark.asyncio
    async def test_get_session_not_found(self, client: AsyncClient):
        r = await client.get("/api/v1/ppe/sessions/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_execute_code(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "p1",
            "language": "python",
        })
        session_id = create_resp.json()["id"]

        r = await client.post(f"/api/v1/ppe/sessions/{session_id}/execute", json={
            "code": "def two_sum(nums, target):\n    d = {}\n    for i, n in enumerate(nums):\n        if target - n in d:\n            return [d[target - n], i]\n        d[n] = i\n",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["session_id"] == session_id
        assert "execution" in body
        assert body["execution"]["exit_code"] == 0

    @pytest.mark.asyncio
    async def test_execute_code_session_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions/nonexistent/execute", json={
            "code": "pass",
        })
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_request_hint(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "p1",
            "language": "python",
        })
        session_id = create_resp.json()["id"]

        r = await client.post(f"/api/v1/ppe/sessions/{session_id}/hint")
        assert r.status_code == 200
        body = r.json()
        assert "hint" in body
        assert body["hint_number"] == 1

    @pytest.mark.asyncio
    async def test_request_hint_with_index(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "p1",
            "language": "python",
        })
        session_id = create_resp.json()["id"]

        r = await client.post(f"/api/v1/ppe/sessions/{session_id}/hint", json={
            "hint_index": 1,
        })
        assert r.status_code == 200
        assert r.json()["hint_number"] == 2

    @pytest.mark.asyncio
    async def test_request_hint_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/ppe/sessions/nonexistent/hint")
        assert r.status_code == 404


# ============================================================================
# 7. AI Orchestrator
# ============================================================================

class TestAIOrchestratorEndpoints:
    @pytest.mark.asyncio
    async def test_list_agents(self, client: AsyncClient):
        r = await client.get("/api/v1/ai/agents")
        assert r.status_code == 200
        body = r.json()
        assert "agents" in body
        assert body["total"] >= 1

    @pytest.mark.asyncio
    async def test_orchestrate_resume_parsing(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "resume_parsing",
            "input": {"resume_text": "John Smith, Python developer"},
        })
        assert r.status_code == 200
        body = r.json()
        assert "task_id" in body
        assert body["status"] == "completed"
        assert body["agent_type"] == "resume_parsing"

    @pytest.mark.asyncio
    async def test_orchestrate_skill_extraction(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "skill_extraction",
            "input": {"text": "Python, PostgreSQL, Kubernetes"},
        })
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_orchestrate_candidate_profiling(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "candidate_profiling",
            "input": {"candidate_id": "c1"},
        })
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_orchestrate_ppe_evaluation(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "ppe_evaluation",
            "input": {"session_id": "ppe_1"},
        })
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_orchestrate_hr_interview(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "hr_interview",
            "input": {"candidate_id": "c1"},
        })
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_orchestrate_technical_interview(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "technical_interview",
            "input": {"candidate_id": "c1"},
        })
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

    @pytest.mark.asyncio
    async def test_orchestrate_agent_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "nonexistent_agent",
            "input": {},
        })
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_create_task(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/tasks", json={
            "agent_type": "resume_parsing",
            "payload": {"resume_text": "Jane Doe, ML Engineer"},
        })
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "queued"
        assert "task_id" in body

    @pytest.mark.asyncio
    async def test_create_task_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/ai/tasks", json={
            "agent_type": "nonexistent",
            "payload": {},
        })
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_task(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/ai/tasks", json={
            "agent_type": "resume_parsing",
            "payload": {"text": "test"},
        })
        task_id = create_resp.json()["task_id"]

        r = await client.get(f"/api/v1/ai/tasks/{task_id}")
        assert r.status_code == 200
        assert r.json()["task_id"] == task_id

    @pytest.mark.asyncio
    async def test_get_task_not_found(self, client: AsyncClient):
        r = await client.get("/api/v1/ai/tasks/nonexistent")
        assert r.status_code == 404


# ============================================================================
# 8. Analytics Service
# ============================================================================

class TestAnalyticsEndpoints:
    @pytest.mark.asyncio
    async def test_dashboard(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/dashboard")
        assert r.status_code == 200
        body = r.json()
        assert "metrics" in body
        assert "trends" in body

    @pytest.mark.asyncio
    async def test_dashboard_time_range(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/dashboard?time_range=30d&department=engineering")
        assert r.status_code == 200
        assert r.json()["time_range"] == "30d"

    @pytest.mark.asyncio
    async def test_pipeline(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/pipeline")
        assert r.status_code == 200
        body = r.json()
        assert "pipeline" in body
        assert body["department"] == "engineering"

    @pytest.mark.asyncio
    async def test_pipeline_custom(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/pipeline?department=marketing&days=60")
        assert r.status_code == 200
        body = r.json()
        assert body["department"] == "marketing"
        assert body["days"] == 60

    @pytest.mark.asyncio
    async def test_ai_performance(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/ai-performance")
        assert r.status_code == 200
        body = r.json()
        assert "metrics" in body
        assert "overall_score" in body

    @pytest.mark.asyncio
    async def test_ai_performance_filtered(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/ai-performance?agent_type=resume_parsing")
        assert r.status_code == 200
        assert len(r.json()["metrics"]) == 1

    @pytest.mark.asyncio
    async def test_recruiter_productivity(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/recruiter-productivity")
        assert r.status_code == 200
        assert len(r.json()["recruiters"]) >= 1

    @pytest.mark.asyncio
    async def test_time_to_hire(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/time-to-hire")
        assert r.status_code == 200
        body = r.json()
        assert "average_days" in body
        assert "by_stage" in body

    @pytest.mark.asyncio
    async def test_generate_report(self, client: AsyncClient):
        r = await client.post("/api/v1/analytics/reports?report_type=monthly")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "generating"

    @pytest.mark.asyncio
    async def test_get_report(self, client: AsyncClient):
        r = await client.get("/api/v1/analytics/reports/report_20250101")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


# ============================================================================
# 9. Workflow Engine
# ============================================================================

class TestWorkflowEndpoints:
    @pytest.mark.asyncio
    async def test_list_workflows(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/")
        assert r.status_code == 200
        body = r.json()
        assert "workflows" in body
        assert body["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_workflows_filter(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/?status=active")
        assert r.status_code == 200
        for w in r.json()["workflows"]:
            assert w["status"] == "active"

    @pytest.mark.asyncio
    async def test_get_workflow(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/w2")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == "w2"

    @pytest.mark.asyncio
    async def test_get_workflow_not_found(self, client: AsyncClient):
        r = await client.get("/api/v1/workflows/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_create_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/", json={
            "name": "New Workflow",
            "trigger": "candidate.created",
            "steps": [{"order": 1, "type": "notification", "name": "Notify"}],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "New Workflow"
        assert body["status"] == "draft"

    @pytest.mark.asyncio
    async def test_update_workflow(self, client: AsyncClient):
        r = await client.put("/api/v1/workflows/w3", json={"name": "Updated PPE Pipeline"})
        assert r.status_code == 200
        assert r.json()["name"] == "Updated PPE Pipeline"

    @pytest.mark.asyncio
    async def test_update_workflow_not_found(self, client: AsyncClient):
        r = await client.put("/api/v1/workflows/nonexistent", json={"name": "test"})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_workflow(self, client: AsyncClient):
        # Create one to delete
        create_resp = await client.post("/api/v1/workflows/", json={
            "name": "To Delete",
            "trigger": "test.event",
        })
        wf_id = create_resp.json()["id"]

        r = await client.delete(f"/api/v1/workflows/{wf_id}")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_delete_workflow_not_found(self, client: AsyncClient):
        r = await client.delete("/api/v1/workflows/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_trigger_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/w2/trigger")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "completed"
        assert "execution_id" in body

    @pytest.mark.asyncio
    async def test_trigger_workflow_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/nonexistent/trigger")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_activate_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/w2/activate")
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_activate_workflow_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/nonexistent/activate")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_deactivate_workflow(self, client: AsyncClient):
        r = await client.post("/api/v1/workflows/w2/deactivate")
        assert r.status_code == 200
        assert r.json()["status"] == "inactive"

    @pytest.mark.asyncio
    async def test_list_executions(self, client: AsyncClient):
        # Trigger first to create an execution
        await client.post("/api/v1/workflows/w2/trigger")

        r = await client.get("/api/v1/workflows/w2/executions")
        assert r.status_code == 200
        body = r.json()
        assert "executions" in body


# ============================================================================
# 10. Notification Service
# ============================================================================

class TestNotificationEndpoints:
    @pytest.mark.asyncio
    async def test_list_notifications(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/")
        assert r.status_code == 200
        body = r.json()
        assert "notifications" in body
        assert "total" in body
        assert "unread_count" in body

    @pytest.mark.asyncio
    async def test_list_notifications_filter_read(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/?read=false")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_notifications_filter_type(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/?type=info")
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_get_notification(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/n1")
        assert r.status_code == 200
        assert r.json()["id"] == "n1"

    @pytest.mark.asyncio
    async def test_get_notification_not_found(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_create_notification(self, client: AsyncClient):
        r = await client.post("/api/v1/notifications/", json={
            "title": "Test Notification",
            "message": "Hello World",
            "type": "info",
            "channel": "in_app",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Test Notification"
        assert body["read"] is False

    @pytest.mark.asyncio
    async def test_update_notification(self, client: AsyncClient):
        r = await client.put("/api/v1/notifications/n1", json={
            "title": "Updated Title",
            "read": True,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "Updated Title"
        assert body["read"] is True

    @pytest.mark.asyncio
    async def test_update_notification_not_found(self, client: AsyncClient):
        r = await client.put("/api/v1/notifications/nonexistent", json={"title": "test"})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_notification(self, client: AsyncClient):
        r = await client.delete("/api/v1/notifications/n1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True

    @pytest.mark.asyncio
    async def test_delete_notification_not_found(self, client: AsyncClient):
        r = await client.delete("/api/v1/notifications/nonexistent")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_read(self, client: AsyncClient):
        r = await client.post("/api/v1/notifications/n3/read")
        assert r.status_code == 200
        assert r.json()["read"] is True

    @pytest.mark.asyncio
    async def test_mark_read_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/notifications/nonexistent/read")
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_mark_all_read(self, client: AsyncClient):
        r = await client.post("/api/v1/notifications/read-all")
        assert r.status_code == 200
        assert "marked_read" in r.json()

    @pytest.mark.asyncio
    async def test_get_preferences(self, client: AsyncClient):
        r = await client.get("/api/v1/notifications/preferences")
        assert r.status_code == 200
        body = r.json()
        assert "email" in body
        assert "push" in body

    @pytest.mark.asyncio
    async def test_update_preferences(self, client: AsyncClient):
        r = await client.put("/api/v1/notifications/preferences", json={
            "email": False,
            "digest_frequency": "weekly",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["email"] is False
        assert body["digest_frequency"] == "weekly"


# ============================================================================
# 11. SSO Service
# ============================================================================

class TestSSOEndpoints:
    @pytest.mark.asyncio
    async def test_list_providers(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/providers")
        assert r.status_code == 200
        body = r.json()
        assert "providers" in body
        assert body["total"] >= 1
        provider_ids = [p["id"] for p in body["providers"]]
        assert "google" in provider_ids
        assert "microsoft" in provider_ids
        assert "linkedin" in provider_ids
        assert "apple" in provider_ids

    @pytest.mark.asyncio
    async def test_authorize_url(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/sso/providers/google/authorize",
            params={"redirect_uri": "http://localhost:3000/callback", "state": "test123"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["provider"] == "google"
        assert "authorization_url" in body

    @pytest.mark.asyncio
    async def test_authorize_url_not_found(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/sso/providers/nonexistent/authorize",
            params={"redirect_uri": "http://localhost"},
        )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_sso_callback(self, client: AsyncClient):
        r = await client.post("/api/v1/sso/providers/google/callback", json={
            "code": "auth_code_123",
            "state": "test123",
        })
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["provider"] == "google"
        assert body["is_new_user"] is True

    @pytest.mark.asyncio
    async def test_sso_callback_not_found(self, client: AsyncClient):
        r = await client.post("/api/v1/sso/providers/nonexistent/callback", json={
            "code": "test",
        })
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_userinfo(self, client: AsyncClient):
        # Get a token via callback
        callback_resp = await client.post("/api/v1/sso/providers/google/callback", json={
            "code": "test_code",
        })
        token = callback_resp.json()["access_token"]

        r = await client.get(
            "/api/v1/sso/userinfo",
            params={"authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "user" in body
        assert body["provider"] == "google"

    @pytest.mark.asyncio
    async def test_get_userinfo_no_token(self, client: AsyncClient):
        r = await client.get("/api/v1/sso/userinfo")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_userinfo_invalid_token(self, client: AsyncClient):
        r = await client.get(
            "/api/v1/sso/userinfo",
            params={"authorization": "Bearer invalid_token"},
        )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_unlink_provider(self, client: AsyncClient):
        # Link first
        callback_resp = await client.post("/api/v1/sso/providers/linkedin/callback", json={
            "code": "test_code",
        })
        token = callback_resp.json()["access_token"]

        r = await client.delete(
            "/api/v1/sso/unlink/linkedin",
            params={"authorization": f"Bearer {token}"},
        )
        assert r.status_code == 200
        assert r.json()["unlinked"] is True

    @pytest.mark.asyncio
    async def test_unlink_no_token(self, client: AsyncClient):
        r = await client.delete("/api/v1/sso/unlink/google")
        assert r.status_code == 401


# ============================================================================
# 12. Compliance Service
# ============================================================================

class TestComplianceEndpoints:
    @pytest.mark.asyncio
    async def test_compliance_status(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/status")
        assert r.status_code == 200
        body = r.json()
        assert body["overall_status"] == "compliant"
        assert "gdpr" in body["frameworks"]

    @pytest.mark.asyncio
    async def test_list_policies(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/policies")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert body["total"] >= 1

    @pytest.mark.asyncio
    async def test_list_consent(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/consent")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body

    @pytest.mark.asyncio
    async def test_record_consent(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/consent", json={
            "candidate_id": "c1",
            "type": "data_processing",
            "granted": True,
            "purpose": "Recruitment evaluation",
        })
        assert r.status_code == 200
        assert r.json()["recorded"] is True

    @pytest.mark.asyncio
    async def test_audit_log(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/audit")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body

    @pytest.mark.asyncio
    async def test_create_audit_entry(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/audit", params={
            "action": "candidate.created",
            "actor": "test@acme.com",
            "resource": "candidate",
            "resource_id": "c1",
        })
        assert r.status_code == 200
        assert r.json()["action"] == "candidate.created"

    @pytest.mark.asyncio
    async def test_data_retention(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/retention")
        assert r.status_code == 200
        assert "policies" in r.json()

    @pytest.mark.asyncio
    async def test_data_export(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/export", json={
            "candidate_id": "c1",
            "format": "json",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

    @pytest.mark.asyncio
    async def test_data_deletion(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/deletion", json={
            "candidate_id": "c1",
            "reason": "user_request",
            "confirm": True,
        })
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

    @pytest.mark.asyncio
    async def test_compliance_check(self, client: AsyncClient):
        r = await client.post("/api/v1/compliance/check", json={"framework": "gdpr"})
        assert r.status_code == 200
        body = r.json()
        assert body["framework"] == "gdpr"
        assert body["passed"] > 0

    @pytest.mark.asyncio
    async def test_compliance_report(self, client: AsyncClient):
        r = await client.get("/api/v1/compliance/report", params={"period": "2025-01"})
        assert r.status_code == 200
        body = r.json()
        assert "overall_score" in body


# ============================================================================
# 13. Billing Service
# ============================================================================

class TestBillingEndpoints:
    @pytest.mark.asyncio
    async def test_list_plans(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/plans")
        assert r.status_code == 200
        body = r.json()
        assert "data" in body
        assert body["total"] == 4

    @pytest.mark.asyncio
    async def test_get_subscription(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/subscription")
        assert r.status_code == 200
        body = r.json()
        assert body["plan"] == "enterprise"

    @pytest.mark.asyncio
    async def test_subscribe(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/subscribe", json={
            "plan": "pro",
            "seats": 10,
            "billing_cycle": "monthly",
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_list_invoices(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/invoices")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_invoice(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/invoices/inv_001")
        assert r.status_code == 200
        body = r.json()
        assert "line_items" in body

    @pytest.mark.asyncio
    async def test_get_usage(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/usage")
        assert r.status_code == 200
        assert "ai_tokens" in r.json()

    @pytest.mark.asyncio
    async def test_list_payment_methods(self, client: AsyncClient):
        r = await client.get("/api/v1/billing/payment-methods")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

    @pytest.mark.asyncio
    async def test_add_payment_method(self, client: AsyncClient):
        r = await client.post("/api/v1/billing/payment-methods", json={
            "type": "card",
            "last_four": "5678",
            "exp_month": 12,
            "exp_year": 2026,
        })
        assert r.status_code == 200
        assert r.json()["created"] is True

    @pytest.mark.asyncio
    async def test_delete_payment_method(self, client: AsyncClient):
        r = await client.delete("/api/v1/billing/payment-methods/pm_1")
        assert r.status_code == 200
        assert r.json()["deleted"] is True


# ============================================================================
# 14. Vector Search Service
# ============================================================================

class TestVectorSearchEndpoints:
    @pytest.mark.asyncio
    async def test_search_candidates(self, client: AsyncClient):
        r = await client.post("/api/v1/search/candidates", json={
            "query": "Python",
            "top_k": 5,
        })
        assert r.status_code == 200
        body = r.json()
        assert "results" in body
        assert "total" in body

    @pytest.mark.asyncio
    async def test_search_jobs(self, client: AsyncClient):
        r = await client.post("/api/v1/search/jobs", json={
            "query": "Engineer",
            "top_k": 5,
        })
        assert r.status_code == 200
        assert "results" in r.json()

    @pytest.mark.asyncio
    async def test_generate_embedding(self, client: AsyncClient):
        r = await client.post("/api/v1/search/embeddings", json={
            "text": "Senior Python developer",
        })
        assert r.status_code == 200
        assert r.json()["dimension"] == 3072

    @pytest.mark.asyncio
    async def test_get_embedding(self, client: AsyncClient):
        create_resp = await client.post("/api/v1/search/embeddings", json={
            "text": "Test text for embedding",
        })
        emb_id = create_resp.json()["embedding_id"]

        r = await client.get(f"/api/v1/search/embeddings/{emb_id}")
        assert r.status_code == 200
        assert "dimension" in r.json()

    @pytest.mark.asyncio
    async def test_similarity_search(self, client: AsyncClient):
        r = await client.post("/api/v1/search/similarity", json={
            "vector": [0.1, 0.8, 0.3],
            "top_k": 5,
        })
        assert r.status_code == 200
        assert "results" in r.json()


# ============================================================================
# 15. Innovation Service
# ============================================================================

class TestInnovationEndpoints:
    @pytest.mark.asyncio
    async def test_detect_bias(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/bias-detection", json={
            "text": "He is a strong candidate who will lead the team.",
        })
        assert r.status_code == 200
        body = r.json()
        assert "bias_score" in body
        assert body["bias_level"] == "low"
        assert "issues" in body

    @pytest.mark.asyncio
    async def test_predict_success(self, client: AsyncClient):
        r = await client.post("/api/v1/innovations/predict-success", json={
            "candidate_id": "c1",
            "job_id": "j1",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["candidate_id"] == "c1"
        assert "success_probability" in body

    @pytest.mark.asyncio
    async def test_smart_schedule(self, client: AsyncClient):
        r = await client.post(
            "/api/v1/innovations/smart-schedule",
            params={"candidate_id": "c1", "job_id": "j1", "interview_type": "technical"},
        )
        assert r.status_code == 200
        assert "optimal_slots" in r.json()

    @pytest.mark.asyncio
    async def test_skills_gap(self, client: AsyncClient):
        r = await client.post(
            "/api/v1/innovations/skills-gap",
            params={"candidate_id": "c1", "job_id": "j1"},
        )
        assert r.status_code == 200
        body = r.json()
        assert "matching_skills" in body
        assert "missing_skills" in body

    @pytest.mark.asyncio
    async def test_diversity_report(self, client: AsyncClient):
        r = await client.get("/api/v1/innovations/diversity-report")
        assert r.status_code == 200
        assert "gender_distribution" in r.json()

    @pytest.mark.asyncio
    async def test_video_analysis(self, client: AsyncClient):
        r = await client.post(
            "/api/v1/innovations/video-analysis",
            params={"interview_id": "i1"},
        )
        assert r.status_code == 200
        assert r.json()["consent_verified"] is True

    @pytest.mark.asyncio
    async def test_recruiter_assist(self, client: AsyncClient):
        r = await client.post(
            "/api/v1/innovations/recruiter-assist",
            params={"recruiter_id": "u1", "task_type": "email_drafting"},
        )
        assert r.status_code == 200
        assert "suggestions" in r.json()

    @pytest.mark.asyncio
    async def test_candidate_experience(self, client: AsyncClient):
        r = await client.get("/api/v1/innovations/candidate-experience/c1")
        assert r.status_code == 200
        body = r.json()
        assert body["candidate_id"] == "c1"
        assert "timeline" in body
