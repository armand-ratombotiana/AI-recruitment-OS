"""Unit tests for multi-tenancy enforcement.

Covers the shared ``require_tenant`` and ``require_user`` FastAPI dependencies
and ensures the candidate service filters by tenant on every query.
"""
from __future__ import annotations

import os
import sys
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

# Ensure backend dir is importable
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.security import (
    create_access_token,
    decode_token,
    get_tenant_id_from_token,
    get_user_id_from_token,
    require_user,
    require_tenant,
)
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.models.candidate import Candidate, CandidateStatus


pytestmark = [pytest.mark.unit, pytest.mark.multi_tenancy]


# ── Pure-function tests (no DB) ────────────────────────────────────────────────


def _make_token(tenant_id: str = "acme", sub: str | None = "user-1", role: str = "recruiter") -> str:
    payload = {"sub": sub, "email": "u@example.com", "role": role, "tenant_id": tenant_id}
    return create_access_token(payload)


def test_get_tenant_id_from_token_returns_tenant():
    token = _make_token(tenant_id="tenant-42")
    assert get_tenant_id_from_token(f"Bearer {token}") == "tenant-42"


def test_get_tenant_id_from_token_missing_header_raises():
    with pytest.raises(Exception) as exc:
        get_tenant_id_from_token(None)
    assert "401" in str(exc.value)


def test_get_tenant_id_from_token_invalid_token_raises():
    with pytest.raises(Exception) as exc:
        get_tenant_id_from_token("Bearer not-a-real-jwt")
    assert "401" in str(exc.value)


def test_get_user_id_from_token_roundtrip():
    token = _make_token(sub="u_abc")
    assert get_user_id_from_token(f"Bearer {token}") == "u_abc"


def test_get_user_id_from_token_wrong_type_returns_none():
    """A refresh token should not be accepted as an access token."""
    from shared.core.security import create_refresh_token
    refresh = create_refresh_token({"sub": "u_abc", "email": "x", "role": "recruiter"})
    assert get_user_id_from_token(f"Bearer {refresh}") is None


def test_require_user_raises_without_header():
    with pytest.raises(Exception) as exc:
        require_user(authorization=None)
    assert "401" in str(exc.value) or "Missing" in str(exc.value.detail)


def test_require_user_returns_payload():
    token = _make_token(tenant_id="t-9", sub="u-9", role="tenant_admin")
    user = require_user(authorization=f"Bearer {token}")
    assert user["id"] == "u-9"
    assert user["tenant_id"] == "t-9"
    assert user["role"] == "tenant_admin"


def test_require_tenant_raises_without_header():
    with pytest.raises(Exception):
        require_tenant(authorization=None)


def test_require_tenant_returns_tenant_from_token():
    token = _make_token(tenant_id="t-7")
    assert require_tenant(authorization=f"Bearer {token}") == "t-7"


# ── Integration test: candidate service enforces tenant isolation ─────────────


