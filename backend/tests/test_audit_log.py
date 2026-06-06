"""Audit log service tests.

Covers:

* Creating a log entry persists to the database (not in-memory).
* Listing logs returns tenant-scoped, paginated results.
* Filtering by user, resource, and action.
* Tenant isolation: a log from tenant A is not visible to tenant B.
* RBAC: non-admin authenticated users get 403 on read endpoints.
* Unauthenticated requests are rejected with 401.
* ``log_action`` helper works from any service.
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

from shared.audit.logger import log_action
from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.audit_log import AuditLog
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Engine / DB fixtures ───────────────────────────────────────────────────────


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
    """Install a per-app DB dependency override that uses the test engine."""
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
async def audit_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.audit_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/audit")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    """Open additional sessions against the same engine (for cross-restart
    / cross-tenant assertions)."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── Creating a log entry ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_log_persists_to_db(audit_client, db_session_factory):
    r = await audit_client.post(
        "/audit/logs",
        json={
            "action": "user.login",
            "resource_type": "auth",
            "resource_id": "session_1",
            "user_id": "u1",
            "details": {"ip": "127.0.0.1"},
            "ip_address": "127.0.0.1",
            "user_agent": "pytest/1.0",
        },
        headers=_auth("tenant-A", "u1", "admin"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    log_id = body["id"]

    # Re-read via a fresh session — proves real DB persistence.
    async with db_session_factory() as session:
        result = await session.execute(
            select(AuditLog).where(AuditLog.id == log_id)
        )
        row = result.scalar_one()
    assert row.tenant_id == "tenant-A"
    assert row.user_id == "u1"
    assert row.action == "user.login"
    assert row.resource_type == "auth"
    assert row.resource_id == "session_1"
    assert row.details == {"ip": "127.0.0.1"}
    assert row.ip_address == "127.0.0.1"
    assert row.user_agent == "pytest/1.0"


@pytest.mark.asyncio
async def test_create_log_via_helper(audit_client, db_session_factory):
    """``log_action`` from any service must persist to the same table."""
    async with db_session_factory() as session:
        entry = await log_action(
            session,
            action="candidate.created",
            resource_type="candidate",
            resource_id="cand_42",
            user_id="u_admin",
            tenant_id="tenant-A",
            details={"email": "jane@example.com", "source": "api"},
            ip_address="10.0.0.1",
        )
        await session.commit()
    assert entry is not None
    assert entry.id is not None

    async with db_session_factory() as session:
        result = await session.execute(
            select(AuditLog).where(AuditLog.id == entry.id)
        )
        row = result.scalar_one()
    assert row.action == "candidate.created"
    assert row.details == {"email": "jane@example.com", "source": "api"}


# ── Listing logs ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_logs_returns_tenant_scoped_results(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    for i in range(3):
        await audit_client.post(
            "/audit/logs",
            json={"action": f"act{i}", "resource_type": "test"},
            headers=admin,
        )

    r = await audit_client.get("/audit/logs", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 3
    assert body["limit"] == 50
    assert body["offset"] == 0
    actions = {row["action"] for row in body["data"]}
    assert actions == {"act0", "act1", "act2"}


@pytest.mark.asyncio
async def test_list_logs_pagination(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    for i in range(5):
        await audit_client.post(
            "/audit/logs",
            json={"action": f"p{i}", "resource_type": "test"},
            headers=admin,
        )

    page1 = await audit_client.get("/audit/logs?limit=2&offset=0", headers=admin)
    page2 = await audit_client.get("/audit/logs?limit=2&offset=2", headers=admin)
    assert page1.status_code == 200
    assert page2.status_code == 200
    assert len(page1.json()["data"]) == 2
    assert len(page2.json()["data"]) == 2
    assert page1.json()["total"] == 5
    assert page2.json()["total"] == 5

    ids1 = {r["id"] for r in page1.json()["data"]}
    ids2 = {r["id"] for r in page2.json()["data"]}
    assert ids1.isdisjoint(ids2)


# ── Filtering by user ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_logs_by_user(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await audit_client.post(
        "/audit/logs",
        json={"action": "a", "resource_type": "x", "user_id": "alice"},
        headers=admin,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "b", "resource_type": "x", "user_id": "bob"},
        headers=admin,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "c", "resource_type": "x", "user_id": "alice"},
        headers=admin,
    )

    r = await audit_client.get("/audit/logs/user/alice", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert all(row["user_id"] == "alice" for row in body["data"])


# ── Filtering by resource ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_logs_by_resource(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await audit_client.post(
        "/audit/logs",
        json={"action": "view", "resource_type": "candidate", "resource_id": "cand_1"},
        headers=admin,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "view", "resource_type": "candidate", "resource_id": "cand_2"},
        headers=admin,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "view", "resource_type": "job", "resource_id": "cand_1"},
        headers=admin,
    )

    r = await audit_client.get(
        "/audit/logs/resource/candidate/cand_1", headers=admin
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["resource_type"] == "candidate"
    assert body["data"][0]["resource_id"] == "cand_1"


# ── Filtering by action ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_logs_by_action(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await audit_client.post(
        "/audit/logs",
        json={"action": "user.login", "resource_type": "auth"},
        headers=admin,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "user.login", "resource_type": "auth"},
        headers=admin,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "user.logout", "resource_type": "auth"},
        headers=admin,
    )

    r = await audit_client.get("/audit/logs/action/user.login", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert all(row["action"] == "user.login" for row in body["data"])


# ── Get a single log ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_single_log(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await audit_client.post(
        "/audit/logs",
        json={"action": "x", "resource_type": "y"},
        headers=admin,
    )
    log_id = create.json()["id"]

    r = await audit_client.get(f"/audit/logs/{log_id}", headers=admin)
    assert r.status_code == 200
    assert r.json()["id"] == log_id
    assert r.json()["action"] == "x"


