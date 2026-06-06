"""Tests for the candidate timeline & notes feature.

Covers:
* Adding, updating, and deleting notes
* Listing just the notes
* Listing the full timeline (notes + auto-logged activities)
* Auto-logging of candidate_created on creation
* Auto-logging of status_change on status update
* Auto-logging of interview_scheduled on interview schedule
* Tenant isolation: tenant A cannot read or mutate tenant B's notes
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

# Make backend importable when this file is run in isolation.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.candidate_activity import (
    CandidateActivity,
    CandidateActivityType,
)
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


# ── Engine / app fixtures ──────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    """Single shared-connection engine so multiple sessions see the same DB."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Importing the model modules registers the tables on SQLModel.metadata.
    from shared.core.models import (  # noqa: F401
        candidate_activity,
        candidate,
        identity,
        audit_log,
        webhook,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def candidate_client(engine):
    """FastAPI app with only the candidate router mounted, with DB override."""
    from apps.candidate_service.main import router as candidate_router

    app = FastAPI()
    app.include_router(candidate_router, prefix="/api/v1/candidates")

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
async def seeded_candidate(engine):
    """Insert a candidate and return its id + tenant + auth headers."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        candidate = Candidate(
            id=str(uuid4()),
            tenant_id=tenant,
            email=f"seed-{uuid4().hex[:8]}@example.com",
            full_name="Seed Candidate",
            status=CandidateStatus.NEW,
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)
    return {
        "tenant_id": tenant,
        "candidate_id": candidate.id,
        "headers": _auth(tenant, sub="recruiter-1"),
    }


# ── Tests ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_add_a_note(candidate_client, seeded_candidate):
    """POST /notes creates a note and returns 201 with the persisted row."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
        json={
            "title": "Phone screen feedback",
            "content": "Strong communicator, recommend moving forward.",
            "meta": {"visibility": "team"},
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["candidate_id"] == cid
    assert body["title"] == "Phone screen feedback"
    assert body["content"] == "Strong communicator, recommend moving forward."
    assert body["meta"] == {"visibility": "team"}
    assert "id" in body
    assert "created_at" in body


@pytest.mark.asyncio
async def test_update_a_note(candidate_client, seeded_candidate):
    """PUT /notes/{id} updates the title/content/meta of an existing note."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    create_resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
        json={"title": "Original", "content": "Original body"},
    )
    assert create_resp.status_code == 201
    note_id = create_resp.json()["id"]

    update_resp = await candidate_client.put(
        f"/api/v1/candidates/{cid}/notes/{note_id}",
        headers=headers,
        json={
            "title": "Updated title",
            "content": "Updated body with new info",
            "meta": {"edited": True},
        },
    )
    assert update_resp.status_code == 200, update_resp.text
    body = update_resp.json()
    assert body["id"] == note_id
    assert body["title"] == "Updated title"
    assert body["content"] == "Updated body with new info"
    assert body["meta"] == {"edited": True}


@pytest.mark.asyncio
async def test_delete_a_note(candidate_client, seeded_candidate):
    """DELETE /notes/{id} removes the note and 404s thereafter."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    create_resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
        json={"title": "To be deleted", "content": "bye"},
    )
    assert create_resp.status_code == 201
    note_id = create_resp.json()["id"]

    del_resp = await candidate_client.delete(
        f"/api/v1/candidates/{cid}/notes/{note_id}",
        headers=headers,
    )
    assert del_resp.status_code == 204, del_resp.text

    # Re-fetching via the notes list should not include the deleted note.
    list_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
    )
    assert list_resp.status_code == 200
    ids = [n["id"] for n in list_resp.json()["data"]]
    assert note_id not in ids

    # And the timeline should also have lost the entry.
    timeline_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/timeline",
        headers=headers,
    )
    assert timeline_resp.status_code == 200
    assert note_id not in [e["id"] for e in timeline_resp.json()["events"]]


