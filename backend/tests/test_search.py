"""Tests for the search service: fuzzy matching, multi-field search,
autocomplete suggestions, recent-search tracking, and analytics.

These tests build a minimal FastAPI app that hosts the ``search_service``
router with isolated in-memory indexes so they don't depend on the rest of
the gateway.  Each test resets the in-memory state via the service's
``_reset_state`` helper plus module-level monkey patches on the candidate
and job indexes.
"""
from __future__ import annotations

import os
import sys
from typing import Any, AsyncGenerator
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
from shared.core.security import create_access_token  # noqa: E402


# ── Token helper ──────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DB / App fixtures ─────────────────────────────────────────────────────────


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
async def search_client(engine) -> AsyncGenerator[AsyncClient, None]:
    """Build a minimal FastAPI app hosting the search router."""
    from apps.search_service import main as svc
    from apps.vector_search_service import main as vs

    # ── Seed isolated in-memory indexes ─────────────────────────────────────
    # Save originals so we can restore them after the test.
    original_candidates = list(vs._candidate_index)
    original_jobs = list(vs._job_index)
    original_interviews = list(svc._interview_index)

    vs._candidate_index[:] = [
        {
            "candidate_id": "c-john",
            "name": "John Smith",
            "email": "john.smith@example.com",
            "location": "San Francisco, CA",
            "skills": ["Python", "PostgreSQL", "Kubernetes"],
            "vector": [0.1, 0.8, 0.3],
            "tenant_id": "tenant-A",
        },
        {
            "candidate_id": "c-sarah",
            "name": "Sarah Chen",
            "email": "sarah.chen@example.com",
            "location": "Seattle, WA",
            "skills": ["Python", "Distributed Systems", "Go"],
            "vector": [0.2, 0.9, 0.1],
            "tenant_id": "tenant-A",
        },
        {
            "candidate_id": "c-alex",
            "name": "Alex Rivera",
            "email": "alex.rivera@example.com",
            "location": "Austin, TX",
            "skills": ["Java", "Spring Boot", "AWS"],
            "vector": [0.5, 0.3, 0.7],
            "tenant_id": "tenant-A",
        },
        {
            "candidate_id": "c-other-tenant",
            "name": "Other Tenant Jane",
            "email": "jane@other.com",
            "location": "Nowhere",
            "skills": ["Python"],
            "vector": [0.0, 0.0, 0.0],
            "tenant_id": "tenant-B",
        },
    ]
    vs._job_index[:] = [
        {
            "job_id": "j-backend",
            "title": "Senior Backend Engineer",
            "description": "Build resilient backend services",
            "location": "Remote",
            "department": "Engineering",
            "required_skills": ["Python", "PostgreSQL"],
            "preferred_skills": ["Kubernetes", "Go"],
            "vector": [0.15, 0.85, 0.25],
            "tenant_id": "tenant-A",
        },
        {
            "job_id": "j-platform",
            "title": "Platform Engineer",
            "description": "Operate the internal developer platform",
            "location": "Remote",
            "department": "Platform",
            "required_skills": ["Kubernetes", "Go", "AWS"],
            "vector": [0.3, 0.7, 0.5],
            "tenant_id": "tenant-A",
        },
    ]
    svc._interview_index[:] = [
        {"interview_id": "i1", "title": "Senior Backend Engineer — John Smith", "type": "technical", "status": "scheduled", "tenant_id": "tenant-A"},
        {"interview_id": "i2", "title": "Platform Engineer — Sarah Chen", "type": "system_design", "status": "completed", "tenant_id": "tenant-A"},
    ]
    svc._reset_state()

    # ── Build the FastAPI app ───────────────────────────────────────────────
    app = FastAPI()
    app.include_router(svc.router, prefix="/search")

    # Override Settings so the search service's auth dependencies succeed.
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    # Override get_db_dependency in case any sub-route needs it.
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

    # ── Cleanup ─────────────────────────────────────────────────────────────
    svc._reset_state()
    vs._candidate_index[:] = original_candidates
    vs._job_index[:] = original_jobs
    svc._interview_index[:] = original_interviews


