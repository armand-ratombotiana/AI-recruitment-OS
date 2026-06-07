"""Tests for the candidate-applications / pipeline tracking feature.

Covers:
* Applying a candidate to a job
* Listing applications for a candidate / job
* Stage transitions and validation
* Withdrawal (DELETE)
* Group-by-stage + full pipeline (Kanban) view
* Bulk stage moves
* Tenant isolation: tenant B must never see or mutate tenant A's rows
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
from shared.core.models.application import (
    ApplicationStage,
    PIPELINE_STAGES,
)
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
    """Shared-connection engine so multiple sessions see the same DB."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Importing model modules registers the tables on SQLModel.metadata.
    from shared.core.models import (  # noqa: F401
        candidate,
        candidate_activity,
        identity,
        audit_log,
        webhook,
        recruitment,
        application as application_model,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def combined_client(engine):
    """FastAPI app with both candidate + job routers mounted on a shared engine."""
    from apps.candidate_service.main import router as candidate_router
    from apps.job_service.main import router as job_router

    app = FastAPI()
    app.include_router(candidate_router, prefix="/api/v1/candidates")
    app.include_router(job_router, prefix="/api/v1/jobs")

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
    """Return an async function that creates a candidate + job in a tenant.

    Inserting rows directly via SQLAlchemy is the only reliable way to get a
    candidate and a job in the *same* tenant in this test setup, because the
    public job-create endpoint hard-codes ``tenant_id="default"``.
    """
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
                description="Build the next-generation platform.",
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


# ── Apply / create ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_apply_candidate_to_job(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    resp = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply",
        headers=h,
        json={
            "job_id": jid,
            "source": "linkedin",
            "notes": "Strong fit for the role.",
            "meta": {"referrer": "alex"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["candidate_id"] == cid
    assert body["job_id"] == jid
    assert body["stage"] == ApplicationStage.APPLIED.value
    assert body["source"] == "linkedin"
    assert body["notes"] == "Strong fit for the role."
    assert body["meta"] == {"referrer": "alex"}
    assert body["score"] is None
    assert "id" in body
    assert "applied_at" in body
    assert "last_stage_change" in body


@pytest.mark.asyncio
async def test_apply_duplicate_returns_409(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    payload = {"job_id": jid, "source": "website"}
    r1 = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json=payload
    )
    assert r1.status_code == 201
    r2 = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json=payload
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_apply_to_unknown_job_returns_404(combined_client, seed_factory):
    seed = await seed_factory()
    cid, h = seed["candidate_id"], seed["headers"]
    resp = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply",
        headers=h,
        json={"job_id": "does-not-exist"},
    )
    assert resp.status_code == 404


# ── Stage moves ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_move_stage(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
    )
    app_id = create.json()["id"]

    for stage in (
        ApplicationStage.SCREENING.value,
        ApplicationStage.INTERVIEW.value,
        ApplicationStage.OFFER.value,
        ApplicationStage.HIRED.value,
    ):
        resp = await combined_client.put(
            f"/api/v1/candidates/{cid}/applications/{app_id}/stage",
            headers=h,
            json={"stage": stage, "notes": f"moved to {stage}"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["stage"] == stage

    final = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications", headers=h
    )
    assert final.status_code == 200
    assert final.json()["data"][0]["stage"] == ApplicationStage.HIRED.value


@pytest.mark.asyncio
async def test_move_stage_rejects_unknown_stage(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
    )
    app_id = create.json()["id"]

    bad = await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/{app_id}/stage",
        headers=h,
        json={"stage": "unicorn"},
    )
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_move_stage_unknown_application_returns_404(combined_client, seed_factory):
    seed = await seed_factory()
    cid, h = seed["candidate_id"], seed["headers"]
    resp = await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/missing-id/stage",
        headers=h,
        json={"stage": ApplicationStage.SCREENING.value},
    )
    assert resp.status_code == 404


# ── Withdraw ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_withdraw_application(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
    )
    app_id = create.json()["id"]

    resp = await combined_client.delete(
        f"/api/v1/candidates/{cid}/applications/{app_id}", headers=h
    )
    assert resp.status_code == 204, resp.text

    listed = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications", headers=h
    )
    assert listed.status_code == 200
    assert listed.json()["total"] == 0


@pytest.mark.asyncio
async def test_withdraw_unknown_returns_404(combined_client, seed_factory):
    seed = await seed_factory()
    cid, h = seed["candidate_id"], seed["headers"]
    resp = await combined_client.delete(
        f"/api/v1/candidates/{cid}/applications/nope", headers=h
    )
    assert resp.status_code == 404