@pytest.mark.asyncio
async def test_get_full_timeline(candidate_client, seeded_candidate):
    """GET /timeline returns the full activity feed: notes + auto-logged events."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    # Schedule an interview to produce an auto-logged activity.
    interview_resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/interviews",
        headers=headers,
        json={
            "title": "Technical screen",
            "scheduled_at": "2026-07-01T14:00:00",
            "interviewer": "Alex",
            "interview_type": "technical",
            "notes": "Focus on system design.",
        },
    )
    assert interview_resp.status_code == 201, interview_resp.text

    # Add a note.
    note_resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
        json={"title": "Pre-interview prep", "content": "Review portfolio first."},
    )
    assert note_resp.status_code == 201

    # Update candidate status to trigger status_change auto-log.
    update_resp = await candidate_client.put(
        f"/api/v1/candidates/{cid}",
        headers=headers,
        json={"status": "screening"},
    )
    assert update_resp.status_code == 200, update_resp.text

    timeline_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/timeline",
        headers=headers,
    )
    assert timeline_resp.status_code == 200
    events = timeline_resp.json()["events"]
    types = {e["type"] for e in events}
    # We expect: interview_scheduled, note, status_change, candidate_created (from PUT creating the candidate in the seed).

    # The seeded candidate was created directly in the fixture (not via the API),
    # so the candidate_created auto-log will be missing — but the status_change,
    # note, and interview_scheduled must all be there.
    assert CandidateActivityType.INTERVIEW_SCHEDULED.value in types
    assert CandidateActivityType.NOTE.value in types
    assert CandidateActivityType.STATUS_CHANGE.value in types
    # Sanity: at least 3 events.
    assert len(events) >= 3


@pytest.mark.asyncio
async def test_get_notes_only(candidate_client, seeded_candidate):
    """GET /notes returns only entries of activity_type='note'."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    # Add 2 notes and 1 auto-logged event (interview).
    n1 = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
        json={"title": "Note 1", "content": "First."},
    )
    n2 = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
        json={"title": "Note 2", "content": "Second."},
    )
    await candidate_client.post(
        f"/api/v1/candidates/{cid}/interviews",
        headers=headers,
        json={
            "title": "AI screen",
            "scheduled_at": "2026-07-02T10:00:00",
        },
    )
    assert n1.status_code == 201
    assert n2.status_code == 201

    list_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers,
    )
    assert list_resp.status_code == 200
    body = list_resp.json()
    assert body["candidate_id"] == cid
    assert body["total"] == 2
    titles = {n["title"] for n in body["data"]}
    assert titles == {"Note 1", "Note 2"}


@pytest.mark.asyncio
async def test_status_change_auto_logs(candidate_client, seeded_candidate):
    """A status update auto-creates a status_change activity on the timeline."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    # First move it from NEW → SCREENING.
    upd1 = await candidate_client.put(
        f"/api/v1/candidates/{cid}",
        headers=headers,
        json={"status": "screening"},
    )
    assert upd1.status_code == 200

    # Then SCREENING → INTERVIEWING — the second transition must auto-log.
    upd2 = await candidate_client.put(
        f"/api/v1/candidates/{cid}",
        headers=headers,
        json={"status": "interviewing"},
    )
    assert upd2.status_code == 200

    timeline_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/timeline",
        headers=headers,
    )
    assert timeline_resp.status_code == 200
    events = timeline_resp.json()["events"]
    status_changes = [e for e in events if e["type"] == CandidateActivityType.STATUS_CHANGE.value]
    assert len(status_changes) == 2

    # Both transitions should have the old/new values in the metadata.
    transitions = {(e["meta"]["old_status"], e["meta"]["new_status"]) for e in status_changes}
    assert ("new", "screening") in transitions
    assert ("screening", "interviewing") in transitions


@pytest.mark.asyncio
async def test_no_status_change_log_when_value_unchanged(candidate_client, seeded_candidate):
    """Updating with the current status must NOT produce a status_change activity."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    # First, move to screening (this WILL log).
    await candidate_client.put(
        f"/api/v1/candidates/{cid}",
        headers=headers,
        json={"status": "screening"},
    )

    # Re-send the same status — no log expected.
    await candidate_client.put(
        f"/api/v1/candidates/{cid}",
        headers=headers,
        json={"status": "screening"},
    )

    timeline_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/timeline",
        headers=headers,
    )
    assert timeline_resp.status_code == 200
    events = timeline_resp.json()["events"]
    status_changes = [e for e in events if e["type"] == CandidateActivityType.STATUS_CHANGE.value]
    assert len(status_changes) == 1