# ── Fuzzy search tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fuzzy_search_typo_in_candidate_name(search_client: AsyncClient):
    """A typo (``Jon Smith``) should still match the candidate ``John Smith``."""
    resp = await search_client.get(
        "/search/",
        params={"q": "Jon Smith", "type": "candidates"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    titles = [r["title"] for r in body["results"]]
    assert "John Smith" in titles
    assert body["fuzzy"] is True
    # The first result should be the fuzzy match for the typo.
    assert body["results"][0]["matched_field"] == "name"


@pytest.mark.asyncio
async def test_fuzzy_search_typo_in_email(search_client: AsyncClient):
    """A partial email lookup should still find the right candidate via fuzzy match."""
    resp = await search_client.get(
        "/search/",
        params={"q": "john.smith@exmple", "type": "candidates"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    emails = {r["metadata"].get("email") for r in body["results"]}
    assert "john.smith@example.com" in emails


@pytest.mark.asyncio
async def test_fuzzy_search_threshold_excludes_too_distant_matches(search_client: AsyncClient):
    """Queries that are too different from any record should not match."""
    resp = await search_client.get(
        "/search/",
        params={"q": "Zzzqqqxxx", "type": "candidates"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    # And we should have recorded this as a no-results query (see analytics test).


# ── Multi-field search tests ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_multi_field_search_by_skill(search_client: AsyncClient):
    """Searching for a skill should match candidates with that skill."""
    resp = await search_client.get(
        "/search/",
        params={"q": "PostgreSQL", "type": "candidates"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    titles = [r["title"] for r in body["results"]]
    assert "John Smith" in titles


@pytest.mark.asyncio
async def test_multi_field_search_by_location(search_client: AsyncClient):
    """Searching for a city should match candidates in that location."""
    resp = await search_client.get(
        "/search/",
        params={"q": "Seattle", "type": "candidates"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    titles = [r["title"] for r in body["results"]]
    assert "Sarah Chen" in titles


@pytest.mark.asyncio
async def test_multi_field_search_by_email_substring(search_client: AsyncClient):
    """Substring match against the email field should return the candidate."""
    resp = await search_client.get(
        "/search/",
        params={"q": "rivera", "type": "candidates"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    titles = [r["title"] for r in body["results"]]
    assert "Alex Rivera" in titles


@pytest.mark.asyncio
async def test_multi_field_search_jobs_across_fields(search_client: AsyncClient):
    """Job search should also consider description and required skills."""
    # Match on required_skill.
    r1 = await search_client.get(
        "/search/", params={"q": "Kubernetes", "type": "jobs"},
        headers=_auth("tenant-A"),
    )
    assert r1.status_code == 200
    job_titles = [r["title"] for r in r1.json()["results"]]
    assert "Platform Engineer" in job_titles

    # Match on description.
    r2 = await search_client.get(
        "/search/", params={"q": "developer platform", "type": "jobs"},
        headers=_auth("tenant-A"),
    )
    assert r2.status_code == 200
    job_titles = [r["title"] for r in r2.json()["results"]]
    assert "Platform Engineer" in job_titles


@pytest.mark.asyncio
async def test_global_search_returns_grouped_results(search_client: AsyncClient):
    """type=all should return grouped candidates, jobs, and interviews."""
    resp = await search_client.get(
        "/search/", params={"q": "Engineer", "type": "all"},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "candidates" in body["grouped"]
    assert "jobs" in body["grouped"]
    assert "interviews" in body["grouped"]
    # There should be at least one job and one interview match.
    assert any(j["type"] == "job" for j in body["grouped"]["jobs"])
    assert any(i["type"] == "interview" for i in body["grouped"]["interviews"])


# ── Suggestions (autocomplete) tests ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_suggestions_prefix_match(search_client: AsyncClient):
    """Prefix matches should appear at the top with score 1.0."""
    resp = await search_client.get(
        "/search/suggest", params={"q": "Sa", "limit": 10},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    texts = [s["text"] for s in body["suggestions"]]
    assert "Sarah Chen" in texts


@pytest.mark.asyncio
async def test_suggestions_fuzzy_match(search_client: AsyncClient):
    """Fuzzy suggestions should still surface the right candidate."""
    resp = await search_client.get(
        "/search/suggest", params={"q": "Jhn Smit", "limit": 10},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    body = resp.json()
    texts = [s["text"] for s in body["suggestions"]]
    assert "John Smith" in texts
    assert body["fuzzy"] is True


@pytest.mark.asyncio
async def test_suggestions_returns_deduped_results(search_client: AsyncClient):
    """Duplicate suggestions should be removed and the list bounded by ``limit``."""
    resp = await search_client.get(
        "/search/suggest", params={"q": "Python", "limit": 5},
        headers=_auth("tenant-A"),
    )
    assert resp.status_code == 200
    items = resp.json()["suggestions"]
    keys = [(s["text"].lower(), s["type"]) for s in items]
    assert len(keys) == len(set(keys))
    assert len(items) <= 5


# ── Recent searches tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_recent_searches_tracked_per_user(search_client: AsyncClient):
    """A search should appear in the user's recent list immediately."""
    user_a = _auth("tenant-A", "alice")
    user_b = _auth("tenant-A", "bob")

    # Alice runs a search.
    r1 = await search_client.get(
        "/search/", params={"q": "PostgreSQL", "type": "candidates"},
        headers=user_a,
    )
    assert r1.status_code == 200

    # Bob runs a different search.
    r2 = await search_client.get(
        "/search/", params={"q": "Kubernetes", "type": "jobs"},
        headers=user_b,
    )
    assert r2.status_code == 200

    # Alice's recent list contains her query and not Bob's.
    alice_recent = await search_client.get(
        "/search/recent", headers=user_a,
    )
    assert alice_recent.status_code == 200
    a_data = alice_recent.json()["data"]
    assert any(e["query"] == "PostgreSQL" and e["user_id"] == "alice" for e in a_data)
    assert not any(e["query"] == "Kubernetes" for e in a_data)

    # Bob's recent list contains his query and not Alice's.
    bob_recent = await search_client.get(
        "/search/recent", headers=user_b,
    )
    assert bob_recent.status_code == 200
    b_data = bob_recent.json()["data"]
    assert any(e["query"] == "Kubernetes" and e["user_id"] == "bob" for e in b_data)
    assert not any(e["query"] == "PostgreSQL" for e in b_data)


@pytest.mark.asyncio
async def test_recent_searches_dedup_identical_query(search_client: AsyncClient):
    """The same query should not appear twice in the recent list."""
    user = _auth("tenant-A", "carol")
    for _ in range(3):
        await search_client.get(
            "/search/", params={"q": "Java", "type": "candidates"},
            headers=user,
        )

    recent = await search_client.get("/search/recent", headers=user)
    assert recent.status_code == 200
    queries = [e["query"] for e in recent.json()["data"]]
    assert queries.count("Java") == 1


@pytest.mark.asyncio
async def test_recent_searches_clear(search_client: AsyncClient):
    """DELETE /recent should clear the user's recent list."""
    user = _auth("tenant-A", "dave")
    await search_client.get(
        "/search/", params={"q": "Go", "type": "candidates"},
        headers=user,
    )
    # Confirm there is at least one entry.
    recent = await search_client.get("/search/recent", headers=user)
    assert recent.json()["total"] >= 1

    # Clear and confirm.
    cleared = await search_client.delete("/search/recent", headers=user)
    assert cleared.status_code == 200
    assert cleared.json()["cleared"] is True
    recent2 = await search_client.get("/search/recent", headers=user)
    assert recent2.json()["total"] == 0


# ── Analytics tests ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_popular_queries_aggregate_by_tenant(search_client: AsyncClient):
    """Popular queries should be aggregated by tenant and exclude other tenants."""
    a1 = _auth("tenant-A", "a1")
    a2 = _auth("tenant-A", "a2")
    b1 = _auth("tenant-B", "b1")

    # Tenant A: two users run the same query.
    for _ in range(2):
        await search_client.get(
            "/search/", params={"q": "Python", "type": "candidates"},
            headers=a1,
        )
    await search_client.get(
        "/search/", params={"q": "Python", "type": "candidates"},
        headers=a2,
    )
    # Different query in tenant A.
    await search_client.get(
        "/search/", params={"q": "AWS", "type": "candidates"},
        headers=a1,
    )
    # Tenant B: only sees its own data.
    await search_client.get(
        "/search/", params={"q": "Python", "type": "candidates"},
        headers=b1,
    )

    pop_a = await search_client.get(
        "/search/popular", headers=a1,
    )
    assert pop_a.status_code == 200
    pop_data = {p["query"]: p["count"] for p in pop_a.json()["data"]}
    assert pop_data.get("Python") == 3
    assert pop_data.get("AWS") == 1

    pop_b = await search_client.get(
        "/search/popular", headers=b1,
    )
    assert pop_b.status_code == 200
    pop_b_data = {p["query"]: p["count"] for p in pop_b.json()["data"]}
    # Tenant B has only its own single Python search.
    assert pop_b_data.get("Python") == 1
    assert "AWS" not in pop_b_data


@pytest.mark.asyncio
async def test_no_results_endpoint_tracks_zero_hits(search_client: AsyncClient):
    """Zero-result queries should appear under ``/no-results``."""
    user = _auth("tenant-A", "eva")
    await search_client.get(
        "/search/", params={"q": "Zzzqqqxxx", "type": "candidates"},
        headers=user,
    )

    no_res = await search_client.get(
        "/search/no-results", headers=user,
    )
    assert no_res.status_code == 200
    queries = [n["query"] for n in no_res.json()["data"]]
    assert "Zzzqqqxxx" in queries


@pytest.mark.asyncio
async def test_search_analytics_summary(search_client: AsyncClient):
    """The analytics endpoint should report totals and zero-result rate."""
    user = _auth("tenant-A", "frank")
    # Two successful queries.
    await search_client.get(
        "/search/", params={"q": "Python", "type": "candidates"}, headers=user,
    )
    await search_client.get(
        "/search/", params={"q": "AWS", "type": "candidates"}, headers=user,
    )
    # One zero-result query.
    await search_client.get(
        "/search/", params={"q": "Zzzqqqxxx", "type": "candidates"}, headers=user,
    )

    analytics = await search_client.get(
        "/search/analytics", headers=user,
    )
    assert analytics.status_code == 200
    body = analytics.json()
    assert body["total_searches"] == 3
    assert body["unique_queries"] == 3
    assert body["zero_result_rate"] > 0
    popular_queries = [p["query"] for p in body["popular"]]
    assert "Python" in popular_queries
    no_result_queries = [p["query"] for p in body["no_results"]]
    assert "Zzzqqqxxx" in no_result_queries


# ── Tenancy isolation tests ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_in_search_results(search_client: AsyncClient):
    """A user in tenant-A should not see candidates from tenant-B."""
    a_user = _auth("tenant-A", "iso-a")
    b_user = _auth("tenant-B", "iso-b")

    a_resp = await search_client.get(
        "/search/", params={"q": "Jane", "type": "candidates"},
        headers=a_user,
    )
    assert a_resp.status_code == 200
    a_titles = [r["title"] for r in a_resp.json()["results"]]
    assert "Other Tenant Jane" not in a_titles

    b_resp = await search_client.get(
        "/search/", params={"q": "Jane", "type": "candidates"},
        headers=b_user,
    )
    assert b_resp.status_code == 200
    b_titles = [r["title"] for r in b_resp.json()["results"]]
    assert "Other Tenant Jane" in b_titles


@pytest.mark.asyncio
async def test_unauthenticated_request_is_rejected(search_client: AsyncClient):
    """Endpoints should require a valid bearer token."""
    resp = await search_client.get("/search/", params={"q": "Python"})
    assert resp.status_code == 401

    resp = await search_client.get("/search/suggest", params={"q": "P"})
    assert resp.status_code == 401

    resp = await search_client.get("/search/recent")
    assert resp.status_code == 401
