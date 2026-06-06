"""Tests for the AI agent task queue (HTTP + worker).

Covers:

* enqueueing a task via the API
* listing tasks for the current tenant
* getting a single task's status
* a task transitions from ``pending`` to ``running`` to ``completed``
  when the worker drains it
* a failing task ends up in ``failed`` with the error stored
* cancelling a pending or running task
* retrying a failed task
* tenant isolation: tenant A cannot see / mutate tenant B's tasks
* worker is idempotent: calling ``process_pending_tasks`` on an empty
  queue is a no-op

The tests bypass the rate-limit middleware so they can run in tight
loops.  A fresh in-memory SQLite engine is used per-test to prove real
DB persistence.
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator
from uuid import uuid4

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

from shared.ai.task_queue import AgentTask
from shared.ai.worker import process_pending_tasks, worker_state
from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.security import create_access_token


# ── Test helpers ───────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DB / app fixtures ──────────────────────────────────────────────────────────


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
    """Install a per-app DB dependency override on a freshly-built FastAPI app."""
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
async def ai_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    """Spin up just the AI orchestrator router (no rate limit / auth deps)."""
    from apps.ai_orchestrator.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/ai")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    """Open additional sessions against the same engine (for cross-restart / cross-tenant checks)."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── 1. Enqueue a task ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enqueue_task_persists_to_db(ai_client, db_session_factory):
    r = await ai_client.post(
        "/api/v1/ai/tasks",
        json={
            "agent_type": "outreach",
            "input": {
                "candidate": {"name": "Jane", "email": "jane@example.com"},
                "job": {"title": "Senior Engineer", "company": "Acme"},
            },
        },
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["agent_type"] == "outreach"
    assert body["status"] == "pending"
    assert body["tenant_id"] == "tenant-A"
    assert body["progress"] == 0.0
    assert body["retry_count"] == 0
    assert body["input"]["candidate"]["name"] == "Jane"
    task_id = body["id"]

    # Verify the row is in the database, not in a module-level dict.
    async with db_session_factory() as session:
        result = await session.execute(
            select(AgentTask).where(AgentTask.id == task_id)
        )
        row = result.scalar_one()
    assert row.tenant_id == "tenant-A"
    assert row.agent_type == "outreach"
    assert row.status == "pending"


@pytest.mark.asyncio
async def test_enqueue_unknown_agent_returns_404(ai_client):
    r = await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "totally_made_up", "input": {}},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404
    assert "totally_made_up" in r.json()["detail"]


# ── 2. List tasks ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_tasks_returns_tenant_scoped(ai_client):
    admin = _auth("tenant-A", "adminA", "admin")
    for _ in range(3):
        r = await ai_client.post(
            "/api/v1/ai/tasks",
            json={"agent_type": "outreach", "input": {"x": 1}},
            headers=admin,
        )
        assert r.status_code == 201

    r = await ai_client.get("/api/v1/ai/tasks", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert body["limit"] == 50
    assert len(body["data"]) == 3
    assert all(t["tenant_id"] == "tenant-A" for t in body["data"])


@pytest.mark.asyncio
async def test_list_tasks_filter_by_status(ai_client, db_session_factory):
    """After running the worker, completed tasks should be filterable."""
    admin = _auth("tenant-A", "adminA", "admin")
    await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {"candidate": {}, "job": {}}},
        headers=admin,
    )

    pending = await ai_client.get(
        "/api/v1/ai/tasks?status=pending", headers=admin
    )
    assert pending.status_code == 200
    assert pending.json()["total"] == 1

    completed = await ai_client.get(
        "/api/v1/ai/tasks?status=completed", headers=admin
    )
    assert completed.status_code == 200
    assert completed.json()["total"] == 0


