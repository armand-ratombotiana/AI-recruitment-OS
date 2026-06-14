"""Tests for AI-powered candidate matching with semantic similarity.

Covers:
* ``semantic_match()`` — pure cosine similarity
* ``match_candidates_to_job()`` — ranked candidate list
* ``match_job_to_candidates()`` — ranked job list
* ``CandidateJobMatcher`` class — score, reasons, match methods
* ``POST /api/v1/ai/match-candidates`` — orchestrator endpoint
* ``POST /api/v1/ai/match-jobs`` — orchestrator endpoint
* ``GET  /api/v1/ai/match-stats`` — orchestrator endpoint
* ``POST /api/v1/ai-matching/candidate/{id}/jobs`` — matching service endpoint
* ``POST /api/v1/ai-matching/job/{id}/candidates`` — matching service endpoint
* ``POST /api/v1/ai-matching/batch`` — batch endpoint
* ``GET  /api/v1/ai-matching/stats`` — stats endpoint
* Ranking order, top_n limits, tenant isolation, auth
"""
from __future__ import annotations

import os
import sys

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.ai.matching import (
    CandidateJobMatcher,
    MatchResult,
    compute_match_stats,
    match_candidates_to_job,
    match_job_to_candidates,
    semantic_match,
)
from shared.core.security import create_access_token

try:
    from apps.ai_orchestrator.main import router as _ai_router_preload  # noqa: F401
except Exception:
    pass


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {"sub": sub, "email": f"{sub}@{tenant_id}.test", "role": role, "tenant_id": tenant_id}
    )


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def ai_client():
    from apps.ai_orchestrator.main import router as ai_router

    app = FastAPI()
    app.include_router(ai_router, prefix="/api/v1/ai")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def matching_client():
    from apps.ai_matching.main import router as matching_router

    app = FastAPI()
    app.include_router(matching_router, prefix="/api/v1/ai-matching")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def matcher():
    return CandidateJobMatcher()


# ── Test data ─────────────────────────────────────────────────────────────────


def _python_dev(**kw):
    base = {
        "id": "c1",
        "skills": ["python", "fastapi", "postgresql", "docker"],
        "experience_years": 5,
        "location": "Paris, France",
        "expected_salary": 70000,
        "title": "Senior Python Developer",
        "metadata": {"culture_fit_signal": 0.8},
    }
    base.update(kw)
    return base


def _java_dev(**kw):
    base = {
        "id": "c2",
        "skills": ["java", "spring", "oracle", "kubernetes"],
        "experience_years": 3,
        "location": "Lyon, France",
        "expected_salary": 60000,
        "title": "Java Backend Engineer",
        "metadata": {"culture_fit_signal": 0.6},
    }
    base.update(kw)
    return base


def _junior_dev(**kw):
    base = {
        "id": "c3",
        "skills": ["html", "css", "javascript"],
        "experience_years": 1,
        "location": "Marseille, France",
        "expected_salary": 35000,
        "title": "Junior Frontend Developer",
        "metadata": {"culture_fit_signal": 0.5},
    }
    base.update(kw)
    return base


def _backend_job(**kw):
    base = {
        "id": "j1",
        "title": "Senior Backend Engineer",
        "required_skills": ["python", "fastapi"],
        "preferred_skills": ["postgresql", "docker"],
        "required_experience_years": 3,
        "location": "Paris, France",
        "salary_min": 60000,
        "salary_max": 100000,
        "remote_ok": False,
        "description": "Build scalable backend services with Python and FastAPI",
    }
    base.update(kw)
    return base


def _frontend_job(**kw):
    base = {
        "id": "j2",
        "title": "Frontend Developer",
        "required_skills": ["javascript", "react", "css"],
        "preferred_skills": ["typescript"],
        "required_experience_years": 1,
        "location": "Marseille, France",
        "salary_min": 30000,
        "salary_max": 50000,
        "remote_ok": True,
        "description": "Build modern web interfaces with React",
    }
    base.update(kw)
    return base


