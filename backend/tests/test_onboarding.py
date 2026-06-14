"""Onboarding workflow automation tests.

Verifies:
* Workflow CRUD with DB persistence.
* Assigning workflows to candidates and task creation.
* Completing tasks and progress tracking.
* Onboarding statistics.
* Tenant isolation.
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.onboarding import (
    CandidateOnboarding,
    OnboardingTask,
    OnboardingWorkflow,
)
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


SAMPLE_STEPS = [
    {"id": "s1", "name": "Sign NDA", "type": "document", "description": "Sign the NDA", "required": True, "order": 1, "config": {}},
    {"id": "s2", "name": "Watch Intro", "type": "video", "description": "Watch intro video", "required": True, "order": 2, "config": {}},
    {"id": "s3", "name": "Setup Laptop", "type": "task", "description": "Configure laptop", "required": False, "order": 3, "config": {}},
]


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db_override(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    def _install(app: FastAPI) -> None:
        async def _override():
            async with factory() as s:
                try:
                    yield s
                    await s.commit()
                except Exception:
                    await s.rollback()
                    raise

        app.dependency_overrides[get_db_dependency] = _override
        app.dependency_overrides[Settings] = lambda: Settings(
            SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
            ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
            DEBUG=False,
        )

    return _install


@pytest_asyncio.fixture
async def onboarding_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.onboarding.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/onboarding")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Workflow CRUD ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_workflow(onboarding_client, db_session_factory):
    r = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "New Hire", "description": "Standard onboarding", "steps": SAMPLE_STEPS},
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "New Hire"
    assert body["description"] == "Standard onboarding"
    assert len(body["steps"]) == 3
    assert body["active"] is True

    async with db_session_factory() as session:
        row = (await session.execute(
            select(OnboardingWorkflow).where(OnboardingWorkflow.id == body["id"])
        )).scalar_one()
    assert row.tenant_id == "tenant-A"
    assert row.name == "New Hire"


@pytest.mark.asyncio
async def test_list_workflows(onboarding_client):
    admin = _auth("tenant-A")
    await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "WF1", "steps": []}, headers=admin,
    )
    await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "WF2", "steps": []}, headers=admin,
    )
    r = await onboarding_client.get("/api/v1/onboarding/workflows", headers=admin)
    assert r.status_code == 200
    assert r.json()["total"] == 2


@pytest.mark.asyncio
async def test_get_workflow(onboarding_client):
    admin = _auth("tenant-A")
    create = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Get Me", "steps": SAMPLE_STEPS}, headers=admin,
    )
    wid = create.json()["id"]
    r = await onboarding_client.get(f"/api/v1/onboarding/workflows/{wid}", headers=admin)
    assert r.status_code == 200
    assert r.json()["name"] == "Get Me"
    assert len(r.json()["steps"]) == 3


@pytest.mark.asyncio
async def test_update_workflow(onboarding_client, db_session_factory):
    admin = _auth("tenant-A")
    create = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Original", "steps": []}, headers=admin,
    )
    wid = create.json()["id"]
    r = await onboarding_client.put(
        f"/api/v1/onboarding/workflows/{wid}",
        json={"name": "Updated", "description": "New desc", "active": False},
        headers=admin,
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Updated"
    assert r.json()["description"] == "New desc"
    assert r.json()["active"] is False

    async with db_session_factory() as session:
        row = (await session.execute(
            select(OnboardingWorkflow).where(OnboardingWorkflow.id == wid)
        )).scalar_one()
    assert row.name == "Updated"
    assert row.active is False


@pytest.mark.asyncio
async def test_get_nonexistent_workflow_404(onboarding_client):
    r = await onboarding_client.get(
        "/api/v1/onboarding/workflows/nonexistent",
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 404


# ── Assign workflow ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_assign_workflow_creates_onboarding_and_tasks(
    onboarding_client, db_session_factory
):
    admin = _auth("tenant-A")
    wf = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Assign Test", "steps": SAMPLE_STEPS}, headers=admin,
    )
    wid = wf.json()["id"]

    r = await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-001"},
        headers=_auth("tenant-A", "recruiter1", "member"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["candidate_id"] == "cand-001"
    assert body["workflow_id"] == wid
    assert body["status"] == "in_progress"
    assert body["progress_pct"] == 0.0
    oid = body["id"]

    async with db_session_factory() as session:
        ob = (await session.execute(
            select(CandidateOnboarding).where(CandidateOnboarding.id == oid)
        )).scalar_one()
        assert ob.candidate_id == "cand-001"
        assert ob.status == "in_progress"

        tasks = (await session.execute(
            select(OnboardingTask).where(OnboardingTask.onboarding_id == oid)
        )).scalars().all()
    assert len(tasks) == 3
    assert all(t.status == "pending" for t in tasks)


@pytest.mark.asyncio
async def test_assign_duplicate_returns_409(onboarding_client):
    admin = _auth("tenant-A")
    wf = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Dup", "steps": SAMPLE_STEPS}, headers=admin,
    )
    wid = wf.json()["id"]
    member = _auth("tenant-A", "recruiter1", "member")

    r1 = await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-dup"}, headers=member,
    )
    assert r1.status_code == 200

    r2 = await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-dup"}, headers=member,
    )
    assert r2.status_code == 409


# ── Complete tasks & progress ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_complete_task_updates_progress(onboarding_client):
    admin = _auth("tenant-A")
    wf = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Progress", "steps": SAMPLE_STEPS}, headers=admin,
    )
    wid = wf.json()["id"]
    member = _auth("tenant-A", "recruiter1", "member")

    assign = await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-prog"}, headers=member,
    )
    oid = assign.json()["id"]

    status_r = await onboarding_client.get(
        f"/api/v1/onboarding/candidates/cand-prog/status", headers=member,
    )
    tasks = status_r.json()["onboardings"][0]["tasks"]
    assert len(tasks) == 3

    r1 = await onboarding_client.post(
        f"/api/v1/onboarding/tasks/{tasks[0]['id']}/complete",
        json={"notes": "Done!"}, headers=member,
    )
    assert r1.status_code == 200
    assert r1.json()["task"]["status"] == "completed"
    assert r1.json()["task"]["notes"] == "Done!"
    assert r1.json()["onboarding"]["progress_pct"] == pytest.approx(33.3, abs=0.1)

    r2 = await onboarding_client.post(
        f"/api/v1/onboarding/tasks/{tasks[1]['id']}/complete",
        headers=member,
    )
    assert r2.status_code == 200
    assert r2.json()["onboarding"]["progress_pct"] == pytest.approx(66.7, abs=0.1)

    r3 = await onboarding_client.post(
        f"/api/v1/onboarding/tasks/{tasks[2]['id']}/complete",
        headers=member,
    )
    assert r3.status_code == 200
    assert r3.json()["onboarding"]["progress_pct"] == pytest.approx(100.0, abs=0.1)
    assert r3.json()["onboarding"]["status"] == "completed"
    assert r3.json()["onboarding"]["completed_at"] is not None


@pytest.mark.asyncio
async def test_complete_already_completed_task_400(onboarding_client):
    admin = _auth("tenant-A")
    wf = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Double", "steps": [{"id": "s1", "name": "Only", "type": "task", "order": 1}]},
        headers=admin,
    )
    wid = wf.json()["id"]
    member = _auth("tenant-A", "recruiter1", "member")

    assign = await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-dbl"}, headers=member,
    )
    status_r = await onboarding_client.get(
        "/api/v1/onboarding/candidates/cand-dbl/status", headers=member,
    )
    tid = status_r.json()["onboardings"][0]["tasks"][0]["id"]

    r1 = await onboarding_client.post(f"/api/v1/onboarding/tasks/{tid}/complete", headers=member)
    assert r1.status_code == 200

    r2 = await onboarding_client.post(f"/api/v1/onboarding/tasks/{tid}/complete", headers=member)
    assert r2.status_code == 400


@pytest.mark.asyncio
async def test_complete_nonexistent_task_404(onboarding_client):
    r = await onboarding_client.post(
        "/api/v1/onboarding/tasks/nonexistent/complete",
        headers=_auth("tenant-A", "recruiter1", "member"),
    )
    assert r.status_code == 404


# ── Candidate status ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_candidate_status(onboarding_client):
    admin = _auth("tenant-A")
    wf = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Status Test", "steps": SAMPLE_STEPS}, headers=admin,
    )
    wid = wf.json()["id"]
    member = _auth("tenant-A", "recruiter1", "member")

    await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-status"}, headers=member,
    )

    r = await onboarding_client.get(
        "/api/v1/onboarding/candidates/cand-status/status", headers=member,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-status"
    assert len(body["onboardings"]) == 1
    assert len(body["onboardings"][0]["tasks"]) == 3


@pytest.mark.asyncio
async def test_candidate_status_not_found_404(onboarding_client):
    r = await onboarding_client.get(
        "/api/v1/onboarding/candidates/nobody/status",
        headers=_auth("tenant-A", "recruiter1", "member"),
    )
    assert r.status_code == 404


# ── Statistics ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_empty(onboarding_client):
    r = await onboarding_client.get(
        "/api/v1/onboarding/stats",
        headers=_auth("tenant-A", "recruiter1", "member"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total_workflows"] == 0
    assert body["total_onboardings"] == 0
    assert body["total_tasks"] == 0


@pytest.mark.asyncio
async def test_stats_with_data(onboarding_client):
    admin = _auth("tenant-A")
    member = _auth("tenant-A", "recruiter1", "member")

    wf = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "Stats WF", "steps": SAMPLE_STEPS}, headers=admin,
    )
    wid = wf.json()["id"]

    await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-s1"}, headers=member,
    )
    await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-s2"}, headers=member,
    )

    status_r = await onboarding_client.get(
        "/api/v1/onboarding/candidates/cand-s1/status", headers=member,
    )
    tid = status_r.json()["onboardings"][0]["tasks"][0]["id"]
    await onboarding_client.post(f"/api/v1/onboarding/tasks/{tid}/complete", headers=member)

    r = await onboarding_client.get("/api/v1/onboarding/stats", headers=member)
    assert r.status_code == 200
    body = r.json()
    assert body["total_workflows"] == 1
    assert body["active_workflows"] == 1
    assert body["total_onboardings"] == 2
    assert body["total_tasks"] == 6
    assert body["completed_tasks"] == 1
    assert body["onboarding_by_status"]["in_progress"] == 2


# ── Tenant isolation ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_list_workflows(onboarding_client):
    a = _auth("tenant-A")
    b = _auth("tenant-B")
    await onboarding_client.post(
        "/api/v1/onboarding/workflows", json={"name": "A-wf", "steps": []}, headers=a,
    )
    await onboarding_client.post(
        "/api/v1/onboarding/workflows", json={"name": "B-wf", "steps": []}, headers=b,
    )

    list_a = await onboarding_client.get("/api/v1/onboarding/workflows", headers=a)
    list_b = await onboarding_client.get("/api/v1/onboarding/workflows", headers=b)
    a_names = {w["name"] for w in list_a.json()["workflows"]}
    b_names = {w["name"] for w in list_b.json()["workflows"]}
    assert "A-wf" in a_names and "B-wf" not in a_names
    assert "B-wf" in b_names and "A-wf" not in b_names


@pytest.mark.asyncio
async def test_tenant_isolation_get_workflow_404(onboarding_client):
    b = _auth("tenant-B")
    create = await onboarding_client.post(
        "/api/v1/onboarding/workflows", json={"name": "B-only", "steps": []}, headers=b,
    )
    wid = create.json()["id"]

    cross = await onboarding_client.get(
        f"/api/v1/onboarding/workflows/{wid}", headers=_auth("tenant-A"),
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_update_workflow_404(onboarding_client):
    b = _auth("tenant-B")
    create = await onboarding_client.post(
        "/api/v1/onboarding/workflows", json={"name": "B-only", "steps": []}, headers=b,
    )
    wid = create.json()["id"]

    cross = await onboarding_client.put(
        f"/api/v1/onboarding/workflows/{wid}",
        json={"name": "Hacked"},
        headers=_auth("tenant-A"),
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_assign_workflow_404(onboarding_client):
    b = _auth("tenant-B")
    create = await onboarding_client.post(
        "/api/v1/onboarding/workflows", json={"name": "B-only", "steps": SAMPLE_STEPS}, headers=b,
    )
    wid = create.json()["id"]

    cross = await onboarding_client.post(
        f"/api/v1/onboarding/workflows/{wid}/assign",
        json={"candidate_id": "cand-x"},
        headers=_auth("tenant-A", "recruiter1", "member"),
    )
    assert cross.status_code == 404


# ── Auth / RBAC ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_401(onboarding_client):
    r = await onboarding_client.get("/api/v1/onboarding/workflows")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_cannot_create_workflow(onboarding_client):
    r = await onboarding_client.post(
        "/api/v1/onboarding/workflows",
        json={"name": "x", "steps": []},
        headers=_auth("tenant-A", "viewer1", "viewer"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_update_workflow(onboarding_client):
    admin = _auth("tenant-A")
    create = await onboarding_client.post(
        "/api/v1/onboarding/workflows", json={"name": "x", "steps": []}, headers=admin,
    )
    wid = create.json()["id"]

    r = await onboarding_client.put(
        f"/api/v1/onboarding/workflows/{wid}",
        json={"name": "y"},
        headers=_auth("tenant-A", "viewer1", "viewer"),
    )
    assert r.status_code == 403
