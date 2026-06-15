"""Integration tests for the rewritten MFA endpoints in auth_service."""
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
from shared.core.security import create_access_token
from shared.auth.mfa import TOTP, base64, hashes, time

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
async def user(session_factory):
    async with session_factory() as s:
        u = User(
            id="u-mfa",
            tenant_id="acme",
            email="mfa@acme.com",
            full_name="Mfa User",
            hashed_password="x",
            role=UserRole.TENANT_ADMIN,
            status=UserStatus.ACTIVE,
        )
        s.add(u)
        await s.commit()
    return u.id


@pytest_asyncio.fixture
async def other_user(session_factory):
    async with session_factory() as s:
        u = User(
            id="u-other",
            tenant_id="acme",
            email="other@acme.com",
            full_name="Other User",
            hashed_password="x",
            role=UserRole.RECRUITER,
            status=UserStatus.ACTIVE,
        )
        s.add(u)
        await s.commit()
    return u.id


@pytest.fixture
def auth_headers(user):
    token = create_access_token(
        {"sub": user, "email": "mfa@acme.com", "role": "admin", "tenant_id": "acme"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def other_auth_headers():
    token = create_access_token(
        {"sub": "u-other", "email": "other@acme.com", "role": "member", "tenant_id": "acme"}
    )
    return {"Authorization": f"Bearer {token}"}


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enable_returns_secret_and_url(app_and_client, user, auth_headers):
    _, c = app_and_client
    r = await c.post("/mfa/enable", json={"user_id": user}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert len(body["secret"]) == 32
    assert body["otpauth_url"].startswith("otpauth://totp/")
    assert body["otpauth_url"].endswith(f"issuer=AI-ROS") or "issuer=AI-ROS" in body["otpauth_url"]
    assert len(body["backup_codes"]) == 10


@pytest.mark.asyncio
async def test_enable_persists_secret_to_user(app_and_client, user, auth_headers, session_factory):
    _, c = app_and_client
    r = await c.post("/mfa/enable", json={"user_id": user}, headers=auth_headers)
    secret = r.json()["secret"]
    from sqlalchemy import select
    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user))).scalar_one()
        assert u.mfa_secret == secret
        assert u.mfa_enabled is False


@pytest.mark.asyncio
async def test_enable_unknown_user_returns_403(app_and_client, auth_headers):
    _, c = app_and_client
    r = await c.post("/mfa/enable", json={"user_id": "nonexistent"}, headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_enable_without_auth_returns_401(app_and_client, user):
    _, c = app_and_client
    r = await c.post("/mfa/enable", json={"user_id": user})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_enable_another_user_returns_403(app_and_client, user, other_user, other_auth_headers):
    _, c = app_and_client
    r = await c.post("/mfa/enable", json={"user_id": user}, headers=other_auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_verify_rejects_invalid_code(app_and_client, user, auth_headers):
    _, c = app_and_client
    await c.post("/mfa/enable", json={"user_id": user}, headers=auth_headers)
    r = await c.post("/mfa/verify", json={"user_id": user, "code": "000000"}, headers=auth_headers)
    r = await c.post("/mfa/verify", json={"user_id": user, "code": "abcdef"}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["verified"] is False


@pytest.mark.asyncio
async def test_verify_accepts_current_code_and_enables_mfa(app_and_client, user, auth_headers, session_factory):
    _, c = app_and_client
    enable = await c.post("/mfa/enable", json={"user_id": user}, headers=auth_headers)
    secret = enable.json()["secret"]
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded.upper())
    code = TOTP(key, length=6, algorithm=hashes.SHA1(), time_step=30).generate(int(time.time())).decode("ascii")

    r = await c.post("/mfa/verify", json={"user_id": user, "code": code}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["verified"] is True

    from sqlalchemy import select
    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user))).scalar_one()
        assert u.mfa_enabled is True


@pytest.mark.asyncio
async def test_verify_without_enable_returns_400(app_and_client, user, auth_headers):
    _, c = app_and_client
    r = await c.post("/mfa/verify", json={"user_id": user, "code": "123456"}, headers=auth_headers)
    assert r.status_code == 400
    assert "not enabled" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_verify_unknown_user_returns_403(app_and_client, auth_headers):
    _, c = app_and_client
    r = await c.post("/mfa/verify", json={"user_id": "missing", "code": "123456"}, headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_verify_rejects_malformed_code(app_and_client, user, auth_headers):
    _, c = app_and_client
    await c.post("/mfa/enable", json={"user_id": user}, headers=auth_headers)
    r = await c.post("/mfa/verify", json={"user_id": user, "code": "12"}, headers=auth_headers)
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_verify_another_user_returns_403(app_and_client, user, other_user, auth_headers, other_auth_headers):
    _, c = app_and_client
    await c.post("/mfa/enable", json={"user_id": user}, headers=auth_headers)
    r = await c.post("/mfa/verify", json={"user_id": user, "code": "123456"}, headers=other_auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_verify_without_auth_returns_401(app_and_client, user):
    _, c = app_and_client
    r = await c.post("/mfa/verify", json={"user_id": user, "code": "123456"})
    assert r.status_code == 401