def _java_job(**kw):
    base = {
        "id": "j3",
        "title": "Java Enterprise Developer",
        "required_skills": ["java", "spring", "oracle"],
        "preferred_skills": ["kubernetes"],
        "required_experience_years": 2,
        "location": "Lyon, France",
        "salary_min": 50000,
        "salary_max": 80000,
        "remote_ok": False,
        "description": "Enterprise Java development with Spring Boot",
    }
    base.update(kw)
    return base


# ── Pure function tests: semantic_match ───────────────────────────────────────


class TestSemanticMatch:
    def test_identical_profiles_score_high(self):
        c = _python_dev()
        j = _backend_job()
        score = semantic_match(c, j)
        assert 0.0 <= score <= 1.0
        assert score > 0.3

    def test_unrelated_profiles_score_low(self):
        c = _junior_dev()
        j = _java_job()
        score = semantic_match(c, j)
        assert 0.0 <= score <= 1.0
        assert score < 0.5

    def test_perfect_overlap(self):
        c = {"skills": ["python", "fastapi", "postgresql"], "experience_years": 5}
        j = {"required_skills": ["python", "fastapi", "postgresql"], "required_experience_years": 5}
        score = semantic_match(c, j)
        assert score > 0.5

    def test_empty_inputs_return_zero(self):
        assert semantic_match({}, {}) == 0.0

    def test_returns_float(self):
        result = semantic_match(_python_dev(), _backend_job())
        assert isinstance(result, float)


# ── Pure function tests: match_candidates_to_job ─────────────────────────────


class TestMatchCandidatesToJob:
    def test_ranking_order(self):
        candidates = [_junior_dev(), _python_dev(), _java_dev()]
        results = match_candidates_to_job(_backend_job(), candidates)
        assert len(results) == 3
        assert results[0].candidate_id == "c1"
        assert results[0].hybrid_score >= results[1].hybrid_score
        assert results[1].hybrid_score >= results[2].hybrid_score

    def test_top_n_limit(self):
        candidates = [_python_dev(id=f"c{i}") for i in range(10)]
        results = match_candidates_to_job(_backend_job(), candidates, top_n=3)
        assert len(results) == 3

    def test_empty_candidates(self):
        results = match_candidates_to_job(_backend_job(), [])
        assert results == []

    def test_returns_match_results(self):
        results = match_candidates_to_job(_backend_job(), [_python_dev()])
        assert len(results) == 1
        r = results[0]
        assert isinstance(r, MatchResult)
        assert r.candidate_id == "c1"
        assert r.job_id == "j1"
        assert 0.0 <= r.hybrid_score <= 1.0
        assert r.recommendation in {"STRONG_MATCH", "MATCH", "POSSIBLE", "WEAK", "NO_MATCH"}


# ── Pure function tests: match_job_to_candidates ──────────────────────────────


class TestMatchJobToCandidates:
    def test_ranking_order(self):
        jobs = [_java_job(), _frontend_job(), _backend_job()]
        results = match_job_to_candidates(_python_dev(), jobs)
        assert len(results) == 3
        assert results[0].job_id == "j1"
        assert results[0].hybrid_score >= results[1].hybrid_score

    def test_top_n_limit(self):
        jobs = [_backend_job(id=f"j{i}") for i in range(15)]
        results = match_job_to_candidates(_python_dev(), jobs, top_n=5)
        assert len(results) == 5

    def test_empty_jobs(self):
        results = match_job_to_candidates(_python_dev(), [])
        assert results == []

    def test_best_job_for_java_dev(self):
        jobs = [_backend_job(), _frontend_job(), _java_job()]
        results = match_job_to_candidates(_java_dev(), jobs)
        assert results[0].job_id == "j3"


# ── Pure function tests: compute_match_stats ──────────────────────────────────


