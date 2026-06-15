"""Tests for tenant isolation in job service CRUD endpoints and tenant_id fallback fixes."""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from shared.core.config import Settings, get_settings
from shared.core.database import get_db_dependency
from shared.core.models.recruitment import Job, JobStatus, JobType
from shared.core.security import create_access_token


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_token(sub: str, tenant_id: str, role: str = "admin") -> str:
    return create_access_token(
        {"sub": sub, "email": f"{sub}@test.com", "role": role, "tenant_id": tenant_id}
    )


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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
    from apps.job_service.main import router as job_router

    app = FastAPI()
    app.include_router(job_router, prefix="/jobs")
    app.dependency_overrides[get_settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    async def _override_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield app, c


@pytest_asyncio.fixture
async def seed_jobs(session_factory):
    async with session_factory() as s:
        for tid in ("tenant-a", "tenant-b"):
            for i in range(3):
                s.add(Job(
                    tenant_id=tid,
                    title=f"{tid} job {i}",
                    description="desc",
                    status=JobStatus.OPEN,
                ))
        await s.commit()


# ── Tenant isolation: list ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_jobs_filters_by_tenant(app_and_client, seed_jobs):
    _, c = app_and_client
    token_a = _bearer(_make_token("u-a", "tenant-a"))
    token_b = _bearer(_make_token("u-b", "tenant-b"))

    r_a = await c.get("/jobs/", headers=token_a)
    r_b = await c.get("/jobs/", headers=token_b)
    assert r_a.status_code == 200
    assert r_b.status_code == 200
    assert r_a.json()["total"] == 3
    assert r_b.json()["total"] == 3
    titles_a = {j["title"] for j in r_a.json()["data"]}
    titles_b = {j["title"] for j in r_b.json()["data"]}
    assert all("tenant-a" in t for t in titles_a)
    assert all("tenant-b" in t for t in titles_b)


@pytest.mark.asyncio
async def test_list_jobs_without_auth_returns_401(app_and_client, seed_jobs):
    _, c = app_and_client
    r = await c.get("/jobs/")
    assert r.status_code == 401


# ── Tenant isolation: get ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_job_other_tenant_returns_404(app_and_client, seed_jobs, session_factory):
    _, c = app_and_client
    async with session_factory() as s:
        job = (await s.execute(select(Job).where(Job.tenant_id == "tenant-a"))).scalars().first()

    token_b = _bearer(_make_token("u-b", "tenant-b"))
    r = await c.get(f"/jobs/{job.id}", headers=token_b)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_job_own_tenant_returns_200(app_and_client, seed_jobs, session_factory):
    _, c = app_and_client
    async with session_factory() as s:
        job = (await s.execute(select(Job).where(Job.tenant_id == "tenant-a"))).scalars().first()

    token_a = _bearer(_make_token("u-a", "tenant-a"))
    r = await c.get(f"/jobs/{job.id}", headers=token_a)
    assert r.status_code == 200
    assert r.json()["id"] == job.id


# ── Tenant isolation: create ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_job_uses_auth_tenant(app_and_client, session_factory):
    _, c = app_and_client
    token = _bearer(_make_token("u-create", "tenant-new"))
    r = await c.post("/jobs/", json={
        "title": "New Job",
        "description": "A test job",
    }, headers=token)
    assert r.status_code == 200
    assert r.json()["created"] is True
    assert r.json()["title"] == "New Job"


# ── Tenant isolation: update ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_job_other_tenant_returns_404(app_and_client, seed_jobs, session_factory):
    _, c = app_and_client
    async with session_factory() as s:
        job = (await s.execute(select(Job).where(Job.tenant_id == "tenant-a"))).scalars().first()

    token_b = _bearer(_make_token("u-b", "tenant-b"))
    r = await c.put(f"/jobs/{job.id}", json={"title": "Hacked"}, headers=token_b)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_update_job_own_tenant_succeeds(app_and_client, seed_jobs, session_factory):
    _, c = app_and_client
    async with session_factory() as s:
        job = (await s.execute(select(Job).where(Job.tenant_id == "tenant-a"))).scalars().first()

    token_a = _bearer(_make_token("u-a", "tenant-a"))
    r = await c.put(f"/jobs/{job.id}", json={"title": "Updated"}, headers=token_a)
    assert r.status_code == 200


# ── Tenant isolation: delete ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_job_other_tenant_returns_404(app_and_client, seed_jobs, session_factory):
    _, c = app_and_client
    async with session_factory() as s:
        job = (await s.execute(select(Job).where(Job.tenant_id == "tenant-a"))).scalars().first()

    token_b = _bearer(_make_token("u-b", "tenant-b"))
    r = await c.delete(f"/jobs/{job.id}", headers=token_b)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_delete_job_own_tenant_succeeds(app_and_client, seed_jobs, session_factory):
    _, c = app_and_client
    async with session_factory() as s:
        job = (await s.execute(select(Job).where(Job.tenant_id == "tenant-a"))).scalars().first()

    token_a = _bearer(_make_token("u-a", "tenant-a"))
    r = await c.delete(f"/jobs/{job.id}", headers=token_a)
    assert r.status_code == 200


# ── require_tenant_id: no fallback to "default" ──────────────────────────────


@pytest.mark.asyncio
async def test_tenant_id_missing_in_token_returns_403(app_and_client, seed_jobs):
    _, c = app_and_client
    token = create_access_token({"sub": "u-no-tenant", "email": "x@x.com", "role": "admin"})
    r = await c.get("/jobs/", headers=_bearer(token))
    assert r.status_code == 403


# ── get_tenant_id_from_token: raises 401 ─────────────────────────────────────


def test_get_tenant_id_from_token_no_header():
    from shared.core.security import get_tenant_id_from_token
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_tenant_id_from_token(None)
    assert exc_info.value.status_code == 401


def test_get_tenant_id_from_token_invalid_token():
    from shared.core.security import get_tenant_id_from_token
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        get_tenant_id_from_token("Bearer garbage.token.here")
    assert exc_info.value.status_code == 401


def test_get_tenant_id_from_token_missing_tenant_id():
    from shared.core.security import get_tenant_id_from_token
    from fastapi import HTTPException

    token = create_access_token({"sub": "u1", "email": "u@x.com", "role": "admin"})
    with pytest.raises(HTTPException) as exc_info:
        get_tenant_id_from_token(f"Bearer {token}")
    assert exc_info.value.status_code == 401


def test_get_tenant_id_from_token_valid():
    from shared.core.security import get_tenant_id_from_token

    token = create_access_token({"sub": "u1", "email": "u@x.com", "role": "admin", "tenant_id": "acme"})
    assert get_tenant_id_from_token(f"Bearer {token}") == "acme"
