"""Email template + drip-sequence (DB) tests for the mailing service.

These tests build a minimal FastAPI app that mounts the mailing service
router at ``/api/v1`` and exercises the new DB-backed endpoints:

* Email templates: list, create, get, update, delete, preview.
* Email sequences (drip campaigns): list, create, enroll, unenroll, stats.
* Tenant isolation: every resource must be scoped to ``tenant_id``.

Persistence is verified end-to-end by re-reading rows through a fresh
SQLAlchemy ``AsyncSession`` so we know the data really hit the DB.
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
from sqlmodel import SQLModel, select

# Make ``backend`` importable when pytest is run from any cwd.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Import the new models so SQLModel.metadata.create_all() registers their
# tables when we build the in-memory engine below.
from shared.core.config import Settings  # noqa: E402
from shared.core.database import get_db_dependency  # noqa: E402
from shared.core.models.email_sequence import (  # noqa: E402
    EmailSequence,
    EmailSequenceEnrollment,
    EmailSequenceStep,
)
from shared.core.models.email_template import EmailTemplate  # noqa: E402
from shared.core.security import create_access_token  # noqa: E402


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token({
        "sub": sub,
        "email": f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DB + app fixtures ──────────────────────────────────────────────────────────


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
async def db_session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def client(engine, db_session_factory) -> AsyncGenerator[AsyncClient, None]:
    """A minimal FastAPI app hosting the mailing service router at /api/v1."""
    from apps.mailing_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def _override_db():
        async with db_session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override_db
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def template_factory(db_session_factory):
    """Helper: create a template row directly in the DB (no HTTP)."""
    async def _make(tenant_id: str, **kwargs) -> EmailTemplate:
        row = EmailTemplate(
            id=str(uuid4()),
            tenant_id=tenant_id,
            name=kwargs.get("name", f"tpl-{uuid4().hex[:6]}"),
            subject=kwargs.get("subject", "Hi {{ full_name }}"),
            body=kwargs.get("body", "<p>Hello {{ full_name }},</p>"),
            variables=kwargs.get("variables", {"full_name": "string"}),
            category=kwargs.get("category", "outreach"),
        )
        async with db_session_factory() as s:
            s.add(row)
            await s.commit()
            await s.refresh(row)
        return row
    return _make


# ── EmailTemplate CRUD ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_template_persists_to_db(client, db_session_factory):
    r = await client.post(
        "/api/v1/email-templates",
        json={
            "name": "Welcome",
            "subject": "Welcome {{ full_name }}",
            "body": "<p>Hi {{ full_name }}, welcome aboard!</p>",
            "variables": {"full_name": "string"},
            "category": "onboarding",
        },
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Welcome"
    assert body["category"] == "onboarding"
    assert body["tenant_id"] == "tenant-A"
    tid = body["id"]

    # Re-read via a fresh session to confirm it is in the DB.
    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailTemplate).where(EmailTemplate.id == tid)
        )).scalar_one()
    assert row.name == "Welcome"
    assert row.subject == "Welcome {{ full_name }}"
    assert row.variables == {"full_name": "string"}


@pytest.mark.asyncio
async def test_list_templates_returns_db_rows(client):
    admin = _auth("tenant-A", "adminA", "admin")
    for i in range(3):
        await client.post(
            "/api/v1/email-templates",
            json={"name": f"tpl{i}", "subject": "S", "body": "B"},
            headers=admin,
        )
    r = await client.get("/api/v1/email-templates", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert {t["name"] for t in body["templates"]} == {"tpl0", "tpl1", "tpl2"}


@pytest.mark.asyncio
async def test_list_templates_filter_by_category(client):
    admin = _auth("tenant-A", "adminA", "admin")
    await client.post(
        "/api/v1/email-templates",
        json={"name": "interview1", "subject": "S", "body": "B", "category": "interview"},
        headers=admin,
    )
    await client.post(
        "/api/v1/email-templates",
        json={"name": "offer1", "subject": "S", "body": "B", "category": "offer"},
        headers=admin,
    )
    r = await client.get(
        "/api/v1/email-templates?category=interview", headers=admin
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["templates"][0]["name"] == "interview1"


@pytest.mark.asyncio
async def test_get_template_returns_db_row(client, template_factory):
    t = await template_factory("tenant-A", name="Find Me")
    r = await client.get(
        f"/api/v1/email-templates/{t.id}", headers=_auth("tenant-A")
    )
    assert r.status_code == 200
    assert r.json()["id"] == t.id
    assert r.json()["name"] == "Find Me"


@pytest.mark.asyncio
async def test_update_template_persists(client, db_session_factory):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-templates",
        json={"name": "Original", "subject": "S", "body": "B"},
        headers=admin,
    )
    tid = create.json()["id"]

    r = await client.put(
        f"/api/v1/email-templates/{tid}",
        json={"name": "Renamed", "category": "offer"},
        headers=admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["category"] == "offer"
    assert body["subject"] == "S"  # unchanged

    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailTemplate).where(EmailTemplate.id == tid)
        )).scalar_one()
    assert row.name == "Renamed"
    assert row.category == "offer"


@pytest.mark.asyncio
async def test_update_variables_persists_as_json(client, db_session_factory):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-templates",
        json={"name": "vars", "subject": "S", "body": "B",
              "variables": {"old": "x"}},
        headers=admin,
    )
    tid = create.json()["id"]

    new_vars = {"full_name": "string", "job_title": "string"}
    r = await client.put(
        f"/api/v1/email-templates/{tid}",
        json={"variables": new_vars},
        headers=admin,
    )
    assert r.status_code == 200
    assert r.json()["variables"] == new_vars

    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailTemplate).where(EmailTemplate.id == tid)
        )).scalar_one()
    assert row.variables == new_vars


@pytest.mark.asyncio
async def test_delete_template_removes_from_db(client, db_session_factory):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-templates",
        json={"name": "Doomed", "subject": "S", "body": "B"},
        headers=admin,
    )
    tid = create.json()["id"]

    r = await client.delete(
        f"/api/v1/email-templates/{tid}", headers=admin
    )
    assert r.status_code == 200
    assert r.json()["deleted"] is True

    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailTemplate).where(EmailTemplate.id == tid)
        )).scalar_one_or_none()
    assert row is None


@pytest.mark.asyncio
async def test_preview_template_renders_sample_data(client):
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-templates",
        json={
            "name": "preview",
            "subject": "Hello {{ full_name }} — {{ job_title }}",
            "body": "<p>Hi {{ full_name }}, the {{ job_title }} role is open.</p>",
            "variables": {"full_name": "string", "job_title": "string"},
        },
        headers=admin,
    )
    tid = create.json()["id"]

    r = await client.post(
        f"/api/v1/email-templates/{tid}/preview",
        json={"sample_data": {"full_name": "Ada", "job_title": "Staff Engineer"}},
        headers=admin,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["rendered_subject"] == "Hello Ada — Staff Engineer"
    assert "Hi Ada" in body["rendered_body"]
    assert "Staff Engineer" in body["rendered_body"]


@pytest.mark.asyncio
async def test_preview_keeps_missing_placeholders(client):
    """If a sample value is absent, the placeholder remains visible in the
    rendered output so editors can spot missing variables."""
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-templates",
        json={"name": "p", "subject": "Hi {{ name }}", "body": "{{ name }}"},
        headers=admin,
    )
    tid = create.json()["id"]
    r = await client.post(
        f"/api/v1/email-templates/{tid}/preview",
        json={"sample_data": {}},
        headers=admin,
    )
    assert r.status_code == 200
    # jinja2 leaves the placeholder intact when the variable is missing.
    assert "{{" in r.json()["rendered_subject"]


# ── EmailSequence CRUD + steps ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_sequence_persists_to_db(client, db_session_factory, template_factory):
    t1 = await template_factory("tenant-A", name="step1-tpl")
    t2 = await template_factory("tenant-A", name="step2-tpl")

    admin = _auth("tenant-A", "adminA", "admin")
    r = await client.post(
        "/api/v1/email-sequences",
        json={
            "name": "Outreach Drip",
            "description": "3-step outreach",
            "steps": [
                {"order": 1, "delay_hours": 0, "template_id": t1.id,
                 "condition": {}},
                {"order": 2, "delay_hours": 48, "template_id": t2.id,
                 "condition": {"if_status": "replied", "then": "stop"}},
            ],
            "active": True,
        },
        headers=admin,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    sid = body["id"]
    assert body["name"] == "Outreach Drip"
    assert body["active"] is True
    assert len(body["steps"]) == 2
    assert body["steps"][1]["delay_hours"] == 48

    # Verify EmailSequence row.
    async with db_session_factory() as session:
        seq = (await session.execute(
            select(EmailSequence).where(EmailSequence.id == sid)
        )).scalar_one()
    assert seq.tenant_id == "tenant-A"
    assert len(seq.steps) == 2

    # Verify the normalized EmailSequenceStep rows.
    async with db_session_factory() as session:
        step_rows = (await session.execute(
            select(EmailSequenceStep)
            .where(EmailSequenceStep.sequence_id == sid)
            .order_by(EmailSequenceStep.order)
        )).scalars().all()
    assert len(step_rows) == 2
    assert step_rows[0].order == 1
    assert step_rows[0].template_id == t1.id
    assert step_rows[1].order == 2
    assert step_rows[1].delay_hours == 48
    assert step_rows[1].condition == {"if_status": "replied", "then": "stop"}


@pytest.mark.asyncio
async def test_create_sequence_rejects_unknown_template(client, template_factory):
    """Steps referencing templates that don't belong to the tenant are rejected."""
    t1 = await template_factory("tenant-A", name="real")
    admin = _auth("tenant-A", "adminA", "admin")
    r = await client.post(
        "/api/v1/email-sequences",
        json={
            "name": "Bad",
            "steps": [
                {"order": 1, "template_id": t1.id, "delay_hours": 0},
                {"order": 2, "template_id": "does-not-exist", "delay_hours": 1},
            ],
        },
        headers=admin,
    )
    assert r.status_code == 400
    assert "does-not-exist" in r.text


