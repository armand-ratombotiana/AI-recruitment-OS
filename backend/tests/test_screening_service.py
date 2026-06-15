"""Tests for the screening service endpoints."""
from __future__ import annotations

import os
import sys

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long!!")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-that-is-at-least-32-chars!!")

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.recruitment import Job, JobStatus
from shared.core.security import create_access_token

from apps.screening_service.main import ScreeningResult, router


TENANT_ID = str(uuid.uuid4())


def _auth_headers() -> dict[str, str]:
    token = create_access_token({
        "sub": "test-user",
        "email": "test@test.com",
        "role": "recruiter",
        "tenant_id": TENANT_ID,
    })
    return {"Authorization": f"Bearer {token}"}


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
async def db_session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_engine):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/screening")

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db_dependency] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=_auth_headers()) as ac:
        yield ac


@pytest_asyncio.fixture
async def seed_data(db_session: AsyncSession):
    job = Job(
        id="job-1",
        tenant_id=TENANT_ID,
        title="Senior Python Developer",
        description="Build things in Python",
        status=JobStatus.OPEN,
        required_skills='["python", "fastapi"]',
        preferred_skills='["aws"]',
    )
    db_session.add(job)

    candidate = Candidate(
        id="cand-1",
        tenant_id=TENANT_ID,
        email="jane@example.com",
        full_name="Jane Doe",
        status=CandidateStatus.NEW,
    )
    db_session.add(candidate)

    candidate2 = Candidate(
        id="cand-2",
        tenant_id=TENANT_ID,
        email="bob@example.com",
        full_name="Bob Smith",
        status=CandidateStatus.NEW,
    )
    db_session.add(candidate2)

    job2 = Job(
        id="job-2",
        tenant_id=TENANT_ID,
        title="Frontend Engineer",
        description="Build UIs",
        status=JobStatus.OPEN,
        required_skills='["react", "typescript"]',
    )
    db_session.add(job2)

    await db_session.commit()
    return {"job": job, "job2": job2, "candidate": candidate, "candidate2": candidate2}


def _mock_screening(score: float = 0.75, qualified: bool = True):
    return AsyncMock(return_value={
        "score": score,
        "recommendation": "MATCH" if score >= 0.7 else "POSSIBLE",
        "strengths": ["Python expertise"],
        "concerns": ["Limited cloud experience"],
        "red_flags": [],
        "qualified": qualified,
        "summary": "Good fit",
        "confidence_score": 0.8,
    })


@pytest.mark.asyncio
async def test_screen_candidates_for_job(client: AsyncClient, seed_data):
    with patch("apps.screening_service.main._run_screening", _mock_screening(0.8)):
        response = await client.post(
            "/api/v1/screening/screen-job/job-1",
            json={"top_n": 10, "threshold": 0.5},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == "job-1"
    assert "results" in data
    assert "total_screened" in data
    assert data["total_screened"] == 2


@pytest.mark.asyncio
async def test_screen_candidates_for_job_not_found(client: AsyncClient, seed_data):
    response = await client.post(
        "/api/v1/screening/screen-job/nonexistent",
        json={"top_n": 10, "threshold": 0.5},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_screen_candidate_for_jobs(client: AsyncClient, seed_data):
    with patch("apps.screening_service.main._run_screening", _mock_screening(0.7)):
        response = await client.post(
            "/api/v1/screening/screen-candidate/cand-1",
            json={"top_n": 5},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["candidate_id"] == "cand-1"
    assert "results" in data
    assert "total_jobs" in data


@pytest.mark.asyncio
async def test_screen_candidate_not_found(client: AsyncClient, seed_data):
    response = await client.post(
        "/api/v1/screening/screen-candidate/nonexistent",
        json={"top_n": 5},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_batch_screen(client: AsyncClient, seed_data):
    with patch("apps.screening_service.main._run_screening", _mock_screening(0.6)):
        response = await client.post(
            "/api/v1/screening/batch",
            json={
                "candidate_ids": ["cand-1", "cand-2"],
                "job_ids": ["job-1", "job-2"],
            },
        )
    assert response.status_code == 200
    data = response.json()
    assert "matrix" in data
    assert data["candidates_screened"] == 2
    assert data["jobs_screened"] == 2


@pytest.mark.asyncio
async def test_batch_screen_empty(client: AsyncClient, seed_data):
    response = await client.post(
        "/api/v1/screening/batch",
        json={"candidate_ids": [], "job_ids": []},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_screening_results_empty(client: AsyncClient, seed_data):
    response = await client.get("/api/v1/screening/results/job-1")
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == "job-1"
    assert data["total_results"] == 0
    assert data["results"] == []


@pytest.mark.asyncio
async def test_get_screening_results_after_screening(client: AsyncClient, seed_data):
    with patch("apps.screening_service.main._run_screening", _mock_screening(0.8)):
        await client.post(
            "/api/v1/screening/screen-job/job-1",
            json={"top_n": 10, "threshold": 0.5},
        )

    response = await client.get("/api/v1/screening/results/job-1")
    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == "job-1"
    assert data["total_results"] > 0
    assert data["results"][0]["candidate_id"] in ["cand-1", "cand-2"]


@pytest.mark.asyncio
async def test_unauthorized_request(db_engine):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/screening")

    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db_dependency] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/screening/results/job-1")
    assert response.status_code == 401
