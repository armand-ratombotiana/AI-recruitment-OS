"""Tests for tenant management — current tenant, usage, limits, quotas, billing.

Covers:

* ``GET /api/v1/tenants/current`` — get the caller's tenant record
* ``PUT /api/v1/tenants/current`` — admin-only update path
* ``GET /api/v1/tenants/current/usage`` — live resource counts
* ``GET /api/v1/tenants/current/limits`` — plan limits + usage + remaining
* ``GET /api/v1/tenants/current/billing`` — billing summary with overage
* ``TenantManager`` direct unit tests (no DB)
* Quota enforcement in the candidate service
* Cross-tenant isolation
* Auth gating
"""
from __future__ import annotations

import os
import sys
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ── Imports under test ────────────────────────────────────────────────────────


from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.models.recruitment import Job, JobStatus
from shared.core.security import create_access_token, hash_password
from shared.tenants import QuotaExceededError, TenantManager


# ── Test helpers ──────────────────────────────────────────────────────────────


def _token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(tenant_id, sub, role)}"}


# ── Engine / DB fixtures ─────────────────────────────────────────────────────


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


# ── App factories ────────────────────────────────────────────────────────────


def _build_tenants_app(install_db) -> FastAPI:
    from apps.tenant_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="")
    install_db(app)
    return app


def _build_candidates_app(install_db) -> FastAPI:
    from apps.candidate_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="")
    install_db(app)
    return app


# ── Clients ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def tenants_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_tenants_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def candidates_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_candidates_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── DB seeding helpers ───────────────────────────────────────────────────────


