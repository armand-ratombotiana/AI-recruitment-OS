"""Tests for the bulk operations service.

Covers:

* Bulk delete candidates (sync flow inside the request)
* Bulk update candidate status
* Bulk add tag (de-duplicated, persisted as JSON list)
* Bulk close / reopen jobs
* Progress tracking (counters + errors list)
* Tenant isolation (one tenant cannot delete/see another tenant's data)
* Listing operations
* Auth — every endpoint requires a valid bearer + member+ role
* ``BulkOperation`` lifecycle helpers (start / update / complete)
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

# Make ``backend`` importable when pytest is run from anywhere.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.recruitment import Job, JobStatus
from shared.core.security import create_access_token


# ── Auth helpers ───────────────────────────────────────────────────────────


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


# ── Engine / app fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Import the model modules so the table metadata is populated.
    from shared.core.models import (  # noqa: F401
        candidate,
        candidate_activity,
        identity,
        audit_log,
        webhook,
        recruitment,
    )
    from shared.bulk.operations import BulkOperation  # noqa: F401

    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def bulk_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.bulk_service.main import router as bulk_router

    app = FastAPI()
    app.include_router(bulk_router, prefix="/api/v1/bulk")

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
async def seeded_candidates(engine):
    """Create 3 candidates for tenant A and return their ids + auth headers."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    ids: list[str] = []
    async with factory() as session:
        for i in range(3):
            cand = Candidate(
                id=str(uuid4()),
                tenant_id=tenant,
                email=f"c{i}-{uuid4().hex[:6]}@example.com",
                full_name=f"Candidate {i}",
                status=CandidateStatus.NEW,
            )
            session.add(cand)
            await session.flush()
            ids.append(cand.id)
        await session.commit()
    return {"tenant_id": tenant, "candidate_ids": ids, "headers": _auth(tenant, "uA", "recruiter")}


