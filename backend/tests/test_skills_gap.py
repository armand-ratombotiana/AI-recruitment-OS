"""Tests for the Skills Gap Analysis Engine.

Covers:
* Gap analysis with perfect / partial / no match
* Skill adjacency scoring
* Learning recommendations
* Batch analysis
* Tenant isolation
* API endpoints
"""
from __future__ import annotations

import os
import sys

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.skills.gap_analysis import SkillsGapAnalyzer, SKILL_TAXONOMY


@pytest.fixture
def analyzer():
    return SkillsGapAnalyzer()


# ── Gap analysis: perfect match ──────────────────────────────────────────


class TestGapAnalysisPerfectMatch:
    def test_all_required_matched(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["Python", "FastAPI", "PostgreSQL"],
            job_required_skills=["python", "fastapi", "postgresql"],
        )
        assert result.missing_required == []
        assert result.gap_score == 1.0
        assert result.coverage_pct == 100.0

    def test_matched_skills_populated(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["Python", "FastAPI"],
            job_required_skills=["python", "fastapi"],
        )
        assert sorted(result.matched_skills) == ["fastapi", "python"]

    def test_extra_candidate_skills_ignored_for_coverage(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["python", "fastapi", "rust", "go"],
            job_required_skills=["python", "fastapi"],
        )
        assert result.coverage_pct == 100.0
        assert result.gap_score == 1.0


# ── Gap analysis: partial match ──────────────────────────────────────────


class TestGapAnalysisPartialMatch:
    def test_partial_required(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["python"],
            job_required_skills=["python", "fastapi", "postgresql"],
        )
        assert len(result.matched_skills) == 1
        assert "fastapi" in result.missing_required
        assert "postgresql" in result.missing_required
        assert 0 < result.gap_score < 1.0

    def test_preferred_bonus(self, analyzer):
        base = analyzer.analyze(
            candidate_skills=["python"],
            job_required_skills=["python", "fastapi"],
        )
        with_pref = analyzer.analyze(
            candidate_skills=["python", "docker"],
            job_required_skills=["python", "fastapi"],
            job_preferred_skills=["docker"],
        )
        assert with_pref.gap_score > base.gap_score

    def test_coverage_includes_preferred(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["python"],
            job_required_skills=["python", "fastapi"],
            job_preferred_skills=["docker"],
        )
        assert result.coverage_pct == pytest.approx(100 / 3, rel=1e-1)


# ── Gap analysis: no match ───────────────────────────────────────────────


class TestGapAnalysisNoMatch:
    def test_no_skills_overlap(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["cobol"],
            job_required_skills=["python", "fastapi"],
        )
        assert result.matched_skills == []
        assert result.gap_score == 0.0
        assert result.coverage_pct == 0.0

    def test_empty_candidate(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=[],
            job_required_skills=["python", "fastapi"],
        )
        assert result.gap_score == 0.0
        assert len(result.missing_required) == 2

    def test_empty_requirements(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["python"],
            job_required_skills=[],
        )
        assert result.gap_score == 1.0
        assert result.coverage_pct == 100.0


# ── Skill adjacency ──────────────────────────────────────────────────────


class TestSkillAdjacency:
    def test_same_skill(self, analyzer):
        assert analyzer.skill_adjacency("python", "python") == 1.0

    def test_same_category(self, analyzer):
        score = analyzer.skill_adjacency("python", "javascript")
        assert score == 0.85

    def test_related_categories(self, analyzer):
        score = analyzer.skill_adjacency("fastapi", "postgresql")
        assert 0.4 < score < 0.9

    def test_unrelated_skills(self, analyzer):
        score = analyzer.skill_adjacency("python", "communication")
        assert score < 0.3

    def test_unknown_skills(self, analyzer):
        score = analyzer.skill_adjacency("quantum computing", "underwater basket weaving")
        assert score == 0.05

    def test_one_known_one_unknown(self, analyzer):
        score = analyzer.skill_adjacency("python", "quantum computing")
        assert score == 0.1


# ── Find skill alternatives ──────────────────────────────────────────────


class TestFindSkillAlternatives:
    def test_returns_related(self, analyzer):
        alts = analyzer.find_skill_alternatives("python")
        assert len(alts) > 0
        assert "javascript" in alts or "java" in alts

    def test_unknown_skill_returns_empty(self, analyzer):
        alts = analyzer.find_skill_alternatives("quantum computing")
        assert alts == []

    def test_max_five(self, analyzer):
        alts = analyzer.find_skill_alternatives("python")
        assert len(alts) <= 5


# ── Learning recommendations ─────────────────────────────────────────────


