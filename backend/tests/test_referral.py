"""Tests for the Candidate Referral Program.

Covers:
* Referral CRUD (create, list, get, update, delete)
* Duplicate referral prevention
* Referral statistics
* Program config (get, update)
* Tenant isolation
* Status transitions and resolved_at timestamp
* Reward inheritance from program
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

from shared.core.config import Settings  # noqa: E402
from shared.core.database import get_db_dependency  # noqa: E402
from shared.core.models.referral import Referral, ReferralProgram  # noqa: E402
from shared.core.security import create_access_token  # noqa: E402


TENANT_A = "tenant-referral-A"
TENANT_B = "tenant-referral-B"


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str = TENANT_A, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    target_tables = [Referral.__table__, ReferralProgram.__table__]
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all, tables=target_tables)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all, tables=target_tables)
    await eng.dispose()


@pytest_asyncio.fixture
async def app_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.referral import main as referral_svc

    app = FastAPI()
    app.include_router(referral_svc.router, prefix="/api/v1/referrals")

    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _db_override():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _db_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _referral_payload(
    referrer_user_id: str | None = None,
    candidate_id: str | None = None,
    job_id: str | None = None,
    notes: str | None = None,
) -> dict:
    return {
        "referrer_user_id": referrer_user_id or str(uuid4()),
        "candidate_id": candidate_id or str(uuid4()),
        "job_id": job_id or str(uuid4()),
        "notes": notes,
    }


# ── Referral CRUD ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_referral(app_client: AsyncClient):
    resp = await app_client.post(
        "/api/v1/referrals/",
        json=_referral_payload(notes="Great candidate"),
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["tenant_id"] == TENANT_A
    assert body["status"] == "pending"
    assert body["reward_status"] == "pending"
    assert body["notes"] == "Great candidate"
    assert body["resolved_at"] is None


@pytest.mark.asyncio
async def test_list_referrals(app_client: AsyncClient):
    await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())
    await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())

    resp = await app_client.get("/api/v1/referrals/", headers=_auth())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert len(body["data"]) == 2


@pytest.mark.asyncio
async def test_get_referral(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth()
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.get(f"/api/v1/referrals/{referral_id}", headers=_auth())
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == referral_id


@pytest.mark.asyncio
async def test_update_referral_status(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth()
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.put(
        f"/api/v1/referrals/{referral_id}",
        json={"status": "hired"},
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "hired"
    assert body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_update_referral_to_rejected_sets_resolved(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth()
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.put(
        f"/api/v1/referrals/{referral_id}",
        json={"status": "rejected"},
        headers=_auth(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "rejected"
    assert body["resolved_at"] is not None


@pytest.mark.asyncio
async def test_update_referral_under_review_no_resolved(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth()
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.put(
        f"/api/v1/referrals/{referral_id}",
        json={"status": "under_review"},
        headers=_auth(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "under_review"
    assert body["resolved_at"] is None


@pytest.mark.asyncio
async def test_delete_referral(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth()
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.delete(f"/api/v1/referrals/{referral_id}", headers=_auth())
    assert resp.status_code == 204

    get_resp = await app_client.get(f"/api/v1/referrals/{referral_id}", headers=_auth())
    assert get_resp.status_code == 404


# ── Duplicate prevention ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_duplicate_referral_prevented(app_client: AsyncClient):
    payload = _referral_payload(
        referrer_user_id="referrer-1",
        candidate_id="cand-1",
        job_id="job-1",
    )
    first = await app_client.post("/api/v1/referrals/", json=payload, headers=_auth())
    assert first.status_code == 201

    second = await app_client.post("/api/v1/referrals/", json=payload, headers=_auth())
    assert second.status_code == 409


# ── Tenant isolation ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_list(app_client: AsyncClient):
    await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth(TENANT_A))
    await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth(TENANT_A))

    resp_b = await app_client.get("/api/v1/referrals/", headers=_auth(TENANT_B))
    assert resp_b.status_code == 200
    assert resp_b.json()["total"] == 0


@pytest.mark.asyncio
async def test_tenant_isolation_get(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth(TENANT_A)
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.get(f"/api/v1/referrals/{referral_id}", headers=_auth(TENANT_B))
    assert resp.status_code == 404


# ── Statistics ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_referral_stats_empty(app_client: AsyncClient):
    resp = await app_client.get("/api/v1/referrals/stats", headers=_auth())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_referrals"] == 0
    assert body["conversion_rate"] == 0.0


@pytest.mark.asyncio
async def test_referral_stats_with_data(app_client: AsyncClient):
    r1 = await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())
    r2 = await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())
    r3 = await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())
    r4 = await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())

    await app_client.put(
        f"/api/v1/referrals/{r1.json()['id']}",
        json={"status": "hired", "reward_amount": 1000},
        headers=_auth(),
    )
    await app_client.put(
        f"/api/v1/referrals/{r2.json()['id']}",
        json={"status": "rejected"},
        headers=_auth(),
    )
    await app_client.put(
        f"/api/v1/referrals/{r3.json()['id']}",
        json={"status": "under_review"},
        headers=_auth(),
    )

    resp = await app_client.get("/api/v1/referrals/stats", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_referrals"] == 4
    assert body["hired_referrals"] == 1
    assert body["rejected_referrals"] == 1
    assert body["under_review_referrals"] == 1
    assert body["pending_referrals"] == 1
    assert body["conversion_rate"] == 0.25


@pytest.mark.asyncio
async def test_referral_stats_tenant_isolated(app_client: AsyncClient):
    await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth(TENANT_A))
    await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth(TENANT_B))

    stats_a = await app_client.get("/api/v1/referrals/stats", headers=_auth(TENANT_A))
    assert stats_a.json()["total_referrals"] == 1

    stats_b = await app_client.get("/api/v1/referrals/stats", headers=_auth(TENANT_B))
    assert stats_b.json()["total_referrals"] == 1


# ── Program config ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_program_creates_default(app_client: AsyncClient):
    resp = await app_client.get("/api/v1/referrals/program", headers=_auth())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tenant_id"] == TENANT_A
    assert body["active"] is True
    assert body["reward_amount"] == 0.0
    assert body["reward_currency"] == "USD"


@pytest.mark.asyncio
async def test_update_program(app_client: AsyncClient):
    await app_client.get("/api/v1/referrals/program", headers=_auth())

    resp = await app_client.put(
        "/api/v1/referrals/program",
        json={
            "name": "Q2 Referral Bonus",
            "description": "Get $2000 for successful hires",
            "reward_amount": 2000.0,
            "reward_currency": "EUR",
            "conditions": {"min_tenure_days": 90},
        },
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Q2 Referral Bonus"
    assert body["description"] == "Get $2000 for successful hires"
    assert body["reward_amount"] == 2000.0
    assert body["reward_currency"] == "EUR"
    assert body["conditions"]["min_tenure_days"] == 90


@pytest.mark.asyncio
async def test_new_referral_inherits_program_reward(app_client: AsyncClient):
    await app_client.put(
        "/api/v1/referrals/program",
        json={"reward_amount": 500.0, "reward_currency": "GBP"},
        headers=_auth(),
    )

    resp = await app_client.post(
        "/api/v1/referrals/",
        json=_referral_payload(),
        headers=_auth(),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["reward_amount"] == 500.0
    assert body["reward_currency"] == "GBP"


# ── Edge cases ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_nonexistent_referral(app_client: AsyncClient):
    resp = await app_client.get("/api/v1/referrals/nonexistent-id", headers=_auth())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_nonexistent_referral(app_client: AsyncClient):
    resp = await app_client.put(
        "/api/v1/referrals/nonexistent-id",
        json={"status": "hired"},
        headers=_auth(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_nonexistent_referral(app_client: AsyncClient):
    resp = await app_client.delete("/api/v1/referrals/nonexistent-id", headers=_auth())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_list_referrals_with_status_filter(app_client: AsyncClient):
    r1 = await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())
    r2 = await app_client.post("/api/v1/referrals/", json=_referral_payload(), headers=_auth())
    await app_client.put(
        f"/api/v1/referrals/{r1.json()['id']}",
        json={"status": "hired"},
        headers=_auth(),
    )

    resp = await app_client.get("/api/v1/referrals/?status=hired", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["status"] == "hired"


@pytest.mark.asyncio
async def test_update_reward_status(app_client: AsyncClient):
    create_resp = await app_client.post(
        "/api/v1/referrals/", json=_referral_payload(), headers=_auth()
    )
    referral_id = create_resp.json()["id"]

    resp = await app_client.put(
        f"/api/v1/referrals/{referral_id}",
        json={"reward_status": "paid"},
        headers=_auth(),
    )
    assert resp.status_code == 200
    assert resp.json()["reward_status"] == "paid"