@pytest.mark.asyncio
async def test_get_unknown_log_404(audit_client):
    r = await audit_client.get(
        "/audit/logs/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


# ── Tenant isolation ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_on_list(audit_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await audit_client.post(
        "/audit/logs",
        json={"action": "A-only", "resource_type": "x"},
        headers=a,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "B-only", "resource_type": "x"},
        headers=b,
    )

    list_a = await audit_client.get("/audit/logs", headers=a)
    list_b = await audit_client.get("/audit/logs", headers=b)
    assert list_a.status_code == 200
    assert list_b.status_code == 200
    a_actions = {r["action"] for r in list_a.json()["data"]}
    b_actions = {r["action"] for r in list_b.json()["data"]}
    assert a_actions == {"A-only"}
    assert b_actions == {"B-only"}


@pytest.mark.asyncio
async def test_tenant_isolation_on_get_returns_404(audit_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await audit_client.post(
        "/audit/logs",
        json={"action": "B-secret", "resource_type": "x"},
        headers=b,
    )
    b_id = create.json()["id"]

    cross = await audit_client.get(f"/audit/logs/{b_id}", headers=a)
    assert cross.status_code == 404

    own = await audit_client.get(f"/audit/logs/{b_id}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_filter(audit_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await audit_client.post(
        "/audit/logs",
        json={"action": "shared-action", "resource_type": "x", "user_id": "u"},
        headers=a,
    )
    await audit_client.post(
        "/audit/logs",
        json={"action": "shared-action", "resource_type": "x", "user_id": "u"},
        headers=b,
    )

    a_filter = await audit_client.get("/audit/logs/user/u", headers=a)
    b_filter = await audit_client.get("/audit/logs/user/u", headers=b)
    assert a_filter.json()["total"] == 1
    assert b_filter.json()["total"] == 1
    assert a_filter.json()["data"][0]["tenant_id"] == "tenant-A"
    assert b_filter.json()["data"][0]["tenant_id"] == "tenant-B"


# ── Admin-only access ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_non_admin_cannot_list_logs(audit_client):
    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await audit_client.get("/audit/logs", headers=recruiter)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_get_log(audit_client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await audit_client.post(
        "/audit/logs",
        json={"action": "x", "resource_type": "y"},
        headers=admin,
    )
    log_id = create.json()["id"]

    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await audit_client.get(f"/audit/logs/{log_id}", headers=recruiter)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_filter_logs(audit_client):
    recruiter = _auth("tenant-A", "recA", "recruiter")
    assert (
        await audit_client.get("/audit/logs/user/u1", headers=recruiter)
    ).status_code == 403
    assert (
        await audit_client.get(
            "/audit/logs/resource/candidate/cand_1", headers=recruiter
        )
    ).status_code == 403
    assert (
        await audit_client.get("/audit/logs/action/login", headers=recruiter)
    ).status_code == 403


@pytest.mark.asyncio
async def test_non_admin_cannot_create_log(audit_client):
    recruiter = _auth("tenant-A", "recA", "recruiter")
    r = await audit_client.post(
        "/audit/logs",
        json={"action": "x", "resource_type": "y"},
        headers=recruiter,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_admin_role_aliases_granted_access(audit_client):
    """``tenant_admin`` and ``admin`` aliases should both work."""
    tenant_admin = _auth("tenant-A", "adminA", "tenant_admin")
    r = await audit_client.get("/audit/logs", headers=tenant_admin)
    assert r.status_code == 200

    super_admin = _auth("tenant-A", "root", "super_admin")
    r = await audit_client.get("/audit/logs", headers=super_admin)
    assert r.status_code == 200


# ── Unauthenticated access ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_list_is_401(audit_client):
    r = await audit_client.get("/audit/logs")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_create_is_401(audit_client):
    r = await audit_client.post(
        "/audit/logs", json={"action": "x", "resource_type": "y"}
    )
    assert r.status_code == 401


# ── Persistence survives "container restart" ─────────────────────────────────


@pytest.mark.asyncio
async def test_data_survives_engine_restart():
    """Closes the engine, recreates it against the same SQLite file, and
    verifies the audit row is still there.  Proves real persistence."""
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "audit.db"
        file_url = f"sqlite+aiosqlite:///{db_path}"

        eng1 = create_async_engine(file_url, echo=False)
        async with eng1.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        factory1 = async_sessionmaker(eng1, class_=AsyncSession, expire_on_commit=False)

        new_id = str(uuid4())
        async with factory1() as session:
            session.add(AuditLog(
                id=new_id,
                tenant_id="tenant-A",
                user_id="u1",
                action="persist.me",
                resource_type="test",
                resource_id="r1",
                details={"k": "v"},
            ))
            await session.commit()
        await eng1.dispose()

        eng2 = create_async_engine(file_url, echo=False)
        factory2 = async_sessionmaker(eng2, class_=AsyncSession, expire_on_commit=False)
        async with factory2() as session:
            result = await session.execute(
                select(AuditLog).where(AuditLog.id == new_id)
            )
            row = result.scalar_one_or_none()
        await eng2.dispose()

        assert row is not None, "AuditLog lost across engine restart"
        assert row.action == "persist.me"
        assert row.details == {"k": "v"}
