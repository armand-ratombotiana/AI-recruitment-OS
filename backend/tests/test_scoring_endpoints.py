"""Tests for the candidate ↔ job scoring endpoints.

Covers:
* ``POST /api/v1/candidates/{id}/score-for-job`` — single pair scoring
* ``POST /api/v1/jobs/{id}/score-candidates`` — top-N candidates for a job
* ``POST /api/v1/candidates/bulk-score`` — full N×M scoring matrix
* ``GET  /api/v1/candidates/{id}/best-jobs`` — ranked jobs for a candidate
* Custom weight overrides
* Strict tenant isolation across all four endpoints
"""
from __future__ import annotations

import json
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

# Make backend importable when this file is run in isolation.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.database import get_db_dependency
from shared.core.models.candidate import (
    Candidate,
    CandidateProfile,
    CandidateSkill,
    CandidateStatus,
    Skill,
)
from shared.core.models.recruitment import Job, JobStatus, JobType
from shared.core.security import create_access_token


# ── Auth helpers ──────────────────────────────────────────────────────────


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


# ── Engine / app fixtures ────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    """Single shared-connection async SQLite engine for the test."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Importing the model modules registers them on SQLModel.metadata.
    from shared.core.models import (  # noqa: F401
        candidate,
        candidate_activity,
        identity,
        audit_log,
        recruitment,
        webhook,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def scoring_client(engine):
    """FastAPI app with both scoring routers (candidates + jobs) mounted."""
    from apps.candidate_service.main import (
        jobs_scoring_router,
        router as candidate_router,
    )

    app = FastAPI()
    app.include_router(candidate_router, prefix="/api/v1/candidates")
    app.include_router(jobs_scoring_router, prefix="/api/v1/jobs")

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

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Seed helpers ──────────────────────────────────────────────────────────


async def _seed_skill(session: AsyncSession, tenant_id: str, name: str) -> Skill:
    skill = Skill(
        id=str(uuid4()),
        tenant_id=tenant_id,
        name=name,
        normalized_name=name.lower().strip(),
    )
    session.add(skill)
    await session.flush()
    return skill


async def _seed_candidate(
    session: AsyncSession,
    tenant_id: str,
    *,
    full_name: str,
    location: str | None = None,
    years_experience: int | None = None,
    skill_names: list[str] | None = None,
) -> Candidate:
    candidate = Candidate(
        id=str(uuid4()),
        tenant_id=tenant_id,
        email=f"{uuid4().hex[:8]}@example.com",
        full_name=full_name,
        location=location,
        status=CandidateStatus.NEW,
    )
    session.add(candidate)
    await session.flush()

    if years_experience is not None:
        profile = CandidateProfile(
            id=str(uuid4()),
            candidate_id=candidate.id,
            tenant_id=tenant_id,
            years_experience=years_experience,
        )
        session.add(profile)

    for sname in skill_names or []:
        skill = await _seed_skill(session, tenant_id, sname)
        link = CandidateSkill(
            id=str(uuid4()),
            candidate_id=candidate.id,
            tenant_id=tenant_id,
            skill_id=skill.id,
        )
        session.add(link)

    await session.flush()
    return candidate


async def _seed_job(
    session: AsyncSession,
    tenant_id: str,
    *,
    title: str,
    required_skills: list[str] | None = None,
    preferred_skills: list[str] | None = None,
    location: str | None = None,
    salary_min: int | None = None,
    salary_max: int | None = None,
    remote_policy: str | None = "onsite",
) -> Job:
    job = Job(
        id=str(uuid4()),
        tenant_id=tenant_id,
        title=title,
        description=f"Description for {title}",
        location=location,
        remote_policy=remote_policy,
        job_type=JobType.FULL_TIME,
        salary_min=salary_min,
        salary_max=salary_max,
        required_skills=json.dumps(required_skills or []),
        preferred_skills=json.dumps(preferred_skills or []),
        status=JobStatus.OPEN,
    )
    session.add(job)
    await session.flush()
    return job


@pytest_asyncio.fixture
async def seeded_world(engine):
    """Seed a tenant with one strong candidate, one weak candidate, and two jobs."""
    tenant_id = f"tenant-{uuid4().hex[:8]}"
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        strong = await _seed_candidate(
            session,
            tenant_id,
            full_name="Strong Candidate",
            location="Paris, France",
            years_experience=6,
            skill_names=["Python", "FastAPI", "PostgreSQL"],
        )
        weak = await _seed_candidate(
            session,
            tenant_id,
            full_name="Weak Candidate",
            location="Lyon, France",
            years_experience=1,
            skill_names=["COBOL"],
        )
        backend_job = await _seed_job(
            session,
            tenant_id,
            title="Senior Backend Engineer",
            required_skills=["Python", "FastAPI"],
            preferred_skills=["PostgreSQL"],
            location="Paris, France",
            salary_min=60000,
            salary_max=120000,
        )
        legacy_job = await _seed_job(
            session,
            tenant_id,
            title="Mainframe Maintenance",
            required_skills=["COBOL", "JCL"],
            location="Lyon, France",
            salary_min=40000,
            salary_max=70000,
        )
        await session.commit()
    return {
        "tenant_id": tenant_id,
        "headers": _auth(tenant_id, sub="recruiter-1"),
        "strong_candidate_id": strong.id,
        "weak_candidate_id": weak.id,
        "backend_job_id": backend_job.id,
        "legacy_job_id": legacy_job.id,
    }


# ── POST /candidates/{id}/score-for-job ───────────────────────────────────


@pytest.mark.asyncio
async def test_score_candidate_for_job_strong_match(scoring_client, seeded_world):
    """A candidate with matching skills+location+salary scores high."""
    resp = await scoring_client.post(
        f"/api/v1/candidates/{seeded_world['strong_candidate_id']}/score-for-job",
        headers=seeded_world["headers"],
        json={"job_id": seeded_world["backend_job_id"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["candidate_id"] == seeded_world["strong_candidate_id"]
    assert body["job_id"] == seeded_world["backend_job_id"]
    assert body["skills_score"] == 1.0
    assert body["location_score"] == 1.0
    assert body["total_score"] >= 0.7
    assert body["recommendation"] in {"STRONG_MATCH", "MATCH"}


@pytest.mark.asyncio
async def test_score_candidate_for_job_weak_match(scoring_client, seeded_world):
    """A candidate with no relevant skills should score low against the backend job."""
    resp = await scoring_client.post(
        f"/api/v1/candidates/{seeded_world['weak_candidate_id']}/score-for-job",
        headers=seeded_world["headers"],
        json={"job_id": seeded_world["backend_job_id"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["skills_score"] == 0.0
    assert body["total_score"] < 0.7
    assert body["recommendation"] in {"WEAK", "POSSIBLE", "NO_MATCH"}


@pytest.mark.asyncio
async def test_score_candidate_for_job_missing_candidate(scoring_client, seeded_world):
    resp = await scoring_client.post(
        f"/api/v1/candidates/{uuid4()}/score-for-job",
        headers=seeded_world["headers"],
        json={"job_id": seeded_world["backend_job_id"]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_score_candidate_for_job_missing_job(scoring_client, seeded_world):
    resp = await scoring_client.post(
        f"/api/v1/candidates/{seeded_world['strong_candidate_id']}/score-for-job",
        headers=seeded_world["headers"],
        json={"job_id": str(uuid4())},
    )
    assert resp.status_code == 404


# ── POST /jobs/{id}/score-candidates ──────────────────────────────────────


@pytest.mark.asyncio
async def test_score_candidates_for_job_returns_ranked_list(scoring_client, seeded_world):
    """The strong candidate must rank above the weak candidate for the backend job."""
    resp = await scoring_client.post(
        f"/api/v1/jobs/{seeded_world['backend_job_id']}/score-candidates",
        headers=seeded_world["headers"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["job_id"] == seeded_world["backend_job_id"]
    candidates = body["candidates"]
    assert body["total_scored"] == 2
    assert [c["rank"] for c in candidates] == [1, 2]
    assert candidates[0]["candidate_id"] == seeded_world["strong_candidate_id"]
    assert candidates[1]["candidate_id"] == seeded_world["weak_candidate_id"]
    assert candidates[0]["score"] >= candidates[1]["score"]


@pytest.mark.asyncio
async def test_score_candidates_for_job_respects_limit(scoring_client, seeded_world):
    resp = await scoring_client.post(
        f"/api/v1/jobs/{seeded_world['backend_job_id']}/score-candidates?limit=1",
        headers=seeded_world["headers"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_scored"] == 1
    assert body["candidates"][0]["candidate_id"] == seeded_world["strong_candidate_id"]


@pytest.mark.asyncio
async def test_score_candidates_for_job_unknown_job(scoring_client, seeded_world):
    resp = await scoring_client.post(
        f"/api/v1/jobs/{uuid4()}/score-candidates",
        headers=seeded_world["headers"],
    )
    assert resp.status_code == 404


# ── POST /candidates/bulk-score ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_score_matrix_size(scoring_client, seeded_world):
    """2 candidates × 2 jobs == 4 cells."""
    resp = await scoring_client.post(
        "/api/v1/candidates/bulk-score",
        headers=seeded_world["headers"],
        json={
            "candidate_ids": [
                seeded_world["strong_candidate_id"],
                seeded_world["weak_candidate_id"],
            ],
            "job_ids": [
                seeded_world["backend_job_id"],
                seeded_world["legacy_job_id"],
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 4
    assert len(body["matrix"]) == 4
    assert set(body["candidate_ids"]) == {
        seeded_world["strong_candidate_id"],
        seeded_world["weak_candidate_id"],
    }
    assert set(body["job_ids"]) == {
        seeded_world["backend_job_id"],
        seeded_world["legacy_job_id"],
    }

    # Spot-check: strong vs backend should outscore weak vs backend.
    by_pair = {(c["candidate_id"], c["job_id"]): c["score"] for c in body["matrix"]}
    assert by_pair[
        (seeded_world["strong_candidate_id"], seeded_world["backend_job_id"])
    ] > by_pair[
        (seeded_world["weak_candidate_id"], seeded_world["backend_job_id"])
    ]
    # And weak vs legacy should outscore weak vs backend.
    assert by_pair[
        (seeded_world["weak_candidate_id"], seeded_world["legacy_job_id"])
    ] > by_pair[
        (seeded_world["weak_candidate_id"], seeded_world["backend_job_id"])
    ]


@pytest.mark.asyncio
async def test_bulk_score_silently_drops_unknown_ids(scoring_client, seeded_world):
    """Unknown ids in the input must not leak — output only includes real rows."""
    resp = await scoring_client.post(
        "/api/v1/candidates/bulk-score",
        headers=seeded_world["headers"],
        json={
            "candidate_ids": [
                seeded_world["strong_candidate_id"],
                str(uuid4()),  # bogus
            ],
            "job_ids": [
                seeded_world["backend_job_id"],
                str(uuid4()),  # bogus
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["candidate_ids"] == [seeded_world["strong_candidate_id"]]
    assert body["job_ids"] == [seeded_world["backend_job_id"]]
    assert body["total"] == 1


# ── GET /candidates/{id}/best-jobs ────────────────────────────────────────


@pytest.mark.asyncio
async def test_best_jobs_for_candidate_sorted(scoring_client, seeded_world):
    """For the strong candidate, the backend job ranks above the legacy job."""
    resp = await scoring_client.get(
        f"/api/v1/candidates/{seeded_world['strong_candidate_id']}/best-jobs",
        headers=seeded_world["headers"],
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["candidate_id"] == seeded_world["strong_candidate_id"]
    assert body["total"] == 2
    matches = body["matches"]
    assert matches[0]["job_id"] == seeded_world["backend_job_id"]
    assert matches[1]["job_id"] == seeded_world["legacy_job_id"]
    assert matches[0]["score"] >= matches[1]["score"]
    assert matches[0]["job_title"] == "Senior Backend Engineer"


@pytest.mark.asyncio
async def test_best_jobs_for_candidate_weak_prefers_legacy(scoring_client, seeded_world):
    """The COBOL-only candidate prefers the legacy job over the backend job."""
    resp = await scoring_client.get(
        f"/api/v1/candidates/{seeded_world['weak_candidate_id']}/best-jobs",
        headers=seeded_world["headers"],
    )
    assert resp.status_code == 200, resp.text
    matches = resp.json()["matches"]
    assert matches[0]["job_id"] == seeded_world["legacy_job_id"]


@pytest.mark.asyncio
async def test_best_jobs_for_unknown_candidate(scoring_client, seeded_world):
    resp = await scoring_client.get(
        f"/api/v1/candidates/{uuid4()}/best-jobs",
        headers=seeded_world["headers"],
    )
    assert resp.status_code == 404


# ── Custom weights ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_custom_weights_change_the_score(scoring_client, seeded_world):
    """Boosting the experience weight to 0 must lower the weak candidate's
    score because their other facets are weak too — the score with no
    experience weight at all should differ from the default-weighted score.
    """
    base = await scoring_client.post(
        f"/api/v1/candidates/{seeded_world['weak_candidate_id']}/score-for-job",
        headers=seeded_world["headers"],
        json={"job_id": seeded_world["backend_job_id"]},
    )
    assert base.status_code == 200, base.text
    base_score = base.json()["total_score"]

    skills_only = await scoring_client.post(
        f"/api/v1/candidates/{seeded_world['weak_candidate_id']}/score-for-job",
        headers=seeded_world["headers"],
        json={
            "job_id": seeded_world["backend_job_id"],
            "weights": {
                "skills": 1.0,
                "experience": 0.0,
                "location": 0.0,
                "salary": 0.0,
                "culture": 0.0,
            },
        },
    )
    assert skills_only.status_code == 200, skills_only.text
    # The weak candidate has zero matching skills → 0.0 when only skills count.
    assert skills_only.json()["total_score"] == 0.0
    assert skills_only.json()["total_score"] != base_score


@pytest.mark.asyncio
async def test_custom_weights_bulk(scoring_client, seeded_world):
    """Weights are also honoured by the bulk endpoint."""
    resp = await scoring_client.post(
        "/api/v1/candidates/bulk-score",
        headers=seeded_world["headers"],
        json={
            "candidate_ids": [seeded_world["weak_candidate_id"]],
            "job_ids": [seeded_world["backend_job_id"]],
            "weights": {
                "skills": 1.0,
                "experience": 0.0,
                "location": 0.0,
                "salary": 0.0,
                "culture": 0.0,
            },
        },
    )
    assert resp.status_code == 200, resp.text
    cell = resp.json()["matrix"][0]
    assert cell["score"] == 0.0


# ── Tenant isolation ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_score_for_job(scoring_client, seeded_world):
    """Tenant B cannot score Tenant A's candidate."""
    other_headers = _auth("other-tenant", sub="attacker")
    resp = await scoring_client.post(
        f"/api/v1/candidates/{seeded_world['strong_candidate_id']}/score-for-job",
        headers=other_headers,
        json={"job_id": seeded_world["backend_job_id"]},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_score_candidates_for_job(scoring_client, seeded_world):
    """Tenant B cannot score against Tenant A's job."""
    other_headers = _auth("other-tenant", sub="attacker")
    resp = await scoring_client.post(
        f"/api/v1/jobs/{seeded_world['backend_job_id']}/score-candidates",
        headers=other_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_best_jobs(scoring_client, seeded_world):
    """Tenant B cannot look up Tenant A's candidate's best jobs."""
    other_headers = _auth("other-tenant", sub="attacker")
    resp = await scoring_client.get(
        f"/api/v1/candidates/{seeded_world['strong_candidate_id']}/best-jobs",
        headers=other_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_bulk_score(scoring_client, seeded_world):
    """Tenant B asking for Tenant A's ids must receive an empty matrix."""
    other_headers = _auth("other-tenant", sub="attacker")
    resp = await scoring_client.post(
        "/api/v1/candidates/bulk-score",
        headers=other_headers,
        json={
            "candidate_ids": [
                seeded_world["strong_candidate_id"],
                seeded_world["weak_candidate_id"],
            ],
            "job_ids": [
                seeded_world["backend_job_id"],
                seeded_world["legacy_job_id"],
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["candidate_ids"] == []
    assert body["job_ids"] == []
    assert body["matrix"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_scoring_requires_auth(scoring_client, seeded_world):
    """No bearer token → 401 on every scoring endpoint."""
    cid = seeded_world["strong_candidate_id"]
    jid = seeded_world["backend_job_id"]
    r1 = await scoring_client.post(
        f"/api/v1/candidates/{cid}/score-for-job",
        json={"job_id": jid},
    )
    r2 = await scoring_client.post(
        f"/api/v1/jobs/{jid}/score-candidates",
    )
    r3 = await scoring_client.post(
        "/api/v1/candidates/bulk-score",
        json={"candidate_ids": [cid], "job_ids": [jid]},
    )
    r4 = await scoring_client.get(f"/api/v1/candidates/{cid}/best-jobs")
    assert r1.status_code == 401
    assert r2.status_code == 401
    assert r3.status_code == 401
    assert r4.status_code == 401