class TestComputeMatchStats:
    def test_empty(self):
        stats = compute_match_stats([])
        assert stats["total"] == 0
        assert stats["avg_hybrid_score"] == 0.0

    def test_stats_computed(self):
        results = match_candidates_to_job(
            _backend_job(), [_python_dev(), _junior_dev(), _java_dev()]
        )
        stats = compute_match_stats(results)
        assert stats["total"] == 3
        assert 0.0 <= stats["avg_hybrid_score"] <= 1.0
        assert stats["strong_matches"] + stats["matches"] + stats["possible"] + stats["weak"] + stats["no_match"] == 3


# ── CandidateJobMatcher class tests ──────────────────────────────────────────


class TestCandidateJobMatcherScore:
    def test_score_range(self, matcher):
        score = matcher.calculate_match_score(_python_dev(), _backend_job())
        assert 0 <= score <= 100

    def test_strong_match_high_score(self, matcher):
        score = matcher.calculate_match_score(_python_dev(), _backend_job())
        assert score >= 50

    def test_weak_match_low_score(self, matcher):
        score = matcher.calculate_match_score(_junior_dev(), _java_job())
        assert score < 60

    def test_empty_inputs_low_score(self, matcher):
        score = matcher.calculate_match_score({}, {})
        assert 0 <= score <= 100

    def test_score_is_float(self, matcher):
        score = matcher.calculate_match_score(_python_dev(), _backend_job())
        assert isinstance(score, float)


class TestCandidateJobMatcherReasons:
    def test_reasons_not_empty(self, matcher):
        reasons = matcher.generate_match_reasons(_python_dev(), _backend_job())
        assert len(reasons) > 0
        assert all(isinstance(r, str) for r in reasons)

    def test_matched_skills_in_reasons(self, matcher):
        reasons = matcher.generate_match_reasons(_python_dev(), _backend_job())
        reason_text = " ".join(reasons).lower()
        assert "python" in reason_text or "fastapi" in reason_text

    def test_missing_skills_mentioned(self, matcher):
        candidate = _python_dev(skills=["python"])
        reasons = matcher.generate_match_reasons(candidate, _backend_job())
        reason_text = " ".join(reasons).lower()
        assert "missing" in reason_text or "fastapi" in reason_text

    def test_experience_mentioned(self, matcher):
        reasons = matcher.generate_match_reasons(_python_dev(), _backend_job())
        reason_text = " ".join(reasons).lower()
        assert "experience" in reason_text

    def test_location_mentioned(self, matcher):
        reasons = matcher.generate_match_reasons(_python_dev(), _backend_job())
        reason_text = " ".join(reasons).lower()
        assert "location" in reason_text

    def test_remote_friendly(self, matcher):
        reasons = matcher.generate_match_reasons(_python_dev(), _frontend_job())
        reason_text = " ".join(reasons).lower()
        assert "remote" in reason_text


class TestCandidateJobMatcherMatchCandidateToJobs:
    def test_returns_ranked_results(self, matcher):
        jobs = [_backend_job(), _frontend_job(), _java_job()]
        results = matcher.match_candidate_to_jobs("c1", _python_dev(), jobs)
        assert len(results) == 3
        assert results[0]["score"] >= results[1]["score"]
        assert results[1]["score"] >= results[2]["score"]

    def test_top_n_limit(self, matcher):
        jobs = [_backend_job(id=f"j{i}") for i in range(10)]
        results = matcher.match_candidate_to_jobs("c1", _python_dev(), jobs, top_n=3)
        assert len(results) == 3

    def test_result_structure(self, matcher):
        results = matcher.match_candidate_to_jobs("c1", _python_dev(), [_backend_job()])
        assert len(results) == 1
        r = results[0]
        assert "job_id" in r
        assert "score" in r
        assert "reasons" in r
        assert isinstance(r["reasons"], list)

    def test_best_job_is_backend(self, matcher):
        jobs = [_java_job(), _frontend_job(), _backend_job()]
        results = matcher.match_candidate_to_jobs("c1", _python_dev(), jobs)
        assert results[0]["job_id"] == "j1"