@pytest_asyncio.fixture
async def seeded_jobs(engine):
    """Create 3 jobs for tenant A and return their ids + auth headers."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    ids: list[str] = []
    async with factory() as session:
        for i in range(3):
            job = Job(
                id=str(uuid4()),
                tenant_id=tenant,
                title=f"Engineer {i}",
                description="do the thing",
                status=JobStatus.OPEN,
            )
            session.add(job)
            await session.flush()
            ids.append(job.id)
        await session.commit()
    return {"tenant_id": tenant, "job_ids": ids, "headers": _auth(tenant, "uA", "recruiter")}


# ── BulkOperation lifecycle helpers ───────────────────────────────────────


@pytest.mark.asyncio
async def test_start_progress_complete_lifecycle(engine):
    """Direct exercise of the lifecycle helpers without HTTP."""
    from shared.bulk.operations import (
        start_bulk_operation,
        update_progress,
        complete_bulk_operation,
    )

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    tenant = f"tenant-{uuid4().hex[:8]}"
    async with factory() as session:
        op = await start_bulk_operation(
            session,
            user_id="u1",
            tenant_id=tenant,
            operation_type="candidates.delete",
            entity_type="candidate",
            total=10,
        )
        assert op.id.startswith("bulk_")
        assert op.status == "pending"
        assert op.processed == 0
        assert op.failed == 0

        # First update should flip status to "running" because it was "pending".
        op1 = await update_progress(session, op.id, processed=4)
        assert op1 is not None
        assert op1.processed == 4
        assert op1.status == "running"

        # Second update adds the deltas and records an error.
        op2 = await update_progress(
            session,
            op.id,
            processed=3,
            failed=1,
            errors=[{"index": 7, "error": "boom"}],
        )
        assert op2 is not None
        assert op2.processed == 7
        assert op2.failed == 1
        assert op2.errors == [{"index": 7, "error": "boom"}]

        final = await complete_bulk_operation(session, op.id, status="completed")
        assert final is not None
        assert final.status == "completed"
        assert final.completed_at is not None


# ── Candidates: bulk delete ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_delete_candidates(bulk_client, seeded_candidates, engine):
    """All 3 candidates get deleted; the operation completes successfully."""
    headers = seeded_candidates["headers"]
    ids = seeded_candidates["candidate_ids"]
    tenant = seeded_candidates["tenant_id"]

    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers,
        json={"ids": ids},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["operation_type"] == "candidates.delete"
    assert body["total"] == 3
    assert body["status"] in ("completed", "partial")
    op_id = body["op_id"]

    # Verify the candidates are gone from the DB.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == tenant)
        )
        assert result.scalars().all() == []

    # The op should be queryable and report success.
    detail = await bulk_client.get(f"/api/v1/bulk/operations/{op_id}", headers=headers)
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["processed"] == 3
    assert detail_body["failed"] == 0


@pytest.mark.asyncio
async def test_bulk_delete_partial_failure(bulk_client, seeded_candidates):
    """Mixing real ids with bogus ids produces a partial result with errors."""
    headers = seeded_candidates["headers"]
    real_ids = seeded_candidates["candidate_ids"]
    bogus_id = str(uuid4())
    payload_ids = [real_ids[0], bogus_id, real_ids[1]]

    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers,
        json={"ids": payload_ids},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    op_id = body["op_id"]

    detail = await bulk_client.get(f"/api/v1/bulk/operations/{op_id}", headers=headers)
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["total"] == 3
    assert detail_body["processed"] == 2
    assert detail_body["failed"] == 1
    assert detail_body["status"] == "partial"
    # The bogus id should appear in the errors log.
    assert any("not found" in e["error"] for e in detail_body["errors"])


# ── Candidates: bulk update status ────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_update_candidate_status(bulk_client, seeded_candidates, engine):
    """All candidates are moved to ``screening`` in one bulk call."""
    headers = seeded_candidates["headers"]
    tenant = seeded_candidates["tenant_id"]
    ids = seeded_candidates["candidate_ids"]

    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/update-status",
        headers=headers,
        json={"ids": ids, "status": "screening"},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    assert body["operation_type"] == "candidates.update_status"
    assert body["status"] == "completed"

    # Verify every candidate is now in ``screening``.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == tenant)
        )
        for cand in result.scalars().all():
            assert cand.status == CandidateStatus.SCREENING


@pytest.mark.asyncio
async def test_bulk_update_candidate_status_rejects_invalid_value(bulk_client, seeded_candidates):
    """Unknown status values are rejected with 400 before any DB work."""
    headers = seeded_candidates["headers"]
    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/update-status",
        headers=headers,
        json={"ids": seeded_candidates["candidate_ids"], "status": "bogus"},
    )
    assert resp.status_code == 400, resp.text


# ── Candidates: bulk add tag ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_add_candidate_tag(bulk_client, seeded_candidates, engine):
    """Adding a tag to a batch persists the tag on every candidate."""
    headers = seeded_candidates["headers"]
    tenant = seeded_candidates["tenant_id"]
    ids = seeded_candidates["candidate_ids"]

    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/add-tag",
        headers=headers,
        json={"ids": ids, "tag": "priority"},
    )
    assert resp.status_code == 202, resp.text
    assert resp.json()["status"] == "completed"

    # Verify every candidate has the tag in their JSON list.
    import json
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == tenant)
        )
        candidates = result.scalars().all()
        assert len(candidates) == 3
        for c in candidates:
            tags = json.loads(c.tags) if c.tags else []
            assert tags == ["priority"]


@pytest.mark.asyncio
async def test_bulk_add_candidate_tag_idempotent(bulk_client, seeded_candidates, engine):
    """Adding the same tag twice should NOT duplicate it on the candidate."""
    import json
    headers = seeded_candidates["headers"]
    tenant = seeded_candidates["tenant_id"]
    ids = seeded_candidates["candidate_ids"]

    # Add the tag once.
    r1 = await bulk_client.post(
        "/api/v1/bulk/candidates/add-tag",
        headers=headers,
        json={"ids": ids, "tag": "vip"},
    )
    assert r1.status_code == 202
    # And again — should still be ["vip"].
    r2 = await bulk_client.post(
        "/api/v1/bulk/candidates/add-tag",
        headers=headers,
        json={"ids": ids, "tag": "vip"},
    )
    assert r2.status_code == 202

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == tenant)
        )
        for c in result.scalars().all():
            tags = json.loads(c.tags) if c.tags else []
            assert tags == ["vip"]


# ── Jobs: bulk close / reopen ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_close_jobs(bulk_client, seeded_jobs, engine):
    headers = seeded_jobs["headers"]
    tenant = seeded_jobs["tenant_id"]
    ids = seeded_jobs["job_ids"]

    resp = await bulk_client.post(
        "/api/v1/bulk/jobs/close",
        headers=headers,
        json={"ids": ids},
    )
    assert resp.status_code == 202, resp.text
    assert resp.json()["status"] == "completed"

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Job).where(Job.tenant_id == tenant)
        )
        for j in result.scalars().all():
            assert j.status == JobStatus.CLOSED


@pytest.mark.asyncio
async def test_bulk_reopen_jobs(bulk_client, seeded_jobs, engine):
    headers = seeded_jobs["headers"]
    tenant = seeded_jobs["tenant_id"]
    ids = seeded_jobs["job_ids"]

    resp = await bulk_client.post(
        "/api/v1/bulk/jobs/reopen",
        headers=headers,
        json={"ids": ids},
    )
    assert resp.status_code == 202, resp.text
    assert resp.json()["status"] == "completed"

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Job).where(Job.tenant_id == tenant)
        )
        for j in result.scalars().all():
            assert j.status == JobStatus.OPEN


# ── Progress tracking ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_progress_tracking_with_large_batch(bulk_client, engine):
    """A 60-item delete produces the right counters and 0 failures."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    tenant = f"tenant-{uuid4().hex[:8]}"
    ids: list[str] = []
    async with factory() as session:
        for i in range(60):
            cand = Candidate(
                id=str(uuid4()),
                tenant_id=tenant,
                email=f"bulk-{i}-{uuid4().hex[:4]}@example.com",
                full_name=f"Cand {i}",
            )
            session.add(cand)
            await session.flush()
            ids.append(cand.id)
        await session.commit()

    headers = _auth(tenant, "uA", "recruiter")
    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers,
        json={"ids": ids},
    )
    assert resp.status_code == 202, resp.text
    body = resp.json()
    op_id = body["op_id"]

    detail = await bulk_client.get(
        f"/api/v1/bulk/operations/{op_id}", headers=headers
    )
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["total"] == 60
    assert detail_body["processed"] == 60
    assert detail_body["failed"] == 0
    assert detail_body["completed_at"] is not None


