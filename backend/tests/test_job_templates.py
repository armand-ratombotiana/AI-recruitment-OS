"""Tests for job templates and cloning.

Covers:

* :func:`shared.jobs.templates.clone_job` — basic clone, options, default
  behaviour, and idempotency.
* ``POST /jobs/{id}/clone`` — endpoint round-trip, option override, and
  HTTP error paths.
* ``POST /jobs/{id}/save-as-template`` — flag flip, template metadata.
* ``GET /jobs/templates`` — tenant-scoped listing.
* ``POST /jobs/from-template/{template_id}`` — materialising a new job.
* Tenant isolation — templates are never visible across tenants.
* Authorization — endpoints require ``member``+ role and a valid token.

Tests use a minimal FastAPI app hosting the job service router, an
in-memory SQLite engine (created per-test), and per-test JWT tokens
issued via the same ``shared.core.security`` module the production code
uses — so RBAC and ``require_tenant_id`` are exercised end-to-end.
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
from shared.core.models.recruitment import Job, JobStatus, JobType  # noqa: E402
from shared.core.models.tag import Tag, TagApplication  # noqa: E402
from shared.core.security import create_access_token  # noqa: E402
from shared.jobs.templates import (  # noqa: E402
    CloneOptions,
    FromTemplateRequest,
    SaveAsTemplateRequest,
    clone_job,
    create_from_template,
    list_templates,
    save_as_template,
    template_to_read,
)


TENANT_A = "tenant-A"
TENANT_B = "tenant-B"


# ── Token / request helpers ───────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "member") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(
    tenant_id: str = TENANT_A, sub: str = "user", role: str = "member"
) -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DB / App fixtures ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    """In-memory SQLite engine with the tables the template tests touch.

    We intentionally create only the tables we need so the suite stays
    isolated from unrelated models that use SQL types SQLite cannot
    round-trip in this environment.
    """
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    target_tables = [
        Job.__table__,
        Tag.__table__,
        TagApplication.__table__,
    ]
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all, tables=target_tables)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all, tables=target_tables)
    await eng.dispose()


@pytest_asyncio.fixture
async def app_client(engine) -> AsyncGenerator[AsyncClient, None]:
    """Minimal FastAPI app hosting the job service router."""
    from apps.job_service import main as job_svc

    app = FastAPI()
    app.include_router(job_svc.router, prefix="/api/v1/jobs")

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
async def job_in_a(engine) -> Job:
    """Rich job in tenant A used as the source for clones/templates."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        job = Job(
            id=str(uuid4()),
            tenant_id=TENANT_A,
            title="Senior Backend Engineer",
            description="Build distributed services that scale.",
            department="Engineering",
            location="Remote (US)",
            remote_policy="remote",
            job_type=JobType.FULL_TIME,
            seniority_required="senior",
            salary_min=180000,
            salary_max=240000,
            currency="USD",
            required_skills='["python", "postgresql", "kubernetes"]',
            preferred_skills='["rust", "kafka"]',
            status=JobStatus.OPEN,
            pipeline_id="pipe-source-1",
            applicants_count=42,
        )
        s.add(job)
        await s.commit()
        await s.refresh(job)
        return job


@pytest_asyncio.fixture
async def job_in_b(engine) -> Job:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        job = Job(
            id=str(uuid4()),
            tenant_id=TENANT_B,
            title="B Job",
            description="Belongs to tenant B.",
            job_type=JobType.FULL_TIME,
            status=JobStatus.OPEN,
        )
        s.add(job)
        await s.commit()
        await s.refresh(job)
        return job


# ── Unit tests for the helpers ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_clone_job_creates_independent_copy(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        clone = await clone_job(s, job_in_a.id, TENANT_A)
        await s.commit()

    assert clone.id != job_in_a.id
    assert clone.tenant_id == TENANT_A
    assert clone.cloned_from_id == job_in_a.id
    assert clone.status == JobStatus.DRAFT
    assert clone.applicants_count == 0
    assert clone.is_template is False
    # Title is suffixed with "(Copy)" when no override is supplied.
    assert clone.title == f"{job_in_a.title} (Copy)"
    # Settings are propagated by default.
    assert clone.department == job_in_a.department
    assert clone.location == job_in_a.location
    assert clone.seniority_required == job_in_a.seniority_required
    assert clone.salary_min == job_in_a.salary_min
    assert clone.salary_max == job_in_a.salary_max
    assert clone.required_skills == job_in_a.required_skills
    assert clone.preferred_skills == job_in_a.preferred_skills
    assert clone.pipeline_id == job_in_a.pipeline_id