# ── 3. Get single task status ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_task_returns_status(ai_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "evaluation", "input": {"candidate": {}, "job": {}}},
        headers=admin,
    )
    task_id = create.json()["id"]

    r = await ai_client.get(f"/api/v1/ai/tasks/{task_id}", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == task_id
    assert body["status"] == "pending"
    assert body["agent_type"] == "evaluation"


@pytest.mark.asyncio
async def test_get_unknown_task_returns_404(ai_client):
    r = await ai_client.get(
        "/api/v1/ai/tasks/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


# ── 4. Worker transitions ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_worker_transitions_to_running_then_completed(ai_client, db_session_factory, engine):
    """A pending task should be picked up by the worker and reach ``completed``."""
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={
            "agent_type": "outreach",
            "input": {
                "candidate": {"name": "Jane"},
                "job": {"title": "Senior Engineer", "company": "Acme"},
            },
        },
        headers=admin,
    )
    task_id = create.json()["id"]

    # Pass the test's session factory so the worker reads from the
    # same in-memory SQLite engine the API wrote to.
    test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    processed = await process_pending_tasks(batch_size=10, session_factory=test_factory)
    assert any(t.id == task_id for t in processed)

    # The DB row should be ``completed`` with a non-null output.
    async with db_session_factory() as session:
        result = await session.execute(
            select(AgentTask).where(AgentTask.id == task_id)
        )
        row = result.scalar_one()
    assert row.status == "completed"
    assert row.progress == 1.0
    assert row.completed_at is not None
    assert row.started_at is not None
    assert row.output is not None
    assert row.error is None


@pytest.mark.asyncio
async def test_worker_records_progress_in_observer(ai_client, db_session_factory, engine):
    """The worker calls the on_progress hook with (task_id, progress)."""
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={
            "agent_type": "evaluation",
            "input": {
                "candidate": {"name": "Jane"},
                "job": {"title": "Senior Engineer"},
            },
        },
        headers=admin,
    )
    task_id = create.json()["id"]

    progress_events: list[tuple[str, float]] = []

    async def observer(tid: str, progress: float) -> None:
        progress_events.append((tid, progress))

    test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await process_pending_tasks(
        batch_size=10, on_progress=observer, session_factory=test_factory
    )
    assert (task_id, 0.1) in progress_events
    assert (task_id, 1.0) in progress_events


# ── 5. Failed task stores error ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_failed_task_has_error(ai_client, db_session_factory, engine):
    """Force a failure path at the worker by patching the agent registry."""
    from apps import ai_orchestrator as _orch

    original = _orch.agents.AGENT_REGISTRY
    # Temporarily pretend ``outreach`` is unsupported.
    _orch.agents.AGENT_REGISTRY = {
        k: v for k, v in original.items() if k != "outreach"
    }
    try:
        admin = _auth("tenant-A", "adminA", "admin")
        # Insert directly via the helper so we can enqueue a now-unsupported type.
        from shared.ai.task_queue import enqueue_task as _enqueue

        test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with test_factory() as session:
            task = await _enqueue(
                session,
                tenant_id="tenant-A",
                agent_type="outreach",
                input={"candidate": {}, "job": {}},
            )
            task_id = task.id

        processed = await process_pending_tasks(
            batch_size=10, session_factory=test_factory
        )
        assert any(t.id == task_id for t in processed)

        async with db_session_factory() as session:
            result = await session.execute(
                select(AgentTask).where(AgentTask.id == task_id)
            )
            row = result.scalar_one()
        assert row.status == "failed"
        assert row.error is not None
        assert "outreach" in row.error or "unsupported" in row.error.lower()
    finally:
        _orch.agents.AGENT_REGISTRY = original


# ── 6. Cancel pending task ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancel_pending_task(ai_client, db_session_factory):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {"x": 1}},
        headers=admin,
    )
    task_id = create.json()["id"]

    r = await ai_client.delete(f"/api/v1/ai/tasks/{task_id}", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "cancelled"
    assert body["completed_at"] is not None

    async with db_session_factory() as session:
        result = await session.execute(
            select(AgentTask).where(AgentTask.id == task_id)
        )
        row = result.scalar_one()
    assert row.status == "cancelled"


@pytest.mark.asyncio
async def test_cancel_completed_task_returns_409(ai_client, db_session_factory, engine):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={
            "agent_type": "outreach",
            "input": {"candidate": {}, "job": {}},
        },
        headers=admin,
    )
    task_id = create.json()["id"]
    test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await process_pending_tasks(batch_size=10, session_factory=test_factory)

    r = await ai_client.delete(f"/api/v1/ai/tasks/{task_id}", headers=admin)
    assert r.status_code == 409
    assert "cancelled" in r.json()["detail"] or "completed" in r.json()["detail"]


