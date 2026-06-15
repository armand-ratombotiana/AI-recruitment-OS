"""Push notifications tests — device management, delivery, history, tenant isolation."""
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

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.push_notification import PushDevice, PushNotification
from shared.core.security import create_access_token
from shared.push_notifications.provider import MockPushProvider, set_push_provider, get_push_provider


def _make_token(tenant_id: str, sub: str = "user", role: str = "member") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
        "id": sub,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "member") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


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
async def push_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.push_notifications.main import router

    provider = MockPushProvider()
    set_push_provider(provider)

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/push")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_db():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override_db
    app.dependency_overrides[get_push_provider] = lambda: provider
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


PREFIX = "/api/v1/push"


@pytest.mark.asyncio
async def test_health(push_client):
    r = await push_client.get(f"{PREFIX}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_register_device(push_client):
    r = await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-abc", "platform": "ios", "app_version": "1.2.3"},
        headers=_auth("tenant-A", "user1"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["device_token"] == "tok-abc"
    assert body["platform"] == "ios"
    assert body["app_version"] == "1.2.3"
    assert body["tenant_id"] == "tenant-A"
    assert body["user_id"] == "user1"
    assert body["id"] is not None


@pytest.mark.asyncio
async def test_register_device_invalid_platform(push_client):
    r = await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-x", "platform": "windows_phone"},
        headers=_auth("tenant-A", "user1"),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_register_device_empty_token(push_client):
    r = await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "", "platform": "android"},
        headers=_auth("tenant-A", "user1"),
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_register_device_idempotent(push_client):
    h = _auth("tenant-A", "user1")
    payload = {"device_token": "tok-dup", "platform": "android"}
    r1 = await push_client.post(f"{PREFIX}/register", json=payload, headers=h)
    r2 = await push_client.post(f"{PREFIX}/register", json=payload, headers=h)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]


@pytest.mark.asyncio
async def test_unregister_device(push_client):
    h = _auth("tenant-A", "user1")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-del", "platform": "ios"},
        headers=h,
    )
    r = await push_client.request(
        "DELETE",
        f"{PREFIX}/unregister",
        json={"device_token": "tok-del"},
        headers=h,
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    devices = await push_client.get(f"{PREFIX}/devices", headers=h)
    assert devices.status_code == 200
    assert len(devices.json()["devices"]) == 0


@pytest.mark.asyncio
async def test_unregister_nonexistent_device(push_client):
    r = await push_client.request(
        "DELETE",
        f"{PREFIX}/unregister",
        json={"device_token": "no-such-token"},
        headers=_auth("tenant-A", "user1"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_list_devices(push_client):
    h = _auth("tenant-A", "user1")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-1", "platform": "ios"},
        headers=h,
    )
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-2", "platform": "android"},
        headers=h,
    )
    r = await push_client.get(f"{PREFIX}/devices", headers=h)
    assert r.status_code == 200
    assert len(r.json()["devices"]) == 2


@pytest.mark.asyncio
async def test_send_push_notification(push_client):
    h = _auth("tenant-A", "user1")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-send", "platform": "ios"},
        headers=h,
    )

    sender = _auth("tenant-A", "recruiter1", "member")
    r = await push_client.post(
        f"{PREFIX}/send",
        json={
            "user_id": "user1",
            "title": "New offer",
            "body": "You have a new offer",
            "data": {"offer_id": "123"},
        },
        headers=sender,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["sent"] == 1
    assert body["results"][0]["status"] == "sent"


@pytest.mark.asyncio
async def test_send_push_no_devices(push_client):
    sender = _auth("tenant-A", "recruiter1", "member")
    r = await push_client.post(
        f"{PREFIX}/send",
        json={"user_id": "nobody", "title": "Hi", "body": "Hello"},
        headers=sender,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_broadcast(push_client):
    h1 = _auth("tenant-A", "user1")
    h2 = _auth("tenant-A", "user2")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-b1", "platform": "ios"},
        headers=h1,
    )
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-b2", "platform": "android"},
        headers=h2,
    )

    sender = _auth("tenant-A", "admin1", "admin")
    r = await push_client.post(
        f"{PREFIX}/broadcast",
        json={"title": "Maintenance", "body": "Server down at 2am"},
        headers=sender,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["devices_reached"] == 2
    assert body["users_reached"] == 2
    assert body["sent"] == 2


@pytest.mark.asyncio
async def test_notification_history(push_client):
    h = _auth("tenant-A", "user1")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-hist", "platform": "web"},
        headers=h,
    )

    sender = _auth("tenant-A", "recruiter1", "member")
    for i in range(3):
        await push_client.post(
            f"{PREFIX}/send",
            json={"user_id": "user1", "title": f"Msg {i}", "body": "body"},
            headers=sender,
        )

    r = await push_client.get(f"{PREFIX}/history", headers=h)
    assert r.status_code == 200
    assert len(r.json()["notifications"]) == 3


