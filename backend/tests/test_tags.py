"""Tests for the tags and labels system.

Covers:

* Tag CRUD (create, list, update, delete) — happy paths and validation.
* Tag application lifecycle (apply, remove, idempotency, missing entities).
* Popular tags leaderboard and per-tenant isolation.
* Candidate and job tag endpoints (``/candidates/{id}/tags`` and
  ``/jobs/{id}/tags``) — list, add-by-id, add-by-name (create-on-attach),
  remove, and the cross-tenant isolation guarantees.

Tests use an isolated in-memory SQLite database, a minimal FastAPI app that
hosts just the candidate, job, and tag routers, and per-test JWT tokens to
exercise the full ``require_tenant_id`` dependency.
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
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings  # noqa: E402
from shared.core.database import get_db_dependency  # noqa: E402
from shared.core.models.candidate import Candidate, CandidateStatus  # noqa: E402
from shared.core.models.recruitment import Job, JobStatus, JobType  # noqa: E402
from shared.core.models.tag import Tag, TagApplication, TagEntityType  # noqa: E402
from shared.core.security import create_access_token  # noqa: E402


TENANT_A = "tenant-A"
TENANT_B = "tenant-B"


# ── Token / request helpers ───────────────────────────────────────────────────


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


# ── DB / App fixtures ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    """In-memory SQLite engine with only the tables the tag tests need.

    We intentionally *don't* call ``SQLModel.metadata.create_all`` — several
    unrelated models in the project (e.g. ``EmailTemplate.body``) use SQL
    types that don't round-trip on SQLite in the test environment.  Creating
    just the tables we touch keeps the test isolated and fast.
    """
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    target_tables = [
        Tag.__table__,
        TagApplication.__table__,
        Candidate.__table__,
        Job.__table__,
    ]
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all, tables=target_tables)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all, tables=target_tables)
    await eng.dispose()


@pytest_asyncio.fixture
async def app_client(engine) -> AsyncGenerator[AsyncClient, None]:
    """Minimal FastAPI app hosting the candidate, job, and tag routers."""
    from apps.candidate_service import main as cand_svc
    from apps.job_service import main as job_svc
    from apps.tag_service import main as tag_svc

    app = FastAPI()
    app.include_router(tag_svc.router, prefix="/tags")
    app.include_router(cand_svc.router, prefix="/candidates")
    app.include_router(job_svc.router, prefix="/jobs")

    # Pin settings so JWT decoding uses a deterministic secret.
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


# ── Domain fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def candidate_in_a(engine) -> Candidate:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        cand = Candidate(
            id=str(uuid4()),
            tenant_id=TENANT_A,
            email="alice@example.com",
            full_name="Alice Anderson",
            status=CandidateStatus.NEW,
        )
        s.add(cand)
        await s.commit()
        await s.refresh(cand)
        return cand


@pytest_asyncio.fixture
async def job_in_a(engine) -> Job:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        job = Job(
            id=str(uuid4()),
            tenant_id=TENANT_A,
            title="Senior Backend Engineer",
            description="Build distributed services.",
            job_type=JobType.FULL_TIME,
            status=JobStatus.OPEN,
        )
        s.add(job)
        await s.commit()
        await s.refresh(job)
        return job


# ── Tag CRUD tests ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_tag(app_client: AsyncClient):
    resp = await app_client.post(
        "/tags/",
        json={"name": "Senior", "color": "#3B82F6", "entity_type": "all"},
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["created"] is True
    assert body["name"] == "senior"
    assert body["display_name"] == "Senior"
    assert body["color"] == "#3B82F6"
    assert body["entity_type"] == "all"


@pytest.mark.asyncio
async def test_create_tag_duplicate_name_conflicts(app_client: AsyncClient):
    payload = {"name": "Remote", "entity_type": "all"}
    first = await app_client.post("/tags/", json=payload, headers=_auth())
    assert first.status_code == 201
    second = await app_client.post("/tags/", json=payload, headers=_auth())
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_create_tag_validates_name(app_client: AsyncClient):
    resp = await app_client.post(
        "/tags/", json={"name": "   "}, headers=_auth()
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_tags_returns_tenant_scoped_rows_with_usage_counts(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    create = await app_client.post(
        "/tags/", json={"name": "Top", "entity_type": "candidate"}, headers=_auth()
    )
    assert create.status_code == 201
    tag_id = create.json()["id"]

    # Apply it twice to two different (fictional) candidates so usage_count = 2.
    for cid in (str(uuid4()), str(uuid4())):
        apply = await app_client.post(
            f"/tags/{tag_id}/apply",
            json={"entity_type": "candidate", "entity_ids": [cid]},
            headers=_auth(),
        )
        assert apply.status_code == 200
        # Non-existent ids are silently skipped — that's fine, we just want
        # to exercise the no-op path.
        assert apply.json()["applied"] == 0

    listing = await app_client.get("/tags/", headers=_auth())
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert body["data"][0]["name"] == "top"
    # No candidate from tenant A was actually attached (the candidates above
    # don't exist), so usage count is 0.
    assert body["data"][0]["usage_count"] == 0

    # Now actually attach to the real candidate.
    real_apply = await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert real_apply.status_code == 200
    assert real_apply.json()["applied"] == 1

    # Usage count should now be 1.
    listing2 = await app_client.get("/tags/", headers=_auth())
    assert listing2.json()["data"][0]["usage_count"] == 1


@pytest.mark.asyncio
async def test_update_tag(app_client: AsyncClient):
    create = await app_client.post(
        "/tags/", json={"name": "Urgent"}, headers=_auth()
    )
    tag_id = create.json()["id"]

    update = await app_client.put(
        f"/tags/{tag_id}",
        json={"color": "#FF0000", "entity_type": "candidate"},
        headers=_auth(),
    )
    assert update.status_code == 200
    assert update.json()["updated"] is True

    # Verify the changes were persisted by re-listing.
    listing = await app_client.get("/tags/", headers=_auth())
    row = next(r for r in listing.json()["data"] if r["id"] == tag_id)
    assert row["color"] == "#FF0000"
    assert row["entity_type"] == "candidate"


@pytest.mark.asyncio
async def test_update_tag_not_found(app_client: AsyncClient):
    resp = await app_client.put(
        f"/tags/{uuid4()}", json={"color": "#000000"}, headers=_auth()
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_tag_cascades_applications(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    create = await app_client.post(
        "/tags/", json={"name": "Temp"}, headers=_auth()
    )
    tag_id = create.json()["id"]

    apply = await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert apply.json()["applied"] == 1

    delete = await app_client.delete(f"/tags/{tag_id}", headers=_auth())
    assert delete.status_code == 200
    assert delete.json()["deleted"] is True

    # Tag should be gone.
    listing = await app_client.get("/tags/", headers=_auth())
    assert listing.json()["total"] == 0


@pytest.mark.asyncio
async def test_apply_tag_to_candidate_then_remove(app_client: AsyncClient, candidate_in_a: Candidate):
    create = await app_client.post(
        "/tags/", json={"name": "Hot"}, headers=_auth()
    )
    tag_id = create.json()["id"]

    apply = await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert apply.status_code == 200
    body = apply.json()
    assert body["applied"] == 1
    assert body["skipped"] == 0
    assert len(body["application_ids"]) == 1

    # A second apply is a no-op (idempotent) and reports skipped=1.
    apply2 = await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert apply2.status_code == 200
    assert apply2.json()["applied"] == 0
    assert apply2.json()["skipped"] == 1

    remove = await app_client.post(
        f"/tags/{tag_id}/remove",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert remove.status_code == 200
    assert remove.json()["removed"] == 1

    # Second remove is a no-op.
    remove2 = await app_client.post(
        f"/tags/{tag_id}/remove",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert remove2.json()["removed"] == 0


@pytest.mark.asyncio
async def test_apply_tag_rejects_wrong_entity_type(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    create = await app_client.post(
        "/tags/", json={"name": "JobOnly", "entity_type": "job"}, headers=_auth()
    )
    tag_id = create.json()["id"]
    resp = await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_apply_tag_unknown_entity_is_skipped(app_client: AsyncClient):
    create = await app_client.post(
        "/tags/", json={"name": "Vip", "entity_type": "all"}, headers=_auth()
    )
    tag_id = create.json()["id"]
    resp = await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [str(uuid4())]},
        headers=_auth(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["applied"] == 0
    assert body["skipped"] == 1


@pytest.mark.asyncio
async def test_popular_tags_orders_by_usage(
    app_client: AsyncClient, candidate_in_a: Candidate, job_in_a: Job
):
    for name, count in (("TagA", 3), ("TagB", 1), ("TagC", 2)):
        c = await app_client.post(
            "/tags/", json={"name": name, "entity_type": "all"}, headers=_auth()
        )
        assert c.status_code == 201

    tag_a_id = next(
        t["id"] for t in (await app_client.get("/tags/", headers=_auth())).json()["data"]
        if t["name"] == "taga"
    )
    tag_b_id = next(
        t["id"] for t in (await app_client.get("/tags/", headers=_auth())).json()["data"]
        if t["name"] == "tagb"
    )
    tag_c_id = next(
        t["id"] for t in (await app_client.get("/tags/", headers=_auth())).json()["data"]
        if t["name"] == "tagc"
    )

    # Apply tag A to 3 distinct targets by hand (we only have 1 candidate
    # and 1 job, so re-applying counts as a no-op after the first hit). Use
    # apply twice on the same id to exercise both targets for tag A, and
    # bulk-apply to two different candidate ids (one of which is real).
    await app_client.post(
        f"/tags/{tag_a_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id, str(uuid4())]},
        headers=_auth(),
    )
    await app_client.post(
        f"/tags/{tag_a_id}/apply",
        json={"entity_type": "job", "entity_ids": [job_in_a.id]},
        headers=_auth(),
    )
    await app_client.post(
        f"/tags/{tag_c_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(),
    )
    await app_client.post(
        f"/tags/{tag_b_id}/apply",
        json={"entity_type": "job", "entity_ids": [job_in_a.id]},
        headers=_auth(),
    )

    popular = await app_client.get("/tags/popular", headers=_auth())
    assert popular.status_code == 200
    items = popular.json()["data"]
    # TagA has the most (2), TagC (1), TagB (1).
    assert items[0]["name"] == "taga"
    assert items[0]["usage_count"] == 2
    # TagC and TagB are tied at 1; alphabetical order is the secondary key.
    assert {items[1]["name"], items[2]["name"]} == {"tagb", "tagc"}


@pytest.mark.asyncio
async def test_tenant_isolation_tags_listing(app_client: AsyncClient):
    create = await app_client.post(
        "/tags/", json={"name": "TenantATag"}, headers=_auth(TENANT_A)
    )
    assert create.status_code == 201

    # Tenant B should not see Tenant A's tag.
    listing_b = await app_client.get("/tags/", headers=_auth(TENANT_B))
    assert listing_b.status_code == 200
    assert listing_b.json()["total"] == 0

    # Tenant B creating a same-name tag should succeed (tags are per-tenant).
    create_b = await app_client.post(
        "/tags/", json={"name": "TenantATag"}, headers=_auth(TENANT_B)
    )
    assert create_b.status_code == 201


@pytest.mark.asyncio
async def test_tenant_isolation_popular_tags(app_client: AsyncClient, candidate_in_a: Candidate):
    # Tenant A creates + applies a tag.
    create = await app_client.post(
        "/tags/", json={"name": "Internal"}, headers=_auth(TENANT_A)
    )
    tag_id = create.json()["id"]
    await app_client.post(
        f"/tags/{tag_id}/apply",
        json={"entity_type": "candidate", "entity_ids": [candidate_in_a.id]},
        headers=_auth(TENANT_A),
    )

    # Tenant B should not see it in the popular list.
    popular_b = await app_client.get("/tags/popular", headers=_auth(TENANT_B))
    assert popular_b.status_code == 200
    assert popular_b.json()["total"] == 0

    # Tenant A should see it.
    popular_a = await app_client.get("/tags/popular", headers=_auth(TENANT_A))
    assert popular_a.json()["total"] == 1
    assert popular_a.json()["data"][0]["name"] == "internal"


# ── Candidate tag endpoints ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_candidate_tags_starts_empty(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    resp = await app_client.get(
        f"/candidates/{candidate_in_a.id}/tags", headers=_auth()
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["entity_type"] == "candidate"
    assert body["entity_id"] == candidate_in_a.id
    assert body["data"] == []
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_add_candidate_tag_by_id(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    create = await app_client.post(
        "/tags/", json={"name": "Onsite", "entity_type": "all"}, headers=_auth()
    )
    tag_id = create.json()["id"]

    add = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags",
        json={"tag_id": tag_id},
        headers=_auth(),
    )
    assert add.status_code == 201, add.text
    body = add.json()
    assert body["applied"] is True
    assert body["created"] is False
    assert body["tag"]["name"] == "onsite"

    # Listing should show the tag.
    listing = await app_client.get(
        f"/candidates/{candidate_in_a.id}/tags", headers=_auth()
    )
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_add_candidate_tag_creates_inline_when_name_given(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    resp = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags",
        json={"name": "Referral", "color": "#00FF00"},
        headers=_auth(),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["created"] is True
    assert body["tag"]["name"] == "referral"
    assert body["tag"]["color"] == "#00FF00"

    # The tag is now visible globally too.
    listing = await app_client.get("/tags/", headers=_auth())
    assert listing.json()["total"] == 1


@pytest.mark.asyncio
async def test_add_candidate_tag_validates_payload(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    # Both tag_id AND name → 400
    bad = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags",
        json={"tag_id": str(uuid4()), "name": "Foo"},
        headers=_auth(),
    )
    assert bad.status_code == 400

    # Neither tag_id NOR name → 400
    empty = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags", json={}, headers=_auth()
    )
    assert empty.status_code == 400


@pytest.mark.asyncio
async def test_remove_candidate_tag(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    create = await app_client.post(
        "/tags/", json={"name": "DropMe"}, headers=_auth()
    )
    tag_id = create.json()["id"]
    add = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags",
        json={"tag_id": tag_id},
        headers=_auth(),
    )
    assert add.status_code == 201

    remove = await app_client.delete(
        f"/candidates/{candidate_in_a.id}/tags/{tag_id}", headers=_auth()
    )
    assert remove.status_code == 204

    listing = await app_client.get(
        f"/candidates/{candidate_in_a.id}/tags", headers=_auth()
    )
    assert listing.json()["total"] == 0

    # Removing again is a 404.
    again = await app_client.delete(
        f"/candidates/{candidate_in_a.id}/tags/{tag_id}", headers=_auth()
    )
    assert again.status_code == 404


@pytest.mark.asyncio
async def test_add_candidate_tag_unknown_candidate(app_client: AsyncClient):
    resp = await app_client.post(
        f"/candidates/{uuid4()}/tags",
        json={"name": "Whatever"},
        headers=_auth(),
    )
    assert resp.status_code == 404


# ── Job tag endpoints ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_job_tags_starts_empty(app_client: AsyncClient, job_in_a: Job):
    resp = await app_client.get(f"/jobs/{job_in_a.id}/tags", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["entity_type"] == "job"
    assert body["entity_id"] == job_in_a.id
    assert body["data"] == []


@pytest.mark.asyncio
async def test_add_and_remove_job_tag(app_client: AsyncClient, job_in_a: Job):
    add = await app_client.post(
        f"/jobs/{job_in_a.id}/tags",
        json={"name": "Hybrid"},
        headers=_auth(),
    )
    assert add.status_code == 201
    assert add.json()["created"] is True

    listing = await app_client.get(f"/jobs/{job_in_a.id}/tags", headers=_auth())
    assert listing.json()["total"] == 1

    tag_id = listing.json()["data"][0]["id"]
    remove = await app_client.delete(
        f"/jobs/{job_in_a.id}/tags/{tag_id}", headers=_auth()
    )
    assert remove.status_code == 204

    listing2 = await app_client.get(f"/jobs/{job_in_a.id}/tags", headers=_auth())
    assert listing2.json()["total"] == 0


@pytest.mark.asyncio
async def test_add_job_tag_rejects_job_only_to_candidate(
    app_client: AsyncClient, candidate_in_a: Candidate
):
    create = await app_client.post(
        "/tags/", json={"name": "JobExclusive", "entity_type": "job"}, headers=_auth()
    )
    tag_id = create.json()["id"]
    resp = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags",
        json={"tag_id": tag_id},
        headers=_auth(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_tenant_isolation_candidate_tags(
    app_client: AsyncClient, engine, candidate_in_a: Candidate
):
    # Tenant A adds a tag.
    add = await app_client.post(
        f"/candidates/{candidate_in_a.id}/tags",
        json={"name": "OnlyForA"},
        headers=_auth(TENANT_A),
    )
    assert add.status_code == 201

    # Tenant B cannot see it.
    listing_b = await app_client.get(
        f"/candidates/{candidate_in_a.id}/tags", headers=_auth(TENANT_B)
    )
    assert listing_b.status_code == 404  # candidate is not in tenant B


# ── Health ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tag_service_health(app_client: AsyncClient):
    resp = await app_client.get("/tags/health", headers=_auth())
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"
    assert resp.json()["service"] == "tag"
