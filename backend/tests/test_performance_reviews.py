"""Tests for the Performance Reviews service.

Covers:
* CRUD over performance reviews (create / list / get / update / submit).
* Review questions CRUD (create / list).
* Review cycles CRUD (create / list).
* Tenant isolation across all endpoints.
* Status transitions and validation.
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
from shared.core.models.performance_review import (  # noqa: E402
    PerformanceReview,
    ReviewAnswer,
    ReviewCycle,
    ReviewQuestion,
)
from shared.core.security import create_access_token  # noqa: E402


TENANT_A = "tenant-A"
TENANT_B = "tenant-B"


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str = TENANT_A, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    target_tables = [
        PerformanceReview.__table__,
        ReviewQuestion.__table__,
        ReviewAnswer.__table__,
        ReviewCycle.__table__,
    ]
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all, tables=target_tables)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all, tables=target_tables)
    await eng.dispose()


@pytest_asyncio.fixture
async def app_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.performance_reviews import main as pr_svc

    app = FastAPI()
    app.include_router(pr_svc.router, prefix="/api/v1/performance-reviews")

    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

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


@pytest.mark.asyncio
async def test_health(app_client: AsyncClient):
    resp = await app_client.get("/api/v1/performance-reviews/health", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_create_review(app_client: AsyncClient):
    resp = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
            "review_cycle": "Q1-2026",
            "strengths": "Great communicator",
            "improvements": "Needs more technical depth",
            "goals": "Lead a project",
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "draft"
    assert body["review_cycle"] == "Q1-2026"
    assert body["strengths"] == "Great communicator"
    assert body["tenant_id"] == TENANT_A


@pytest.mark.asyncio
async def test_create_review_requires_auth(app_client: AsyncClient):
    resp = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_reviews(app_client: AsyncClient):
    for i in range(3):
        await app_client.post(
            "/api/v1/performance-reviews/",
            json={
                "reviewee_id": str(uuid4()),
                "reviewer_id": str(uuid4()),
                "review_cycle": f"Cycle-{i}",
            },
            headers=_auth(),
        )
    resp = await app_client.get("/api/v1/performance-reviews/", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3


@pytest.mark.asyncio
async def test_get_review(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(),
    )
    rid = create.json()["id"]
    resp = await app_client.get(f"/api/v1/performance-reviews/{rid}", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["id"] == rid


@pytest.mark.asyncio
async def test_get_review_not_found(app_client: AsyncClient):
    resp = await app_client.get(
        f"/api/v1/performance-reviews/{uuid4()}", headers=_auth()
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_review(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(),
    )
    rid = create.json()["id"]
    resp = await app_client.put(
        f"/api/v1/performance-reviews/{rid}",
        json={
            "overall_score": 4.5,
            "strengths": "Updated strengths",
            "goals": "Updated goals",
        },
        headers=_auth(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_score"] == 4.5
    assert body["strengths"] == "Updated strengths"
    assert body["goals"] == "Updated goals"


@pytest.mark.asyncio
async def test_submit_review(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(),
    )
    rid = create.json()["id"]
    resp = await app_client.post(
        f"/api/v1/performance-reviews/{rid}/submit",
        headers=_auth(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "submitted"
    assert body["submitted_at"] is not None


@pytest.mark.asyncio
async def test_submit_review_twice_returns_409(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(),
    )
    rid = create.json()["id"]
    await app_client.post(
        f"/api/v1/performance-reviews/{rid}/submit",
        headers=_auth(),
    )
    resp = await app_client.post(
        f"/api/v1/performance-reviews/{rid}/submit",
        headers=_auth(),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_submitted_review_returns_409(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(),
    )
    rid = create.json()["id"]
    await app_client.post(
        f"/api/v1/performance-reviews/{rid}/submit",
        headers=_auth(),
    )
    resp = await app_client.put(
        f"/api/v1/performance-reviews/{rid}",
        json={"strengths": "Should fail"},
        headers=_auth(),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_question(app_client: AsyncClient):
    resp = await app_client.post(
        "/api/v1/performance-reviews/questions",
        json={
            "category": "technical",
            "question_text": "How would you rate this employee's coding skills?",
            "question_type": "rating",
            "weight": 2.0,
            "required": True,
            "order": 1,
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["category"] == "technical"
    assert body["question_type"] == "rating"
    assert body["weight"] == 2.0
    assert body["tenant_id"] == TENANT_A


@pytest.mark.asyncio
async def test_create_question_invalid_type(app_client: AsyncClient):
    resp = await app_client.post(
        "/api/v1/performance-reviews/questions",
        json={
            "question_text": "Bad type question",
            "question_type": "invalid_type",
        },
        headers=_auth(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_questions(app_client: AsyncClient):
    for i in range(3):
        await app_client.post(
            "/api/v1/performance-reviews/questions",
            json={
                "category": "category_a" if i < 2 else "category_b",
                "question_text": f"Question {i}",
                "question_type": "rating",
                "order": i,
            },
            headers=_auth(),
        )
    resp = await app_client.get("/api/v1/performance-reviews/questions", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3

    resp_filtered = await app_client.get(
        "/api/v1/performance-reviews/questions?category=category_a",
        headers=_auth(),
    )
    assert resp_filtered.status_code == 200
    assert resp_filtered.json()["total"] == 2


@pytest.mark.asyncio
async def test_create_cycle(app_client: AsyncClient):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    resp = await app_client.post(
        "/api/v1/performance-reviews/cycles",
        json={
            "name": "Q1 2026 Review",
            "start_date": now.isoformat(),
            "end_date": (now + timedelta(days=30)).isoformat(),
            "status": "active",
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Q1 2026 Review"
    assert body["status"] == "active"
    assert body["tenant_id"] == TENANT_A


@pytest.mark.asyncio
async def test_create_cycle_invalid_dates(app_client: AsyncClient):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    resp = await app_client.post(
        "/api/v1/performance-reviews/cycles",
        json={
            "name": "Bad cycle",
            "start_date": (now + timedelta(days=30)).isoformat(),
            "end_date": now.isoformat(),
        },
        headers=_auth(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_cycles(app_client: AsyncClient):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for i in range(2):
        await app_client.post(
            "/api/v1/performance-reviews/cycles",
            json={
                "name": f"Cycle {i}",
                "start_date": now.isoformat(),
                "end_date": (now + timedelta(days=30)).isoformat(),
            },
            headers=_auth(),
        )
    resp = await app_client.get("/api/v1/performance-reviews/cycles", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2


@pytest.mark.asyncio
async def test_tenant_isolation_reviews(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(TENANT_A),
    )
    assert create.status_code == 201
    rid = create.json()["id"]

    listing_b = await app_client.get(
        "/api/v1/performance-reviews/", headers=_auth(TENANT_B)
    )
    assert listing_b.status_code == 200
    assert listing_b.json()["total"] == 0

    detail_b = await app_client.get(
        f"/api/v1/performance-reviews/{rid}", headers=_auth(TENANT_B)
    )
    assert detail_b.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_submit(app_client: AsyncClient):
    create = await app_client.post(
        "/api/v1/performance-reviews/",
        json={
            "reviewee_id": str(uuid4()),
            "reviewer_id": str(uuid4()),
        },
        headers=_auth(TENANT_A),
    )
    rid = create.json()["id"]

    submit_b = await app_client.post(
        f"/api/v1/performance-reviews/{rid}/submit",
        headers=_auth(TENANT_B),
    )
    assert submit_b.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_questions(app_client: AsyncClient):
    await app_client.post(
        "/api/v1/performance-reviews/questions",
        json={
            "question_text": "Tenant A question",
            "question_type": "text",
        },
        headers=_auth(TENANT_A),
    )

    listing_b = await app_client.get(
        "/api/v1/performance-reviews/questions", headers=_auth(TENANT_B)
    )
    assert listing_b.status_code == 200
    assert listing_b.json()["total"] == 0


@pytest.mark.asyncio
async def test_tenant_isolation_cycles(app_client: AsyncClient):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await app_client.post(
        "/api/v1/performance-reviews/cycles",
        json={
            "name": "Tenant A cycle",
            "start_date": now.isoformat(),
            "end_date": (now + timedelta(days=30)).isoformat(),
        },
        headers=_auth(TENANT_A),
    )

    listing_b = await app_client.get(
        "/api/v1/performance-reviews/cycles", headers=_auth(TENANT_B)
    )
    assert listing_b.status_code == 200
    assert listing_b.json()["total"] == 0


@pytest.mark.asyncio
async def test_list_reviews_filter_by_reviewee(app_client: AsyncClient):
    reviewee_id = str(uuid4())
    other_reviewee = str(uuid4())
    reviewer = str(uuid4())

    await app_client.post(
        "/api/v1/performance-reviews/",
        json={"reviewee_id": reviewee_id, "reviewer_id": reviewer},
        headers=_auth(),
    )
    await app_client.post(
        "/api/v1/performance-reviews/",
        json={"reviewee_id": other_reviewee, "reviewer_id": reviewer},
        headers=_auth(),
    )

    resp = await app_client.get(
        f"/api/v1/performance-reviews/?reviewee_id={reviewee_id}",
        headers=_auth(),
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["data"][0]["reviewee_id"] == reviewee_id