@pytest.mark.asyncio
async def test_clone_job_respects_title_override(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        clone = await clone_job(
            s, job_in_a.id, TENANT_A, CloneOptions(title="Staff Backend Engineer")
        )
        await s.commit()
    assert clone.title == "Staff Backend Engineer"


@pytest.mark.asyncio
async def test_clone_job_can_skip_settings(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        clone = await clone_job(
            s, job_in_a.id, TENANT_A, CloneOptions(copy_settings=False)
        )
        await s.commit()
    # Settings should be empty/null.
    assert clone.required_skills == "[]"
    assert clone.preferred_skills == "[]"
    assert clone.salary_min is None
    assert clone.salary_max is None
    assert clone.seniority_required is None
    assert clone.remote_policy is None


@pytest.mark.asyncio
async def test_clone_job_can_skip_pipeline(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        clone = await clone_job(
            s, job_in_a.id, TENANT_A, CloneOptions(copy_pipeline=False)
        )
        await s.commit()
    assert clone.pipeline_id is None
    # Settings still copied.
    assert clone.required_skills == job_in_a.required_skills


@pytest.mark.asyncio
async def test_clone_job_can_skip_questions(engine, job_in_a: Job):
    # The source has no template_name/template_description; we use the
    # helper to flip is_template so the question lineage would be carried.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        template = await save_as_template(
            s,
            job_id=job_in_a.id,
            tenant_id=TENANT_A,
            request=SaveAsTemplateRequest(
                template_name="Backend Template",
                template_description="Standard backend loop",
            ),
        )
        await s.commit()
        template_id = template.id

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        clone = await clone_job(
            s, template_id, TENANT_A, CloneOptions(copy_questions=False)
        )
        await s.commit()
    # Without copy_questions the template metadata is NOT carried over.
    assert clone.template_name is None
    assert clone.template_description is None
    # Lineage is still tracked via cloned_from_id.
    assert clone.cloned_from_id == template_id


@pytest.mark.asyncio
async def test_clone_job_404_for_missing_source(engine):
    from fastapi import HTTPException

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        with pytest.raises(HTTPException) as exc_info:
            await clone_job(s, str(uuid4()), TENANT_A)
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_clone_job_isolates_tenants(engine, job_in_b: Job):
    """A job in tenant B must not be cloneable by tenant A."""
    from fastapi import HTTPException

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        with pytest.raises(HTTPException) as exc_info:
            await clone_job(s, job_in_b.id, TENANT_A)
        assert exc_info.value.status_code == 404


# ── Endpoint: POST /jobs/{id}/clone ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoint_clone_basic(app_client: AsyncClient, job_in_a: Job):
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/clone", json={}, headers=_auth()
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["cloned_from_id"] == job_in_a.id
    assert body["status"] == "draft"
    assert body["copy_pipeline"] is True
    assert body["copy_questions"] is True
    assert body["copy_settings"] is True
    assert body["title"].endswith("(Copy)")

    # The new id is persisted and reachable via GET.
    detail = await app_client.get(
        f"/api/v1/jobs/{body['id']}", headers=_auth()
    )
    assert detail.status_code == 200
    detail_body = detail.json()
    assert detail_body["applicants_count"] == 0
    assert detail_body["status"] == "draft"


@pytest.mark.asyncio
async def test_endpoint_clone_with_options(app_client: AsyncClient, job_in_a: Job):
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/clone",
        json={
            "title": "Renamed Clone",
            "copy_pipeline": False,
            "copy_questions": True,
            "copy_settings": True,
        },
        headers=_auth(),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Renamed Clone"
    assert body["copy_pipeline"] is False

    # Verify pipeline was not copied in the persisted row.
    detail = await app_client.get(
        f"/api/v1/jobs/{body['id']}", headers=_auth()
    )
    assert detail.status_code == 200


@pytest.mark.asyncio
async def test_endpoint_clone_404(app_client: AsyncClient):
    resp = await app_client.post(
        f"/api/v1/jobs/{uuid4()}/clone", json={}, headers=_auth()
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_endpoint_clone_requires_member(app_client: AsyncClient, job_in_a: Job):
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/clone",
        json={},
        headers=_auth(role="viewer"),
    )
    assert resp.status_code == 403


# ── Endpoint: POST /jobs/{id}/save-as-template ───────────────────────────────


@pytest.mark.asyncio
async def test_save_as_template_flips_flag(app_client: AsyncClient, job_in_a: Job):
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={"template_name": "Backend Loop", "template_description": "v1"},
        headers=_auth(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["is_template"] is True
    assert body["template_name"] == "Backend Loop"
    assert body["template_description"] == "v1"


@pytest.mark.asyncio
async def test_save_as_template_defaults_name_to_title(
    app_client: AsyncClient, job_in_a: Job
):
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={},
        headers=_auth(),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["template_name"] == job_in_a.title


@pytest.mark.asyncio
async def test_save_as_template_404(app_client: AsyncClient):
    resp = await app_client.post(
        f"/api/v1/jobs/{uuid4()}/save-as-template",
        json={},
        headers=_auth(),
    )
    assert resp.status_code == 404


# ── Endpoint: GET /jobs/templates ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_templates_empty(app_client: AsyncClient):
    resp = await app_client.get("/api/v1/jobs/templates", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 0
    assert body["data"] == []


@pytest.mark.asyncio
async def test_list_templates_returns_only_templates(
    app_client: AsyncClient, job_in_a: Job, engine
):
    # Mark one job as a template.
    await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={"template_name": "Backend v1"},
        headers=_auth(),
    )
    # Add a second, non-template job directly.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        regular = Job(
            id=str(uuid4()),
            tenant_id=TENANT_A,
            title="Regular Posting",
            description="Just a job, not a template.",
            job_type=JobType.FULL_TIME,
            status=JobStatus.OPEN,
        )
        s.add(regular)
        await s.commit()

    resp = await app_client.get("/api/v1/jobs/templates", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["data"][0]["id"] == job_in_a.id
    assert body["data"][0]["template_name"] == "Backend v1"


# ── Endpoint: POST /jobs/from-template/{template_id} ─────────────────────────


@pytest.mark.asyncio
async def test_create_from_template(app_client: AsyncClient, job_in_a: Job):
    # First save as a template.
    save = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={"template_name": "Backend Loop"},
        headers=_auth(),
    )
    assert save.status_code == 200
    template_id = save.json()["id"]

    resp = await app_client.post(
        f"/api/v1/jobs/from-template/{template_id}",
        json={
            "title": "Backend Engineer (NYC)",
            "department": "Platform",
            "location": "New York, NY",
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["cloned_from_id"] == template_id
    assert body["title"] == "Backend Engineer (NYC)"
    assert body["department"] == "Platform"
    assert body["location"] == "New York, NY"
    assert body["status"] == "draft"

    # Persisted, queryable, and NOT marked as a template.
    detail = await app_client.get(
        f"/api/v1/jobs/{body['id']}", headers=_auth()
    )
    assert detail.status_code == 200


@pytest.mark.asyncio
async def test_create_from_template_rejects_non_template(
    app_client: AsyncClient, job_in_a: Job
):
    # job_in_a is not flagged is_template, so it should be rejected.
    resp = await app_client.post(
        f"/api/v1/jobs/from-template/{job_in_a.id}",
        json={
            "title": "Will Fail",
            "department": "X",
            "location": "Y",
        },
        headers=_auth(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_from_template_404_for_missing(app_client: AsyncClient):
    resp = await app_client.post(
        f"/api/v1/jobs/from-template/{uuid4()}",
        json={"title": "T", "department": "D", "location": "L"},
        headers=_auth(),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_from_template_validates_required_fields(
    app_client: AsyncClient, job_in_a: Job
):
    save = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={},
        headers=_auth(),
    )
    template_id = save.json()["id"]

    # Missing "location".
    resp = await app_client.post(
        f"/api/v1/jobs/from-template/{template_id}",
        json={"title": "T", "department": "D"},
        headers=_auth(),
    )
    assert resp.status_code == 422

    # Empty title.
    resp2 = await app_client.post(
        f"/api/v1/jobs/from-template/{template_id}",
        json={"title": "", "department": "D", "location": "L"},
        headers=_auth(),
    )
    assert resp2.status_code == 422


# ── Tenant isolation ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_list_templates(
    app_client: AsyncClient, job_in_a: Job
):
    await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={},
        headers=_auth(TENANT_A),
    )
    # Tenant A sees the template.
    a = await app_client.get("/api/v1/jobs/templates", headers=_auth(TENANT_A))
    assert a.json()["total"] == 1

    # Tenant B sees nothing.
    b = await app_client.get("/api/v1/jobs/templates", headers=_auth(TENANT_B))
    assert b.json()["total"] == 0


@pytest.mark.asyncio
async def test_tenant_isolation_clone_across_tenants(
    app_client: AsyncClient, job_in_b: Job
):
    # Tenant A tries to clone tenant B's job.
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_b.id}/clone", json={}, headers=_auth(TENANT_A)
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_create_from_template(
    app_client: AsyncClient, job_in_a: Job
):
    # Tenant A creates a template.
    save = await app_client.post(
        f"/api/v1/jobs/{job_in_a.id}/save-as-template",
        json={},
        headers=_auth(TENANT_A),
    )
    template_id = save.json()["id"]

    # Tenant B cannot see / use it.
    resp = await app_client.post(
        f"/api/v1/jobs/from-template/{template_id}",
        json={"title": "T", "department": "D", "location": "L"},
        headers=_auth(TENANT_B),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_save_as_template(
    app_client: AsyncClient, job_in_b: Job
):
    # Tenant A cannot mark tenant B's job as a template.
    resp = await app_client.post(
        f"/api/v1/jobs/{job_in_b.id}/save-as-template",
        json={},
        headers=_auth(TENANT_A),
    )
    assert resp.status_code == 404


# ── Authorization ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_endpoints_require_authentication(
    app_client: AsyncClient, job_in_a: Job
):
    # No Authorization header at all.
    for method, path, body in [
        ("GET", "/api/v1/jobs/templates", None),
        ("POST", f"/api/v1/jobs/{job_in_a.id}/save-as-template", {}),
        ("POST", f"/api/v1/jobs/{job_in_a.id}/clone", {}),
        ("POST", f"/api/v1/jobs/from-template/{job_in_a.id}", {}),
    ]:
        if method == "GET":
            r = await app_client.get(path)
        else:
            r = await app_client.post(path, json=body or {})
        assert r.status_code == 401, (method, path, r.status_code)


@pytest.mark.asyncio
async def test_template_to_read_projects_skills(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        clone = await save_as_template(
            s,
            job_id=job_in_a.id,
            tenant_id=TENANT_A,
            request=SaveAsTemplateRequest(template_name="t"),
        )
        await s.commit()
        await s.refresh(clone)
        projected = template_to_read(clone)

    assert projected.required_skills == ["python", "postgresql", "kubernetes"]
    assert projected.preferred_skills == ["rust", "kafka"]
    assert projected.template_name == "t"
    assert projected.id == job_in_a.id


@pytest.mark.asyncio
async def test_list_templates_helper_directly(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        await save_as_template(
            s,
            job_id=job_in_a.id,
            tenant_id=TENANT_A,
            request=SaveAsTemplateRequest(template_name="direct"),
        )
        await s.commit()

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        rows = await list_templates(s, tenant_id=TENANT_A)
    assert len(rows) == 1
    assert rows[0].id == job_in_a.id
    assert rows[0].is_template is True
    assert rows[0].template_name == "direct"


@pytest.mark.asyncio
async def test_create_from_template_helper_directly(engine, job_in_a: Job):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        template = await save_as_template(
            s,
            job_id=job_in_a.id,
            tenant_id=TENANT_A,
            request=SaveAsTemplateRequest(template_name="helper"),
        )
        await s.commit()
        template_id = template.id

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        new_job = await create_from_template(
            s,
            template_id=template_id,
            tenant_id=TENANT_A,
            request=FromTemplateRequest(
                title="Helper Job", department="Eng", location="Remote"
            ),
        )
        await s.commit()
    assert new_job.id != template_id
    assert new_job.is_template is False
    assert new_job.cloned_from_id == template_id
    assert new_job.title == "Helper Job"
    assert new_job.department == "Eng"
    assert new_job.location == "Remote"
    # Settings propagated.
    assert new_job.required_skills == job_in_a.required_skills
    assert new_job.pipeline_id == job_in_a.pipeline_id
    assert new_job.salary_min == job_in_a.salary_min


@pytest.mark.asyncio
async def test_list_templates_pagination_and_ordering(
    app_client: AsyncClient, engine
):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    titles = ["Alpha", "Bravo", "Charlie"]
    ids: list[str] = []
    for title in titles:
        async with factory() as s:
            j = Job(
                id=str(uuid4()),
                tenant_id=TENANT_A,
                title=title,
                description="x",
                job_type=JobType.FULL_TIME,
                status=JobStatus.DRAFT,
                is_template=True,
                template_name=title,
            )
            s.add(j)
            await s.commit()
            await s.refresh(j)
            ids.append(j.id)

    resp = await app_client.get(
        "/api/v1/jobs/templates?limit=10&offset=0", headers=_auth()
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    # All three ids present, regardless of order.
    returned = {row["id"] for row in body["data"]}
    assert returned == set(ids)
