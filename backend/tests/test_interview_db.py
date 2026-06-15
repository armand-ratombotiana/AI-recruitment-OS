"""Interview service DB persistence tests.

Verifies that:
* CRUD operations actually persist to the database (not an in-memory dict).
* Committed data survives a fresh DB session (simulated container restart).
* Tenant isolation is enforced end-to-end via the API.
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
from sqlmodel import SQLModel, select

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.interview import Interview, InterviewStatus
from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


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


@pytest_asyncio.fixture
async def interview_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    from apps.interview_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/interviews")
    db_override(app)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# -- CRUD persists --


@pytest.mark.asyncio
async def test_create_interview_persists_to_db(interview_client, db_session_factory):
    r = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-1", "job_id": "job-1", "interview_type": "technical"},
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["candidate_id"] == "cand-1"
    assert body["status"] == "scheduled"
    assert body["created"] is True
    interview_id = body["id"]

    async with db_session_factory() as session:
        result = await session.execute(
            select(Interview).where(Interview.id == interview_id)
        )
        row = result.scalar_one()
    assert row.candidate_id == "cand-1"
    assert row.job_id == "job-1"
    assert row.tenant_id == "tenant-A"
    assert row.status == InterviewStatus.SCHEDULED


@pytest.mark.asyncio
async def test_list_interviews_returns_db_rows(interview_client):
    admin = _auth("tenant-A")
    for i in range(3):
        await interview_client.post(
            "/interviews/",
            json={"candidate_id": f"cand-{i}", "job_id": "job-1", "interview_type": "technical"},
            headers=admin,
        )

    r = await interview_client.get("/interviews/", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_get_interview_returns_db_row(interview_client):
    admin = _auth("tenant-A")
    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-1", "job_id": "job-1", "interview_type": "technical"},
        headers=admin,
    )
    iid = create.json()["id"]

    r = await interview_client.get(f"/interviews/{iid}", headers=admin)
    assert r.status_code == 200
    assert r.json()["id"] == iid
    assert r.json()["candidate_id"] == "cand-1"


@pytest.mark.asyncio
async def test_start_interview_persists(interview_client, db_session_factory):
    admin = _auth("tenant-A")
    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-1", "job_id": "job-1", "interview_type": "technical"},
        headers=admin,
    )
    iid = create.json()["id"]

    r = await interview_client.post(f"/interviews/{iid}/start", headers=admin)
    assert r.status_code == 200
    assert r.json()["status"] == "in_progress"

    async with db_session_factory() as session:
        result = await session.execute(
            select(Interview).where(Interview.id == iid)
        )
        row = result.scalar_one()
    assert row.status == InterviewStatus.IN_PROGRESS
    assert row.started_at is not None


@pytest.mark.asyncio
async def test_complete_interview_persists(interview_client, db_session_factory):
    admin = _auth("tenant-A")
    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-1", "job_id": "job-1", "interview_type": "technical"},
        headers=admin,
    )
    iid = create.json()["id"]

    await interview_client.post(f"/interviews/{iid}/start", headers=admin)
    r = await interview_client.post(f"/interviews/{iid}/complete", headers=admin)
    assert r.status_code == 200
    assert r.json()["status"] == "completed"

    async with db_session_factory() as session:
        result = await session.execute(
            select(Interview).where(Interview.id == iid)
        )
        row = result.scalar_one()
    assert row.status == InterviewStatus.COMPLETED
    assert row.ended_at is not None


@pytest.mark.asyncio
async def test_cancel_interview_persists(interview_client, db_session_factory):
    admin = _auth("tenant-A")
    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-1", "job_id": "job-1", "interview_type": "technical"},
        headers=admin,
    )
    iid = create.json()["id"]

    r = await interview_client.post(
        f"/interviews/{iid}/cancel",
        json={"reason": "Candidate unavailable"},
        headers=admin,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"

    async with db_session_factory() as session:
        result = await session.execute(
            select(Interview).where(Interview.id == iid)
        )
        row = result.scalar_one()
    assert row.status == InterviewStatus.CANCELLED


@pytest.mark.asyncio
async def test_cancel_already_cancelled_returns_409(interview_client):
    admin = _auth("tenant-A")
    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-1", "job_id": "job-1", "interview_type": "technical"},
        headers=admin,
    )
    iid = create.json()["id"]

    await interview_client.post(
        f"/interviews/{iid}/cancel",
        json={"reason": "First cancel"},
        headers=admin,
    )
    r = await interview_client.post(
        f"/interviews/{iid}/cancel",
        json={"reason": "Second cancel"},
        headers=admin,
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_reschedule_interview_persists(interview_client, db_session_factory):
    admin = _auth("tenant-A")
    create = await interview_client.post(
        "/interviews/",
        json={
            "candidate_id": "cand-1",
            "job_id": "job-1",
            "interview_type": "technical",
            "scheduled_at": "2025-01-20T14:00:00Z",
        },
        headers=admin,
    )
    iid = create.json()["id"]

    r = await interview_client.post(
        f"/interviews/{iid}/reschedule",
        json={"scheduled_at": "2025-02-01T10:00:00Z", "reason": "Conflict"},
        headers=admin,
    )
    assert r.status_code == 200
    assert r.json()["new_scheduled_at"] == "2025-02-01T10:00:00Z"
    assert r.json()["rescheduled"] is True

    async with db_session_factory() as session:
        result = await session.execute(
            select(Interview).where(Interview.id == iid)
        )
        row = result.scalar_one()
    assert row.scheduled_at is not None
    assert row.scheduled_at.month == 2


# -- Persistence survives "container restart" --


@pytest.mark.asyncio
async def test_data_survives_container_restart():
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "interviews.db"
        file_url = f"sqlite+aiosqlite:///{db_path}"

        eng1 = create_async_engine(file_url, echo=False)
        async with eng1.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

        factory1 = async_sessionmaker(eng1, class_=AsyncSession, expire_on_commit=False)
        iid = str(uuid4())
        async with factory1() as session:
            session.add(Interview(
                id=iid, tenant_id="tenant-A", candidate_id="c1", job_id="j1",
                application_id="", interview_type="technical",
                status=InterviewStatus.SCHEDULED,
            ))
            await session.commit()

        await eng1.dispose()

        eng2 = create_async_engine(file_url, echo=False)
        factory2 = async_sessionmaker(eng2, class_=AsyncSession, expire_on_commit=False)
        async with factory2() as session:
            result = await session.execute(
                select(Interview).where(Interview.id == iid)
            )
            row = result.scalar_one_or_none()

        await eng2.dispose()

        assert row is not None, "Interview lost across engine restart"
        assert row.candidate_id == "c1"
        assert row.tenant_id == "tenant-A"


# -- Tenant isolation --


@pytest.mark.asyncio
async def test_tenant_isolation_on_list(interview_client):
    a = _auth("tenant-A")
    b = _auth("tenant-B")

    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-A", "job_id": "job-1", "interview_type": "technical"},
        headers=a,
    )
    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-B", "job_id": "job-1", "interview_type": "technical"},
        headers=b,
    )

    list_a = await interview_client.get("/interviews/", headers=a)
    list_b = await interview_client.get("/interviews/", headers=b)
    assert list_a.status_code == 200
    assert list_b.status_code == 200

    a_candidates = {i["candidate_id"] for i in list_a.json()["data"]}
    b_candidates = {i["candidate_id"] for i in list_b.json()["data"]}
    assert "cand-A" in a_candidates and "cand-B" not in a_candidates
    assert "cand-B" in b_candidates and "cand-A" not in b_candidates


@pytest.mark.asyncio
async def test_tenant_isolation_on_get_returns_404(interview_client):
    a = _auth("tenant-A")
    b = _auth("tenant-B")

    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-B", "job_id": "job-1", "interview_type": "technical"},
        headers=b,
    )
    b_id = create.json()["id"]

    cross = await interview_client.get(f"/interviews/{b_id}", headers=a)
    assert cross.status_code == 404

    own = await interview_client.get(f"/interviews/{b_id}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_start_returns_404(interview_client):
    a = _auth("tenant-A")
    b = _auth("tenant-B")

    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-B", "job_id": "job-1", "interview_type": "technical"},
        headers=b,
    )
    b_id = create.json()["id"]

    cross = await interview_client.post(f"/interviews/{b_id}/start", headers=a)
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_cancel_returns_404(interview_client):
    a = _auth("tenant-A")
    b = _auth("tenant-B")

    create = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-B", "job_id": "job-1", "interview_type": "technical"},
        headers=b,
    )
    b_id = create.json()["id"]

    cross = await interview_client.post(
        f"/interviews/{b_id}/cancel",
        json={"reason": "hack"},
        headers=a,
    )
    assert cross.status_code == 404


# -- Unauthenticated access is rejected --


@pytest.mark.asyncio
async def test_unauthenticated_list_is_401(interview_client):
    r = await interview_client.get("/interviews/")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_unauthenticated_create_is_401(interview_client):
    r = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "x", "job_id": "y", "interview_type": "technical"},
    )
    assert r.status_code == 401


# -- 404 for missing resources --


@pytest.mark.asyncio
async def test_get_unknown_interview_404(interview_client):
    r = await interview_client.get(
        "/interviews/does-not-exist",
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_start_unknown_interview_404(interview_client):
    r = await interview_client.post(
        "/interviews/does-not-exist/start",
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_complete_unknown_interview_404(interview_client):
    r = await interview_client.post(
        "/interviews/does-not-exist/complete",
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 404


# -- Filtering --


@pytest.mark.asyncio
async def test_filter_by_status(interview_client):
    admin = _auth("tenant-A")
    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "c1", "job_id": "j1", "interview_type": "technical"},
        headers=admin,
    )
    r2 = await interview_client.post(
        "/interviews/",
        json={"candidate_id": "c2", "job_id": "j1", "interview_type": "technical"},
        headers=admin,
    )
    iid = r2.json()["id"]
    await interview_client.post(f"/interviews/{iid}/start", headers=admin)

    scheduled = await interview_client.get("/interviews/?status=scheduled", headers=admin)
    in_progress = await interview_client.get("/interviews/?status=in_progress", headers=admin)
    assert scheduled.status_code == 200
    assert in_progress.status_code == 200
    assert scheduled.json()["total"] == 1
    assert in_progress.json()["total"] == 1


@pytest.mark.asyncio
async def test_filter_by_candidate_id(interview_client):
    admin = _auth("tenant-A")
    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-X", "job_id": "j1", "interview_type": "technical"},
        headers=admin,
    )
    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "cand-Y", "job_id": "j1", "interview_type": "technical"},
        headers=admin,
    )

    r = await interview_client.get("/interviews/?candidate_id=cand-X", headers=admin)
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["data"][0]["candidate_id"] == "cand-X"


@pytest.mark.asyncio
async def test_filter_by_job_id(interview_client):
    admin = _auth("tenant-A")
    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "c1", "job_id": "job-X", "interview_type": "technical"},
        headers=admin,
    )
    await interview_client.post(
        "/interviews/",
        json={"candidate_id": "c2", "job_id": "job-Y", "interview_type": "technical"},
        headers=admin,
    )

    r = await interview_client.get("/interviews/?job_id=job-X", headers=admin)
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["data"][0]["job_id"] == "job-X"
