"""Integration tests for API key CRUD + change-password + profile update."""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from shared.core.config import Settings, get_settings
from shared.core.database import get_db_dependency
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.security import create_access_token, hash_password

from apps.auth_service.main import router as auth_router


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
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
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def app_and_client(session_factory):
    app = FastAPI()
    app.include_router(auth_router)
    app.dependency_overrides[get_settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
        DEMO_ENABLED=False,
    )

    async def _override_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield app, c


@pytest_asyncio.fixture
async def auth_user(session_factory):
    async with session_factory() as s:
        u = User(
            id="u-keys",
            tenant_id="acme",
            email="keys@acme.com",
            full_name="Keys User",
            hashed_password=hash_password("OldPassword1!"),
            role=UserRole.TENANT_ADMIN,
            status=UserStatus.ACTIVE,
        )
        s.add(u)
        await s.commit()
    return u.id


def _bearer(user_id: str, tenant_id: str = "acme") -> dict:
    tok = create_access_token({
        "sub": user_id, "email": "u@x.com", "role": "admin", "tenant_id": tenant_id,
    })
    return {"Authorization": f"Bearer {tok}"}


# ── API key tests ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_api_key_returns_plaintext_once(app_and_client, auth_user):
    _, c = app_and_client
    r = await c.post(
        "/api-keys",
        json={"name": "prod", "scopes": ["read:candidates"]},
        headers=_bearer(auth_user),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "prod"
    assert len(body["key"]) >= 32
    assert body["scopes"] == ["read:candidates"]


@pytest.mark.asyncio
async def test_list_api_keys_excludes_plaintext(app_and_client, auth_user):
    _, c = app_and_client
    await c.post("/api-keys", json={"name": "k1"}, headers=_bearer(auth_user))
    r = await c.get("/api-keys", headers=_bearer(auth_user))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert "key" not in body["data"][0]
    assert "key_hash" not in body["data"][0]
    assert body["data"][0]["name"] == "k1"


@pytest.mark.asyncio
async def test_revoke_api_key_marks_revoked(app_and_client, auth_user, session_factory):
    _, c = app_and_client
    created = await c.post("/api-keys", json={"name": "k"}, headers=_bearer(auth_user))
    key_id = created.json()["id"]

    r = await c.delete(f"/api-keys/{key_id}", headers=_bearer(auth_user))
    assert r.status_code == 200
    assert r.json()["revoked"] is True

    from sqlalchemy import select
    from shared.core.models.identity import APIKey as APIKeyModel
    async with session_factory() as s:
        k = (await s.execute(select(APIKeyModel).where(APIKeyModel.id == key_id))).scalar_one()
        assert k.revoked_at is not None


@pytest.mark.asyncio
async def test_revoke_nonexistent_key_returns_404(app_and_client, auth_user):
    _, c = app_and_client
    r = await c.delete("/api-keys/nonexistent", headers=_bearer(auth_user))
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_revoke_other_users_key_returns_404(app_and_client, session_factory):
    # Two users in different tenants
    async with session_factory() as s:
        s.add(User(
            id="u1", tenant_id="t1", email="a@x.com", full_name="A",
            hashed_password="x", role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE,
        ))
        s.add(User(
            id="u2", tenant_id="t2", email="b@x.com", full_name="B",
            hashed_password="x", role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE,
        ))
        await s.commit()
    _, c = app_and_client
    # u1 creates a key
    r = await c.post("/api-keys", json={"name": "u1key"}, headers=_bearer("u1", "t1"))
    key_id = r.json()["id"]
    # u2 tries to revoke it — should 404
    r = await c.delete(f"/api-keys/{key_id}", headers=_bearer("u2", "t2"))
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_api_keys_require_auth(app_and_client):
    _, c = app_and_client
    r = await c.get("/api-keys")
    assert r.status_code == 401
    r = await c.post("/api-keys", json={"name": "x"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_api_key_with_expiry(app_and_client, auth_user):
    _, c = app_and_client
    r = await c.post(
        "/api-keys", json={"name": "tmp", "expires_in_days": 30}, headers=_bearer(auth_user),
    )
    body = r.json()
    assert body["expires_at"] is not None


# ── Change password tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_change_password_with_correct_current(app_and_client, auth_user, session_factory):
    _, c = app_and_client
    r = await c.post(
        "/change-password",
        json={"current_password": "OldPassword1!", "new_password": "NewPassword1!"},
        headers=_bearer(auth_user),
    )
    assert r.status_code == 200

    from sqlalchemy import select
    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == auth_user))).scalar_one()
        # New password must verify
        from shared.core.security import verify_password
        assert verify_password("NewPassword1!", u.hashed_password)
        # Old password must NOT verify
        assert not verify_password("OldPassword1!", u.hashed_password)


@pytest.mark.asyncio
async def test_change_password_wrong_current_returns_401(app_and_client, auth_user):
    _, c = app_and_client
    r = await c.post(
        "/change-password",
        json={"current_password": "Wrong1!", "new_password": "NewPassword1!"},
        headers=_bearer(auth_user),
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_change_password_weak_new_password_rejected(app_and_client, auth_user):
    _, c = app_and_client
    r = await c.post(
        "/change-password",
        json={"current_password": "OldPassword1!", "new_password": "short"},
        headers=_bearer(auth_user),
    )
    assert r.status_code in (400, 422)


@pytest.mark.asyncio
async def test_change_password_requires_auth(app_and_client):
    _, c = app_and_client
    r = await c.post("/change-password", json={"current_password": "x", "new_password": "NewPassword1!"})
    assert r.status_code == 401


# ── Profile update tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_profile_changes_fields(app_and_client, auth_user, session_factory):
    _, c = app_and_client
    r = await c.put(
        "/me",
        json={"full_name": "Updated Name", "phone": "+1-555-0001"},
        headers=_bearer(auth_user),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["full_name"] == "Updated Name"
    assert body["phone"] == "+1-555-0001"

    from sqlalchemy import select
    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == auth_user))).scalar_one()
        assert u.full_name == "Updated Name"
        assert u.phone == "+1-555-0001"


@pytest.mark.asyncio
async def test_update_profile_partial_preserves_unchanged(app_and_client, auth_user, session_factory):
    _, c = app_and_client
    r = await c.put("/me", json={"phone": "999"}, headers=_bearer(auth_user))
    assert r.status_code == 200
    async with session_factory() as s:
        from sqlalchemy import select
        u = (await s.execute(select(User).where(User.id == auth_user))).scalar_one()
        assert u.phone == "999"
        assert u.full_name == "Keys User"  # unchanged


@pytest.mark.asyncio
async def test_update_profile_empty_body_returns_400(app_and_client, auth_user):
    _, c = app_and_client
    r = await c.put("/me", json={}, headers=_bearer(auth_user))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_update_profile_requires_auth(app_and_client):
    _, c = app_and_client
    r = await c.put("/me", json={"full_name": "X"})
    assert r.status_code == 401
