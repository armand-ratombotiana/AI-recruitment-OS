"""Integration tests for the rewritten compliance service.

Covers:
  - DB-backed audit log (GET /audit-log, POST /audit-log)
  - Consent recording + listing
  - GDPR data export (with real candidate data)
  - GDPR data deletion (PII anonymisation)
  - Compliance status / policies / retention
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateProfile, CandidateStatus
from shared.core.models.compliance import AuditEntry
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.security import create_access_token
from shared.core.config import get_settings

from apps.compliance_service.main import router as compliance_router


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Bring up the full metadata — compliance tables plus the ones it references
    from sqlalchemy import MetaData
    from sqlmodel import SQLModel
    from shared.core.models.compliance import (
        AuditEntry, ConsentRecord, DataExportRequest, DataDeletionRequest,
    )
    from shared.core.models.candidate import Candidate, CandidateProfile
    from shared.core.models.identity import User

    # SQLModel.metadata is the registry; ensure all model modules are imported
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture
async def db_session(session_factory) -> AsyncSession:
    async with session_factory() as s:
        yield s


def _token(user_id: str, tenant_id: str, email: str = "u@x.com") -> str:
    return create_access_token({
        "sub": user_id,
        "email": email,
        "role": "admin",
        "tenant_id": tenant_id,
    })


@pytest_asyncio.fixture
async def app_and_client(session_factory):
    app = FastAPI()
    app.include_router(compliance_router)

    async def _override_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield app, c


@pytest_asyncio.fixture
async def tenant_with_user(session_factory):
    """Insert a tenant + user + a candidate, return ids."""
    async with session_factory() as s:
        user = User(
            id="u1", email="owner@acme.com", full_name="Owner",
            hashed_password="x",             role=UserRole.TENANT_ADMIN, status=UserStatus.ACTIVE,
            tenant_id="acme",
        )
        cand = Candidate(
            id="c1", tenant_id="acme", email="cand@x.com",
            full_name="John Smith", phone="555-0001", location="NYC",
            linkedin_url="https://linkedin.com/in/john",
            status=CandidateStatus.NEW,
        )
        prof = CandidateProfile(
            candidate_id="c1", tenant_id="acme",
            summary="Senior Python dev", seniority_level="senior",
            years_experience=8, domains=json_dumps(["fintech"]),
        )
        s.add_all([user, cand, prof])
        await s.commit()
    return {"user_id": "u1", "candidate_id": "c1", "tenant_id": "acme"}


def json_dumps(obj):
    import json
    return json.dumps(obj)


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health(app_and_client):
    _, c = app_and_client
    r = await c.get("/health")
    assert r.status_code == 200
    assert r.json()["service"] == "compliance"


@pytest.mark.asyncio
async def test_policies_and_retention(app_and_client):
    _, c = app_and_client
    r = await c.get("/policies")
    assert r.status_code == 200
    assert r.json()["total"] >= 3
    r = await c.get("/retention")
    assert r.status_code == 200
    assert "policies" in r.json()


@pytest.mark.asyncio
async def test_status(app_and_client):
    _, c = app_and_client
    r = await c.get("/status")
    assert r.status_code == 200
    body = r.json()
    assert body["overall_status"] == "compliant"
    assert "gdpr" in body["frameworks"]


@pytest.mark.asyncio
async def test_audit_log_post_and_get(app_and_client, tenant_with_user):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"], "owner@acme.com")
    headers = {"Authorization": f"Bearer {tok}"}

    # POST an audit entry
    r = await c.post(
        "/audit-log",
        headers=headers,
        json={"action": "test.event", "resource_type": "test", "resource_id": "r1", "outcome": "success"},
    )
    assert r.status_code == 200
    assert r.json()["recorded"] is True

    # GET it back
    r = await c.get("/audit-log", headers=headers)
    assert r.status_code == 200
    rows = r.json()["data"]
    assert any(e["action"] == "test.event" for e in rows)


@pytest.mark.asyncio
async def test_audit_log_requires_auth(app_and_client):
    _, c = app_and_client
    r = await c.get("/audit-log")
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_audit_log_tenant_isolation(app_and_client, tenant_with_user, session_factory):
    _, c = app_and_client
    # User from tenant acme writes one event
    tok_a = _token(tenant_with_user["user_id"], "acme", "a@x.com")
    await c.post(
        "/audit-log",
        headers={"Authorization": f"Bearer {tok_a}"},
        json={"action": "tenant.a.event", "resource_type": "x", "resource_id": "x1"},
    )
    # User from tenant beta tries to read — should see zero entries
    tok_b = _token("u2", "beta", "b@x.com")
    r = await c.get("/audit-log", headers={"Authorization": f"Bearer {tok_b}"})
    assert r.status_code == 200
    assert r.json()["total"] == 0


@pytest.mark.asyncio
async def test_consent_record_and_list(app_and_client, tenant_with_user):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"], "owner@acme.com")
    headers = {"Authorization": f"Bearer {tok}"}

    r = await c.post(
        "/consent",
        headers=headers,
        json={"candidate_id": "c1", "type": "data_processing", "granted": True},
    )
    assert r.status_code == 200
    assert r.json()["recorded"] is True

    r = await c.get("/consent?candidate_id=c1", headers=headers)
    assert r.status_code == 200
    rows = r.json()["data"]
    assert len(rows) == 1
    assert rows[0]["granted"] is True
    assert rows[0]["type"] == "data_processing"


@pytest.mark.asyncio
async def test_gdpr_export_returns_real_data(app_and_client, tenant_with_user):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"], "owner@acme.com")
    headers = {"Authorization": f"Bearer {tok}"}

    r = await c.post(
        "/data-export",
        headers=headers,
        json={"candidate_id": "c1", "format": "json"},
    )
    assert r.status_code == 200
    export_id = r.json()["id"]

    r = await c.get(f"/data-export/{export_id}", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    payload = body["payload"]
    assert payload["candidate"]["email"] == "cand@x.com"
    assert payload["candidate"]["full_name"] == "John Smith"
    assert payload["candidate"]["phone"] == "555-0001"
    assert payload["profile"]["years_experience"] == 8
    assert payload["export_metadata"]["format"] == "json"
    assert payload["export_metadata"]["exported_by"] == "u1"


@pytest.mark.asyncio
async def test_gdpr_export_unknown_candidate(app_and_client, tenant_with_user):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"])
    r = await c.post(
        "/data-export",
        headers={"Authorization": f"Bearer {tok}"},
        json={"candidate_id": "nonexistent"},
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_gdpr_deletion_anonymises_pii(app_and_client, tenant_with_user, session_factory):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"])
    headers = {"Authorization": f"Bearer {tok}"}

    r = await c.post(
        "/data-deletion",
        headers=headers,
        json={"candidate_id": "c1", "confirm": True, "reason": "user_request"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert "full_name" in body["anonymized_fields"]
    assert "email" in body["anonymized_fields"]
    assert "phone" in body["anonymized_fields"]

    # Read back from DB — PII must be gone
    from sqlalchemy import select
    async with session_factory() as s:
        cand = (await s.execute(select(Candidate).where(Candidate.id == "c1"))).scalar_one()
        assert cand.full_name.startswith("anonymised-")
        assert cand.email.endswith("@deleted.invalid")
        assert cand.phone is None
        assert cand.location is None
        assert cand.linkedin_url is None


@pytest.mark.asyncio
async def test_gdpr_deletion_requires_confirm(app_and_client, tenant_with_user):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"])
    r = await c.post(
        "/data-deletion",
        headers={"Authorization": f"Bearer {tok}"},
        json={"candidate_id": "c1", "confirm": False},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_gdpr_deletion_writes_audit_entry(app_and_client, tenant_with_user):
    _, c = app_and_client
    tok = _token(tenant_with_user["user_id"], tenant_with_user["tenant_id"])
    headers = {"Authorization": f"Bearer {tok}"}
    await c.post("/data-deletion", headers=headers, json={"candidate_id": "c1", "confirm": True})
    r = await c.get("/audit-log?action=gdpr.delete", headers=headers)
    rows = r.json()["data"]
    assert len(rows) == 1
    assert rows[0]["resource_id"] == "c1"
    assert rows[0]["actor_id"] == "u1"
