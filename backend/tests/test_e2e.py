"""End-to-end integration tests for AI-ROS.

Tests complete multi-step workflows across all services using an in-memory SQLite database.
"""
from __future__ import annotations

import asyncio
import sys
import os
from typing import Generator, AsyncGenerator

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlmodel import SQLModel

from shared.core.database import get_db_dependency


# ── Database Fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="module")
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="module")
async def client(db_engine) -> AsyncGenerator[AsyncClient, None]:
    from main import app

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_db():
        async with session_factory() as session:
            yield session
            await session.commit()

    app.dependency_overrides[get_db_dependency] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def _reset_ppe_sessions():
    """Reset PPE in-memory store so each test starts fresh."""
    import apps.ppe_service.main as ppe_mod
    ppe_mod.SESSIONS_DB.clear()


def _reset_ai_tasks():
    """Reset AI tasks in-memory store."""
    import apps.ai_orchestrator.main as ai_mod
    ai_mod.TASKS_DB.clear()


def _reset_workflows():
    """Reset workflow executions in-memory store."""
    import apps.workflow_engine.main as wf_mod
    wf_mod.EXECUTIONS_DB.clear()


def _reset_notifications():
    """Reset notification DB to seed data."""
    import apps.notification_service.main as notif_mod
    notif_mod.NOTIFICATIONS_DB.clear()
    notif_mod.NOTIFICATIONS_DB["n1"] = {
        "id": "n1", "title": "New Application", "message": "John Smith applied",
        "type": "info", "channel": "in_app", "read": False, "created_at": "2025-01-20T10:30:00Z",
    }


# ============================================================================
# Flow 1 — Auth
# ============================================================================

