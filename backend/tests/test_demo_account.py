"""Tests for the demo account and demo seeding."""
from __future__ import annotations

import os
import sys

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlmodel import SQLModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from shared.core.config import get_settings
from shared.core.database import get_db_dependency
from apps.auth_service.main import router as auth_router
from apps.mailing_service.main import router as mailing_router


pytestmark = [pytest.mark.integration, pytest.mark.demo]


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine):
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1/auth")
    app.include_router(mailing_router, prefix="/api/v1/mailing")

    # Force demo on for the test
    get_settings.cache_clear()
    import os
    os.environ["DEMO_ENABLED"] = "true"
    os.environ["DEMO_EMAIL"] = "demo@airos.io"
    os.environ["DEMO_PASSWORD"] = "demo1234"
    get_settings.cache_clear()

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_dependency] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_seed_demo_creates_user(client: AsyncClient):
    resp = await client.post("/api/v1/auth/admin/seed-demo")
    assert resp.status_code == 200
    body = resp.json()
    assert "Demo seed complete" in body["message"]


@pytest.mark.asyncio
async def test_demo_login_succeeds(client: AsyncClient):
    # First seed
    await client.post("/api/v1/auth/admin/seed-demo")
    # Then login
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "demo@airos.io", "password": "demo1234"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["user"]["is_demo"] is True
    assert body["user"]["email_verified"] is True
    assert body["user"]["role"] in {"super_admin", "admin", "demo"}


@pytest.mark.asyncio
async def test_demo_login_case_insensitive(client: AsyncClient):
    await client.post("/api/v1/auth/admin/seed-demo")
    # Try with uppercase email
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "DEMO@AIROS.IO", "password": "demo1234"},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_demo_login_with_whitespace_email(client: AsyncClient):
    await client.post("/api/v1/auth/admin/seed-demo")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "  demo@airos.io  ", "password": "demo1234"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_demo_login_wrong_password_rejected(client: AsyncClient):
    await client.post("/api/v1/auth/admin/seed-demo")
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "demo@airos.io", "password": "wrong-password"},
    )
    assert resp.status_code == 401
    assert "Invalid" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_demo_seeds_sample_data(client: AsyncClient):
    resp = await client.post("/api/v1/auth/admin/seed-demo")
    assert resp.status_code == 200
    msg = resp.json()["message"]
    # The seed should have created at least 1 user; if the DB was empty it
    # also seeds candidates/jobs/interviews.
    assert "seeded_users" in msg


@pytest.mark.asyncio
async def test_demo_seed_is_idempotent(client: AsyncClient):
    """Calling seed multiple times should not fail or create duplicates."""
    r1 = await client.post("/api/v1/auth/admin/seed-demo")
    r2 = await client.post("/api/v1/auth/admin/seed-demo")
    r3 = await client.post("/api/v1/auth/admin/seed-demo")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r3.status_code == 200

    # Login should still work
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "demo@airos.io", "password": "demo1234"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_demo_user_full_access_after_login(client: AsyncClient):
    await client.post("/api/v1/auth/admin/seed-demo")
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "demo@airos.io", "password": "demo1234"},
    )
    token = login.json()["access_token"]
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == "demo@airos.io"
    assert me.json()["is_demo"] is True