@pytest.mark.asyncio
async def test_history_persists_to_db(push_client, db_session_factory):
    h = _auth("tenant-A", "user1")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-persist", "platform": "ios"},
        headers=h,
    )
    sender = _auth("tenant-A", "recruiter1", "member")
    await push_client.post(
        f"{PREFIX}/send",
        json={"user_id": "user1", "title": "Persisted", "body": "check"},
        headers=sender,
    )

    async with db_session_factory() as session:
        result = await session.execute(
            select(PushNotification).where(
                PushNotification.tenant_id == "tenant-A",
                PushNotification.title == "Persisted",
            )
        )
        row = result.scalar_one()
    assert row.body == "check"
    assert row.status == "sent"


@pytest.mark.asyncio
async def test_tenant_isolation_devices(push_client):
    a = _auth("tenant-A", "userA")
    b = _auth("tenant-B", "userB")

    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-A", "platform": "ios"},
        headers=a,
    )
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-B", "platform": "android"},
        headers=b,
    )

    ra = await push_client.get(f"{PREFIX}/devices", headers=a)
    rb = await push_client.get(f"{PREFIX}/devices", headers=b)
    assert len(ra.json()["devices"]) == 1
    assert len(rb.json()["devices"]) == 1
    assert ra.json()["devices"][0]["device_token"] == "tok-A"
    assert rb.json()["devices"][0]["device_token"] == "tok-B"


@pytest.mark.asyncio
async def test_tenant_isolation_broadcast(push_client):
    a = _auth("tenant-A", "userA")
    b = _auth("tenant-B", "userB")

    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-isA", "platform": "ios"},
        headers=a,
    )
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-isB", "platform": "android"},
        headers=b,
    )

    sender_a = _auth("tenant-A", "adminA", "admin")
    r = await push_client.post(
        f"{PREFIX}/broadcast",
        json={"title": "A-only", "body": "msg"},
        headers=sender_a,
    )
    assert r.status_code == 200
    assert r.json()["devices_reached"] == 1
    assert r.json()["users_reached"] == 1


@pytest.mark.asyncio
async def test_tenant_isolation_history(push_client):
    a = _auth("tenant-A", "userA")
    b = _auth("tenant-B", "userB")

    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-hA", "platform": "ios"},
        headers=a,
    )
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-hB", "platform": "android"},
        headers=b,
    )

    sender_a = _auth("tenant-A", "recA", "member")
    sender_b = _auth("tenant-B", "recB", "member")

    await push_client.post(
        f"{PREFIX}/send",
        json={"user_id": "userA", "title": "For A", "body": "body"},
        headers=sender_a,
    )
    await push_client.post(
        f"{PREFIX}/send",
        json={"user_id": "userB", "title": "For B", "body": "body"},
        headers=sender_b,
    )

    ha = await push_client.get(f"{PREFIX}/history", headers=a)
    hb = await push_client.get(f"{PREFIX}/history", headers=b)
    a_titles = {n["title"] for n in ha.json()["notifications"]}
    b_titles = {n["title"] for n in hb.json()["notifications"]}
    assert "For A" in a_titles and "For B" not in a_titles
    assert "For B" in b_titles and "For A" not in b_titles


@pytest.mark.asyncio
async def test_unauthenticated_register(push_client):
    r = await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "x", "platform": "ios"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_devices(push_client):
    r = await push_client.get(f"{PREFIX}/devices")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_viewer_cannot_send(push_client):
    h = _auth("tenant-A", "viewer1", "viewer")
    r = await push_client.post(
        f"{PREFIX}/send",
        json={"user_id": "user1", "title": "x", "body": "y"},
        headers=h,
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_send_push_data_stored_as_json(push_client, db_session_factory):
    h = _auth("tenant-A", "user1")
    await push_client.post(
        f"{PREFIX}/register",
        json={"device_token": "tok-json", "platform": "web"},
        headers=h,
    )
    sender = _auth("tenant-A", "recruiter1", "member")
    await push_client.post(
        f"{PREFIX}/send",
        json={
            "user_id": "user1",
            "title": "JSON test",
            "body": "check data",
            "data": {"key": "value", "nested": {"a": 1}},
        },
        headers=sender,
    )

    async with db_session_factory() as session:
        result = await session.execute(
            select(PushNotification).where(PushNotification.title == "JSON test")
        )
        row = result.scalar_one()
    assert row.data is not None
    import json
    parsed = json.loads(row.data)
    assert parsed["key"] == "value"
    assert parsed["nested"]["a"] == 1