# ── List per candidate / per job ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_applications_for_candidate(combined_client, seed_factory, engine):
    seed = await seed_factory()
    cid, h = seed["candidate_id"], seed["headers"]
    tenant = seed["tenant_id"]
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Add two extra jobs in the same tenant (the public job-create endpoint
    # hard-codes tenant_id="default", so we insert directly).
    extra_job_ids: list[str] = []
    async with factory() as session:
        for i in range(2):
            j = Job(
                id=str(uuid4()),
                tenant_id=tenant,
                title=f"Other Job {i}",
                description="x",
                job_type=JobType.FULL_TIME,
                status=JobStatus.OPEN,
            )
            session.add(j)
            await session.flush()
            extra_job_ids.append(j.id)
        await session.commit()

    job_ids = [seed["job_id"], *extra_job_ids]
    for jid in job_ids:
        r = await combined_client.post(
            f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
        )
        assert r.status_code == 201

    listed = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications", headers=h
    )
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 3
    assert {row["job_id"] for row in body["data"]} == set(job_ids)


@pytest.mark.asyncio
async def test_list_applications_for_candidate_filtered_by_stage(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
    )
    app_id = create.json()["id"]

    # Bump it to screening.
    await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/{app_id}/stage",
        headers=h,
        json={"stage": ApplicationStage.SCREENING.value},
    )

    applied = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications?stage=applied", headers=h
    )
    assert applied.status_code == 200
    assert applied.json()["total"] == 0

    screening = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications?stage=screening", headers=h
    )
    assert screening.status_code == 200
    assert screening.json()["total"] == 1


@pytest.mark.asyncio
async def test_list_applications_for_job(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
    )

    listed = await combined_client.get(
        f"/api/v1/jobs/{jid}/applications", headers=h
    )
    assert listed.status_code == 200
    body = listed.json()
    assert body["total"] == 1
    assert body["data"][0]["job_id"] == jid


# ── Pipeline (Kanban) ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pipeline_view_groups_by_stage(combined_client, seed_factory, engine):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    tenant = seed["tenant_id"]
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Three applications on three different jobs (the dedup key is
    # (candidate, job), so we need separate jobs to put the same candidate
    # in three different stages).
    job_ids: list[str] = [jid]
    async with factory() as session:
        for i in range(2):
            j = Job(
                id=str(uuid4()),
                tenant_id=tenant,
                title=f"Kanban Job {i}",
                description="x",
                job_type=JobType.FULL_TIME,
                status=JobStatus.OPEN,
            )
            session.add(j)
            await session.flush()
            job_ids.append(j.id)
        await session.commit()

    app_ids: list[str] = []
    for j in job_ids:
        r = await combined_client.post(
            f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": j}
        )
        assert r.status_code == 201
        app_ids.append(r.json()["id"])

    await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/{app_ids[1]}/stage",
        headers=h,
        json={"stage": ApplicationStage.INTERVIEW.value},
    )
    await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/{app_ids[2]}/stage",
        headers=h,
        json={"stage": ApplicationStage.REJECTED.value},
    )

    pipe = await combined_client.get(f"/api/v1/jobs/{jid}/pipeline", headers=h)
    assert pipe.status_code == 200
    body = pipe.json()
    assert body["job_id"] == jid
    assert body["total"] == 1
    # Every pipeline stage must be present (even when empty) so the UI
    # never sees a missing column.
    assert set(body["by_stage"].keys()) == set(PIPELINE_STAGES)
    assert len(body["by_stage"][ApplicationStage.APPLIED.value]) == 1

    # The other two applications live on different jobs; their stages
    # show up in those jobs' pipeline views.
    other_pipe = await combined_client.get(
        f"/api/v1/jobs/{job_ids[1]}/pipeline", headers=h
    )
    assert other_pipe.json()["by_stage"][ApplicationStage.INTERVIEW.value]
    other_pipe2 = await combined_client.get(
        f"/api/v1/jobs/{job_ids[2]}/pipeline", headers=h
    )
    assert other_pipe2.json()["by_stage"][ApplicationStage.REJECTED.value]


@pytest.mark.asyncio
async def test_applications_by_stage(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid, h = seed["candidate_id"], seed["job_id"], seed["headers"]
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": jid}
    )
    app_id = create.json()["id"]
    await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/{app_id}/stage",
        headers=h,
        json={"stage": ApplicationStage.OFFER.value},
    )

    resp = await combined_client.get(
        f"/api/v1/jobs/{jid}/applications/by-stage", headers=h
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body["by_stage"].keys()) == set(PIPELINE_STAGES)
    assert len(body["by_stage"][ApplicationStage.OFFER.value]) == 1
    assert body["total"] == 1


