"""Tests verifying that interview, PPE, analytics-legacy, and dashboard
services now require authentication (Bearer token) on every endpoint.
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator

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
from shared.core.security import create_access_token  # noqa: E402


TENANT = "tenant-auth-test"


def _make_token(tenant_id: str = TENANT, role: str = "recruiter") -> str:
    return create_access_token({
        "sub": "test-user",
        "email": "test@test.com",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str = TENANT, role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, role)}"}


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


def _build_app(router, prefix: str):
    from shared.core.database import get_db_dependency

    app = FastAPI()
    app.include_router(router, prefix=prefix)
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )
    return app


@pytest_asyncio.fixture
async def interview_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.interview_service.main import router as interview_router
    from shared.core.database import get_db_dependency

    app = _build_app(interview_router, "/interviews")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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


@pytest_asyncio.fixture
async def ppe_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.ppe_service.main import router as ppe_router

    app = _build_app(ppe_router, "/ppe")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def analytics_legacy_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.analytics_service.main import router as analytics_router
    from shared.core.database import get_db_dependency

    app = _build_app(analytics_router, "/analytics")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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


@pytest_asyncio.fixture
async def dashboard_client() -> AsyncGenerator[AsyncClient, None]:
    from apps.dashboard_service.main import router as dashboard_router

    app = _build_app(dashboard_router, "/dashboard")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Interview Service ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_interview_list_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.get("/interviews/")
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


@pytest.mark.asyncio
async def test_interview_get_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.get("/interviews/i1")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_create_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.post("/interviews/", json={
        "candidate_id": "c1", "job_id": "j1", "interview_type": "technical",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_start_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.post("/interviews/i1/start")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_complete_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.post("/interviews/i1/complete")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_feedback_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.post("/interviews/i1/feedback")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_transcript_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.get("/interviews/i1/transcript")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_analytics_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.get("/interviews/i1/analytics")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_reschedule_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.post("/interviews/i1/reschedule", json={
        "scheduled_at": "2025-02-01T10:00:00Z",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_cancel_requires_auth(interview_client: AsyncClient):
    resp = await interview_client.post("/interviews/i1/cancel", json={
        "reason": "test",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_interview_list_works_with_auth(interview_client: AsyncClient):
    resp = await interview_client.get("/interviews/", headers=_auth())
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_interview_get_works_with_auth(interview_client: AsyncClient):
    resp = await interview_client.get("/interviews/i1", headers=_auth())
    assert resp.status_code == 200


# ── PPE Service ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ppe_problems_requires_auth(ppe_client: AsyncClient):
    resp = await ppe_client.get("/ppe/problems")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ppe_get_problem_requires_auth(ppe_client: AsyncClient):
    resp = await ppe_client.get("/ppe/problems/p1")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ppe_create_session_requires_auth(ppe_client: AsyncClient):
    resp = await ppe_client.post("/ppe/sessions", json={
        "problem_id": "p1", "language": "python",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ppe_get_session_requires_auth(ppe_client: AsyncClient):
    resp = await ppe_client.get("/ppe/sessions/test123")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ppe_execute_requires_auth(ppe_client: AsyncClient):
    resp = await ppe_client.post("/ppe/sessions/test123/execute", json={
        "code": "print('hello')",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ppe_hint_requires_auth(ppe_client: AsyncClient):
    resp = await ppe_client.post("/ppe/sessions/test123/hint")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_ppe_problems_works_with_auth(ppe_client: AsyncClient):
    resp = await ppe_client.get("/ppe/problems", headers=_auth())
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_ppe_get_problem_works_with_auth(ppe_client: AsyncClient):
    resp = await ppe_client.get("/ppe/problems/p1", headers=_auth())
    assert resp.status_code == 200


# ── Analytics Legacy Endpoints ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_analytics_dashboard_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/dashboard")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_pipeline_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/pipeline")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_ai_performance_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/ai-performance")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_recruiter_productivity_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/recruiter-productivity")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_time_to_hire_legacy_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/time-to-hire-legacy")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_reports_post_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.post("/analytics/reports")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_reports_get_requires_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/reports/report_123")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_analytics_dashboard_works_with_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/dashboard", headers=_auth())
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_analytics_pipeline_works_with_auth(analytics_legacy_client: AsyncClient):
    resp = await analytics_legacy_client.get("/analytics/pipeline", headers=_auth())
    assert resp.status_code == 200


# ── Dashboard Service ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_dashboard_stats_requires_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/stats")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_recent_activity_requires_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/recent-activity")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_upcoming_requires_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/upcoming")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_funnel_requires_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/funnel")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_widgets_requires_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/widgets")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_stats_works_with_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/stats", headers=_auth())
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"


@pytest.mark.asyncio
async def test_dashboard_recent_activity_works_with_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/recent-activity", headers=_auth())
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_upcoming_works_with_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/upcoming", headers=_auth())
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_funnel_works_with_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/funnel", headers=_auth())
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_widgets_works_with_auth(dashboard_client: AsyncClient):
    resp = await dashboard_client.get("/dashboard/widgets", headers=_auth())
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_dashboard_old_header_no_longer_works(dashboard_client: AsyncClient):
    resp = await dashboard_client.get(
        "/dashboard/stats",
        headers={"X-Tenant-ID": "default"},
    )
    assert resp.status_code == 401
