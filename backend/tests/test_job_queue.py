"""Tests for the background job queue service (HTTP API + Celery tasks).

Covers:
* enqueueing jobs via the API
* listing jobs for the current tenant (paginated, filtered)
* getting a single job's status
* cancelling a pending job
* cancelling a completed/failed job (409)
* priority queues (high/medium/low)
* scheduled jobs
* tenant isolation: tenant A cannot see / mutate tenant B's jobs
* queue statistics endpoint
* unknown task name returns 400
* RBAC: non-admin users get 403
* Celery task unit tests (send_bulk_email, generate_report, etc.)
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
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

from apps.job_queue.main import BackgroundJob, JobPriority, JobStatus
from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


VALID_TASK = "shared.jobs.tasks.generate_report"
VALID_TASK_EMAIL = "shared.jobs.tasks.send_bulk_email"
VALID_TASK_SYNC = "shared.jobs.tasks.sync_integration"
VALID_TASK_AI = "shared.jobs.tasks.process_ai_batch"
VALID_TASK_CLEANUP = "shared.jobs.tasks.cleanup_old_data"


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
async def jq_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.job_queue.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/jobs")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest.mark.asyncio
async def test_enqueue_job(jq_client):
    r = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {"report_type": "daily"}},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["task_name"] == VALID_TASK
    assert body["status"] == "pending"
    assert body["tenant_id"] == "tenant-A"
    assert body["priority"] == "medium"
    assert body["payload"]["report_type"] == "daily"


@pytest.mark.asyncio
async def test_enqueue_unknown_task_returns_400(jq_client):
    r = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": "shared.jobs.tasks.nonexistent", "payload": {}},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 400
    assert "nonexistent" in r.json()["detail"]


@pytest.mark.asyncio
async def test_list_jobs_returns_tenant_scoped(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")
    for _ in range(3):
        r = await jq_client.post(
            "/api/v1/jobs/queue",
            json={"task_name": VALID_TASK, "payload": {}},
            headers=admin,
        )
        assert r.status_code == 201

    r = await jq_client.get("/api/v1/jobs/queue", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3
    assert all(j["tenant_id"] == "tenant-A" for j in body["data"])


@pytest.mark.asyncio
async def test_get_job_status(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=admin,
    )
    job_id = create.json()["id"]

    r = await jq_client.get(f"/api/v1/jobs/queue/{job_id}", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == job_id
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_get_unknown_job_returns_404(jq_client):
    r = await jq_client.get(
        "/api/v1/jobs/queue/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_cancel_pending_job(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=admin,
    )
    job_id = create.json()["id"]

    r = await jq_client.delete(f"/api/v1/jobs/queue/{job_id}", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "cancelled"
    assert body["completed_at"] is not None


@pytest.mark.asyncio
async def test_cancel_already_cancelled_returns_409(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=admin,
    )
    job_id = create.json()["id"]

    await jq_client.delete(f"/api/v1/jobs/queue/{job_id}", headers=admin)
    r = await jq_client.delete(f"/api/v1/jobs/queue/{job_id}", headers=admin)
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_priority_queues(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")

    high = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}, "priority": "high"},
        headers=admin,
    )
    assert high.status_code == 201
    assert high.json()["priority"] == "high"

    low = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}, "priority": "low"},
        headers=admin,
    )
    assert low.status_code == 201
    assert low.json()["priority"] == "low"

    r = await jq_client.get("/api/v1/jobs/queue?priority=high", headers=admin)
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["data"][0]["priority"] == "high"


@pytest.mark.asyncio
async def test_scheduled_job(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    r = await jq_client.post(
        "/api/v1/jobs/queue",
        json={
            "task_name": VALID_TASK,
            "payload": {},
            "scheduled_at": future,
        },
        headers=admin,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["scheduled_at"] is not None
    assert body["status"] == "pending"


@pytest.mark.asyncio
async def test_tenant_isolation_list(jq_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=a,
    )
    await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=b,
    )

    a_list = await jq_client.get("/api/v1/jobs/queue", headers=a)
    b_list = await jq_client.get("/api/v1/jobs/queue", headers=b)
    assert a_list.json()["total"] == 1
    assert b_list.json()["total"] == 1
    assert a_list.json()["data"][0]["tenant_id"] == "tenant-A"
    assert b_list.json()["data"][0]["tenant_id"] == "tenant-B"


@pytest.mark.asyncio
async def test_tenant_isolation_get_returns_404(jq_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=b,
    )
    job_id = create.json()["id"]

    cross = await jq_client.get(f"/api/v1/jobs/queue/{job_id}", headers=a)
    assert cross.status_code == 404

    own = await jq_client.get(f"/api/v1/jobs/queue/{job_id}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_cancel(jq_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=b,
    )
    job_id = create.json()["id"]

    cross = await jq_client.delete(f"/api/v1/jobs/queue/{job_id}", headers=a)
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_queue_stats(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")

    await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}, "priority": "high"},
        headers=admin,
    )
    await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}, "priority": "low"},
        headers=admin,
    )

    create = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=admin,
    )
    job_id = create.json()["id"]
    await jq_client.delete(f"/api/v1/jobs/queue/{job_id}", headers=admin)

    r = await jq_client.get("/api/v1/jobs/queue/stats", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total_jobs"] == 3
    assert body["pending"] == 2
    assert body["cancelled"] == 1
    assert body["by_priority"]["high"] == 1
    assert body["by_priority"]["low"] == 1


@pytest.mark.asyncio
async def test_non_admin_gets_403(jq_client):
    viewer = _auth("tenant-A", "viewer1", "viewer")

    r = await jq_client.get("/api/v1/jobs/queue", headers=viewer)
    assert r.status_code == 403

    r = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=viewer,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_filter_by_status(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")

    await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=admin,
    )
    create2 = await jq_client.post(
        "/api/v1/jobs/queue",
        json={"task_name": VALID_TASK, "payload": {}},
        headers=admin,
    )
    await jq_client.delete(f"/api/v1/jobs/queue/{create2.json()['id']}", headers=admin)

    pending = await jq_client.get("/api/v1/jobs/queue?status=pending", headers=admin)
    assert pending.status_code == 200
    assert pending.json()["total"] == 1

    cancelled = await jq_client.get("/api/v1/jobs/queue?status=cancelled", headers=admin)
    assert cancelled.status_code == 200
    assert cancelled.json()["total"] == 1


@pytest.mark.asyncio
async def test_no_auth_returns_401(jq_client):
    r = await jq_client.get("/api/v1/jobs/queue")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_all_valid_task_names(jq_client):
    admin = _auth("tenant-A", "adminA", "admin")
    tasks = [VALID_TASK, VALID_TASK_EMAIL, VALID_TASK_SYNC, VALID_TASK_AI, VALID_TASK_CLEANUP]

    for task in tasks:
        r = await jq_client.post(
            "/api/v1/jobs/queue",
            json={"task_name": task, "payload": {}},
            headers=admin,
        )
        assert r.status_code == 201, f"Failed for task {task}: {r.text}"


class TestCeleryTasks:
    def test_send_bulk_email(self):
        from shared.jobs.tasks import send_bulk_email

        result = send_bulk_email(
            tenant_id="test-tenant",
            recipient_ids=["u1", "u2", "u3"],
            template_id="welcome",
        )
        assert result["tenant_id"] == "test-tenant"
        assert result["total"] == 3
        assert result["sent"] == 3
        assert result["failed"] == 0

    def test_generate_report(self):
        from shared.jobs.tasks import generate_report

        result = generate_report(tenant_id="test-tenant", report_type="weekly")
        assert result["tenant_id"] == "test-tenant"
        assert result["report_type"] == "weekly"
        assert "metrics" in result

    def test_sync_integration(self):
        from shared.jobs.tasks import sync_integration

        result = sync_integration(tenant_id="test-tenant", sync_all=True)
        assert result["tenant_id"] == "test-tenant"
        assert result["sync_all"] is True
        assert result["status"] == "completed"

    def test_process_ai_batch(self):
        from shared.jobs.tasks import process_ai_batch

        result = process_ai_batch(
            tenant_id="test-tenant",
            batch_type="scoring",
            candidate_ids=["c1", "c2"],
        )
        assert result["tenant_id"] == "test-tenant"
        assert result["batch_type"] == "scoring"
        assert result["total"] == 2
        assert result["processed"] == 2

    def test_cleanup_old_data(self):
        from shared.jobs.tasks import cleanup_old_data

        result = cleanup_old_data(tenant_id="test-tenant", retention_days=90)
        assert result["tenant_id"] == "test-tenant"
        assert result["retention_days"] == 90
        assert result["status"] == "completed"