# ── Bulk stage move ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_move_stage_partial(combined_client, seed_factory, engine):
    """The primary job only owns one of three applications; the rest are
    silently skipped and reported via ``not_found``."""
    seed = await seed_factory()
    cid, h = seed["candidate_id"], seed["headers"]
    tenant = seed["tenant_id"]
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    job_ids: list[str] = [seed["job_id"]]
    async with factory() as session:
        for i in range(2):
            j = Job(
                id=str(uuid4()),
                tenant_id=tenant,
                title=f"Bulk Job {i}",
                description="x",
                job_type=JobType.FULL_TIME,
                status=JobStatus.OPEN,
            )
            session.add(j)
            await session.flush()
            job_ids.append(j.id)
        await session.commit()

    app_ids: list[str] = []
    for j in job_ids:
        r = await combined_client.post(
            f"/api/v1/candidates/{cid}/apply", headers=h, json={"job_id": j}
        )
        app_ids.append(r.json()["id"])

    jid_primary = job_ids[0]
    bulk = await combined_client.post(
        f"/api/v1/jobs/{jid_primary}/applications/bulk-stage",
        headers=h,
        json={
            "application_ids": app_ids,
            "stage": ApplicationStage.SCREENING.value,
        },
    )
    assert bulk.status_code == 200, bulk.text
    body = bulk.json()
    assert body["moved"] == 1
    assert body["requested"] == 3
    assert set(body["not_found"]) == set(app_ids[1:])


@pytest.mark.asyncio
async def test_bulk_move_rejects_unknown_stage(combined_client, seed_factory):
    seed = await seed_factory()
    jid, h = seed["job_id"], seed["headers"]
    resp = await combined_client.post(
        f"/api/v1/jobs/{jid}/applications/bulk-stage",
        headers=h,
        json={"application_ids": ["x"], "stage": "nope"},
    )
    assert resp.status_code == 400


# ── Auth + tenant isolation ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoints_require_authentication(combined_client, seed_factory):
    seed = await seed_factory()
    cid, jid = seed["candidate_id"], seed["job_id"]
    assert (
        await combined_client.post(f"/api/v1/candidates/{cid}/apply", json={"job_id": jid})
    ).status_code == 401
    assert (
        await combined_client.get(f"/api/v1/candidates/{cid}/applications")
    ).status_code == 401
    assert (
        await combined_client.get(f"/api/v1/jobs/{jid}/applications")
    ).status_code == 401
    assert (
        await combined_client.get(f"/api/v1/jobs/{jid}/pipeline")
    ).status_code == 401


@pytest.mark.asyncio
async def test_tenant_isolation_apply(combined_client, seed_factory):
    """Tenant B cannot apply a candidate that belongs to tenant A."""
    seed = await seed_factory()
    cid, jid, h_a = (
        seed["candidate_id"],
        seed["job_id"],
        seed["headers"],
    )
    h_b = _auth(tenant_id="other-tenant", sub="attacker")
    resp = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply",
        headers=h_b,
        json={"job_id": jid},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_list(combined_client, seed_factory):
    """Tenant B sees no applications for tenant A's candidate / job."""
    seed = await seed_factory()
    cid, jid, h_a = (
        seed["candidate_id"],
        seed["job_id"],
        seed["headers"],
    )
    h_b = _auth(tenant_id="other-tenant", sub="attacker")

    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h_a, json={"job_id": jid}
    )
    assert create.status_code == 201

    assert (
        await combined_client.get(
            f"/api/v1/candidates/{cid}/applications", headers=h_b
        )
    ).status_code == 404
    assert (
        await combined_client.get(
            f"/api/v1/jobs/{jid}/applications", headers=h_b
        )
    ).status_code == 404
    assert (
        await combined_client.get(
            f"/api/v1/jobs/{jid}/applications/by-stage", headers=h_b
        )
    ).status_code == 404
    assert (
        await combined_client.get(
            f"/api/v1/jobs/{jid}/pipeline", headers=h_b
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_stage_change(combined_client, seed_factory):
    """Tenant B cannot move tenant A's application to a new stage."""
    seed = await seed_factory()
    cid, jid, h_a = (
        seed["candidate_id"],
        seed["job_id"],
        seed["headers"],
    )
    h_b = _auth(tenant_id="other-tenant", sub="attacker")
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h_a, json={"job_id": jid}
    )
    app_id = create.json()["id"]

    resp = await combined_client.put(
        f"/api/v1/candidates/{cid}/applications/{app_id}/stage",
        headers=h_b,
        json={"stage": ApplicationStage.SCREENING.value},
    )
    assert resp.status_code == 404

    listed = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications", headers=h_a
    )
    assert listed.json()["data"][0]["stage"] == ApplicationStage.APPLIED.value


@pytest.mark.asyncio
async def test_tenant_isolation_withdraw(combined_client, seed_factory):
    """Tenant B cannot withdraw tenant A's application."""
    seed = await seed_factory()
    cid, jid, h_a = (
        seed["candidate_id"],
        seed["job_id"],
        seed["headers"],
    )
    h_b = _auth(tenant_id="other-tenant", sub="attacker")
    create = await combined_client.post(
        f"/api/v1/candidates/{cid}/apply", headers=h_a, json={"job_id": jid}
    )
    app_id = create.json()["id"]

    resp = await combined_client.delete(
        f"/api/v1/candidates/{cid}/applications/{app_id}", headers=h_b
    )
    assert resp.status_code == 404

    listed = await combined_client.get(
        f"/api/v1/candidates/{cid}/applications", headers=h_a
    )
    assert listed.json()["total"] == 1
