"""Tests for ML-powered analytics insights.

Tests the core ML functions and the API endpoints for predictions,
bias detection, sourcing recommendations, and hiring forecasts.
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

from shared.analytics.ml_insights import (
    detect_hiring_bias,
    forecast_hiring_needs,
    predict_candidate_success,
    predict_time_to_hire,
    recommend_sourcing_channels,
)
from shared.core.config import Settings  # noqa: E402
from shared.core.database import get_db_dependency  # noqa: E402
from shared.core.models.candidate import Candidate, CandidateStatus  # noqa: E402
from shared.core.models.identity import User, UserRole, UserStatus  # noqa: E402
from shared.core.models.recruitment import (  # noqa: E402
    Application,
    ApplicationStatus,
    Job,
    JobStatus,
)
from shared.core.security import create_access_token  # noqa: E402


TENANT_A = "tenant-ml-A"
TENANT_B = "tenant-ml-B"


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


# ── Unit tests for ML functions ───────────────────────────────────────────────


class TestPredictTimeToHire:
    def test_empty_historical_returns_default(self):
        result = predict_time_to_hire({"department": "Engineering"}, [])
        assert result["predicted_days"] == 30.0
        assert result["confidence"] == 0.0
        assert result["method"] == "default"
        assert result["sample_size"] == 0

    def test_weighted_average_with_few_samples(self):
        historical = [
            {"days_to_hire": 20, "department": "Engineering", "seniority": "senior", "applicants": 50},
            {"days_to_hire": 30, "department": "Engineering", "seniority": "senior", "applicants": 40},
            {"days_to_hire": 25, "department": "Engineering", "seniority": "mid", "applicants": 60},
        ]
        job = {"department": "Engineering", "seniority_required": "senior", "applicants_count": 45}
        result = predict_time_to_hire(job, historical)
        assert result["method"] == "weighted_average"
        assert result["sample_size"] >= 2
        assert result["predicted_days"] > 0

    def test_linear_regression_with_sufficient_data(self):
        historical = [
            {"days_to_hire": d, "department": "Engineering", "seniority": "senior", "applicants": a}
            for d, a in [(10, 100), (15, 80), (20, 60), (25, 40), (30, 20), (12, 90), (18, 70)]
        ]
        job = {"department": "Engineering", "seniority_required": "senior", "applicants_count": 50}
        result = predict_time_to_hire(job, historical)
        assert result["method"] == "linear_regression"
        assert result["sample_size"] == 7
        assert 0 < result["predicted_days"] < 100
        assert 0 <= result["confidence"] <= 1.0

    def test_dept_filter_returns_relevant_subset(self):
        historical = [
            {"days_to_hire": 15, "department": "Engineering", "seniority": "senior", "applicants": 50},
            {"days_to_hire": 45, "department": "Sales", "seniority": "junior", "applicants": 30},
            {"days_to_hire": 10, "department": "Engineering", "seniority": "mid", "applicants": 70},
        ]
        job = {"department": "Engineering", "seniority_required": None, "applicants_count": 0}
        result = predict_time_to_hire(job, historical)
        assert result["sample_size"] == 2

    def test_single_sample(self):
        historical = [{"days_to_hire": 25, "department": "HR", "seniority": "mid", "applicants": 30}]
        job = {"department": "HR", "seniority_required": "mid", "applicants_count": 20}
        result = predict_time_to_hire(job, historical)
        assert result["predicted_days"] == 25.0
        assert result["sample_size"] == 1


class TestPredictCandidateSuccess:
    def test_empty_history_returns_baseline(self):
        result = predict_candidate_success(
            {"source": "linkedin", "location": "Paris"},
            {"department": "Engineering"},
            [],
        )
        assert result["probability"] == 0.5
        assert result["sample_size"] == 0

    def test_no_successful_hires(self):
        historical = [
            {"source": "linkedin", "hired": False, "performed_well": False},
            {"source": "indeed", "hired": False, "performed_well": False},
        ]
        result = predict_candidate_success(
            {"source": "linkedin"},
            {"department": "Engineering"},
            historical,
        )
        assert result["probability"] == 0.3
        assert "no_successful_hires_in_history" in result["factors"]

    def test_strong_skill_match(self):
        historical = [
            {"source": "linkedin", "location": "Paris", "seniority": "senior",
             "skills": ["python", "fastapi"], "years_experience": 5,
             "hired": True, "performed_well": True, "department": "Engineering"},
            {"source": "referral", "location": "Lyon", "seniority": "mid",
             "skills": ["java"], "years_experience": 3,
             "hired": True, "performed_well": True, "department": "Engineering"},
        ]
        candidate = {
            "source": "linkedin", "location": "Paris", "seniority": "senior",
            "skills": ["python", "fastapi", "sql"], "years_experience": 6,
        }
        job = {"department": "Engineering", "seniority_required": "senior",
               "required_skills": ["python", "fastapi"], "location": "Paris"}
        result = predict_candidate_success(candidate, job, historical)
        assert result["probability"] > 0.5
        assert "strong_skill_match" in result["factors"]

    def test_weak_source_penalty(self):
        historical = [
            {"source": "spam_site", "hired": True, "performed_well": False},
            {"source": "spam_site", "hired": True, "performed_well": False},
            {"source": "spam_site", "hired": True, "performed_well": False},
            {"source": "linkedin", "hired": True, "performed_well": True},
            {"source": "linkedin", "hired": True, "performed_well": True},
        ]
        candidate = {"source": "spam_site"}
        job = {"department": "Engineering"}
        result = predict_candidate_success(candidate, job, historical)
        assert "weak_source_spam_site" in result["factors"]

    def test_probability_bounded(self):
        historical = [
            {"source": "linkedin", "location": "Paris", "seniority": "senior",
             "skills": ["python"], "years_experience": 10,
             "hired": True, "performed_well": True, "department": "Engineering"},
        ]
        candidate = {
            "source": "linkedin", "location": "Paris", "seniority": "senior",
            "skills": ["python"], "years_experience": 10,
        }
        job = {"department": "Engineering", "seniority_required": "senior",
               "required_skills": ["python"], "location": "Paris"}
        result = predict_candidate_success(candidate, job, historical)
        assert 0.01 <= result["probability"] <= 0.99


class TestDetectHiringBias:
    def test_empty_applications(self):
        result = detect_hiring_bias([], [])
        assert result["risk_level"] == "none"
        assert result["biases"] == []

    def test_no_bias_detected(self):
        apps = [
            {"candidate_id": f"c{i}", "location": "Paris", "source": "linkedin"}
            for i in range(10)
        ] + [
            {"candidate_id": f"c{i+10}", "location": "Lyon", "source": "linkedin"}
            for i in range(10)
        ]
        hires = [
            {"candidate_id": f"c{i}"} for i in range(3)
        ] + [
            {"candidate_id": f"c{i+10}"} for i in range(3)
        ]
        result = detect_hiring_bias(apps, hires)
        assert result["risk_level"] in ("none", "low")

    def test_location_bias_detected(self):
        apps = [
            {"candidate_id": f"paris_{i}", "location": "Paris, FR", "source": "linkedin"}
            for i in range(50)
        ] + [
            {"candidate_id": f"remote_{i}", "location": "Small Town, FR", "source": "linkedin"}
            for i in range(50)
        ]
        hires = [{"candidate_id": f"paris_{i}"} for i in range(20)]
        result = detect_hiring_bias(apps, hires)
        assert result["risk_level"] in ("medium", "high")
        location_biases = [b for b in result["biases"] if b["dimension"] == "location"]
        assert len(location_biases) > 0

    def test_source_bias_detected(self):
        apps = [
            {"candidate_id": f"ref_{i}", "location": "Paris", "source": "referral"}
            for i in range(30)
        ] + [
            {"candidate_id": f"board_{i}", "location": "Paris", "source": "job_board"}
            for i in range(70)
        ]
        hires = [{"candidate_id": f"ref_{i}"} for i in range(15)]
        result = detect_hiring_bias(apps, hires)
        source_biases = [b for b in result["biases"] if b["dimension"] == "source"]
        assert len(source_biases) > 0

    def test_dimensions_analyzed(self):
        apps = [{"candidate_id": "c1", "location": "Paris", "source": "linkedin"}]
        result = detect_hiring_bias(apps, [])
        assert result["dimensions_analyzed"] == 3


class TestRecommendSourcingChannels:
    def test_zero_budget(self):
        result = recommend_sourcing_channels({"department": "Engineering"}, 0)
        assert result["allocations"] == []
        assert result["expected_hires"] == 0.0

    def test_positive_budget_returns_allocations(self):
        result = recommend_sourcing_channels({"department": "Engineering"}, 10000)
        assert len(result["allocations"]) > 0
        assert result["total_budget"] == 10000
        assert result["expected_hires"] > 0
        assert result["method"] == "efficiency_weighted"

    def test_budget_sums_correctly(self):
        result = recommend_sourcing_channels({"department": "Engineering"}, 5000)
        total_allocated = sum(a["budget_allocated"] for a in result["allocations"])
        assert abs(total_allocated - 5000) < 100

    def test_engineering_dept_boosts_linkedin(self):
        eng = recommend_sourcing_channels({"department": "Engineering"}, 10000)
        sales = recommend_sourcing_channels({"department": "Sales"}, 10000)
        eng_linkedin = next((a for a in eng["allocations"] if a["channel"] == "linkedin"), None)
        sales_linkedin = next((a for a in sales["allocations"] if a["channel"] == "linkedin"), None)
        if eng_linkedin and sales_linkedin:
            assert eng_linkedin["budget_allocated"] >= sales_linkedin["budget_allocated"]

    def test_custom_historical_channels(self):
        custom = [
            {"channel": "tiktok", "cost_per_candidate": 10.0, "conversion_rate": 0.25, "avg_cost_per_hire": 40.0},
            {"channel": "newspaper", "cost_per_candidate": 100.0, "conversion_rate": 0.01, "avg_cost_per_hire": 10000.0},
        ]
        result = recommend_sourcing_channels({"department": "Marketing"}, 5000, custom)
        assert len(result["allocations"]) == 2
        tiktok = next(a for a in result["allocations"] if a["channel"] == "tiktok")
        newspaper = next(a for a in result["allocations"] if a["channel"] == "newspaper")
        assert tiktok["expected_hires"] > newspaper["expected_hires"]


class TestForecastHiringNeeds:
    def test_zero_months(self):
        result = forecast_hiring_needs("t1", 0)
        assert result["forecast"]["total_hires_needed"] == 0

    def test_no_historical_data_uses_default(self):
        result = forecast_hiring_needs("t1", 3, current_open_positions=5)
        assert result["method"] == "default"
        assert result["confidence"] == 0.2
        assert len(result["monthly_breakdown"]) == 3

    def test_with_historical_data_uses_regression(self):
        historical = [
            {"month": "2025-01", "hires_count": 3},
            {"month": "2025-02", "hires_count": 5},
            {"month": "2025-03", "hires_count": 4},
            {"month": "2025-04", "hires_count": 7},
            {"month": "2025-05", "hires_count": 6},
        ]
        result = forecast_hiring_needs("t1", 3, historical, current_open_positions=2)
        assert result["method"] == "linear_regression"
        assert len(result["monthly_breakdown"]) == 3
        assert result["trend"] in ("increasing", "decreasing", "stable")

    def test_attrition_increases_forecast(self):
        historical = [
            {"month": "2025-01", "hires_count": 5},
            {"month": "2025-02", "hires_count": 5},
            {"month": "2025-03", "hires_count": 5},
        ]
        no_attrition = forecast_hiring_needs("t1", 6, historical, attrition_rate=0.0)
        with_attrition = forecast_hiring_needs("t1", 6, historical, attrition_rate=0.15)
        assert with_attrition["forecast"]["total_hires_needed"] >= no_attrition["forecast"]["total_hires_needed"]

    def test_months_capped(self):
        result = forecast_hiring_needs("t1", 100)
        assert result["forecast"]["months"] == 100

    def test_single_data_point_uses_default(self):
        historical = [{"month": "2025-01", "hires_count": 5}]
        result = forecast_hiring_needs("t1", 3, historical)
        assert result["method"] == "default"


# ── API endpoint tests ────────────────────────────────────────────────────────


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
    recruiter = User(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        email="rec-ml@tenant.test",
        full_name="ML Recruiter",
        hashed_password="x",
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
    )
    session.add(recruiter)
    await session.flush()

    job1 = Job(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        title="Backend Engineer",
        description="Build APIs",
        department="Engineering",
        seniority_required="senior",
        status=JobStatus.OPEN,
        hiring_manager_id=recruiter.id,
        created_at=_naive_utc(days_ago=60),
    )
    job2 = Job(
        id=str(uuid4()),
        tenant_id=TENANT_A,
        title="Frontend Engineer",
        description="Build UIs",
        department="Engineering",
        status=JobStatus.OPEN,
        hiring_manager_id=recruiter.id,
        created_at=_naive_utc(days_ago=45),
    )
    session.add_all([job1, job2])
    await session.flush()

    candidates = []
    sources = ["linkedin", "referral", "indeed", "linkedin", "careers_site",
               "linkedin", "referral", "indeed"]
    locations = ["Paris, FR", "Paris, FR", "Lyon, FR", "Paris, FR", "Lyon, FR",
                 "Paris, FR", "Paris, FR", "Lyon, FR"]
    for i in range(8):
        candidates.append(
            Candidate(
                id=str(uuid4()),
                tenant_id=TENANT_A,
                email=f"ml-cand-{i}@example.com",
                full_name=f"ML Candidate {i}",
                source=sources[i],
                location=locations[i],
                status=CandidateStatus.HIRED if i < 3 else CandidateStatus.NEW,
            )
        )
    session.add_all(candidates)
    await session.flush()

    apps = []
    app_statuses = [
        ApplicationStatus.HIRED,
        ApplicationStatus.HIRED,
        ApplicationStatus.HIRED,
        ApplicationStatus.APPLIED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEWING,
        ApplicationStatus.APPLIED,
        ApplicationStatus.REJECTED,
    ]
    for i, (cand, status) in enumerate(zip(candidates, app_statuses)):
        target_job = job1 if i % 2 == 0 else job2
        apps.append(
            Application(
                id=str(uuid4()),
                tenant_id=TENANT_A,
                candidate_id=cand.id,
                job_id=target_job.id,
                status=status,
                applied_at=_naive_utc(days_ago=30),
                updated_at=(
                    target_job.created_at + timedelta(days=25)
                    if status == ApplicationStatus.HIRED
                    else _naive_utc(days_ago=10)
                ),
            )
        )
    session.add_all(apps)
    await session.commit()

    return {
        "recruiter_id": recruiter.id,
        "job1_id": job1.id,
        "job2_id": job2.id,
        "candidate_ids": [c.id for c in candidates],
    }


async def _seed_tenant_b(session: AsyncSession) -> None:
    job = Job(
        id=str(uuid4()),
        tenant_id=TENANT_B,
        title="Tenant B Job",
        description="x",
        status=JobStatus.OPEN,
        created_at=_naive_utc(days_ago=10),
    )
    session.add(job)
    await session.commit()


@pytest_asyncio.fixture
async def ml_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.analytics_service.main import router as analytics_router

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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


@pytest.mark.asyncio
async def test_endpoint_time_to_hire_prediction(ml_client: AsyncClient):
    resp = await ml_client.get(
        "/analytics/predictions/time-to-hire", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "predictions" in body
    assert "historical_sample_size" in body
    assert isinstance(body["predictions"], list)


@pytest.mark.asyncio
async def test_endpoint_bias_detection(ml_client: AsyncClient):
    resp = await ml_client.get(
        "/analytics/insights/bias-detection", headers=_auth(TENANT_A)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "biases" in body
    assert "risk_level" in body
    assert "dimensions_analyzed" in body


@pytest.mark.asyncio
async def test_endpoint_sourcing_recommendations(ml_client: AsyncClient):
    resp = await ml_client.get(
        "/analytics/insights/sourcing-recommendations?budget=5000",
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "allocations" in body
    assert "expected_hires" in body
    assert body["total_budget"] == 5000


@pytest.mark.asyncio
async def test_endpoint_forecast_hiring_needs(ml_client: AsyncClient):
    resp = await ml_client.get(
        "/analytics/forecasts/hiring-needs?months=3",
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "forecast" in body
    assert "monthly_breakdown" in body
    assert body["forecast"]["months"] == 3


@pytest.mark.asyncio
async def test_endpoint_tenant_isolation_time_to_hire(ml_client: AsyncClient):
    resp = await ml_client.get(
        "/analytics/predictions/time-to-hire", headers=_auth(TENANT_B)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["historical_sample_size"] == 0
    for pred in body["predictions"]:
        assert pred["method"] == "default"
        assert pred["confidence"] == 0.0


@pytest.mark.asyncio
async def test_endpoint_tenant_isolation_bias(ml_client: AsyncClient):
    resp = await ml_client.get(
        "/analytics/insights/bias-detection", headers=_auth(TENANT_B)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["risk_level"] == "none"


@pytest.mark.asyncio
async def test_ml_endpoints_require_auth(ml_client: AsyncClient):
    endpoints = [
        "/analytics/predictions/time-to-hire",
        "/analytics/insights/bias-detection",
        "/analytics/insights/sourcing-recommendations",
        "/analytics/forecasts/hiring-needs",
    ]
    for path in endpoints:
        resp = await ml_client.get(path)
        assert resp.status_code == 401, f"{path} should require auth, got {resp.status_code}"


@pytest.mark.asyncio
async def test_viewer_role_rejected(ml_client: AsyncClient):
    endpoints = [
        "/analytics/predictions/time-to-hire",
        "/analytics/insights/bias-detection",
        "/analytics/insights/sourcing-recommendations",
        "/analytics/forecasts/hiring-needs",
    ]
    for path in endpoints:
        resp = await ml_client.get(path, headers=_auth(TENANT_A, role="candidate"))
        assert resp.status_code == 403, f"{path} should reject viewer role, got {resp.status_code}"