# ── Tenant isolation ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_cannot_delete_other_tenants_candidates(
    bulk_client, seeded_candidates, engine
):
    """Tenant B cannot delete tenant A's candidates via the bulk endpoint."""
    headers_b = _auth("tenant-B", "attacker", "recruiter")
    target_ids = seeded_candidates["candidate_ids"]
    tenant_a = seeded_candidates["tenant_id"]

    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers_b,
        json={"ids": target_ids},
    )
    # The op is accepted (the ids are simply not visible inside the loop).
    assert resp.status_code == 202
    body = resp.json()
    op_id = body["op_id"]

    detail = await bulk_client.get(
        f"/api/v1/bulk/operations/{op_id}", headers=headers_b
    )
    assert detail.status_code == 200
    detail_body = detail.json()
    # Every id belonged to tenant A; from tenant B's perspective they all
    # "not found" → 3 failures.
    assert detail_body["failed"] == 3
    assert detail_body["processed"] == 0

    # And tenant A's candidates are untouched.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == tenant_a)
        )
        assert len(result.scalars().all()) == 3


@pytest.mark.asyncio
async def test_tenant_isolation_cannot_see_other_tenants_operations(
    bulk_client, seeded_candidates
):
    """Tenant B gets 404 when trying to read tenant A's operation by id."""
    headers_a = seeded_candidates["headers"]
    headers_b = _auth("tenant-B", "attacker", "recruiter")

    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers_a,
        json={"ids": seeded_candidates["candidate_ids"]},
    )
    assert resp.status_code == 202
    op_id = resp.json()["op_id"]

    detail = await bulk_client.get(
        f"/api/v1/bulk/operations/{op_id}", headers=headers_b
    )
    assert detail.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_listing(bulk_client, seeded_candidates):
    """``GET /operations`` is scoped to the caller's tenant only."""
    headers_a = seeded_candidates["headers"]
    headers_b = _auth("tenant-B", "attacker", "recruiter")

    # Tenant A creates one operation.
    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers_a,
        json={"ids": seeded_candidates["candidate_ids"]},
    )
    assert resp.status_code == 202

    # Tenant A sees it.
    list_a = await bulk_client.get("/api/v1/bulk/operations", headers=headers_a)
    assert list_a.status_code == 200
    body_a = list_a.json()
    assert body_a["total"] >= 1
    assert all(item["tenant_id"] == seeded_candidates["tenant_id"] for item in body_a["data"])

    # Tenant B sees nothing.
    list_b = await bulk_client.get("/api/v1/bulk/operations", headers=headers_b)
    assert list_b.status_code == 200
    body_b = list_b.json()
    assert body_b["total"] == 0
    assert body_b["data"] == []