@pytest.mark.asyncio
async def test_list_sequences_returns_db_rows(client, template_factory):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")
    await client.post(
        "/api/v1/email-sequences",
        json={"name": "s1", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    await client.post(
        "/api/v1/email-sequences",
        json={"name": "s2", "active": True,
              "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    r = await client.get("/api/v1/email-sequences", headers=admin)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert {s["name"] for s in body["sequences"]} == {"s1", "s2"}

    # Filter by active flag.
    r2 = await client.get(
        "/api/v1/email-sequences?active=true", headers=admin
    )
    assert r2.json()["total"] == 1
    assert r2.json()["sequences"][0]["name"] == "s2"


@pytest.mark.asyncio
async def test_update_sequence_replaces_steps(client, db_session_factory, template_factory):
    t1 = await template_factory("tenant-A", name="orig-tpl")
    t2 = await template_factory("tenant-A", name="new-tpl")
    admin = _auth("tenant-A", "adminA", "admin")

    create = await client.post(
        "/api/v1/email-sequences",
        json={
            "name": "Rename me",
            "steps": [{"order": 1, "template_id": t1.id, "delay_hours": 0}],
        },
        headers=admin,
    )
    sid = create.json()["id"]

    r = await client.put(
        f"/api/v1/email-sequences/{sid}",
        json={
            "name": "Renamed",
            "active": True,
            "steps": [
                {"order": 1, "template_id": t2.id, "delay_hours": 0},
                {"order": 2, "template_id": t2.id, "delay_hours": 24},
            ],
        },
        headers=admin,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["active"] is True
    assert len(body["steps"]) == 2

    # Step rows should have been replaced, not duplicated.
    async with db_session_factory() as session:
        step_rows = (await session.execute(
            select(EmailSequenceStep)
            .where(EmailSequenceStep.sequence_id == sid)
            .order_by(EmailSequenceStep.order)
        )).scalars().all()
    assert len(step_rows) == 2
    assert all(s.template_id == t2.id for s in step_rows)


@pytest.mark.asyncio
async def test_delete_sequence_cascades_steps_and_enrollments(
    client, db_session_factory, template_factory
):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")

    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "casc", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    sid = create.json()["id"]

    # Enroll a candidate so we can verify cascade.
    enroll = await client.post(
        f"/api/v1/email-sequences/{sid}/enroll",
        json={"candidate_id": "cand-123"},
        headers=admin,
    )
    assert enroll.status_code == 201

    # Delete the sequence.
    r = await client.delete(f"/api/v1/email-sequences/{sid}", headers=admin)
    assert r.status_code == 200

    # Steps and enrollments should be gone.
    async with db_session_factory() as session:
        step_count = (await session.execute(
            select(EmailSequenceStep).where(EmailSequenceStep.sequence_id == sid)
        )).all()
        enr_count = (await session.execute(
            select(EmailSequenceEnrollment).where(
                EmailSequenceEnrollment.sequence_id == sid
            )
        )).all()
        seq = (await session.execute(
            select(EmailSequence).where(EmailSequence.id == sid)
        )).scalar_one_or_none()
    assert len(step_count) == 0
    assert len(enr_count) == 0
    assert seq is None


# ── Enroll / unenroll / stats ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enroll_candidate_persists_enrollment(
    client, db_session_factory, template_factory
):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "enr", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    sid = create.json()["id"]

    r = await client.post(
        f"/api/v1/email-sequences/{sid}/enroll",
        json={"candidate_id": "cand-abc"},
        headers=admin,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["candidate_id"] == "cand-abc"
    assert body["sequence_id"] == sid
    assert body["status"] == "active"
    assert body["current_step"] == 0
    eid = body["id"]

    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailSequenceEnrollment).where(
                EmailSequenceEnrollment.id == eid
            )
        )).scalar_one()
    assert row.candidate_id == "cand-abc"
    assert row.status == "active"


@pytest.mark.asyncio
async def test_unenroll_marks_status_and_completed_at(
    client, db_session_factory, template_factory
):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "unr", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    sid = create.json()["id"]
    enroll = await client.post(
        f"/api/v1/email-sequences/{sid}/enroll",
        json={"candidate_id": "cand-xyz"},
        headers=admin,
    )
    eid = enroll.json()["id"]

    r = await client.delete(
        f"/api/v1/email-sequences/{sid}/enrollments/{eid}", headers=admin
    )
    assert r.status_code == 200
    assert r.json()["unenrolled"] is True

    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailSequenceEnrollment).where(
                EmailSequenceEnrollment.id == eid
            )
        )).scalar_one()
    assert row.status == "unenrolled"
    assert row.completed_at is not None


