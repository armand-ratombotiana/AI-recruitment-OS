"""Tests for AI content generation and template management.

Covers:
- ContentGenerator class (job descriptions, emails, offer letters, rejections, LinkedIn posts)
- Template CRUD endpoints
- Tenant isolation
- Fallback behavior when LLM is unavailable
"""
from __future__ import annotations

import os
import sys
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.security import create_access_token

TENANT_A = str(uuid4())
TENANT_B = str(uuid4())


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


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from shared.core.models import (  # noqa: F401
        candidate,
        identity,
        recruitment,
    )
    from shared.core.models.content_template import ContentTemplate  # noqa: F401

    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def content_client(engine):
    from apps.content_generation.main import router as content_router

    app = FastAPI()
    app.include_router(content_router, prefix="/api/v1/content")

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


@pytest.fixture
def tenant_a() -> str:
    return TENANT_A


@pytest.fixture
def tenant_b() -> str:
    return TENANT_B


# ── ContentGenerator unit tests ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_job_description_fallback():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_job_description(
        job_title="Senior Python Developer",
        requirements=["5+ years Python", "FastAPI experience"],
        company_info={"name": "Acme Corp", "location": "Remote"},
    )
    assert isinstance(result, str)
    assert len(result) > 50
    assert "Senior Python Developer" in result or "Python" in result


@pytest.mark.asyncio
async def test_generate_email_fallback():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_email(
        template_type="interview_invitation",
        candidate_data={"name": "Jane Doe", "email": "jane@example.com"},
        job_data={"title": "Engineer", "company": "TechCo"},
    )
    assert isinstance(result, str)
    assert len(result) > 30
    assert "Jane Doe" in result or "Engineer" in result


@pytest.mark.asyncio
async def test_generate_offer_letter_fallback():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_offer_letter(
        candidate_data={"name": "John Smith"},
        job_data={"title": "CTO", "company": "StartupXYZ"},
        offer_terms={"salary": "$200k", "start_date": "2026-08-01", "location": "SF"},
    )
    assert isinstance(result, str)
    assert len(result) > 50
    assert "John Smith" in result or "CTO" in result


@pytest.mark.asyncio
async def test_generate_rejection_letter_fallback():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_rejection_letter(
        candidate_data={"name": "Bob Wilson"},
        job_data={"title": "Designer", "company": "DesignCo"},
        reason="Going with internal candidate",
    )
    assert isinstance(result, str)
    assert len(result) > 50
    assert "Bob Wilson" in result or "Designer" in result


@pytest.mark.asyncio
async def test_generate_linkedin_post_fallback():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_linkedin_post(
        job_data={"title": "DevOps Engineer", "company": "CloudCo", "skills": ["AWS", "Docker"]},
        tone="casual",
    )
    assert isinstance(result, str)
    assert len(result) > 30
    assert "DevOps" in result or "hiring" in result.lower()


@pytest.mark.asyncio
async def test_generate_job_description_empty_requirements():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_job_description(job_title="Intern")
    assert isinstance(result, str)
    assert len(result) > 20


@pytest.mark.asyncio
async def test_generate_email_unknown_type():
    from shared.ai.content_generator import ContentGenerator
    from shared.ai.llm_router import LLMRouter

    router = LLMRouter(allow_mock=True)
    gen = ContentGenerator(router=router, tenant_id="test")

    result = await gen.generate_email(
        template_type="unknown_type",
        candidate_data={"name": "Test"},
        job_data={"title": "Role"},
    )
    assert isinstance(result, str)
    assert len(result) > 10