@pytest_asyncio.fixture
async def engine():
    """Single shared connection (StaticPool) so multiple sessions see the same DB.

    Without StaticPool, ``sqlite:///:memory:`` gives each connection its own
    private database, so a session that commits is invisible to other sessions
    in the same test.
    """
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
async def db_session(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def seeded(db_session: AsyncSession):
    """Two tenants with two candidates each."""
    from shared.core.security import hash_password
    now = "2025-01-01T00:00:00"

    t1 = "tenant-A"
    t2 = "tenant-B"

    u1 = User(
        id=str(uuid4()),
        tenant_id=t1,
        email="a1@x.com",
        full_name="A One",
        hashed_password=hash_password("P@ssword1"),
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
    )
    u2 = User(
        id=str(uuid4()),
        tenant_id=t2,
        email="b1@x.com",
        full_name="B One",
        hashed_password=hash_password("P@ssword1"),
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
    )
    db_session.add_all([u1, u2])
    await db_session.flush()

    c1 = Candidate(id=str(uuid4()), tenant_id=t1, email="alice@a.com", full_name="Alice A", status=CandidateStatus.NEW)
    c2 = Candidate(id=str(uuid4()), tenant_id=t1, email="bob@a.com", full_name="Bob A", status=CandidateStatus.NEW)
    c3 = Candidate(id=str(uuid4()), tenant_id=t2, email="carol@b.com", full_name="Carol B", status=CandidateStatus.NEW)
    c4 = Candidate(id=str(uuid4()), tenant_id=t2, email="dave@b.com", full_name="Dave B", status=CandidateStatus.NEW)
    db_session.add_all([c1, c2, c3, c4])
    await db_session.commit()

    return {"tenant_A": t1, "tenant_B": t2, "candidates": [c1, c2, c3, c4], "users": [u1, u2]}


@pytest_asyncio.fixture
async def candidate_client(engine):
    """Mount only the candidate router in a fresh FastAPI app for isolation tests."""
    from fastapi import FastAPI, Depends
    from apps.candidate_service.main import router as candidate_router
    from shared.core.database import get_db_dependency

    app = FastAPI()
    app.include_router(candidate_router, prefix="/candidates")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override():
        # Mirror the production get_db_dependency: commit on success, rollback on error.
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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_candidate_list_isolated_by_tenant(candidate_client, seeded):
    """Tenant A should only see Tenant A candidates, and vice versa."""
    token_a = _make_token(tenant_id=seeded["tenant_A"], sub="uA")
    token_b = _make_token(tenant_id=seeded["tenant_B"], sub="uB")

    r_a = await candidate_client.get("/candidates/", headers={"Authorization": f"Bearer {token_a}"})
    r_b = await candidate_client.get("/candidates/", headers={"Authorization": f"Bearer {token_b}"})

    assert r_a.status_code == 200
    assert r_b.status_code == 200

    data_a = r_a.json()["data"]
    data_b = r_b.json()["data"]
    assert {c["email"] for c in data_a} == {"alice@a.com", "bob@a.com"}
    assert {c["email"] for c in data_b} == {"carol@b.com", "dave@b.com"}


@pytest.mark.asyncio
async def test_candidate_get_cross_tenant_is_404(candidate_client, seeded):
    """Tenant A cannot read Tenant B's candidate by id."""
    c_b = next(c for c in seeded["candidates"] if c.tenant_id == seeded["tenant_B"])
    token_a = _make_token(tenant_id=seeded["tenant_A"], sub="uA")

    r = await candidate_client.get(
        f"/candidates/{c_b.id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_candidate_create_dupe_check_is_tenant_scoped(candidate_client, seeded):
    """Same email in two tenants must be allowed; same email in one tenant must be rejected."""
    token_a = _make_token(tenant_id=seeded["tenant_A"], sub="uA")
    token_b = _make_token(tenant_id=seeded["tenant_B"], sub="uB")

    payload = {"email": "shared@example.com", "full_name": "Shared Person"}
    r1 = await candidate_client.post("/candidates/", json=payload, headers={"Authorization": f"Bearer {token_a}"})
    r2 = await candidate_client.post("/candidates/", json=payload, headers={"Authorization": f"Bearer {token_b}"})
    r3 = await candidate_client.post("/candidates/", json=payload, headers={"Authorization": f"Bearer {token_a}"})

    assert r1.status_code == 200
    assert r2.status_code == 200  # different tenant, same email is fine
    assert r3.status_code == 409  # same tenant, same email rejected


@pytest.mark.asyncio
async def test_candidate_update_cross_tenant_is_404(candidate_client, seeded):
    c_b = next(c for c in seeded["candidates"] if c.tenant_id == seeded["tenant_B"])
    token_a = _make_token(tenant_id=seeded["tenant_A"], sub="uA")

    r = await candidate_client.put(
        f"/candidates/{c_b.id}",
        json={"full_name": "Hacked"},
        headers={"Authorization": f"Bearer {token_a}"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_candidate_delete_cross_tenant_is_404(candidate_client, seeded):
    c_b = next(c for c in seeded["candidates"] if c.tenant_id == seeded["tenant_B"])
    token_a = _make_token(tenant_id=seeded["tenant_A"], sub="uA")

    r = await candidate_client.delete(
        f"/candidates/{c_b.id}", headers={"Authorization": f"Bearer {token_a}"}
    )
    assert r.status_code == 404

    # And the candidate still exists for its real tenant
    token_b = _make_token(tenant_id=seeded["tenant_B"], sub="uB")
    r2 = await candidate_client.get(
        f"/candidates/{c_b.id}", headers={"Authorization": f"Bearer {token_b}"}
    )
    assert r2.status_code == 200
