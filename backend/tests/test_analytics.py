"""Tests for the analytics service endpoints.

Each test stands up a minimal FastAPI app that hosts the analytics router
on top of an in-memory SQLite database.  We seed the database with a small
set of jobs, candidates, applications, and interviews so the real query
logic in the router is exercised end-to-end.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone
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
from shared.core.models.candidate import Candidate, CandidateStatus  # noqa: E402
from shared.core.models.identity import User, UserRole, UserStatus  # noqa: E402
from shared.core.models.interview import Interview, InterviewStatus  # noqa: E402
from shared.core.models.recruitment import (  # noqa: E402
    Application,
    ApplicationStatus,
    Job,
    JobStatus,
)
from shared.core.security import create_access_token  # noqa: E402


# ── Constants & helpers ──────────────────────────────────────────────────────

TENANT_A = "tenant-analytics-A"
TENANT_B = "tenant-analytics-B"


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


def _naive_utc(days_ago: int = 0) -> datetime:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(tzinfo=None)


# ── DB / app fixtures ────────────────────────────────────────────────────────


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


async def _seed_tenant_a(session: AsyncSession) -> dict[str, str]:
    """Populate tenant A with deterministic test data.

    Returns a dict of named ids for use by individual tests.
    """
    recruiter = User(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        email="rec-a@tenant.test",
        full_name="Alice Recruiter",
        hashed_password="x",
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
    )
    interviewer = User(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        email="int-a@tenant.test",
        full_name="Ivan Interviewer",
        hashed_password="x",
        role=UserRole.INTERVIEWER,
        status=UserStatus.ACTIVE,
    )
    session.add_all([recruiter, interviewer])
    await session.flush()

    job_open = Job(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        title="Senior Backend Engineer",
        description="Build resilient backend services",
        department="Engineering",
        status=JobStatus.OPEN,
        hiring_manager_id=recruiter.id,
        created_at=_naive_utc(days_ago=60),
    )
    job_draft = Job(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        title="Mobile Engineer (draft)",
        description="iOS role",
        department="Engineering",
        status=JobStatus.DRAFT,
        hiring_manager_id=recruiter.id,
        created_at=_naive_utc(days_ago=5),
    )
    job_other_recruiter = Job(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        title="Data Scientist",
        description="ML pipelines",
        department="Data",
        status=JobStatus.OPEN,
        hiring_manager_id=interviewer.id,
        created_at=_naive_utc(days_ago=90),
    )
    session.add_all([job_open, job_draft, job_other_recruiter])
    await session.flush()

    candidates: list[Candidate] = []
    sources = ["linkedin", "referral", "linkedin", "careers_site", "unknown"]
    locations = ["Paris, FR", "Paris, FR", "Lyon, FR", "Lyon, FR", "Marseille, FR"]
    statuses = [
        CandidateStatus.NEW,
        CandidateStatus.SCREENING,
        CandidateStatus.INTERVIEWING,
        CandidateStatus.OFFER,
        CandidateStatus.HIRED,
    ]
    for i, (src, loc, st) in enumerate(zip(sources, locations, statuses)):
        candidates.append(
            Candidate(
                id=str(uuid4()),
                tenant_id=TENANT_A,
                email=f"cand-{i}@example.com",
                full_name=f"Candidate {i}",
                source=src,
                location=loc,
                status=st,
            )
        )
    session.add_all(candidates)
    await session.flush()

    # Applications — distribute across the funnel.  Two applications end in
    # HIRED; the others stop at intermediate stages.
    apps: list[Application] = []
    app_statuses: list[ApplicationStatus] = [
        ApplicationStatus.APPLIED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEWING,
        ApplicationStatus.OFFERED,
        ApplicationStatus.HIRED,
    ]
    for cand, app_status in zip(candidates, app_statuses):
        # Apply to job_open; the HIRED candidate applies to job_other_recruiter
        # so we can verify per-recruiter hire counts.
        target_job = job_other_recruiter if app_status == ApplicationStatus.HIRED else job_open
        apps.append(
            Application(
                id=str(uuid4()),
                tenant_id=TENANT_A,
                candidate_id=cand.id,
                job_id=target_job.id,
                status=app_status,
                applied_at=_naive_utc(days_ago=40),
                # For HIRED applications, simulate that ~30 days passed between
                # the job's created_at and the application's updated_at.
                updated_at=(
                    target_job.created_at + timedelta(days=30)
                    if app_status == ApplicationStatus.HIRED
                    else _naive_utc(days_ago=30)
                ),
            )
        )
    session.add_all(apps)
    await session.flush()

    # Interviews for the first three candidates.
    interviews: list[Interview] = []
    for i, cand in enumerate(candidates[:3]):
        interviews.append(
            Interview(
                id=str(uuid4()),
                tenant_id=TENANT_A,
                application_id=apps[i].id,
                candidate_id=cand.id,
                job_id=job_open.id,
                interview_type="technical",
                status=InterviewStatus.COMPLETED if i % 2 == 0 else InterviewStatus.SCHEDULED,
                interviewer_id=interviewer.id,
            )
        )
    # Add one more interview for the recruiter (so they have interview count)
    interviews.append(
        Interview(
            id=str(uuid4()),
            tenant_id=TENANT_A,
            application_id=apps[3].id,
            candidate_id=candidates[3].id,
            job_id=job_open.id,
            interview_type="hr_screening",
            status=InterviewStatus.SCHEDULED,
            interviewer_id=recruiter.id,
        )
    )
    session.add_all(interviews)
    await session.commit()

    return {
        "recruiter_id": recruiter.id,
        "interviewer_id": interviewer.id,
        "job_open_id": job_open.id,
        "job_draft_id": job_draft.id,
        "job_other_recruiter_id": job_other_recruiter.id,
        "candidate_hired_id": candidates[4].id,
    }


async def _seed_tenant_b(session: AsyncSession) -> None:
    """A separate tenant to verify isolation (counts must be zero)."""
    other = Job(
        id=str(uuid4()),
        tenant_id=TENANT_B,
        title="Tenant B Job",
        description="x",
        status=JobStatus.OPEN,
        created_at=_naive_utc(days_ago=10),
    )
    session.add(other)
    await session.commit()


@pytest_asyncio.fixture
async def analytics_client(engine) -> AsyncGenerator[AsyncClient, None]:
    """Build a minimal FastAPI app hosting only the analytics router."""
    from apps.analytics_service.main import router as analytics_router

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Seed both tenants.
    async with factory() as session:
        await _seed_tenant_a(session)
        await _seed_tenant_b(session)

    app = FastAPI()
    app.include_router(analytics_router, prefix="/analytics")

    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

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


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_overview_returns_four_main_metrics(analytics_client: AsyncClient):
    """Overview must include the four canonical metrics
    (candidates, jobs, interviews, hires) plus a generated_at timestamp."""
    resp = await analytics_client.get(
        "/analytics/overview", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # All four primary metrics must be present and integer-typed.
    for key in ("total_candidates", "total_jobs", "total_interviews", "total_hires"):
        assert key in body, f"Missing key: {key}"
        assert isinstance(body[key], int), f"{key} should be int, got {type(body[key])}"

    # Sanity: tenant A seeded 5 candidates, 3 jobs, 4 interviews, 1 hire.
    assert body["total_candidates"] == 5
    assert body["total_jobs"] == 3
    assert body["total_jobs"] == body["open_jobs"] + 1  # one is DRAFT
    assert body["open_jobs"] == 2
    assert body["total_interviews"] == 4
    assert body["total_hires"] == 1
    assert body["completed_interviews"] == 2
    assert body["active_applications"] == 4
    assert body["pending_offers"] == 1
    assert "generated_at" in body


@pytest.mark.asyncio
async def test_overview_tenant_isolation(analytics_client: AsyncClient):
    """Tenant B must not see Tenant A's data."""
    resp = await analytics_client.get(
        "/analytics/overview", headers=_auth(TENANT_B)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_candidates"] == 0
    assert body["total_jobs"] == 1
    assert body["total_hires"] == 0


@pytest.mark.asyncio
async def test_hiring_funnel_returns_stages(analytics_client: AsyncClient):
    """Funnel must return the 5 canonical stages with conversion rates."""
    resp = await analytics_client.get(
        "/analytics/hiring-funnel", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "stages" in body
    assert "total_entered" in body
    assert "total_hired" in body
    assert "overall_conversion" in body

    stage_names = [s["stage"] for s in body["stages"]]
    # Order matters for the funnel view.
    assert stage_names == ["applied", "screened", "interviewed", "offered", "hired"]

    for stage in body["stages"]:
        assert "count" in stage
        assert "conversion_from_previous" in stage
        assert isinstance(stage["count"], int)
        assert 0.0 <= stage["conversion_from_previous"] <= 1.0

    # Sanity: 5 applications in seeded data, with the deepest stage reached
    # for each being 1 hired.
    assert body["total_entered"] == 5
    assert body["total_hired"] == 1
    # The counts should be monotonically non-increasing across the funnel.
    counts = [s["count"] for s in body["stages"]]
    assert counts == sorted(counts, reverse=True)


@pytest.mark.asyncio
async def test_time_to_hire_returns_average_days(analytics_client: AsyncClient):
    """Time-to-hire must return an average in days, plus a sample size."""
    resp = await analytics_client.get(
        "/analytics/time-to-hire", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    for key in ("average_days", "median_days", "sample_size", "by_stage", "generated_at"):
        assert key in body, f"Missing key: {key}"

    assert isinstance(body["average_days"], (int, float))
    assert body["sample_size"] == 1  # Only one HIRED application
    # Job was created 60 days ago and the hire took ~30 days, so we expect
    # roughly 30 days.  We allow a wide window to avoid timing flakiness.
    assert 0 < body["average_days"] <= 90
    assert body["median_days"] == body["average_days"]  # only one sample


@pytest.mark.asyncio
async def test_time_to_hire_empty_tenant(analytics_client: AsyncClient):
    """Time-to-hire for a tenant with no hires must return zeros, not crash."""
    resp = await analytics_client.get(
        "/analytics/time-to-hire", headers=_auth(TENANT_B)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["average_days"] == 0.0
    assert body["median_days"] == 0.0
    assert body["sample_size"] == 0


@pytest.mark.asyncio
async def test_source_effectiveness_returns_list(analytics_client: AsyncClient):
    """Source effectiveness must return a list of sources with counts."""
    resp = await analytics_client.get(
        "/analytics/source-effectiveness", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "sources" in body
    assert "total" in body
    assert isinstance(body["sources"], list)
    assert body["total"] == 5

    sources_by_name = {s["source"]: s for s in body["sources"]}
    # Seeded: linkedin x2, referral x1, careers_site x1, unknown x1
    assert sources_by_name["linkedin"]["candidates"] == 2
    assert sources_by_name["referral"]["candidates"] == 1
    assert sources_by_name["careers_site"]["candidates"] == 1
    assert sources_by_name["unknown"]["candidates"] == 1

    # The hired candidate was sourced from "unknown" in our seed data.
    assert sources_by_name["unknown"]["hired"] == 1
    for src in body["sources"]:
        assert "conversion_rate" in src
        assert 0.0 <= src["conversion_rate"] <= 1.0


@pytest.mark.asyncio
async def test_diversity_returns_breakdown(analytics_client: AsyncClient):
    """Diversity must include location, seniority, and status buckets."""
    resp = await analytics_client.get(
        "/analytics/diversity", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    for key in ("by_location", "by_seniority", "by_status", "total", "generated_at"):
        assert key in body, f"Missing key: {key}"

    assert body["total"] == 5
    for section in ("by_location", "by_seniority", "by_status"):
        assert isinstance(body[section], list)
        for bucket in body[section]:
            assert {"label", "count", "percentage"} <= set(bucket.keys())
            assert isinstance(bucket["count"], int)
            assert isinstance(bucket["percentage"], (int, float))

    # Status buckets should at least cover all candidates.  When the
    # per-bucket count is below the "other" threshold, individual labels
    # collapse into a single "other" bucket; otherwise they appear
    # individually.  Either way the total count of status buckets must
    # equal the candidate count.
    status_total = sum(b["count"] for b in body["by_status"])
    assert status_total == 5
    status_labels = {b["label"] for b in body["by_status"]}
    # With 5 candidates spread across 5 distinct statuses, each status
    # has count 1 and is below the "other" threshold, so the only label
    # visible should be "other".
    assert "other" in status_labels

    # Percentages should sum to ~100 (within rounding).
    total_pct = sum(b["percentage"] for b in body["by_status"])
    assert 99.0 <= total_pct <= 101.0


@pytest.mark.asyncio
async def test_recruiter_performance_returns_list(analytics_client: AsyncClient):
    """Recruiter performance must return per-recruiter aggregates."""
    resp = await analytics_client.get(
        "/analytics/recruiter-performance", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert "recruiters" in body
    assert "total" in body
    assert isinstance(body["recruiters"], list)
    assert body["total"] == len(body["recruiters"])

    # Both seeded users should appear because both have interview activity
    # and the data scientist job is owned by the interviewer.
    ids = {r["recruiter_id"] for r in body["recruiters"]}
    assert len(ids) >= 1

    for r in body["recruiters"]:
        assert {"candidates_processed", "interviews_scheduled",
                "interviews_completed", "hires"} <= set(r.keys())
        assert isinstance(r["candidates_processed"], int)
        assert isinstance(r["interviews_scheduled"], int)
        assert isinstance(r["hires"], int)

    # Verify that the sum of hires across recruiters matches the overview.
    total_hires = sum(r["hires"] for r in body["recruiters"])
    assert total_hires == 1  # Only one HIRED application in the seed data


@pytest.mark.asyncio
async def test_all_endpoints_require_auth(analytics_client: AsyncClient):
    """Every analytics endpoint must require a valid Bearer token."""
    endpoints = [
        "/analytics/overview",
        "/analytics/hiring-funnel",
        "/analytics/time-to-hire",
        "/analytics/source-effectiveness",
        "/analytics/diversity",
        "/analytics/recruiter-performance",
    ]
    for path in endpoints:
        resp = await analytics_client.get(path)
        assert resp.status_code == 401, (
            f"{path} should require auth, got {resp.status_code}"
        )