@pytest.mark.asyncio
async def test_candidate_creation_auto_logs(candidate_client, seeded_candidate):
    """Creating a candidate via the API auto-logs a candidate_created activity."""
    # The seed fixture created the candidate directly (bypassing the API), so
    # we exercise the auto-log path with a brand-new candidate via the API.
    headers = seeded_candidate["headers"]
    create_resp = await candidate_client.post(
        "/api/v1/candidates/",
        headers=headers,
        json={
            "email": f"fresh-{uuid4().hex[:8]}@example.com",
            "full_name": "Fresh Candidate",
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    new_id = create_resp.json()["id"]

    timeline_resp = await candidate_client.get(
        f"/api/v1/candidates/{new_id}/timeline",
        headers=headers,
    )
    assert timeline_resp.status_code == 200
    events = timeline_resp.json()["events"]
    types = {e["type"] for e in events}
    assert CandidateActivityType.CANDIDATE_CREATED.value in types


@pytest.mark.asyncio
async def test_interview_schedule_auto_logs(candidate_client, seeded_candidate):
    """POST /interviews auto-logs an interview_scheduled activity."""
    cid = seeded_candidate["candidate_id"]
    headers = seeded_candidate["headers"]

    resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/interviews",
        headers=headers,
        json={
            "title": "Onsite",
            "scheduled_at": "2026-08-01T09:00:00",
            "interviewer": "Sam",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["candidate_id"] == cid
    assert body["title"] == "Onsite"
    assert "activity_id" in body

    timeline_resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/timeline",
        headers=headers,
    )
    assert timeline_resp.status_code == 200
    types = {e["type"] for e in timeline_resp.json()["events"]}
    assert CandidateActivityType.INTERVIEW_SCHEDULED.value in types


# ── Tenant isolation ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_notes(candidate_client, seeded_candidate):
    """Tenant B must not see, update, or delete Tenant A's notes."""
    cid = seeded_candidate["candidate_id"]
    headers_a = seeded_candidate["headers"]
    headers_b = _auth(tenant_id="other-tenant", sub="attacker")

    # Create a note as tenant A.
    create_resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers_a,
        json={"title": "Tenant A note", "content": "private"},
    )
    assert create_resp.status_code == 201
    note_id = create_resp.json()["id"]

    # Tenant B cannot list A's notes.
    list_resp_b = await candidate_client.get(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers_b,
    )
    assert list_resp_b.status_code == 404  # candidate not visible to tenant B

    # Tenant B cannot update A's note (candidate not visible → 404).
    update_resp_b = await candidate_client.put(
        f"/api/v1/candidates/{cid}/notes/{note_id}",
        headers=headers_b,
        json={"title": "hijacked"},
    )
    assert update_resp_b.status_code == 404

    # Tenant B cannot delete A's note.
    delete_resp_b = await candidate_client.delete(
        f"/api/v1/candidates/{cid}/notes/{note_id}",
        headers=headers_b,
    )
    assert delete_resp_b.status_code == 404

    # And the note is still there for tenant A.
    list_resp_a = await candidate_client.get(
        f"/api/v1/candidates/{cid}/notes",
        headers=headers_a,
    )
    assert list_resp_a.status_code == 200
    assert list_resp_a.json()["total"] == 1


@pytest.mark.asyncio
async def test_tenant_isolation_timeline(candidate_client, seeded_candidate):
    """Tenant B gets 404 for the timeline of a candidate it does not own."""
    cid = seeded_candidate["candidate_id"]
    headers_b = _auth(tenant_id="other-tenant", sub="attacker")

    resp = await candidate_client.get(
        f"/api/v1/candidates/{cid}/timeline",
        headers=headers_b,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_interview_schedule(candidate_client, seeded_candidate):
    """Tenant B cannot schedule an interview on Tenant A's candidate."""
    cid = seeded_candidate["candidate_id"]
    headers_b = _auth(tenant_id="other-tenant", sub="attacker")

    resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/interviews",
        headers=headers_b,
        json={
            "title": "Hostile interview",
            "scheduled_at": "2026-08-01T09:00:00",
        },
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_notes_require_auth(candidate_client, seeded_candidate):
    """Notes endpoints require a valid bearer token."""
    cid = seeded_candidate["candidate_id"]

    list_resp = await candidate_client.get(f"/api/v1/candidates/{cid}/notes")
    assert list_resp.status_code == 401

    create_resp = await candidate_client.post(
        f"/api/v1/candidates/{cid}/notes",
        json={"title": "x", "content": "y"},
    )
    assert create_resp.status_code == 401