# ── Endpoint integration tests ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_job_description_endpoint(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate/job-description",
        json={
            "job_title": "Backend Engineer",
            "requirements": ["Python", "FastAPI"],
            "company_info": {"name": "TestCo"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_type"] == "job_description"
    assert body["tenant_id"] == tenant_a
    assert len(body["content"]) > 0


@pytest.mark.asyncio
async def test_generate_email_endpoint(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate/email",
        json={
            "template_type": "interview_invitation",
            "candidate_data": {"name": "Alice"},
            "job_data": {"title": "PM", "company": "Corp"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_type"] == "email"
    assert len(body["content"]) > 0


@pytest.mark.asyncio
async def test_generate_offer_letter_endpoint(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate/offer-letter",
        json={
            "candidate_data": {"name": "Bob"},
            "job_data": {"title": "Lead", "company": "Inc"},
            "offer_terms": {"salary": "$150k"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_type"] == "offer_letter"
    assert len(body["content"]) > 0


@pytest.mark.asyncio
async def test_generate_rejection_endpoint(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate/rejection",
        json={
            "candidate_data": {"name": "Carol"},
            "job_data": {"title": "Analyst", "company": "Bank"},
            "reason": "Position filled internally",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_type"] == "rejection"
    assert len(body["content"]) > 0


@pytest.mark.asyncio
async def test_generate_linkedin_post_endpoint(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate/linkedin-post",
        json={
            "job_data": {"title": "SRE", "company": "OpsCo", "skills": ["K8s"]},
            "tone": "professional",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_type"] == "linkedin_post"
    assert len(body["content"]) > 0


@pytest.mark.asyncio
async def test_generate_content_generic_endpoint(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate",
        json={
            "content_type": "job_description",
            "data": {"job_title": "Frontend Dev", "requirements": ["React"]},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_type"] == "job_description"


@pytest.mark.asyncio
async def test_generate_content_invalid_type(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/generate",
        json={"content_type": "invalid_type", "data": {}},
        headers=headers,
    )
    assert resp.status_code == 400


# ── Template CRUD tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_template(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/templates",
        json={
            "name": "SRE Job Post",
            "type": "job_description",
            "content": "We are hiring a {{ role }} at {{ company }}.",
            "variables": {"role": "string", "company": "string"},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "SRE Job Post"
    assert body["type"] == "job_description"
    assert body["tenant_id"] == tenant_a
    assert "id" in body


@pytest.mark.asyncio
async def test_list_templates(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    await content_client.post(
        "/api/v1/content/templates",
        json={"name": "T1", "type": "email", "content": "Hello {{ name }}"},
        headers=headers,
    )
    resp = await content_client.get("/api/v1/content/templates", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert all(t["tenant_id"] == tenant_a for t in body["data"])


@pytest.mark.asyncio
async def test_update_template(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    create_resp = await content_client.post(
        "/api/v1/content/templates",
        json={"name": "Original", "type": "email", "content": "v1"},
        headers=headers,
    )
    tid = create_resp.json()["id"]

    resp = await content_client.put(
        f"/api/v1/content/templates/{tid}",
        json={"name": "Updated", "content": "v2"},
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Updated"
    assert body["content"] == "v2"


@pytest.mark.asyncio
async def test_delete_template(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    create_resp = await content_client.post(
        "/api/v1/content/templates",
        json={"name": "ToDelete", "type": "rejection", "content": "Sorry"},
        headers=headers,
    )
    tid = create_resp.json()["id"]

    resp = await content_client.delete(f"/api/v1/content/templates/{tid}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    get_resp = await content_client.get("/api/v1/content/templates", headers=headers)
    ids = [t["id"] for t in get_resp.json()["data"]]
    assert tid not in ids


@pytest.mark.asyncio
async def test_template_invalid_type(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.post(
        "/api/v1/content/templates",
        json={"name": "Bad", "type": "invalid_type", "content": "x"},
        headers=headers,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_template_not_found(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.put(
        "/api/v1/content/templates/nonexistent-id",
        json={"name": "X"},
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_template_not_found(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    resp = await content_client.delete(
        "/api/v1/content/templates/nonexistent-id",
        headers=headers,
    )
    assert resp.status_code == 404


# ── Tenant isolation tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_templates(content_client: AsyncClient, tenant_a: str, tenant_b: str):
    headers_a = _auth(tenant_a)
    headers_b = _auth(tenant_b)

    create_resp = await content_client.post(
        "/api/v1/content/templates",
        json={"name": "Tenant A Template", "type": "email", "content": "A only"},
        headers=headers_a,
    )
    tid_a = create_resp.json()["id"]

    list_b = await content_client.get("/api/v1/content/templates", headers=headers_b)
    ids_b = [t["id"] for t in list_b.json()["data"]]
    assert tid_a not in ids_b

    update_b = await content_client.put(
        f"/api/v1/content/templates/{tid_a}",
        json={"name": "Hacked"},
        headers=headers_b,
    )
    assert update_b.status_code == 404

    delete_b = await content_client.delete(
        f"/api/v1/content/templates/{tid_a}",
        headers=headers_b,
    )
    assert delete_b.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_content_generation(content_client: AsyncClient, tenant_a: str, tenant_b: str):
    headers_a = _auth(tenant_a)
    headers_b = _auth(tenant_b)

    resp_a = await content_client.post(
        "/api/v1/content/generate/job-description",
        json={"job_title": "Role A", "requirements": []},
        headers=headers_a,
    )
    resp_b = await content_client.post(
        "/api/v1/content/generate/job-description",
        json={"job_title": "Role B", "requirements": []},
        headers=headers_b,
    )

    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.json()["tenant_id"] == tenant_a
    assert resp_b.json()["tenant_id"] == tenant_b


@pytest.mark.asyncio
async def test_list_templates_type_filter(content_client: AsyncClient, tenant_a: str):
    headers = _auth(tenant_a)
    await content_client.post(
        "/api/v1/content/templates",
        json={"name": "Email T", "type": "email", "content": "email"},
        headers=headers,
    )
    await content_client.post(
        "/api/v1/content/templates",
        json={"name": "JD T", "type": "job_description", "content": "jd"},
        headers=headers,
    )

    resp = await content_client.get("/api/v1/content/templates?type=email", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert all(t["type"] == "email" for t in body["data"])