class TestFlowAuth:
    """Register -> Login -> Refresh -> Logout"""

    @pytest.mark.asyncio
    async def test_full_auth_flow(self, client: AsyncClient):
        # 1. Register
        r = await client.post("/api/v1/auth/register", json={
            "email": "flow1@acme.com",
            "full_name": "Flow One User",
            "password": "SecureP@ss123",
            "role": "recruiter",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["created"] is True
        assert body["email"] == "flow1@acme.com"

        # 2. Login
        r = await client.post("/api/v1/auth/login", json={
            "email": "flow1@acme.com",
            "password": "SecureP@ss123",
        })
        assert r.status_code == 200
        login_body = r.json()
        assert "access_token" in login_body
        assert "refresh_token" in login_body
        assert login_body["token_type"] == "bearer"
        refresh_token = login_body["refresh_token"]

        # 3. Refresh token
        r = await client.post("/api/v1/auth/refresh", json={
            "refresh_token": refresh_token,
        })
        assert r.status_code == 200
        assert "access_token" in r.json()
        assert r.json()["expires_in"] > 0

        # 4. Logout
        r = await client.post("/api/v1/auth/logout", json={
            "refresh_token": refresh_token,
        })
        assert r.status_code == 200
        assert r.json()["logged_out"] is True

    @pytest.mark.asyncio
    async def test_register_duplicate_conflict(self, client: AsyncClient):
        # Register first time
        r = await client.post("/api/v1/auth/register", json={
            "email": "dup@acme.com",
            "full_name": "Dup User",
            "password": "SecureP@ss123",
        })
        assert r.status_code == 200

        # Register again -> 409
        r = await client.post("/api/v1/auth/register", json={
            "email": "dup@acme.com",
            "full_name": "Dup User 2",
            "password": "SecureP@ss123",
        })
        assert r.status_code == 409


# ============================================================================
# Flow 2 — Candidate Pipeline
# ============================================================================

class TestFlowCandidatePipeline:
    """Create A & B -> List -> Get A -> Update A -> Enrich A -> Match A"""

    @pytest.mark.asyncio
    async def test_full_candidate_pipeline(self, client: AsyncClient):
        # 1. Create candidate A
        r = await client.post("/api/v1/candidates/", json={
            "email": "alice@candidate.com",
            "full_name": "Alice Engineer",
            "location": "San Francisco",
            "seniority_level": "senior",
            "years_experience": 8,
        })
        assert r.status_code == 200
        assert r.json()["created"] is True
        candidate_a_id = r.json()["id"]

        # 2. Create candidate B
        r = await client.post("/api/v1/candidates/", json={
            "email": "bob@candidate.com",
            "full_name": "Bob Developer",
            "location": "New York",
            "seniority_level": "mid",
            "years_experience": 4,
        })
        assert r.status_code == 200
        assert r.json()["created"] is True
        candidate_b_id = r.json()["id"]

        # 3. List candidates
        r = await client.get("/api/v1/candidates/")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 2
        ids = [c["id"] for c in body["data"]]
        assert candidate_a_id in ids
        assert candidate_b_id in ids

        # 4. Get candidate A
        r = await client.get(f"/api/v1/candidates/{candidate_a_id}")
        assert r.status_code == 200
        detail = r.json()
        assert detail["id"] == candidate_a_id
        assert detail["full_name"] == "Alice Engineer"

        # 5. Update candidate A
        r = await client.put(f"/api/v1/candidates/{candidate_a_id}", json={
            "full_name": "Alice Senior Engineer",
            "location": "Seattle",
        })
        assert r.status_code == 200
        assert r.json()["updated"] is True

        # 6. Enrich candidate A
        r = await client.post(f"/api/v1/candidates/{candidate_a_id}/enrich")
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

        # 7. Match candidate A
        r = await client.post(f"/api/v1/candidates/{candidate_a_id}/match")
        assert r.status_code == 200
        assert r.json()["candidate_id"] == candidate_a_id


# ============================================================================
# Flow 3 — Job & Matching
# ============================================================================

class TestFlowJobMatching:
    """Create job -> List -> Get -> Get matched candidates"""

    @pytest.mark.asyncio
    async def test_full_job_flow(self, client: AsyncClient):
        # 1. Create job
        r = await client.post("/api/v1/jobs/", json={
            "title": "Senior Backend Engineer",
            "description": "Build scalable distributed systems with Python.",
            "department": "Engineering",
            "location": "Remote",
            "required_skills": ["Python", "FastAPI", "PostgreSQL"],
        })
        assert r.status_code == 200
        assert r.json()["created"] is True
        job_id = r.json()["id"]

        # 2. List jobs
        r = await client.get("/api/v1/jobs/")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1

        # 3. Get job
        r = await client.get(f"/api/v1/jobs/{job_id}")
        assert r.status_code == 200
        detail = r.json()
        assert detail["id"] == job_id
        assert detail["title"] == "Senior Backend Engineer"

        # 4. Get matched candidates
        r = await client.get(f"/api/v1/jobs/{job_id}/candidates")
        assert r.status_code == 200
        assert r.json()["job_id"] == job_id


# ============================================================================
# Flow 4 — Interview
# ============================================================================

class TestFlowInterview:
    """Create -> List -> Start -> Complete"""

    @pytest.mark.asyncio
    async def test_full_interview_flow(self, client: AsyncClient):
        # 1. Create interview
        r = await client.post("/api/v1/interviews/", json={
            "candidate_id": "c1",
            "job_id": "j1",
            "interview_type": "technical",
            "is_ai_interview": True,
        })
        assert r.status_code == 200
        assert r.json()["created"] is True
        interview_id = r.json()["id"]

        # 2. List interviews
        r = await client.get("/api/v1/interviews/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

        # 3. Start interview
        r = await client.post(f"/api/v1/interviews/{interview_id}/start")
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

        # 4. Complete interview
        r = await client.post(f"/api/v1/interviews/{interview_id}/complete")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


# ============================================================================
# Flow 5 — PPE
# ============================================================================

class TestFlowPPE:
    """List problems -> Create session -> Execute code -> Request hint"""

    @pytest.mark.asyncio
    async def test_full_ppe_flow(self, client: AsyncClient):
        _reset_ppe_sessions()

        # 1. List problems
        r = await client.get("/api/v1/ppe/problems")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1

        # 2. Create session
        r = await client.post("/api/v1/ppe/sessions", json={
            "problem_id": "p1",
            "language": "python",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "created"
        session_id = r.json()["id"]

        # 3. Execute code
        r = await client.post(f"/api/v1/ppe/sessions/{session_id}/execute", json={
            "code": "def two_sum(nums, target):\n    d = {}\n    for i, n in enumerate(nums):\n        if target - n in d:\n            return [d[target - n], i]\n        d[n] = i\n",
        })
        assert r.status_code == 200
        assert r.json()["execution"]["exit_code"] == 0

        # 4. Request hint
        r = await client.post(f"/api/v1/ppe/sessions/{session_id}/hint")
        assert r.status_code == 200
        assert "hint" in r.json()
        assert r.json()["hint_number"] == 1


# ============================================================================
# Flow 6 — AI
# ============================================================================

class TestFlowAI:
    """List agents -> Orchestrate"""

    @pytest.mark.asyncio
    async def test_full_ai_flow(self, client: AsyncClient):
        _reset_ai_tasks()

        # 1. List agents
        r = await client.get("/api/v1/ai/agents")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1

        # 2. Orchestrate
        r = await client.post("/api/v1/ai/orchestrate", json={
            "agent_type": "resume_parsing",
            "input": {"resume_text": "John Smith, Python developer with 5 years experience."},
        })
        assert r.status_code == 200
        result = r.json()
        assert result["status"] == "completed"
        assert "task_id" in result
        assert result["agent_type"] == "resume_parsing"


# ============================================================================
# Flow 7 — Analytics
# ============================================================================

class TestFlowAnalytics:
    """Dashboard -> Pipeline -> AI Performance"""

    @pytest.mark.asyncio
    async def test_full_analytics_flow(self, client: AsyncClient):
        # 1. Dashboard
        r = await client.get("/api/v1/analytics/dashboard")
        assert r.status_code == 200
        body = r.json()
        assert "metrics" in body
        assert "trends" in body

        # 2. Pipeline
        r = await client.get("/api/v1/analytics/pipeline")
        assert r.status_code == 200
        body = r.json()
        assert "pipeline" in body
        assert len(body["pipeline"]) >= 1

        # 3. AI performance
        r = await client.get("/api/v1/analytics/ai-performance")
        assert r.status_code == 200
        body = r.json()
        assert "metrics" in body
        assert "overall_score" in body


# ============================================================================
# Flow 8 — Workflows
# ============================================================================

class TestFlowWorkflows:
    """Create -> List -> Activate -> Trigger"""

    @pytest.mark.asyncio
    async def test_full_workflow_flow(self, client: AsyncClient):
        _reset_workflows()

        # 1. Create workflow
        r = await client.post("/api/v1/workflows/", json={
            "name": "E2E Test Workflow",
            "trigger": "candidate.created",
            "steps": [
                {"order": 1, "type": "notification", "name": "Notify recruiter"},
                {"order": 2, "type": "ai_evaluation", "name": "Parse resume"},
            ],
        })
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "E2E Test Workflow"
        assert body["status"] == "draft"
        workflow_id = body["id"]

        # 2. List workflows
        r = await client.get("/api/v1/workflows/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

        # 3. Activate workflow
        r = await client.post(f"/api/v1/workflows/{workflow_id}/activate")
        assert r.status_code == 200
        assert r.json()["status"] == "active"

        # 4. Trigger workflow
        r = await client.post(f"/api/v1/workflows/{workflow_id}/trigger", json={
            "context": {"candidate_id": "c1"},
        })
        assert r.status_code == 200
        trigger_body = r.json()
        assert trigger_body["status"] == "completed"
        assert trigger_body["steps_executed"] == 2


# ============================================================================
# Flow 9 — Notifications
# ============================================================================

class TestFlowNotifications:
    """Create -> List -> Mark read"""

    @pytest.mark.asyncio
    async def test_full_notification_flow(self, client: AsyncClient):
        _reset_notifications()

        # 1. Create notification
        r = await client.post("/api/v1/notifications/", json={
            "title": "E2E Test Alert",
            "message": "This is a test notification.",
            "type": "info",
            "channel": "in_app",
        })
        assert r.status_code == 200
        body = r.json()
        assert body["title"] == "E2E Test Alert"
        assert body["read"] is False
        notification_id = body["id"]

        # 2. List notifications
        r = await client.get("/api/v1/notifications/")
        assert r.status_code == 200
        list_body = r.json()
        assert list_body["total"] >= 1

        # 3. Mark read
        r = await client.post(f"/api/v1/notifications/{notification_id}/read")
        assert r.status_code == 200
        assert r.json()["read"] is True


# ============================================================================
# Flow 10 — Full Pipeline (End-to-End)
# ============================================================================

class TestFlowFullPipeline:
    """Complete recruitment lifecycle: Register -> Candidates -> Job -> Interviews -> PPE -> Analytics"""

    @pytest.mark.asyncio
    async def test_complete_recruitment_lifecycle(self, client: AsyncClient):
        _reset_ppe_sessions()
        _reset_ai_tasks()

        # 1. Register user
        r = await client.post("/api/v1/auth/register", json={
            "email": "recruiter@acme.com",
            "full_name": "Full Pipeline Recruiter",
            "password": "SecureP@ss123",
            "role": "recruiter",
        })
        assert r.status_code == 200
        user_id = r.json()["id"]

        # 2. Login
        r = await client.post("/api/v1/auth/login", json={
            "email": "recruiter@acme.com",
            "password": "SecureP@ss123",
        })
        assert r.status_code == 200
        tokens = r.json()

        # 3. Create 3 candidates
        candidate_ids = []
        for i, name in enumerate(["Alpha", "Beta", "Gamma"]):
            r = await client.post("/api/v1/candidates/", json={
                "email": f"{name.lower()}@candidate.com",
                "full_name": f"{name} Candidate",
                "location": ["SF", "NYC", "Remote"][i],
                "seniority_level": ["senior", "mid", "senior"][i],
                "years_experience": [10, 5, 8][i],
            })
            assert r.status_code == 200
            candidate_ids.append(r.json()["id"])
        assert len(candidate_ids) == 3

        # 4. Create job
        r = await client.post("/api/v1/jobs/", json={
            "title": "Full Stack Engineer",
            "description": "Build end-to-end features with Python and React.",
            "department": "Engineering",
            "location": "Remote",
            "required_skills": ["Python", "React", "TypeScript"],
        })
        assert r.status_code == 200
        job_id = r.json()["id"]

        # 5. Schedule interviews for each candidate
        interview_ids = []
        for cid in candidate_ids:
            r = await client.post("/api/v1/interviews/", json={
                "candidate_id": cid,
                "job_id": job_id,
                "interview_type": "technical",
                "is_ai_interview": True,
            })
            assert r.status_code == 200
            interview_ids.append(r.json()["id"])
        assert len(interview_ids) == 3

        # 6. Start each interview
        for iid in interview_ids:
            r = await client.post(f"/api/v1/interviews/{iid}/start")
            assert r.status_code == 200
            assert r.json()["status"] == "in_progress"

        # 7. Complete each interview
        for iid in interview_ids:
            r = await client.post(f"/api/v1/interviews/{iid}/complete")
            assert r.status_code == 200
            assert r.json()["status"] == "completed"

        # 8. Create PPE sessions and execute code
        for cid in candidate_ids:
            r = await client.post("/api/v1/ppe/sessions", json={
                "problem_id": "p1",
                "language": "python",
            })
            assert r.status_code == 200
            ppe_session_id = r.json()["id"]

            r = await client.post(f"/api/v1/ppe/sessions/{ppe_session_id}/execute", json={
                "code": "def two_sum(nums, target):\n    d = {}\n    for i, n in enumerate(nums):\n        if target - n in d:\n            return [d[target - n], i]\n        d[n] = i\n",
            })
            assert r.status_code == 200
            assert r.json()["execution"]["exit_code"] == 0

        # 9. Get analytics dashboard
        r = await client.get("/api/v1/analytics/dashboard")
        assert r.status_code == 200
        dashboard = r.json()
        assert "metrics" in dashboard
        assert dashboard["metrics"]["total_candidates"] >= 0

        # 10. Verify data consistency
        r = await client.get("/api/v1/candidates/")
        assert r.status_code == 200
        assert r.json()["total"] >= 3

        r = await client.get("/api/v1/jobs/")
        assert r.status_code == 200
        assert r.json()["total"] >= 1

        r = await client.get("/api/v1/interviews/")
        assert r.status_code == 200
        assert r.json()["total"] >= 3

        # 11. Orchestrate AI tasks for each candidate
        for cid in candidate_ids:
            r = await client.post("/api/v1/ai/orchestrate", json={
                "agent_type": "candidate_profiling",
                "input": {"candidate_id": cid},
            })
            assert r.status_code == 200
            assert r.json()["status"] == "completed"

        # 12. Create and trigger a workflow
        r = await client.post("/api/v1/workflows/", json={
            "name": "Post-Interview Pipeline",
            "trigger": "interview.completed",
            "steps": [
                {"order": 1, "type": "ai_evaluation", "name": "Grade results"},
                {"order": 2, "type": "notification", "name": "Send update"},
            ],
        })
        workflow_id = r.json()["id"]

        r = await client.post(f"/api/v1/workflows/{workflow_id}/activate")
        assert r.status_code == 200

        r = await client.post(f"/api/v1/workflows/{workflow_id}/trigger")
        assert r.status_code == 200
        assert r.json()["status"] == "completed"

        # 13. Send notification
        r = await client.post("/api/v1/notifications/", json={
            "title": "Pipeline Complete",
            "message": "All interviews and evaluations completed.",
            "type": "success",
        })
        assert r.status_code == 200
        notification_id = r.json()["id"]

        r = await client.post(f"/api/v1/notifications/{notification_id}/read")
        assert r.status_code == 200
        assert r.json()["read"] is True

        # 14. Final analytics check
        r = await client.get("/api/v1/analytics/pipeline")
        assert r.status_code == 200
        assert "pipeline" in r.json()

        r = await client.get("/api/v1/analytics/ai-performance")
        assert r.status_code == 200
        assert "overall_score" in r.json()