async def _seed_user(db: AsyncSession, tenant_id: str, email: str | None = None) -> User:
    user = User(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        email=email or f"{uuid.uuid4().hex[:8]}@example.com",
        full_name="Seed User",
        hashed_password=hash_password("TestPassword123!"),
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _seed_candidate(db: AsyncSession, tenant_id: str, email: str | None = None) -> Candidate:
    candidate = Candidate(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        email=email or f"cand_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Seed Candidate",
        status=CandidateStatus.NEW,
    )
    db.add(candidate)
    await db.commit()
    await db.refresh(candidate)
    return candidate


async def _seed_job(db: AsyncSession, tenant_id: str, title: str | None = None) -> Job:
    job = Job(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        title=title or f"Job {uuid.uuid4().hex[:6]}",
        description="Seeded job",
        status=JobStatus.OPEN,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


# ── Reset in-memory tenant store between tests ───────────────────────────────


@pytest.fixture(autouse=True)
def _reset_tenant_store():
    from apps.tenant_service import main as ts

    ts._tenants.clear()
    ts._tenant_settings.clear()
    ts._tenant_branding.clear()
    yield
    ts._tenants.clear()
    ts._tenant_settings.clear()
    ts._tenant_branding.clear()


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/tenants/current
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_current_tenant_auto_creates(tenants_client: AsyncClient):
    r = await tenants_client.get(
        "/api/v1/tenants/current", headers=_auth("tenant-A", "alice")
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "tenant-A"
    assert body["plan"] == "free"
    assert body["status"] == "active"
    assert body["name"] == "tenant-A"


@pytest.mark.asyncio
async def test_get_current_tenant_requires_auth(tenants_client: AsyncClient):
    r = await tenants_client.get("/api/v1/tenants/current")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_current_tenant_isolated_per_tenant(tenants_client: AsyncClient):
    r1 = await tenants_client.get(
        "/api/v1/tenants/current", headers=_auth("tenant-A", "alice", "tenant_admin")
    )
    r2 = await tenants_client.get(
        "/api/v1/tenants/current", headers=_auth("tenant-B", "bob", "tenant_admin")
    )
    assert r1.json()["id"] == "tenant-A"
    assert r2.json()["id"] == "tenant-B"
    assert r1.json()["id"] != r2.json()["id"]


# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/v1/tenants/current
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_current_tenant_as_admin(tenants_client: AsyncClient):
    r = await tenants_client.put(
        "/api/v1/tenants/current",
        json={"name": "Acme Inc", "plan": "pro"},
        headers=_auth("tenant-A", "adminA", "tenant_admin"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["updated"] is True
    assert body["tenant"]["name"] == "Acme Inc"
    assert body["tenant"]["plan"] == "pro"


@pytest.mark.asyncio
async def test_update_current_tenant_rejects_non_admin(tenants_client: AsyncClient):
    r = await tenants_client.put(
        "/api/v1/tenants/current",
        json={"name": "Hacked"},
        headers=_auth("tenant-A", "alice", "recruiter"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_update_current_tenant_rejects_unknown_plan(tenants_client: AsyncClient):
    r = await tenants_client.put(
        "/api/v1/tenants/current",
        json={"plan": "bogus"},
        headers=_auth("tenant-A", "adminA", "tenant_admin"),
    )
    assert r.status_code == 400
    assert "Unknown plan" in r.json()["detail"]


@pytest.mark.asyncio
async def test_update_current_tenant_rejects_invalid_status(tenants_client: AsyncClient):
    r = await tenants_client.put(
        "/api/v1/tenants/current",
        json={"status": "wat"},
        headers=_auth("tenant-A", "adminA", "tenant_admin"),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_update_current_tenant_requires_auth(tenants_client: AsyncClient):
    r = await tenants_client.put(
        "/api/v1/tenants/current", json={"name": "Anonymous"}
    )
    assert r.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/tenants/current/usage
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_current_usage_zeros(tenants_client: AsyncClient):
    r = await tenants_client.get(
        "/api/v1/tenants/current/usage", headers=_auth("tenant-A", "alice")
    )
    assert r.status_code == 200
    body = r.json()
    assert body["users"] == 0
    assert body["candidates"] == 0
    assert body["jobs"] == 0
    assert body["storage_mb"] == 0
    assert body["tenant_id"] == "tenant-A"


@pytest.mark.asyncio
async def test_get_current_usage_counts_db_rows(
    tenants_client: AsyncClient, engine
):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        await _seed_user(db, "tenant-A", email="u1@a.com")
        await _seed_user(db, "tenant-A", email="u2@a.com")
        await _seed_user(db, "tenant-A", email="u3@a.com")
        await _seed_candidate(db, "tenant-A")
        await _seed_candidate(db, "tenant-A")
        await _seed_job(db, "tenant-A")

    r = await tenants_client.get(
        "/api/v1/tenants/current/usage", headers=_auth("tenant-A", "alice")
    )
    body = r.json()
    assert body["users"] == 3
    assert body["candidates"] == 2
    assert body["jobs"] == 1
    assert body["storage_mb"] >= 1  # 2 candidates * 256KB / 1024


@pytest.mark.asyncio
async def test_get_current_usage_isolated_per_tenant(
    tenants_client: AsyncClient, engine
):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        await _seed_user(db, "tenant-A")
        await _seed_user(db, "tenant-A")
        await _seed_user(db, "tenant-B")

    r_a = await tenants_client.get(
        "/api/v1/tenants/current/usage", headers=_auth("tenant-A", "alice")
    )
    r_b = await tenants_client.get(
        "/api/v1/tenants/current/usage", headers=_auth("tenant-B", "bob")
    )
    assert r_a.json()["users"] == 2
    assert r_b.json()["users"] == 1


@pytest.mark.asyncio
async def test_get_current_usage_requires_auth(tenants_client: AsyncClient):
    r = await tenants_client.get("/api/v1/tenants/current/usage")
    assert r.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/tenants/current/limits
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_current_limits_for_free_plan(tenants_client: AsyncClient):
    r = await tenants_client.get(
        "/api/v1/tenants/current/limits", headers=_auth("tenant-A", "alice")
    )
    assert r.status_code == 200
    body = r.json()
    assert body["plan_id"] == "free"
    assert body["limits"]["max_candidates"] == 50
    assert body["limits"]["max_users"] == 3
    assert body["limits"]["max_jobs"] == 10
    # Free plan storage is 1 GB → 1024 MB
    assert body["limits"]["max_storage_mb"] == 1024
    assert body["unlimited"]["candidates"] is False


@pytest.mark.asyncio
async def test_get_current_limits_remaining(tenants_client: AsyncClient, engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        await _seed_user(db, "tenant-A", email="u1@a.com")
        await _seed_candidate(db, "tenant-A")

    r = await tenants_client.get(
        "/api/v1/tenants/current/limits", headers=_auth("tenant-A", "alice")
    )
    body = r.json()
    assert body["remaining"]["users"] == 2  # 3 - 1
    assert body["remaining"]["candidates"] == 49  # 50 - 1


@pytest.mark.asyncio
async def test_get_current_limits_enterprise_unlimited(
    tenants_client: AsyncClient,
):
    # First, set the tenant's plan to enterprise.
    await tenants_client.put(
        "/api/v1/tenants/current",
        json={"plan": "enterprise"},
        headers=_auth("tenant-A", "adminA", "tenant_admin"),
    )
    r = await tenants_client.get(
        "/api/v1/tenants/current/limits", headers=_auth("tenant-A", "alice")
    )
    body = r.json()
    assert body["plan_id"] == "enterprise"
    assert body["limits"]["max_candidates"] == -1
    assert body["unlimited"]["candidates"] is True
    assert body["unlimited"]["jobs"] is True
    assert body["unlimited"]["storage_mb"] is False  # enterprise caps storage at 5000 GB


# ─────────────────────────────────────────────────────────────────────────────
# GET /api/v1/tenants/current/billing
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_billing_summary_includes_plan_and_usage(tenants_client: AsyncClient):
    r = await tenants_client.get(
        "/api/v1/tenants/current/billing", headers=_auth("tenant-A", "alice")
    )
    assert r.status_code == 200
    body = r.json()
    assert body["plan"]["id"] == "free"
    assert body["plan"]["name"] == "Free"
    assert body["plan"]["monthly_price_cents"] == 0
    assert body["currency"] == "usd"
    assert "overage" in body
    assert "overage_cents" in body
    assert "current_usage" in body
    assert "limits" in body
    assert "period" in body
    assert "generated_at" in body


@pytest.mark.asyncio
async def test_billing_summary_computes_overage(
    tenants_client: AsyncClient, engine
):
    # Free plan allows 50 candidates.  Seed 55 candidates.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(55):
            await _seed_candidate(db, "tenant-A", email=f"c{i}@a.com")

    r = await tenants_client.get(
        "/api/v1/tenants/current/billing", headers=_auth("tenant-A", "alice")
    )
    body = r.json()
    assert body["overage"]["candidates"]["overage"] == 5
    # 5 units * 10 cents = 50 cents
    assert body["overage_cents"] == 50


@pytest.mark.asyncio
async def test_billing_summary_no_overage_when_under_limit(
    tenants_client: AsyncClient, engine
):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(3):
            await _seed_candidate(db, "tenant-A", email=f"c{i}@a.com")

    r = await tenants_client.get(
        "/api/v1/tenants/current/billing", headers=_auth("tenant-A", "alice")
    )
    body = r.json()
    assert body["overage"]["candidates"]["overage"] == 0
    assert body["overage_cents"] == 0


@pytest.mark.asyncio
async def test_billing_summary_enterprise_no_candidate_overage(
    tenants_client: AsyncClient, engine
):
    await tenants_client.put(
        "/api/v1/tenants/current",
        json={"plan": "enterprise"},
        headers=_auth("tenant-A", "adminA", "tenant_admin"),
    )
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(75):
            await _seed_candidate(db, "tenant-A", email=f"c{i}@a.com")

    r = await tenants_client.get(
        "/api/v1/tenants/current/billing", headers=_auth("tenant-A", "alice")
    )
    body = r.json()
    assert body["overage"]["candidates"]["unlimited"] is True
    assert body["overage"]["candidates"]["overage"] == 0
    assert body["overage_cents"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# TenantManager — direct unit tests
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_manager_get_usage_no_db():
    m = TenantManager()
    usage = await m.get_usage("any-tenant")
    assert usage == {
        "tenant_id": "any-tenant",
        "users": 0,
        "candidates": 0,
        "jobs": 0,
        "storage_mb": 0,
    }


def test_tenant_manager_get_limits_free_plan():
    m = TenantManager()
    limits = m.get_limits("any-tenant")
    assert limits["plan_id"] == "free"
    assert limits["max_candidates"] == 50


def test_tenant_manager_get_limits_pro_plan():
    m = TenantManager()
    # Register a tenant with a non-default plan.
    m.get_or_create_tenant("t-1", plan="pro")
    limits = m.get_limits("t-1")
    assert limits["plan_id"] == "pro"
    assert limits["max_candidates"] == 10000


def test_tenant_manager_get_limits_enterprise_unlimited():
    m = TenantManager()
    m.get_or_create_tenant("t-1", plan="enterprise")
    limits = m.get_limits("t-1")
    import math
    assert limits["max_candidates"] == math.inf
    assert limits["unlimited"]["candidates"] is True


@pytest.mark.asyncio
async def test_tenant_manager_check_quota_within_limit():
    m = TenantManager()
    # No DB → usage is 0, well under the free limit of 50.
    assert await m.check_quota("t-1", "candidates") is True


@pytest.mark.asyncio
async def test_tenant_manager_check_quota_exceeds_limit(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(50):
            await _seed_candidate(db, "t-1", email=f"c{i}@a.com")
        # Add one more — should put us at 50, on the boundary.
        await _seed_candidate(db, "t-1", email="c-final@a.com")
    async with factory() as db:
        m = TenantManager(db=db)
        with pytest.raises(QuotaExceededError) as exc_info:
            await m.check_quota("t-1", "candidates")
    assert exc_info.value.resource == "candidates"
    assert exc_info.value.used == 51
    assert exc_info.value.limit == 50


@pytest.mark.asyncio
async def test_tenant_manager_check_quota_unlimited():
    m = TenantManager()
    m.get_or_create_tenant("t-1", plan="enterprise")
    # No DB; unlimited plan should always pass.
    assert await m.check_quota("t-1", "candidates") is True
    assert await m.check_quota("t-1", "jobs") is True


@pytest.mark.asyncio
async def test_tenant_manager_check_quota_unknown_resource():
    m = TenantManager()
    with pytest.raises(ValueError):
        await m.check_quota("t-1", "spaceships")


@pytest.mark.asyncio
async def test_tenant_manager_billing_summary_shape(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        await _seed_user(db, "t-1", email="u@a.com")
        await _seed_candidate(db, "t-1")
        await _seed_job(db, "t-1")
    async with factory() as db:
        m = TenantManager(db=db)
        summary = await m.get_billing_summary("t-1")
    assert summary["plan"]["id"] == "free"
    assert summary["current_usage"]["users"] == 1
    assert summary["current_usage"]["candidates"] == 1
    assert summary["current_usage"]["jobs"] == 1
    assert "overage" in summary
    assert "overage_cents" in summary
    assert "period" in summary
    # 1 user / 1 candidate / 1 job — all under free plan limits.
    assert summary["overage_cents"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# Quota enforcement in the candidate service
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_candidate_create_enforced_by_quota(candidates_client: AsyncClient, engine):
    # Free plan allows 50 candidates.  Seed 50 then attempt to create the
    # 51st — the candidate service must refuse with 402.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(50):
            await _seed_candidate(db, "tenant-A", email=f"c{i}@a.com")

    r = await candidates_client.post(
        "/",
        json={"email": "new@a.com", "full_name": "Over Quota"},
        headers=_auth("tenant-A", "alice", "recruiter"),
    )
    assert r.status_code == 402
    detail = r.json()["detail"]
    assert detail["code"] == "quota_exceeded"
    assert detail["resource"] == "candidates"
    assert detail["limit"] == 50
    assert detail["used"] >= 50


@pytest.mark.asyncio
async def test_candidate_create_succeeds_under_quota(candidates_client: AsyncClient):
    r = await candidates_client.post(
        "/",
        json={"email": "ok@a.com", "full_name": "Under Quota"},
        headers=_auth("tenant-A", "alice", "recruiter"),
    )
    assert r.status_code == 200
    assert r.json()["created"] is True


@pytest.mark.asyncio
async def test_candidate_create_unlimited_enterprise(
    candidates_client: AsyncClient, engine
):
    # The tenant's plan must be set to enterprise via the tenant service.
    # Since we only mount the candidate router here, we set the plan by
    # writing directly into the in-memory tenant store.
    from apps.tenant_service.main import _tenants
    _tenants["tenant-A"] = {
        "id": "tenant-A", "name": "tenant-A", "slug": "tenant-a",
        "plan": "enterprise", "status": "active",
        "created_at": "2025-01-01T00:00:00Z", "updated_at": "2025-01-01T00:00:00Z",
    }
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(60):
            await _seed_candidate(db, "tenant-A", email=f"seed{i}@a.com")

    r = await candidates_client.post(
        "/",
        json={"email": "new60@a.com", "full_name": "Enterprise Test"},
        headers=_auth("tenant-A", "alice", "recruiter"),
    )
    assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Tenant isolation
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_usage(tenants_client: AsyncClient, engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        for i in range(5):
            await _seed_user(db, "tenant-A", email=f"a{i}@a.com")
        for i in range(3):
            await _seed_user(db, "tenant-B", email=f"b{i}@b.com")

    r_a = await tenants_client.get(
        "/api/v1/tenants/current/usage", headers=_auth("tenant-A", "alice")
    )
    r_b = await tenants_client.get(
        "/api/v1/tenants/current/usage", headers=_auth("tenant-B", "bob")
    )
    assert r_a.json()["users"] == 5
    assert r_b.json()["users"] == 3
    assert r_a.json()["users"] != r_b.json()["users"]


@pytest.mark.asyncio
async def test_tenant_isolation_billing(tenants_client: AsyncClient, engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        # Tenant A: 30 candidates (under free limit of 50)
        for i in range(30):
            await _seed_candidate(db, "tenant-A", email=f"a{i}@a.com")
        # Tenant B: 60 candidates (over free limit)
        for i in range(60):
            await _seed_candidate(db, "tenant-B", email=f"b{i}@b.com")

    r_a = await tenants_client.get(
        "/api/v1/tenants/current/billing", headers=_auth("tenant-A", "alice")
    )
    r_b = await tenants_client.get(
        "/api/v1/tenants/current/billing", headers=_auth("tenant-B", "bob")
    )
    assert r_a.json()["overage_cents"] == 0
    assert r_b.json()["overage_cents"] == 100  # 10 overage * 10 cents
    assert r_a.json()["current_usage"]["candidates"] == 30
    assert r_b.json()["current_usage"]["candidates"] == 60


@pytest.mark.asyncio
async def test_tenant_isolation_update_forbidden(tenants_client: AsyncClient):
    # Tenant A's admin should only see their own record (no cross-tenant
    # update via the path-parameterized /tenants/{id} route is exposed
    # in this test, but the current-tenant endpoint must still scope
    # writes to the caller's own tenant).
    r = await tenants_client.put(
        "/api/v1/tenants/current",
        json={"name": "Tenant A Inc"},
        headers=_auth("tenant-A", "adminA", "tenant_admin"),
    )
    assert r.status_code == 200
    r2 = await tenants_client.get(
        "/api/v1/tenants/current", headers=_auth("tenant-B", "adminB", "tenant_admin")
    )
    assert r2.json()["name"] != "Tenant A Inc"
    assert r2.json()["id"] == "tenant-B"


# ─────────────────────────────────────────────────────────────────────────────
# Auth gating for the new endpoints
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unauthenticated_blocked_on_all_current_endpoints(
    tenants_client: AsyncClient,
):
    for path in (
        "/api/v1/tenants/current",
        "/api/v1/tenants/current/usage",
        "/api/v1/tenants/current/limits",
        "/api/v1/tenants/current/billing",
    ):
        r = await tenants_client.get(path)
        assert r.status_code == 401, f"{path} should require auth"