@pytest.mark.asyncio
async def test_unenroll_unknown_enrollment_returns_404(client, template_factory):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "unr2", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    sid = create.json()["id"]
    r = await client.delete(
        f"/api/v1/email-sequences/{sid}/enrollments/does-not-exist",
        headers=admin,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_sequence_stats_aggregate_by_status(
    client, db_session_factory, template_factory
):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "stats", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    sid = create.json()["id"]

    # 3 active, 1 unenrolled, 1 completed (set via direct DB write to bypass
    # the worker, which is intentionally out of scope for these tests).
    for cid in ("c1", "c2", "c3"):
        r = await client.post(
            f"/api/v1/email-sequences/{sid}/enroll",
            json={"candidate_id": cid},
            headers=admin,
        )
        assert r.status_code == 201
    r = await client.post(
        f"/api/v1/email-sequences/{sid}/enroll",
        json={"candidate_id": "c4"},
        headers=admin,
    )
    eid4 = r.json()["id"]
    await client.delete(
        f"/api/v1/email-sequences/{sid}/enrollments/{eid4}", headers=admin
    )
    # Manually mark one as completed.
    async with db_session_factory() as session:
        row = (await session.execute(
            select(EmailSequenceEnrollment).where(
                EmailSequenceEnrollment.candidate_id == "c1"
            )
        )).scalar_one()
        row.status = "completed"
        row.completed_at = row.enrolled_at
        await session.commit()

    r = await client.get(
        f"/api/v1/email-sequences/{sid}/stats", headers=admin
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sequence_id"] == sid
    assert body["total_enrollments"] == 4
    assert body["active_count"] == 2  # c2, c3
    assert body["completed_count"] == 1
    assert body["unenrolled_count"] == 1
    assert body["step_count"] == 1


@pytest.mark.asyncio
async def test_list_sequence_enrollments(client, template_factory):
    t = await template_factory("tenant-A", name="tpl")
    admin = _auth("tenant-A", "adminA", "admin")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "list-enr", "steps": [{"order": 1, "template_id": t.id}]},
        headers=admin,
    )
    sid = create.json()["id"]
    for cid in ("alice", "bob"):
        await client.post(
            f"/api/v1/email-sequences/{sid}/enroll",
            json={"candidate_id": cid},
            headers=admin,
        )
    r = await client.get(
        f"/api/v1/email-sequences/{sid}/enrollments", headers=admin
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2
    assert {e["candidate_id"] for e in body["enrollments"]} == {"alice", "bob"}


# ── Tenant isolation ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_on_template_list(client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")
    await client.post(
        "/api/v1/email-templates",
        json={"name": "A-tpl", "subject": "S", "body": "B"},
        headers=a,
    )
    await client.post(
        "/api/v1/email-templates",
        json={"name": "B-tpl", "subject": "S", "body": "B"},
        headers=b,
    )
    list_a = await client.get("/api/v1/email-templates", headers=a)
    list_b = await client.get("/api/v1/email-templates", headers=b)
    assert {t["name"] for t in list_a.json()["templates"]} == {"A-tpl"}
    assert {t["name"] for t in list_b.json()["templates"]} == {"B-tpl"}


@pytest.mark.asyncio
async def test_tenant_isolation_on_template_get_returns_404(client):
    a = _auth("tenant-A", "adminA", "admin")
    b = _auth("tenant-B", "adminB", "admin")
    create = await client.post(
        "/api/v1/email-templates",
        json={"name": "B-only", "subject": "S", "body": "B"},
        headers=b,
    )
    bid = create.json()["id"]
    cross = await client.get(f"/api/v1/email-templates/{bid}", headers=a)
    assert cross.status_code == 404
    own = await client.get(f"/api/v1/email-templates/{bid}", headers=b)
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_template_update_returns_404(client, template_factory):
    t = await template_factory("tenant-B", name="B-only")
    r = await client.put(
        f"/api/v1/email-templates/{t.id}",
        json={"name": "Hacked"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_template_delete_returns_404(client, template_factory):
    t = await template_factory("tenant-B", name="B-only")
    r = await client.delete(
        f"/api/v1/email-templates/{t.id}",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_sequence_get_returns_404(client, template_factory):
    t = await template_factory("tenant-B", name="tpl")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "B-seq", "steps": [{"order": 1, "template_id": t.id}]},
        headers=_auth("tenant-B", "adminB", "admin"),
    )
    sid = create.json()["id"]
    cross = await client.get(
        f"/api/v1/email-sequences/{sid}",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert cross.status_code == 404
    own = await client.get(
        f"/api/v1/email-sequences/{sid}",
        headers=_auth("tenant-B", "adminB", "admin"),
    )
    assert own.status_code == 200


@pytest.mark.asyncio
async def test_tenant_isolation_on_sequence_enroll_returns_404(
    client, template_factory
):
    t = await template_factory("tenant-B", name="tpl")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "B-seq", "steps": [{"order": 1, "template_id": t.id}]},
        headers=_auth("tenant-B", "adminB", "admin"),
    )
    sid = create.json()["id"]
    cross = await client.post(
        f"/api/v1/email-sequences/{sid}/enroll",
        json={"candidate_id": "cand-1"},
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_on_sequence_stats_returns_404(
    client, template_factory
):
    t = await template_factory("tenant-B", name="tpl")
    create = await client.post(
        "/api/v1/email-sequences",
        json={"name": "B-seq", "steps": [{"order": 1, "template_id": t.id}]},
        headers=_auth("tenant-B", "adminB", "admin"),
    )
    sid = create.json()["id"]
    cross = await client.get(
        f"/api/v1/email-sequences/{sid}/stats",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert cross.status_code == 404


@pytest.mark.asyncio
async def test_unauthenticated_create_template_is_401(client):
    r = await client.post(
        "/api/v1/email-templates",
        json={"name": "x", "subject": "s", "body": "b"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_non_admin_cannot_create_template(client):
    r = await client.post(
        "/api/v1/email-templates",
        json={"name": "x", "subject": "s", "body": "b"},
        headers=_auth("tenant-A", "viewer1", "viewer"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_get_unknown_template_404(client):
    r = await client.get(
        "/api/v1/email-templates/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_unknown_sequence_404(client):
    r = await client.get(
        "/api/v1/email-sequences/does-not-exist",
        headers=_auth("tenant-A", "adminA", "admin"),
    )
    assert r.status_code == 404