class TestCandidateJobMatcherMatchJobToCandidates:
    def test_returns_ranked_results(self, matcher):
        candidates = [_junior_dev(), _java_dev(), _python_dev()]
        results = matcher.match_job_to_candidates("j1", _backend_job(), candidates)
        assert len(results) == 3
        assert results[0]["score"] >= results[1]["score"]

    def test_top_n_limit(self, matcher):
        candidates = [_python_dev(id=f"c{i}") for i in range(10)]
        results = matcher.match_job_to_candidates("j1", _backend_job(), candidates, top_n=5)
        assert len(results) == 5

    def test_result_structure(self, matcher):
        results = matcher.match_job_to_candidates("j1", _backend_job(), [_python_dev()])
        assert len(results) == 1
        r = results[0]
        assert "candidate_id" in r
        assert "score" in r
        assert "reasons" in r

    def test_best_candidate_is_python_dev(self, matcher):
        candidates = [_junior_dev(), _java_dev(), _python_dev()]
        results = matcher.match_job_to_candidates("j1", _backend_job(), candidates)
        assert results[0]["candidate_id"] == "c1"


# ── Orchestrator endpoint tests ──────────────────────────────────────────────


class TestMatchCandidatesEndpoint:
    @pytest.mark.asyncio
    async def test_match_candidates_success(self, ai_client):
        tenant = "test-tenant-match"
        resp = await ai_client.post(
            "/api/v1/ai/match-candidates",
            headers=_auth(tenant),
            json={
                "job": _backend_job(),
                "candidates": [_python_dev(), _java_dev(), _junior_dev()],
                "top_n": 20,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == tenant
        assert body["total_scored"] == 3
        assert body["returned"] == 3
        assert len(body["matches"]) == 3
        assert body["matches"][0]["hybrid_score"] >= body["matches"][1]["hybrid_score"]
        assert "stats" in body

    @pytest.mark.asyncio
    async def test_match_candidates_top_n(self, ai_client):
        resp = await ai_client.post(
            "/api/v1/ai/match-candidates",
            headers=_auth("t1"),
            json={
                "job": _backend_job(),
                "candidates": [_python_dev(), _java_dev(), _junior_dev()],
                "top_n": 1,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["returned"] == 1
        assert body["matches"][0]["candidate_id"] == "c1"

    @pytest.mark.asyncio
    async def test_match_candidates_requires_auth(self, ai_client):
        resp = await ai_client.post(
            "/api/v1/ai/match-candidates",
            json={"job": _backend_job(), "candidates": [_python_dev()]},
        )
        assert resp.status_code == 401


class TestMatchJobsEndpoint:
    @pytest.mark.asyncio
    async def test_match_jobs_success(self, ai_client):
        tenant = "test-tenant-jobs"
        resp = await ai_client.post(
            "/api/v1/ai/match-jobs",
            headers=_auth(tenant),
            json={
                "candidate": _python_dev(),
                "jobs": [_backend_job(), _frontend_job(), _java_job()],
                "top_n": 10,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == tenant
        assert body["total_scored"] == 3
        assert body["returned"] == 3
        assert body["matches"][0]["job_id"] == "j1"

    @pytest.mark.asyncio
    async def test_match_jobs_top_n(self, ai_client):
        resp = await ai_client.post(
            "/api/v1/ai/match-jobs",
            headers=_auth("t1"),
            json={
                "candidate": _python_dev(),
                "jobs": [_backend_job(), _frontend_job(), _java_job()],
                "top_n": 2,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["returned"] == 2

    @pytest.mark.asyncio
    async def test_match_jobs_requires_auth(self, ai_client):
        resp = await ai_client.post(
            "/api/v1/ai/match-jobs",
            json={"candidate": _python_dev(), "jobs": [_backend_job()]},
        )
        assert resp.status_code == 401


class TestMatchStatsEndpoint:
    @pytest.mark.asyncio
    async def test_match_stats(self, ai_client):
        resp = await ai_client.get(
            "/api/v1/ai/match-stats",
            headers=_auth("stats-tenant"),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == "stats-tenant"
        assert body["semantic_weight"] == 0.40
        assert body["structured_weight"] == 0.60
        assert "supported_dimensions" in body

    @pytest.mark.asyncio
    async def test_match_stats_requires_auth(self, ai_client):
        resp = await ai_client.get("/api/v1/ai/match-stats")
        assert resp.status_code == 401


# ── AI Matching service endpoint tests ───────────────────────────────────────


class TestMatchingServiceCandidateEndpoint:
    @pytest.mark.asyncio
    async def test_match_candidate_to_jobs(self, matching_client):
        tenant = "match-svc-tenant"
        resp = await matching_client.post(
            "/api/v1/ai-matching/candidate/c1/jobs",
            headers=_auth(tenant),
            json={
                "candidate": _python_dev(),
                "jobs": [_backend_job(), _frontend_job(), _java_job()],
                "top_n": 10,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == tenant
        assert body["candidate_id"] == "c1"
        assert body["total_scored"] == 3
        assert body["returned"] == 3
        assert body["matches"][0]["score"] >= body["matches"][1]["score"]
        assert "reasons" in body["matches"][0]

    @pytest.mark.asyncio
    async def test_match_candidate_requires_auth(self, matching_client):
        resp = await matching_client.post(
            "/api/v1/ai-matching/candidate/c1/jobs",
            json={"candidate": _python_dev(), "jobs": [_backend_job()]},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_match_candidate_empty_jobs(self, matching_client):
        resp = await matching_client.post(
            "/api/v1/ai-matching/candidate/c1/jobs",
            headers=_auth("t1"),
            json={"candidate": _python_dev(), "jobs": []},
        )
        assert resp.status_code == 422


class TestMatchingServiceJobEndpoint:
    @pytest.mark.asyncio
    async def test_match_job_to_candidates(self, matching_client):
        tenant = "match-svc-job"
        resp = await matching_client.post(
            "/api/v1/ai-matching/job/j1/candidates",
            headers=_auth(tenant),
            json={
                "job": _backend_job(),
                "candidates": [_python_dev(), _java_dev(), _junior_dev()],
                "top_n": 20,
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == tenant
        assert body["job_id"] == "j1"
        assert body["total_scored"] == 3
        assert body["matches"][0]["score"] >= body["matches"][1]["score"]

    @pytest.mark.asyncio
    async def test_match_job_requires_auth(self, matching_client):
        resp = await matching_client.post(
            "/api/v1/ai-matching/job/j1/candidates",
            json={"job": _backend_job(), "candidates": [_python_dev()]},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_match_job_empty_candidates(self, matching_client):
        resp = await matching_client.post(
            "/api/v1/ai-matching/job/j1/candidates",
            headers=_auth("t1"),
            json={"job": _backend_job(), "candidates": []},
        )
        assert resp.status_code == 422


class TestBatchMatchEndpoint:
    @pytest.mark.asyncio
    async def test_batch_match(self, matching_client):
        tenant = "batch-tenant"
        resp = await matching_client.post(
            "/api/v1/ai-matching/batch",
            headers=_auth(tenant),
            json={
                "items": [
                    {
                        "mode": "candidate_to_jobs",
                        "candidate": _python_dev(),
                        "jobs": [_backend_job(), _frontend_job()],
                        "top_n": 5,
                    },
                    {
                        "mode": "job_to_candidates",
                        "job": _backend_job(),
                        "candidates": [_python_dev(), _java_dev()],
                        "top_n": 5,
                    },
                ],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == tenant
        assert body["total_items"] == 2
        assert body["processed"] == 2
        assert len(body["results"]) == 2
        assert body["results"][0]["mode"] == "candidate_to_jobs"
        assert body["results"][1]["mode"] == "job_to_candidates"
        assert len(body["results"][0]["matches"]) > 0
        assert len(body["results"][1]["matches"]) > 0

    @pytest.mark.asyncio
    async def test_batch_match_requires_auth(self, matching_client):
        resp = await matching_client.post(
            "/api/v1/ai-matching/batch",
            json={"items": [{"mode": "candidate_to_jobs", "candidate": _python_dev(), "jobs": [_backend_job()]}]},
        )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_batch_match_invalid_mode(self, matching_client):
        resp = await matching_client.post(
            "/api/v1/ai-matching/batch",
            headers=_auth("t1"),
            json={
                "items": [
                    {
                        "mode": "invalid_mode",
                        "candidate": _python_dev(),
                        "jobs": [_backend_job()],
                    },
                ],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "error" in body["results"][0]


class TestMatchingServiceStatsEndpoint:
    @pytest.mark.asyncio
    async def test_stats(self, matching_client):
        resp = await matching_client.get(
            "/api/v1/ai-matching/stats",
            headers=_auth("stats-tenant-2"),
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tenant_id"] == "stats-tenant-2"
        assert body["semantic_weight"] == 0.40
        assert body["structured_weight"] == 0.60
        assert "supported_dimensions" in body
        assert "matcher_type" in body

    @pytest.mark.asyncio
    async def test_stats_requires_auth(self, matching_client):
        resp = await matching_client.get("/api/v1/ai-matching/stats")
        assert resp.status_code == 401


# ── Tenant isolation ──────────────────────────────────────────────────────────


class TestTenantIsolation:
    @pytest.mark.asyncio
    async def test_tenant_id_in_response(self, ai_client):
        t1 = "tenant-alpha"
        t2 = "tenant-beta"
        r1 = await ai_client.post(
            "/api/v1/ai/match-candidates",
            headers=_auth(t1),
            json={"job": _backend_job(), "candidates": [_python_dev()]},
        )
        r2 = await ai_client.post(
            "/api/v1/ai/match-candidates",
            headers=_auth(t2),
            json={"job": _backend_job(), "candidates": [_python_dev()]},
        )
        assert r1.json()["tenant_id"] == t1
        assert r2.json()["tenant_id"] == t2
        assert r1.json()["tenant_id"] != r2.json()["tenant_id"]

    @pytest.mark.asyncio
    async def test_match_stats_tenant_scoped(self, ai_client):
        r1 = await ai_client.get("/api/v1/ai/match-stats", headers=_auth("iso-tenant-1"))
        r2 = await ai_client.get("/api/v1/ai/match-stats", headers=_auth("iso-tenant-2"))
        assert r1.json()["tenant_id"] == "iso-tenant-1"
        assert r2.json()["tenant_id"] == "iso-tenant-2"

    @pytest.mark.asyncio
    async def test_matching_service_tenant_isolation(self, matching_client):
        r1 = await matching_client.post(
            "/api/v1/ai-matching/candidate/c1/jobs",
            headers=_auth("svc-tenant-a"),
            json={"candidate": _python_dev(), "jobs": [_backend_job()]},
        )
        r2 = await matching_client.post(
            "/api/v1/ai-matching/candidate/c1/jobs",
            headers=_auth("svc-tenant-b"),
            json={"candidate": _python_dev(), "jobs": [_backend_job()]},
        )
        assert r1.json()["tenant_id"] == "svc-tenant-a"
        assert r2.json()["tenant_id"] == "svc-tenant-b"

    @pytest.mark.asyncio
    async def test_batch_tenant_isolation(self, matching_client):
        r1 = await matching_client.post(
            "/api/v1/ai-matching/batch",
            headers=_auth("batch-iso-1"),
            json={"items": [{"mode": "candidate_to_jobs", "candidate": _python_dev(), "jobs": [_backend_job()]}]},
        )
        r2 = await matching_client.post(
            "/api/v1/ai-matching/batch",
            headers=_auth("batch-iso-2"),
            json={"items": [{"mode": "candidate_to_jobs", "candidate": _python_dev(), "jobs": [_backend_job()]}]},
        )
        assert r1.json()["tenant_id"] == "batch-iso-1"
        assert r2.json()["tenant_id"] == "batch-iso-2"