# ── Listing operations ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_bulk_operations(bulk_client, seeded_candidates, seeded_jobs):
    """Two operations (one candidates, one jobs) both show up in the list."""
    headers = _auth(seeded_candidates["tenant_id"], "uA", "recruiter")
    # candidates.delete
    r1 = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers,
        json={"ids": seeded_candidates["candidate_ids"]},
    )
    assert r1.status_code == 202
    # jobs.close
    r2 = await bulk_client.post(
        "/api/v1/bulk/jobs/close",
        headers=headers,
        json={"ids": seeded_jobs["job_ids"]},
    )
    assert r2.status_code == 202

    listing = await bulk_client.get("/api/v1/bulk/operations", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    op_types = {item["operation_type"] for item in body["data"]}
    assert "candidates.delete" in op_types
    assert "jobs.close" in op_types


@pytest.mark.asyncio
async def test_get_bulk_operation_404_for_missing_id(bulk_client, seeded_candidates):
    headers = seeded_candidates["headers"]
    resp = await bulk_client.get(
        "/api/v1/bulk/operations/bulk_doesnotexist", headers=headers
    )
    assert resp.status_code == 404


# ── Auth ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoints_require_auth(bulk_client):
    """Every bulk endpoint must require a valid bearer token."""
    no_headers_cases = [
        ("POST", "/api/v1/bulk/candidates/delete", {"ids": ["x"]}),
        ("POST", "/api/v1/bulk/candidates/update-status", {"ids": ["x"], "status": "new"}),
        ("POST", "/api/v1/bulk/candidates/add-tag", {"ids": ["x"], "tag": "t"}),
        ("POST", "/api/v1/bulk/jobs/close", {"ids": ["x"]}),
        ("POST", "/api/v1/bulk/jobs/reopen", {"ids": ["x"]}),
    ]
    for method, path, payload in no_headers_cases:
        resp = await bulk_client.request(method, path, json=payload)
        assert resp.status_code == 401, f"{method} {path} returned {resp.status_code}"

    # GET endpoints also 401 without auth.
    for path in ("/api/v1/bulk/operations", "/api/v1/bulk/operations/bulk_x"):
        resp = await bulk_client.get(path)
        assert resp.status_code == 401, f"GET {path} returned {resp.status_code}"


@pytest.mark.asyncio
async def test_viewer_role_is_rejected(bulk_client, seeded_candidates):
    """A user with the ``viewer`` role is below ``member+`` and gets 403."""
    headers = _auth(seeded_candidates["tenant_id"], "viewer-user", "viewer")
    resp = await bulk_client.post(
        "/api/v1/bulk/candidates/delete",
        headers=headers,
        json={"ids": seeded_candidates["candidate_ids"]},
    )
    assert resp.status_code == 403, resp.text
