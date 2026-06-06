"""Tests for the candidate import service.

Covers:

* CSV import happy path
* CSV import with some invalid rows
* CSV template download
* LinkedIn import (stub)
* Tenant isolation — imports only affect the caller's tenant
"""
from __future__ import annotations

import io
import os
import sys
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateSkill, Skill
from shared.core.security import create_access_token


# ── Token / auth helpers ───────────────────────────────────────────────────


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


# ── Engine / DB fixtures ────────────────────────────────────────────────────


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
async def db_override(engine):
    """Install a DB dependency override on the import-service app."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    def _install(app: FastAPI) -> None:
        async def _override():
            async with factory() as s:
                try:
                    yield s
                    await s.commit()
                except Exception:
                    await s.rollback()
                    raise

        app.dependency_overrides[get_db_dependency] = _override
        app.dependency_overrides[Settings] = lambda: Settings(
            SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
            ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
            DATABASE_URL="sqlite+aiosqlite:///:memory:",
            DEBUG=False,
        )

    return _install


def _build_import_app(install_db) -> FastAPI:
    from apps.import_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/imports")
    install_db(app)
    return app


@pytest_asyncio.fixture
async def import_client(db_override) -> AsyncGenerator[AsyncClient, None]:
    app = _build_import_app(db_override)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _csv_bytes(text: str) -> bytes:
    return text.encode("utf-8")


# ── Template download ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_template_download_returns_csv(import_client):
    headers = _auth("tenant-A", "uA", "recruiter")
    r = await import_client.get("/imports/candidates/template", headers=headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/csv")
    body = r.text
    # Header row is present
    assert "full_name" in body
    assert "email" in body
    # At least one example row is present
    assert "@example.com" in body


@pytest.mark.asyncio
async def test_template_download_requires_authentication(import_client):
    r = await import_client.get("/imports/candidates/template")
    assert r.status_code == 401


# ── CSV import: happy path ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_import_with_valid_data(import_client, engine):
    headers = _auth("tenant-A", "uA", "recruiter")
    csv_text = (
        "full_name,email,phone,location,skills,experience_years,linkedin_url\n"
        "Jane Doe,jane@example.com,+1-555-0100,New York,python;fastapi;postgres,5,"
        "https://linkedin.com/in/jane\n"
        "John Smith,john@example.com,,Remote,react;typescript;graphql,8,\n"
        "Alice Wong,alice@example.com,+1-555-0200,San Francisco,"
        "go;kubernetes;docker,3,https://linkedin.com/in/alice\n"
    )
    files = {"file": ("candidates.csv", _csv_bytes(csv_text), "text/csv")}

    r = await import_client.post(
        "/imports/candidates/csv", files=files, headers=headers
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["imported"] == 3
    assert payload["failed"] == 0
    assert payload["errors"] == []
    assert {c["email"] for c in payload["candidates"]} == {
        "jane@example.com",
        "john@example.com",
        "alice@example.com",
    }

    # Verify rows are actually persisted in the DB, scoped to tenant-A.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == "tenant-A")
        )
        candidates = result.scalars().all()
        assert len(candidates) == 3
        emails = {c.email for c in candidates}
        assert emails == {
            "jane@example.com",
            "john@example.com",
            "alice@example.com",
        }
        # Skills were attached for Jane (3 skills)
        jane = next(c for c in candidates if c.email == "jane@example.com")
        skills_result = await session.execute(
            select(CandidateSkill, Skill)
            .join(Skill, CandidateSkill.skill_id == Skill.id)
            .where(CandidateSkill.candidate_id == jane.id)
        )
        skill_names = {skill.name for _, skill in skills_result.all()}
        assert skill_names == {"python", "fastapi", "postgres"}


@pytest.mark.asyncio
async def test_csv_import_supports_synonym_headers(import_client):
    headers = _auth("tenant-A", "uA", "recruiter")
    # 'name' instead of 'full_name', 'experience' instead of 'experience_years'
    csv_text = (
        "name,email,phone,city,skill,yoe\n"
        "Bob Marley,bob@example.com,+44-20-9999,London,music;guitar,40\n"
    )
    files = {"file": ("candidates.csv", _csv_bytes(csv_text), "text/csv")}
    r = await import_client.post(
        "/imports/candidates/csv", files=files, headers=headers
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["imported"] == 1
    assert payload["failed"] == 0


# ── CSV import: invalid rows ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_import_with_some_invalid_rows(import_client, engine):
    headers = _auth("tenant-A", "uA", "recruiter")
    csv_text = (
        "full_name,email,phone,location,skills,experience_years\n"
        "Valid One,valid1@example.com,+1-555,City A,python,5\n"
        ",missing-name@example.com,+1-555,City B,python,3\n"  # missing full_name
        "No Email Person,,+1-555,City C,python,3\n"  # missing email
        "Bad Experience,valid2@example.com,+1-555,City D,python,not-a-number\n"
        "Valid Two,valid3@example.com,+1-555,City E,java,7\n"
    )
    files = {"file": ("candidates.csv", _csv_bytes(csv_text), "text/csv")}
    r = await import_client.post(
        "/imports/candidates/csv", files=files, headers=headers
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload["imported"] == 2
    assert payload["failed"] == 3
    error_texts = [e["error"] for e in payload["errors"]]
    assert any("full_name" in t for t in error_texts)
    assert any("email" in t for t in error_texts)
    assert any("numeric" in t for t in error_texts)

    # Persisted rows are exactly the two valid ones.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.tenant_id == "tenant-A")
        )
        candidates = result.scalars().all()
        assert {c.email for c in candidates} == {
            "valid1@example.com",
            "valid3@example.com",
        }


@pytest.mark.asyncio
async def test_csv_import_rejects_duplicates_within_file_and_db(
    import_client, engine
):
    headers = _auth("tenant-A", "uA", "recruiter")
    csv_text = (
        "full_name,email\n"
        "First,f@example.com\n"
        "Second,f@example.com\n"  # duplicate in file
    )
    files = {"file": ("candidates.csv", _csv_bytes(csv_text), "text/csv")}
    r1 = await import_client.post(
        "/imports/candidates/csv", files=files, headers=headers
    )
    assert r1.status_code == 200
    p1 = r1.json()
    assert p1["imported"] == 1
    assert p1["failed"] == 1
    assert "Duplicate" in p1["errors"][0]["error"]

    # Now upload the same file again — first row should fail because it now
    # exists in the DB.
    files2 = {"file": ("candidates.csv", _csv_bytes(csv_text), "text/csv")}
    r2 = await import_client.post(
        "/imports/candidates/csv", files=files2, headers=headers
    )
    assert r2.status_code == 200
    p2 = r2.json()
    assert p2["imported"] == 0
    assert p2["failed"] == 2


@pytest.mark.asyncio
async def test_csv_import_requires_authentication(import_client):
    csv_text = "full_name,email\nJane,jane@example.com\n"
    files = {"file": ("candidates.csv", _csv_bytes(csv_text), "text/csv")}
    r = await import_client.post("/imports/candidates/csv", files=files)
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_csv_import_rejects_empty_file(import_client):
    headers = _auth("tenant-A", "uA", "recruiter")
    files = {"file": ("empty.csv", b"", "text/csv")}
    r = await import_client.post(
        "/imports/candidates/csv", files=files, headers=headers
    )
    assert r.status_code == 400


# ── LinkedIn import ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_linkedin_import_creates_candidate(import_client, engine):
    headers = _auth("tenant-A", "uA", "recruiter")
    payload = {
        "linkedin_url": "https://www.linkedin.com/in/someone",
        "name": "Liam Linked",
        "email": "liam@example.com",
        "phone": "+1-555-0123",
        "location": "Boston, MA",
        "skills": ["python", "aws", "kubernetes"],
        "experience_years": 9,
    }
    r = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "liam@example.com"
    assert body["full_name"] == "Liam Linked"
    assert body["linkedin_url"] == payload["linkedin_url"]
    assert body["source"] == "linkedin"
    assert body["created"] is True
    assert body["id"]

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(
            select(Candidate).where(Candidate.email == "liam@example.com")
        )
        candidate = result.scalar_one()
        assert candidate.tenant_id == "tenant-A"
        assert candidate.source == "linkedin"
        assert candidate.linkedin_url == payload["linkedin_url"]
        assert candidate.location == "Boston, MA"

        skills_result = await session.execute(
            select(CandidateSkill, Skill)
            .join(Skill, CandidateSkill.skill_id == Skill.id)
            .where(CandidateSkill.candidate_id == candidate.id)
        )
        skill_names = {skill.name for _, skill in skills_result.all()}
        assert skill_names == {"python", "aws", "kubernetes"}


@pytest.mark.asyncio
async def test_linkedin_import_accepts_comma_separated_skills_string(import_client):
    headers = _auth("tenant-A", "uA", "recruiter")
    payload = {
        "linkedin_url": "https://www.linkedin.com/in/another",
        "name": "Sam String",
        "email": "sam@example.com",
        "skills": "java, spring, postgres",
    }
    r = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "sam@example.com"


@pytest.mark.asyncio
async def test_linkedin_import_rejects_duplicate_email(import_client):
    headers = _auth("tenant-A", "uA", "recruiter")
    payload = {
        "linkedin_url": "https://www.linkedin.com/in/dup",
        "name": "Dup Person",
        "email": "dup@example.com",
    }
    r1 = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers
    )
    assert r1.status_code == 200

    r2 = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers
    )
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_linkedin_import_rejects_invalid_email(import_client):
    headers = _auth("tenant-A", "uA", "recruiter")
    payload = {
        "linkedin_url": "https://www.linkedin.com/in/bad",
        "name": "Bad Email",
        "email": "not-an-email",
    }
    r = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_linkedin_import_requires_authentication(import_client):
    payload = {
        "linkedin_url": "https://www.linkedin.com/in/anon",
        "name": "Anon",
        "email": "anon@example.com",
    }
    r = await import_client.post("/imports/candidates/linkedin", json=payload)
    assert r.status_code == 401


# ── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_csv_imports_are_scoped_to_caller_tenant(import_client, engine):
    """Tenant A and tenant B each import independently; rows must not leak."""
    headers_a = _auth("tenant-A", "uA", "recruiter")
    headers_b = _auth("tenant-B", "uB", "recruiter")

    csv_a = (
        "full_name,email\n"
        "A One,a1@example.com\n"
        "A Two,a2@example.com\n"
    )
    csv_b = (
        "full_name,email\n"
        "B One,b1@example.com\n"
        "B Two,b2@example.com\n"
    )

    r_a = await import_client.post(
        "/imports/candidates/csv",
        files={"file": ("a.csv", _csv_bytes(csv_a), "text/csv")},
        headers=headers_a,
    )
    r_b = await import_client.post(
        "/imports/candidates/csv",
        files={"file": ("b.csv", _csv_bytes(csv_b), "text/csv")},
        headers=headers_b,
    )
    assert r_a.status_code == 200
    assert r_b.status_code == 200
    assert r_a.json()["imported"] == 2
    assert r_b.json()["imported"] == 2

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        result = await session.execute(select(Candidate))
        all_candidates = result.scalars().all()
        tenant_a_emails = {
            c.email for c in all_candidates if c.tenant_id == "tenant-A"
        }
        tenant_b_emails = {
            c.email for c in all_candidates if c.tenant_id == "tenant-B"
        }
        assert tenant_a_emails == {"a1@example.com", "a2@example.com"}
        assert tenant_b_emails == {"b1@example.com", "b2@example.com"}
        # No cross-tenant leak.
        assert tenant_a_emails.isdisjoint(tenant_b_emails)


@pytest.mark.asyncio
async def test_csv_import_in_tenant_b_does_not_collide_with_tenant_a(
    import_client,
):
    """Same email can exist in two different tenants — no false conflict."""
    headers_a = _auth("tenant-A", "uA", "recruiter")
    headers_b = _auth("tenant-B", "uB", "recruiter")
    csv = "full_name,email\nShared,shared@example.com\n"

    r_a = await import_client.post(
        "/imports/candidates/csv",
        files={"file": ("a.csv", _csv_bytes(csv), "text/csv")},
        headers=headers_a,
    )
    r_b = await import_client.post(
        "/imports/candidates/csv",
        files={"file": ("b.csv", _csv_bytes(csv), "text/csv")},
        headers=headers_b,
    )
    assert r_a.status_code == 200
    assert r_b.status_code == 200
    assert r_a.json()["imported"] == 1
    assert r_b.json()["imported"] == 1
    assert r_a.json()["failed"] == 0
    assert r_b.json()["failed"] == 0


@pytest.mark.asyncio
async def test_linkedin_imports_are_scoped_to_caller_tenant(import_client):
    headers_a = _auth("tenant-A", "uA", "recruiter")
    headers_b = _auth("tenant-B", "uB", "recruiter")
    payload = {
        "linkedin_url": "https://www.linkedin.com/in/shared",
        "name": "Shared Person",
        "email": "shared-li@example.com",
    }
    r_a = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers_a
    )
    r_b = await import_client.post(
        "/imports/candidates/linkedin", json=payload, headers=headers_b
    )
    assert r_a.status_code == 200
    assert r_b.status_code == 200
    # The two candidates have different IDs but the same email.
    assert r_a.json()["id"] != r_b.json()["id"]
    assert r_a.json()["email"] == r_b.json()["email"]


@pytest.mark.asyncio
async def test_csv_import_rejects_oversized_file(import_client):
    """Files over MAX_CSV_BYTES return 413."""
    headers = _auth("tenant-A", "uA", "recruiter")
    big_header = "full_name,email\n"
    # ~12 MB of data, over the 10 MB cap.
    big_row = ("X" * 5000 + ",x@example.com\n").encode("utf-8")
    big = big_header.encode("utf-8") + big_row * 2500  # ~12.5 MB
    files = {"file": ("big.csv", big, "text/csv")}
    r = await import_client.post(
        "/imports/candidates/csv", files=files, headers=headers
    )
    assert r.status_code == 413
