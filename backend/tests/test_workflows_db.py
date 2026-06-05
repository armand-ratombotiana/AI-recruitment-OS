"""Workflow engine DB persistence tests.

Verifies that:
* CRUD operations actually persist to the database (not an in-memory dict).
* Committed data survives a fresh DB session (simulated container restart).
* Tenant isolation is enforced end-to-end via the API.
* Triggering a workflow records a ``WorkflowRun`` and updates the parent's
  ``runs``/``last_run`` counters in the DB.
"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
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

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.workflow import Workflow, WorkflowRun
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Fixtures ───────────────────────────────────────────────────────────────────


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
async def workflows_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.workflow_engine.main import router

    app = FastAPI()
    app.include_router(router, prefix="/workflows")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── CRUD persists ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_workflow_persists_to_db(
    workflows_client, db_session_factory
):
    r = await workflows_client.post(
        "/workflows/",
        json={
            "name": "Auto-Screen",
            "description": "Auto-screens new applications",
            "steps": [
                {"order": 1, "type": "ai_evaluation", "name": "Parse Resume"},
                {"order": 2, "type": "notification", "name": "Notify Recruiter"},
            ],
            "is_active": True,
        },
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Auto-Screen"
    assert body["is_active"] is True
    assert body["runs"] == 0
    workflow_id = body["id"]

    # Re-read via a fresh session to prove it is in the DB.
    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == workflow_id)
        )
        row = result.scalar_one()
    assert row.name == "Auto-Screen"
    assert row.tenant_id == "tenant-A"
    assert row.is_active is True
    assert len(row.steps) == 2


@pytest.mark.asyncio
async def test_get_workflow_returns_db_row(workflows_client, db_session_factory):
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Get Me", "steps": []},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    wid = create.json()["id"]

    r = await workflows_client.get(
        f"/workflows/{wid}", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 200
    assert r.json()["id"] == wid
    assert r.json()["name"] == "Get Me"


@pytest.mark.asyncio
async def test_update_workflow_persists(workflows_client, db_session_factory):
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Original", "steps": []},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    wid = create.json()["id"]

    r = await workflows_client.put(
        f"/workflows/{wid}",
        json={"name": "Renamed", "is_active": True},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert r.json()["is_active"] is True

    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        row = result.scalar_one()
    assert row.name == "Renamed"
    assert row.is_active is True


@pytest.mark.asyncio
async def test_update_steps_persists_as_json(workflows_client, db_session_factory):
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Steps", "steps": [{"order": 1, "name": "old"}]},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    wid = create.json()["id"]

    new_steps = [
        {"order": 1, "type": "ai_evaluation", "name": "Parse Resume"},
        {"order": 2, "type": "condition", "name": "Check minimum"},
    ]
    r = await workflows_client.put(
        f"/workflows/{wid}",
        json={"steps": new_steps},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200
    assert r.json()["steps"] == new_steps

    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        row = result.scalar_one()
    assert row.steps == new_steps


@pytest.mark.asyncio
async def test_delete_workflow_removes_from_db(
    workflows_client, db_session_factory
):
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Doomed", "steps": []},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    wid = create.json()["id"]

    r = await workflows_client.delete(
        f"/workflows/{wid}", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        row = result.scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_list_workflows_returns_db_rows(workflows_client):
    admin = _auth("tenant-A", "adminA", "admin")
    for i in range(3):
        await workflows_client.post(
            "/workflows/", json={"name": f"wf{i}", "steps": []}, headers=admin
        )

    r = await workflows_client.get("/workflows/", headers=admin)
    assert r.status_code == 200
    assert r.json()["total"] == 3


@pytest.mark.asyncio
async def test_list_workflows_filter_by_is_active(workflows_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await workflows_client.post(
        "/workflows/", json={"name": "active", "is_active": True, "steps": []}, headers=admin
    )
    await workflows_client.post(
        "/workflows/", json={"name": "draft", "is_active": False, "steps": []}, headers=admin
    )

    r_active = await workflows_client.get("/workflows/?is_active=true", headers=admin)
    r_inactive = await workflows_client.get("/workflows/?is_active=false", headers=admin)
    assert r_active.status_code == 200
    assert r_inactive.status_code == 200
    assert {w["name"] for w in r_active.json()["workflows"]} == {"active"}
    assert {w["name"] for w in r_inactive.json()["workflows"]} == {"draft"}


# ── Activate / deactivate ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_activate_and_deactivate_persist(workflows_client, db_session_factory):
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Toggle", "steps": []},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    wid = create.json()["id"]
    assert create.json()["is_active"] is False

    r = await workflows_client.post(
        f"/workflows/{wid}/activate", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is True

    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        row = result.scalar_one()
    assert row.is_active is True

    r2 = await workflows_client.post(
        f"/workflows/{wid}/deactivate", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r2.status_code == 200
    assert r2.json()["is_active"] is False

    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        row = result.scalar_one()
    assert row.is_active is False


# ── Trigger + WorkflowRun ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_trigger_records_workflow_run(workflows_client, db_session_factory):
    create = await workflows_client.post(
        "/workflows/",
        json={
            "name": "Triggerme",
            "is_active": True,
            "steps": [
                {"order": 1, "name": "step1"},
                {"order": 2, "name": "step2"},
            ],
        },
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    wid = create.json()["id"]

    r = await workflows_client.post(
        f"/workflows/{wid}/trigger",
        json={"k": "v"},
        headers=_auth("tenant-A", "userA", "member"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert body["steps_executed"] == 2
    run_id = body["execution_id"]

    # WorkflowRun row exists in DB.
    async with db_session_factory() as session:
        result = await session.execute(
            select(WorkflowRun).where(WorkflowRun.id == run_id)
        )
        run = result.scalar_one()
    assert run.workflow_id == wid
    assert run.status == "completed"
    assert run.started_at is not None
    assert run.finished_at is not None
    assert run.result["context"] == {"k": "v"}
    assert len(run.result["steps"]) == 2

    # Parent workflow's runs counter and last_run updated.
    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        wf = result.scalar_one()
    assert wf.runs == 1
    assert wf.last_run is not None


@pytest.mark.asyncio
async def test_trigger_increments_runs_counter(workflows_client, db_session_factory):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Counter", "is_active": True, "steps": [{"name": "s"}]},
        headers=admin,
    )
    wid = create.json()["id"]

    for _ in range(3):
        await workflows_client.post(
            f"/workflows/{wid}/trigger", json={}, headers=admin
        )

    async with db_session_factory() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.id == wid)
        )
        wf = result.scalar_one()
    assert wf.runs == 3


@pytest.mark.asyncio
async def test_trigger_inactive_workflow_rejected(workflows_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Draft", "is_active": False, "steps": []},
        headers=admin,
    )
    wid = create.json()["id"]

    r = await workflows_client.post(
        f"/workflows/{wid}/trigger", json={}, headers=admin
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_list_executions_returns_db_runs(workflows_client, db_session_factory):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await workflows_client.post(
        "/workflows/",
        json={"name": "Exec", "is_active": True, "steps": [{"name": "s"}]},
        headers=admin,
    )
    wid = create.json()["id"]
    await workflows_client.post(f"/workflows/{wid}/trigger", json={}, headers=admin)
    await workflows_client.post(f"/workflows/{wid}/trigger", json={}, headers=admin)

    r = await workflows_client.get(
        f"/workflows/{wid}/executions",
        headers=_auth("tenant-A", "userA", "member"),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 2


# ── Persistence survives "container restart" ────────────────────────────────


@pytest.mark.asyncio
async def test_data_survives_container_restart():
    """Close the engine, recreate the engine from the same on-disk file, and
    re-verify the workflow + run.  This proves persistence is real."""
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "workflows.db"
        file_url = f"sqlite+aiosqlite:///{db_path}"

        eng1 = create_async_engine(file_url, echo=False)
        async with eng1.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

        factory1 = async_sessionmaker(eng1, class_=AsyncSession, expire_on_commit=False)
        wid = str(uuid4())
        rid = str(uuid4())
        async with factory1() as session:
            session.add(Workflow(
                id=wid, tenant_id="tenant-A", name="Survivor",
                description=None, steps=[{"name": "s"}], is_active=True,
                runs=5, success_rate=0.8, last_run=None,
            ))
            session.add(WorkflowRun(
                id=rid, workflow_id=wid, status="completed",
                result={"steps": [{"name": "s", "status": "completed"}]},
            ))
            await session.commit()

        await eng1.dispose()

        eng2 = create_async_engine(file_url, echo=False)
        factory2 = async_sessionmaker(eng2, class_=AsyncSession, expire_on_commit=False)
        async with factory2() as session:
            wf_result = await session.execute(
                select(Workflow).where(Workflow.id == wid)
            )
            run_result = await session.execute(
                select(WorkflowRun).where(WorkflowRun.id == rid)
            )
            wf = wf_result.scalar_one_or_none()
            run = run_result.scalar_one_or_none()
        await eng2.dispose()

        assert wf is not None, "Workflow lost across engine restart"
        assert wf.name == "Survivor"
        assert wf.runs == 5
        assert wf.is_active is True
        assert run is not None, "WorkflowRun lost across engine restart"
        assert run.status == "completed"
        assert run.result["steps"][0]["name"] == "s"


# ── Tenant isolation ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_on_list(workflows_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await workflows_client.post(
        "/workflows/", json={"name": "wf-A", "steps": []}, headers=a
    )
    await workflows_client.post(
        "/workflows/", json={"name": "wf-B", "steps": []}, headers=b
    )

    list_a = await workflows_client.get("/workflows/", headers=a)
    list_b = await workflows_client.get("/workflows/", headers=b)
    assert list_a.status_code == 200
    assert list_b.status_code == 200
    a_names = {w["name"] for w in list_a.json()["workflows"]}
    b_names = {w["name"] for w in list_b.json()["workflows"]}
    assert "wf-A" in a_names and "wf-B" not in a_names
    assert "wf-B" in b_names and "wf-A" not in b_names


@pytest.mark.asyncio
async def test_tenant_isolation_on_get_returns_404(workflows_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await workflows_client.post(
        "/workflows/", json={"name": "B-only", "steps": []}, headers=b
    )
    b_id = create.json()["id"]

    cross = await workflows_client.get(f"/workflows/{b_id}", headers=a)
    assert cross.status_code == 404

    own = await workflows_client.get(f"/workflows/{b_id}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_update_returns_404(workflows_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await workflows_client.post(
        "/workflows/", json={"name": "B-only", "steps": []}, headers=b
    )
    b_id = create.json()["id"]

    cross = await workflows_client.put(
        f"/workflows/{b_id}", json={"name": "Hacked"}, headers=a
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_delete_returns_404(workflows_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await workflows_client.post(
        "/workflows/", json={"name": "B-only", "steps": []}, headers=b
    )
    b_id = create.json()["id"]

    cross = await workflows_client.delete(f"/workflows/{b_id}", headers=a)
    assert cross.status_code == 404

    still = await workflows_client.get(f"/workflows/{b_id}", headers=b)
    assert still.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_trigger_returns_404(workflows_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await workflows_client.post(
        "/workflows/", json={"name": "B-only", "is_active": True, "steps": []}, headers=b
    )
    b_id = create.json()["id"]

    cross = await workflows_client.post(f"/workflows/{b_id}/trigger", json={}, headers=a)
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_executions_returns_404(workflows_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await workflows_client.post(
        "/workflows/", json={"name": "B-only", "steps": []}, headers=b
    )
    b_id = create.json()["id"]

    cross = await workflows_client.get(
        f"/workflows/{b_id}/executions", headers=a
    )
    assert cross.status_code == 404


# ── Auth / RBAC ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_list_is_401(workflows_client):
    r = await workflows_client.get("/workflows/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_cannot_create_workflow(workflows_client):
    headers = _auth("tenant-A", "viewer1", "viewer")
    r = await workflows_client.post(
        "/workflows/", json={"name": "x", "steps": []}, headers=headers
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_update_workflow(workflows_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await workflows_client.post(
        "/workflows/", json={"name": "x", "steps": []}, headers=admin
    )
    wid = create.json()["id"]

    r = await workflows_client.put(
        f"/workflows/{wid}", json={"name": "y"},
        headers=_auth("tenant-A", "viewer1", "viewer"),
    )
    assert r.status_code == 403


# ── 404 for missing resources ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_unknown_workflow_404(workflows_client):
    r = await workflows_client.get(
        "/workflows/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_unknown_workflow_404(workflows_client):
    r = await workflows_client.put(
        "/workflows/does-not-exist",
        json={"name": "x"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_unknown_workflow_404(workflows_client):
    r = await workflows_client.delete(
        "/workflows/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404
