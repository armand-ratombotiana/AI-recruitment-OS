"""Notification service DB persistence tests.

Verifies that:
* CRUD operations actually persist to the database (not an in-memory dict).
* Committed data survives a fresh DB session (simulated container restart).
* Tenant isolation is enforced end-to-end via the API.
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
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.notification import Notification
from shared.core.security import create_access_token
from sqlmodel import select


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
async def notifications_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.notification_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/notifications")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    """Expose a session factory so tests can open a *second* session against
    the same engine to simulate a container restart."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# ── CRUD persists ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_notification_persists_to_db(
    notifications_client, db_session_factory
):
    r = await notifications_client.post(
        "/notifications/",
        json={"title": "Hello", "message": "World", "type": "info"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "Hello"
    assert body["read"] is False
    notification_id = body["id"]

    # Read it back via a fresh session (proves it is in the DB, not memory).
    async with db_session_factory() as session:
        result = await session.execute(
            select(Notification).where(Notification.id == notification_id)
        )
        row = result.scalar_one()
    assert row.title == "Hello"
    assert row.message == "World"
    assert row.tenant_id == "tenant-A"
    assert row.read is False


@pytest.mark.asyncio
async def test_get_notification_returns_db_row(
    notifications_client, db_session_factory
):
    create = await notifications_client.post(
        "/notifications/",
        json={"title": "Persist me", "message": "body"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    nid = create.json()["id"]

    r = await notifications_client.get(
        f"/notifications/{nid}", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 200
    assert r.json()["id"] == nid
    assert r.json()["title"] == "Persist me"


@pytest.mark.asyncio
async def test_update_notification_persists(
    notifications_client, db_session_factory
):
    create = await notifications_client.post(
        "/notifications/",
        json={"title": "Original", "message": "msg"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    nid = create.json()["id"]

    r = await notifications_client.put(
        f"/notifications/{nid}",
        json={"title": "Updated", "read": True},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Updated"
    assert r.json()["read"] is True

    # Re-read via a new session.
    async with db_session_factory() as session:
        result = await session.execute(
            select(Notification).where(Notification.id == nid)
        )
        row = result.scalar_one()
    assert row.title == "Updated"
    assert row.read is True


@pytest.mark.asyncio
async def test_delete_notification_removes_from_db(
    notifications_client, db_session_factory
):
    create = await notifications_client.post(
        "/notifications/",
        json={"title": "Doomed", "message": "msg"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    nid = create.json()["id"]

    r = await notifications_client.delete(
        f"/notifications/{nid}", headers=_auth("tenant-A", "adminA", "admin")
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    async with db_session_factory() as session:
        result = await session.execute(
            select(Notification).where(Notification.id == nid)
        )
        row = result.scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_mark_read_persists(notifications_client, db_session_factory):
    create = await notifications_client.post(
        "/notifications/",
        json={"title": "Unread", "message": "x"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    nid = create.json()["id"]

    r = await notifications_client.post(
        f"/notifications/{nid}/read",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 200
    assert r.json()["read"] is True

    async with db_session_factory() as session:
        result = await session.execute(
            select(Notification).where(Notification.id == nid)
        )
        row = result.scalar_one()
    assert row.read is True


@pytest.mark.asyncio
async def test_mark_all_read_updates_all_tenant_rows(
    notifications_client, db_session_factory
):
    admin = _auth("tenant-A", "adminA", "admin")
    for i in range(3):
        await notifications_client.post(
            "/notifications/",
            json={"title": f"n{i}", "message": "m"},
            headers=admin,
        )

    r = await notifications_client.post("/notifications/read-all", headers=admin)
    assert r.status_code == 200
    assert r.json()["marked_read"] == 3

    async with db_session_factory() as session:
        result = await session.execute(
            select(Notification).where(Notification.tenant_id == "tenant-A")
        )
        rows = result.scalars().all()
    assert all(row.read for row in rows)


# ── Persistence survives "container restart" ────────────────────────────────


@pytest.mark.asyncio
async def test_data_survives_container_restart():
    """Close the engine, recreate the engine from the same connection, and
    re-verify the data.  This proves persistence is real (not in-memory)."""
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "notifications.db"
        file_url = f"sqlite+aiosqlite:///{db_path}"

        # First "container" — create data and commit.
        eng1 = create_async_engine(file_url, echo=False)
        async with eng1.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

        factory1 = async_sessionmaker(eng1, class_=AsyncSession, expire_on_commit=False)
        nid = str(uuid4())
        async with factory1() as session:
            session.add(Notification(
                id=nid, tenant_id="tenant-A", user_id=None,
                type="info", title="survives", message="x", read=False, link=None,
            ))
            await session.commit()

        await eng1.dispose()

        # Second "container" — fresh engine, same on-disk file.
        eng2 = create_async_engine(file_url, echo=False)
        factory2 = async_sessionmaker(eng2, class_=AsyncSession, expire_on_commit=False)
        async with factory2() as session:
            result = await session.execute(
                select(Notification).where(Notification.id == nid)
            )
            row = result.scalar_one_or_none()

        await eng2.dispose()

        assert row is not None, "Notification lost across engine restart"
        assert row.title == "survives"
        assert row.tenant_id == "tenant-A"


# ── Tenant isolation ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_on_list(notifications_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await notifications_client.post(
        "/notifications/", json={"title": "A-only", "message": "m"}, headers=a
    )
    await notifications_client.post(
        "/notifications/", json={"title": "B-only", "message": "m"}, headers=b
    )

    list_a = await notifications_client.get("/notifications/", headers=a)
    list_b = await notifications_client.get("/notifications/", headers=b)
    assert list_a.status_code == 200
    assert list_b.status_code == 200

    a_titles = {n["title"] for n in list_a.json()["notifications"]}
    b_titles = {n["title"] for n in list_b.json()["notifications"]}
    assert "A-only" in a_titles and "B-only" not in a_titles
    assert "B-only" in b_titles and "A-only" not in b_titles


@pytest.mark.asyncio
async def test_tenant_isolation_on_get_returns_404(notifications_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await notifications_client.post(
        "/notifications/", json={"title": "B-secret", "message": "m"}, headers=b
    )
    b_id = create.json()["id"]

    cross = await notifications_client.get(f"/notifications/{b_id}", headers=a)
    assert cross.status_code == 404

    own = await notifications_client.get(f"/notifications/{b_id}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_update_returns_404(notifications_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await notifications_client.post(
        "/notifications/", json={"title": "B-only", "message": "m"}, headers=b
    )
    b_id = create.json()["id"]

    cross = await notifications_client.put(
        f"/notifications/{b_id}", json={"title": "Hacked"}, headers=a
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_delete_returns_404(notifications_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    create = await notifications_client.post(
        "/notifications/", json={"title": "B-only", "message": "m"}, headers=b
    )
    b_id = create.json()["id"]

    cross = await notifications_client.delete(f"/notifications/{b_id}", headers=a)
    assert cross.status_code == 404

    # Verify the original notification is still there for tenant B.
    still = await notifications_client.get(f"/notifications/{b_id}", headers=b)
    assert still.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_mark_all_read(notifications_client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")

    await notifications_client.post(
        "/notifications/", json={"title": "A1", "message": "m"}, headers=a
    )
    await notifications_client.post(
        "/notifications/", json={"title": "A2", "message": "m"}, headers=a
    )
    await notifications_client.post(
        "/notifications/", json={"title": "B1", "message": "m"}, headers=b
    )

    r = await notifications_client.post("/notifications/read-all", headers=a)
    assert r.status_code == 200
    assert r.json()["marked_read"] == 2  # only A's two

    # Tenant B's notification should still be unread.
    list_b = await notifications_client.get("/notifications/?read=false", headers=b)
    assert list_b.status_code == 200
    assert list_b.json()["unread_count"] == 1


# ── Unauthenticated access is rejected ────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_list_is_401(notifications_client):
    r = await notifications_client.get("/notifications/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_create_is_401(notifications_client):
    r = await notifications_client.post(
        "/notifications/", json={"title": "x", "message": "y"}
    )
    assert r.status_code == 401


# ── RBAC: non-admin cannot create ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_non_admin_cannot_create_notification(notifications_client):
    headers = _auth("tenant-A", "viewer1", "viewer")
    r = await notifications_client.post(
        "/notifications/", json={"title": "x", "message": "y"}, headers=headers
    )
    assert r.status_code == 403


# ── Filtering ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_filter_by_read(notifications_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await notifications_client.post(
        "/notifications/", json={"title": "unread", "message": "m"}, headers=admin
    )
    r2 = await notifications_client.post(
        "/notifications/", json={"title": "to-read", "message": "m"}, headers=admin
    )
    nid = r2.json()["id"]
    await notifications_client.post(
        f"/notifications/{nid}/read", headers=admin
    )

    unread = await notifications_client.get(
        "/notifications/?read=false", headers=admin
    )
    read = await notifications_client.get(
        "/notifications/?read=true", headers=admin
    )
    assert unread.status_code == 200
    assert read.status_code == 200
    assert {n["title"] for n in unread.json()["notifications"]} == {"unread"}
    assert {n["title"] for n in read.json()["notifications"]} == {"to-read"}


@pytest.mark.asyncio
async def test_filter_by_type(notifications_client):
    admin = _auth("tenant-A", "adminA", "admin")
    await notifications_client.post(
        "/notifications/", json={"title": "info1", "message": "m", "type": "info"}, headers=admin
    )
    await notifications_client.post(
        "/notifications/", json={"title": "warn1", "message": "m", "type": "warning"}, headers=admin
    )

    r = await notifications_client.get("/notifications/?type=info", headers=admin)
    assert r.status_code == 200
    titles = {n["title"] for n in r.json()["notifications"]}
    assert titles == {"info1"}


# ── 404 for missing resources ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_unknown_notification_404(notifications_client):
    r = await notifications_client.get(
        "/notifications/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_unknown_notification_404(notifications_client):
    r = await notifications_client.put(
        "/notifications/does-not-exist",
        json={"title": "x"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_unknown_notification_404(notifications_client):
    r = await notifications_client.delete(
        "/notifications/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


# ── Unread count ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unread_count_in_list(notifications_client):
    admin = _auth("tenant-A", "adminA", "admin")
    for i in range(3):
        await notifications_client.post(
            "/notifications/", json={"title": f"n{i}", "message": "m"}, headers=admin
        )
    r1 = await notifications_client.post(
        "/notifications/", json={"title": "read-me", "message": "m"}, headers=admin
    )
    await notifications_client.post(
        f"/notifications/{r1.json()['id']}/read", headers=admin
    )

    r = await notifications_client.get("/notifications/", headers=admin)
    assert r.json()["total"] == 4
    assert r.json()["unread_count"] == 3
