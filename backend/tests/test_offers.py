"""Tests for offer management with e-signatures and templates.

Covers:
* Creating offers
* Listing offers
* Updating draft offers
* Sending offers
* Accepting offers
* Declining offers
* Signing offers (e-signature)
* Offer templates CRUD
* Tenant isolation
* Status transition validation
"""
from __future__ import annotations

import os
import sys
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
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.recruitment import Job, JobStatus, JobType
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from shared.core.models import (  # noqa: F401
        candidate,
        candidate_activity,
        identity,
        audit_log,
        webhook,
        recruitment,
    )
    from shared.core.models import offer as offer_model  # noqa: F401

    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def offer_client(engine):
    from apps.offer_service.main import router as offer_router

    app = FastAPI()
    app.include_router(offer_router, prefix="/api/v1/offers")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def seed_factory(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _seed(tenant: str | None = None) -> dict:
        tenant_id = tenant or f"tenant-{uuid4().hex[:8]}"
        async with factory() as session:
            candidate = Candidate(
                id=str(uuid4()),
                tenant_id=tenant_id,
                email=f"seed-{uuid4().hex[:8]}@example.com",
                full_name="Seed Candidate",
                status=CandidateStatus.NEW,
            )
            job = Job(
                id=str(uuid4()),
                tenant_id=tenant_id,
                title="Senior Backend Engineer",
                description="Build the platform.",
                department="Engineering",
                location="Remote",
                remote_policy="remote",
                job_type=JobType.FULL_TIME,
                status=JobStatus.OPEN,
            )
            session.add(candidate)
            session.add(job)
            await session.commit()
            await session.refresh(candidate)
            await session.refresh(job)
        return {
            "tenant_id": tenant_id,
            "candidate_id": candidate.id,
            "job_id": job.id,
            "headers": _auth(tenant_id, sub="recruiter-1"),
        }

    return _seed


# ── Create ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_offer(offer_client, seed_factory):
    seed = await seed_factory()
    resp = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={
            "candidate_id": seed["candidate_id"],
            "job_id": seed["job_id"],
            "salary": 120000,
            "equity": 0.5,
            "start_date": "2026-07-01",
            "expiration_date": "2026-07-15",
            "terms": {"bonus": "10%"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["candidate_id"] == seed["candidate_id"]
    assert body["job_id"] == seed["job_id"]
    assert body["salary"] == 120000
    assert body["equity"] == 0.5
    assert body["start_date"] == "2026-07-01"
    assert body["expiration_date"] == "2026-07-15"
    assert body["terms"] == {"bonus": "10%"}
    assert body["status"] == "draft"
    assert body["sent_at"] is None
    assert body["accepted_at"] is None
    assert body["signature_data"] is None
    assert "id" in body


@pytest.mark.asyncio
async def test_create_offer_minimal(offer_client, seed_factory):
    seed = await seed_factory()
    resp = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={
            "candidate_id": seed["candidate_id"],
            "job_id": seed["job_id"],
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["salary"] is None
    assert body["equity"] is None
    assert body["terms"] == {}
    assert body["status"] == "draft"


# ── List ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_offers(offer_client, seed_factory):
    seed = await seed_factory()
    h = seed["headers"]
    for _ in range(3):
        await offer_client.post(
            "/api/v1/offers",
            headers=h,
            json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
        )
    resp = await offer_client.get("/api/v1/offers", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3
    assert body["page"] == 1


@pytest.mark.asyncio
async def test_list_offers_filter_by_status(offer_client, seed_factory):
    seed = await seed_factory()
    h = seed["headers"]
    r1 = await offer_client.post(
        "/api/v1/offers",
        headers=h,
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    offer_id = r1.json()["id"]
    await offer_client.post(
        "/api/v1/offers",
        headers=h,
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    await offer_client.post(f"/api/v1/offers/{offer_id}/send", headers=h)

    resp = await offer_client.get("/api/v1/offers?status=sent", headers=h)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["data"][0]["status"] == "sent"


# ── Get ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"], "salary": 90000},
    )
    oid = r.json()["id"]
    resp = await offer_client.get(f"/api/v1/offers/{oid}", headers=seed["headers"])
    assert resp.status_code == 200
    assert resp.json()["id"] == oid
    assert resp.json()["salary"] == 90000


@pytest.mark.asyncio
async def test_get_offer_not_found(offer_client, seed_factory):
    seed = await seed_factory()
    resp = await offer_client.get("/api/v1/offers/nonexistent", headers=seed["headers"])
    assert resp.status_code == 404


# ── Update ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_draft_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"], "salary": 80000},
    )
    oid = r.json()["id"]
    resp = await offer_client.put(
        f"/api/v1/offers/{oid}",
        headers=seed["headers"],
        json={"salary": 100000, "terms": {"signing_bonus": 5000}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["salary"] == 100000
    assert body["terms"] == {"signing_bonus": 5000}


@pytest.mark.asyncio
async def test_update_sent_offer_returns_400(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    resp = await offer_client.put(
        f"/api/v1/offers/{oid}",
        headers=seed["headers"],
        json={"salary": 200000},
    )
    assert resp.status_code == 400


# ── Send ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    resp = await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "sent"
    assert body["sent_at"] is not None


@pytest.mark.asyncio
async def test_send_already_sent_offer_returns_400(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    resp = await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    assert resp.status_code == 400


# ── Accept ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_accept_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    resp = await offer_client.post(f"/api/v1/offers/{oid}/accept", headers=seed["headers"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "accepted"
    assert body["accepted_at"] is not None


@pytest.mark.asyncio
async def test_accept_draft_offer_returns_400(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    resp = await offer_client.post(f"/api/v1/offers/{oid}/accept", headers=seed["headers"])
    assert resp.status_code == 400


# ── Decline ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_decline_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    resp = await offer_client.post(f"/api/v1/offers/{oid}/decline", headers=seed["headers"])
    assert resp.status_code == 200
    assert resp.json()["status"] == "declined"


@pytest.mark.asyncio
async def test_decline_draft_offer_returns_400(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    resp = await offer_client.post(f"/api/v1/offers/{oid}/decline", headers=seed["headers"])
    assert resp.status_code == 400


# ── Sign ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sign_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    resp = await offer_client.post(
        f"/api/v1/offers/{oid}/sign",
        headers=seed["headers"],
        json={"signature_data": "base64encodedsignaturedata=="},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["signature_data"] == "base64encodedsignaturedata=="
    assert body["signed_at"] is not None


@pytest.mark.asyncio
async def test_sign_accepted_offer(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    await offer_client.post(f"/api/v1/offers/{oid}/send", headers=seed["headers"])
    await offer_client.post(f"/api/v1/offers/{oid}/accept", headers=seed["headers"])
    resp = await offer_client.post(
        f"/api/v1/offers/{oid}/sign",
        headers=seed["headers"],
        json={"signature_data": "signed-after-accept"},
    )
    assert resp.status_code == 200
    assert resp.json()["signature_data"] == "signed-after-accept"


@pytest.mark.asyncio
async def test_sign_draft_offer_returns_400(offer_client, seed_factory):
    seed = await seed_factory()
    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed["headers"],
        json={"candidate_id": seed["candidate_id"], "job_id": seed["job_id"]},
    )
    oid = r.json()["id"]
    resp = await offer_client.post(
        f"/api/v1/offers/{oid}/sign",
        headers=seed["headers"],
        json={"signature_data": "nope"},
    )
    assert resp.status_code == 400


# ── Templates ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_template(offer_client, seed_factory):
    seed = await seed_factory()
    resp = await offer_client.post(
        "/api/v1/offers/templates",
        headers=seed["headers"],
        json={
            "name": "Standard Offer",
            "content": "Dear {{candidate_name}}, we are pleased to offer you...",
            "variables": {"candidate_name": "string", "salary": "number"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Standard Offer"
    assert body["content"] == "Dear {{candidate_name}}, we are pleased to offer you..."
    assert body["variables"] == {"candidate_name": "string", "salary": "number"}
    assert "id" in body


@pytest.mark.asyncio
async def test_list_templates(offer_client, seed_factory):
    seed = await seed_factory()
    h = seed["headers"]
    await offer_client.post("/api/v1/offers/templates", headers=h, json={"name": "Template A"})
    await offer_client.post("/api/v1/offers/templates", headers=h, json={"name": "Template B"})
    resp = await offer_client.get("/api/v1/offers/templates", headers=h)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["data"]) == 2


# ── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_offers(offer_client, seed_factory):
    seed_a = await seed_factory()
    seed_b = await seed_factory()

    r = await offer_client.post(
        "/api/v1/offers",
        headers=seed_a["headers"],
        json={"candidate_id": seed_a["candidate_id"], "job_id": seed_a["job_id"]},
    )
    oid = r.json()["id"]

    resp = await offer_client.get(f"/api/v1/offers/{oid}", headers=seed_b["headers"])
    assert resp.status_code == 404

    resp = await offer_client.get("/api/v1/offers", headers=seed_b["headers"])
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_tenant_isolation_templates(offer_client, seed_factory):
    seed_a = await seed_factory()
    seed_b = await seed_factory()

    await offer_client.post(
        "/api/v1/offers/templates",
        headers=seed_a["headers"],
        json={"name": "Tenant A Template"},
    )

    resp = await offer_client.get("/api/v1/offers/templates", headers=seed_b["headers"])
    assert resp.json()["total"] == 0


# ── Full lifecycle ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_full_offer_lifecycle(offer_client, seed_factory):
    seed = await seed_factory()
    h = seed["headers"]

    r = await offer_client.post(
        "/api/v1/offers",
        headers=h,
        json={
            "candidate_id": seed["candidate_id"],
            "job_id": seed["job_id"],
            "salary": 150000,
            "terms": {"remote": True},
        },
    )
    assert r.status_code == 201
    oid = r.json()["id"]
    assert r.json()["status"] == "draft"

    r2 = await offer_client.put(
        f"/api/v1/offers/{oid}", headers=h, json={"salary": 160000}
    )
    assert r2.status_code == 200
    assert r2.json()["salary"] == 160000

    r3 = await offer_client.post(f"/api/v1/offers/{oid}/send", headers=h)
    assert r3.json()["status"] == "sent"

    r4 = await offer_client.post(f"/api/v1/offers/{oid}/accept", headers=h)
    assert r4.json()["status"] == "accepted"

    r5 = await offer_client.post(
        f"/api/v1/offers/{oid}/sign",
        headers=h,
        json={"signature_data": "final-signature-data"},
    )
    assert r5.json()["signature_data"] == "final-signature-data"
    assert r5.json()["signed_at"] is not None