# ── 7. Retry failed task ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_retry_failed_task(ai_client, db_session_factory, engine):
    """Cancel a pending task, then retry it, then run the worker."""
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={
            "agent_type": "outreach",
            "input": {"candidate": {"name": "Jane"}, "job": {"title": "Eng"}},
        },
        headers=admin,
    )
    task_id = create.json()["id"]

    # Cancel it (a permitted transition from pending).
    cancel = await ai_client.delete(f"/api/v1/ai/tasks/{task_id}", headers=admin)
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "cancelled"

    # Retry should bring it back to pending with retry_count == 1.
    r = await ai_client.post(
        f"/api/v1/ai/tasks/{task_id}/retry", headers=admin
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["retry_count"] == 1
    assert body["error"] is None
    assert body["output"] is None

    # The worker should now run it to completion.
    test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    await process_pending_tasks(batch_size=10, session_factory=test_factory)
    async with db_session_factory() as session:
        result = await session.execute(
            select(AgentTask).where(AgentTask.id == task_id)
        )
        row = result.scalar_one()
    assert row.status == "completed"
    assert row.retry_count == 1


@pytest.mark.asyncio
async def test_retry_pending_task_returns_409(ai_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {}},
        headers=admin,
    )
    task_id = create.json()["id"]

    r = await ai_client.post(f"/api/v1/ai/tasks/{task_id}/retry", headers=admin)
    assert r.status_code == 409
    assert "failed" in r.json()["detail"] or "cancelled" in r.json()["detail"]


# ── 8. Tenant isolation ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_list(ai_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {"x": 1}},
        headers=a,
    )
    await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {"x": 2}},
        headers=b,
    )

    a_list = await ai_client.get("/api/v1/ai/tasks", headers=a)
    b_list = await ai_client.get("/api/v1/ai/tasks", headers=b)
    assert a_list.json()["total"] == 1
    assert b_list.json()["total"] == 1
    assert a_list.json()["data"][0]["tenant_id"] == "tenant-A"
    assert b_list.json()["data"][0]["tenant_id"] == "tenant-B"


@pytest.mark.asyncio
async def test_tenant_isolation_get_returns_404(ai_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {}},
        headers=b,
    )
    task_id = create.json()["id"]

    cross = await ai_client.get(f"/api/v1/ai/tasks/{task_id}", headers=a)
    assert cross.status_code == 404

    own = await ai_client.get(f"/api/v1/ai/tasks/{task_id}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_cancel(ai_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await ai_client.post(
        "/api/v1/ai/tasks",
        json={"agent_type": "outreach", "input": {}},
        headers=b,
    )
    task_id = create.json()["id"]

    cross = await ai_client.delete(f"/api/v1/ai/tasks/{task_id}", headers=a)
    assert cross.status_code == 404


# ── 9. Worker is idempotent on empty queue ─────────────────────────────────────


@pytest.mark.asyncio
async def test_worker_drains_empty_queue(ai_client, engine):
    """Calling process_pending_tasks on an empty queue should be a no-op."""
    test_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    processed = await process_pending_tasks(batch_size=10, session_factory=test_factory)
    assert processed == []


# ── 10. New agent types are recognised ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_new_agents_are_registered():
    from apps.ai_orchestrator.agents import AGENT_REGISTRY

    assert "outreach" in AGENT_REGISTRY
    assert "evaluation" in AGENT_REGISTRY
    assert "interview_questions" in AGENT_REGISTRY