class TestLearningRecommendations:
    def test_backend_engineer_gaps(self, analyzer):
        recs = analyzer.recommend_learning(
            candidate_skills=["python"],
            target_role="backend engineer",
        )
        assert len(recs) > 0
        skill_names = [r["skill"] for r in recs]
        assert "fastapi" in skill_names or "postgresql" in skill_names

    def test_no_gaps_for_expert(self, analyzer):
        recs = analyzer.recommend_learning(
            candidate_skills=["python", "fastapi", "postgresql", "docker", "aws"],
            target_role="backend engineer",
        )
        assert len(recs) == 0

    def test_difficulty_with_bridge(self, analyzer):
        recs = analyzer.recommend_learning(
            candidate_skills=["javascript"],
            target_role="backend engineer",
        )
        bridge_recs = [r for r in recs if r["bridge_from"] is not None]
        assert len(bridge_recs) > 0

    def test_unknown_role_fallback(self, analyzer):
        recs = analyzer.recommend_learning(
            candidate_skills=[],
            target_role="meme lord",
        )
        assert len(recs) > 0


# ── Gap analysis to_dict ─────────────────────────────────────────────────


class TestGapAnalysisDataclass:
    def test_to_dict_round_keys(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["python"],
            job_required_skills=["python", "fastapi"],
        )
        d = result.to_dict()
        assert "matched_skills" in d
        assert "missing_required" in d
        assert "missing_preferred" in d
        assert "gap_score" in d
        assert "coverage_pct" in d
        assert "recommendations" in d

    def test_gap_score_bounded(self, analyzer):
        result = analyzer.analyze(
            candidate_skills=["python", "fastapi", "postgresql"],
            job_required_skills=["python", "fastapi"],
            job_preferred_skills=["docker"],
        )
        assert 0.0 <= result.gap_score <= 1.0


# ── API endpoint tests ───────────────────────────────────────────────────

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from shared.core.security import create_access_token


def _make_token(tenant_id: str, sub: str = "user") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": "recruiter",
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub)}"}


@pytest_asyncio.fixture
async def skills_client():
    from apps.skills_service.main import router as skills_router

    app = FastAPI()
    app.include_router(skills_router, prefix="/api/v1/skills")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


TENANT_A = "tenant-skills-a"
TENANT_B = "tenant-skills-b"


@pytest.mark.asyncio
async def test_api_gap_analysis(skills_client):
    resp = await skills_client.post(
        "/api/v1/skills/gap-analysis",
        headers=_auth(TENANT_A),
        json={
            "candidate_skills": ["python", "fastapi"],
            "required_skills": ["python", "fastapi", "postgresql"],
            "preferred_skills": ["docker"],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["tenant_id"] == TENANT_A
    assert "python" in body["matched_skills"]
    assert "postgresql" in body["missing_required"]
    assert body["gap_score"] > 0


@pytest.mark.asyncio
async def test_api_batch_analysis(skills_client):
    resp = await skills_client.post(
        "/api/v1/skills/gap-analysis/batch",
        headers=_auth(TENANT_A),
        json={
            "pairs": [
                {"candidate_id": "c1", "job_id": "j1"},
                {"candidate_id": "c2", "job_id": "j2"},
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert len(body["results"]) == 2


@pytest.mark.asyncio
async def test_api_taxonomy(skills_client):
    resp = await skills_client.get(
        "/api/v1/skills/taxonomy",
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "taxonomy" in body
    assert "programming_languages" in body["taxonomy"]


@pytest.mark.asyncio
async def test_api_adjacency(skills_client):
    resp = await skills_client.get(
        "/api/v1/skills/adjacency/python",
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["skill"] == "python"
    assert len(body["related_skills"]) > 0


@pytest.mark.asyncio
async def test_api_recommend_learning(skills_client):
    resp = await skills_client.post(
        "/api/v1/skills/recommend-learning",
        headers=_auth(TENANT_A),
        json={
            "candidate_skills": ["python"],
            "target_role": "backend engineer",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["target_role"] == "backend engineer"
    assert len(body["recommendations"]) > 0


# ── Tenant isolation ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_gap_analysis(skills_client):
    resp_a = await skills_client.post(
        "/api/v1/skills/gap-analysis",
        headers=_auth(TENANT_A),
        json={
            "candidate_skills": ["python"],
            "required_skills": ["python"],
        },
    )
    resp_b = await skills_client.post(
        "/api/v1/skills/gap-analysis",
        headers=_auth(TENANT_B),
        json={
            "candidate_skills": ["python"],
            "required_skills": ["python"],
        },
    )
    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.json()["tenant_id"] == TENANT_A
    assert resp_b.json()["tenant_id"] == TENANT_B


@pytest.mark.asyncio
async def test_tenant_isolation_taxonomy(skills_client):
    resp = await skills_client.get(
        "/api/v1/skills/taxonomy",
        headers=_auth(TENANT_B),
    )
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] == TENANT_B


@pytest.mark.asyncio
async def test_requires_auth(skills_client):
    resp = await skills_client.post(
        "/api/v1/skills/gap-analysis",
        json={
            "candidate_skills": ["python"],
            "required_skills": ["python"],
        },
    )
    assert resp.status_code == 401
