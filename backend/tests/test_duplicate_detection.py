"""Tests for candidate duplicate detection & merge.

Covers:

* :mod:`shared.dedup.detector` — pure unit tests for the scoring rules.
* The ``POST /detect-duplicates`` endpoint — finds groups in a tenant.
* The ``GET  /{id}/possible-duplicates`` endpoint — finds matches for one.
* The ``POST /merge`` endpoint — folds two candidates into one.
* Tenant isolation — candidate access is scoped to the caller's tenant.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Any
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
from shared.dedup.detector import (
    DuplicateMatch,
    find_duplicates,
    find_duplicates_for_new,
    normalize_email,
    normalize_location,
    normalize_name,
    normalize_phone,
    score_pair,
)


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


# ── Plain-object candidate for unit tests ──────────────────────────────────


class _StubCandidate:
    """Lightweight stand-in for a :class:`Candidate` row.

    The detector only reads ``id``, ``email``, ``full_name``, ``phone``, and
    ``location`` so we don't need the full SQLModel for the unit tests.
    """

    def __init__(
        self,
        id: str | None = None,
        email: str | None = None,
        full_name: str | None = None,
        phone: str | None = None,
        location: str | None = None,
    ) -> None:
        self.id = id or str(uuid4())
        self.email = email
        self.full_name = full_name
        self.phone = phone
        self.location = location

    def __repr__(self) -> str:  # pragma: no cover - debugging only
        return (
            f"_StubCandidate(id={self.id!r}, email={self.email!r}, "
            f"full_name={self.full_name!r}, phone={self.phone!r}, "
            f"location={self.location!r})"
        )


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
        tag,
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


async def _insert_candidate(
    engine,
    *,
    tenant_id: str,
    email: str,
    full_name: str,
    phone: str | None = None,
    location: str | None = None,
    status: CandidateStatus = CandidateStatus.NEW,
) -> Candidate:
    """Insert a candidate directly and return the row."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        candidate = Candidate(
            id=str(uuid4()),
            tenant_id=tenant_id,
            email=email,
            full_name=full_name,
            phone=phone,
            location=location,
            status=status,
        )
        session.add(candidate)
        await session.commit()
        await session.refresh(candidate)
    return candidate


async def _insert_note(
    engine,
    *,
    tenant_id: str,
    candidate_id: str,
    content: str,
    title: str = "Note",
) -> None:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        activity = CandidateActivity(
            tenant_id=tenant_id,
            candidate_id=candidate_id,
            activity_type=CandidateActivityType.NOTE.value,
            title=title,
            content=content,
        )
        session.add(activity)
        await session.commit()


# ── Unit tests: pure detector (no DB) ─────────────────────────────────────


class TestNormalisation:
    def test_email_is_lowercased_and_stripped(self):
        assert normalize_email("  JOHN@Example.COM  ") == "john@example.com"

    def test_email_empty_returns_blank(self):
        assert normalize_email(None) == ""
        assert normalize_email("") == ""
        assert normalize_email("   ") == ""

    def test_phone_strips_formatting(self):
        assert normalize_phone("+1 (555) 123-4567") == "+15551234567"
        assert normalize_phone("555.123.4567") == "5551234567"
        assert normalize_phone("  555-1234  ") == "5551234"

    def test_phone_empty_returns_blank(self):
        assert normalize_phone(None) == ""
        assert normalize_phone("") == ""
        assert normalize_phone("abc-def-####") == ""

    def test_name_strips_honorifics_and_lowercases(self):
        assert normalize_name("Dr. John Smith") == "john smith"
        assert normalize_name("MR.  John   Smith") == "john smith"
        assert normalize_name("Prof. Jane Doe") == "jane doe"

    def test_name_empty_returns_blank(self):
        assert normalize_name(None) == ""
        assert normalize_name("   ") == ""
        assert normalize_name("Dr. Mr.") == ""

    def test_location_lowercases_and_collapses_whitespace(self):
        assert normalize_location("  New   York   City  ") == "new york city"
        assert normalize_location(None) == ""


class TestScorePair:
    def test_exact_email_match_is_high_confidence(self):
        a = _StubCandidate(email="john@x.com", full_name="John Smith")
        b = _StubCandidate(email="JOHN@X.com", full_name="Different Name")
        m = score_pair(a, b)
        assert m is not None
        assert m.confidence == 0.95
        assert m.reason == "exact_email"

    def test_name_and_phone_match_is_medium_confidence(self):
        a = _StubCandidate(full_name="John Smith", phone="555.123.4567")
        b = _StubCandidate(full_name="JOHN  SMITH", phone="(555) 123-4567")
        m = score_pair(a, b)
        assert m is not None
        assert m.confidence == 0.75
        assert m.reason == "name_phone"

    def test_name_and_location_match_is_low_confidence(self):
        a = _StubCandidate(full_name="John Smith", location="NYC")
        b = _StubCandidate(full_name="john smith", location="nyc")
        m = score_pair(a, b)
        assert m is not None
        assert m.confidence == 0.55
        assert m.reason == "name_location"

    def test_email_match_wins_over_name_match(self):
        """If the email matches, the higher-confidence rule is reported."""
        a = _StubCandidate(
            email="john@x.com", full_name="John Smith", phone="111", location="NYC"
        )
        b = _StubCandidate(
            email="JOHN@X.com",
            full_name="Different",
            phone="222",
            location="Boston",
        )
        m = score_pair(a, b)
        assert m is not None
        assert m.reason == "exact_email"

    def test_different_names_dont_match(self):
        a = _StubCandidate(full_name="John Smith", phone="111", location="NYC")
        b = _StubCandidate(full_name="Jane Doe", phone="111", location="NYC")
        assert score_pair(a, b) is None

    def test_different_phones_dont_match_on_phone_rule(self):
        a = _StubCandidate(full_name="John Smith", phone="111", location="NYC")
        b = _StubCandidate(full_name="John Smith", phone="222", location="Boston")
        # name matches, location differs → should fall through to None
        assert score_pair(a, b) is None

    def test_same_id_does_not_match_itself(self):
        a = _StubCandidate(id="x", email="john@x.com", full_name="John Smith")
        b = _StubCandidate(id="x", email="john@x.com", full_name="John Smith")
        assert score_pair(a, b) is None

    def test_missing_signals_dont_false_positive(self):
        """If a candidate has no contact info, we must not match by name alone."""
        a = _StubCandidate(full_name="John Smith")
        b = _StubCandidate(full_name="John Smith")
        assert score_pair(a, b) is None


class TestFindDuplicates:
    def test_empty_input_returns_no_groups(self):
        assert find_duplicates([]) == []
        assert find_duplicates([_StubCandidate()]) == []

    def test_exact_email_pair_creates_one_group(self):
        a = _StubCandidate(id="a", email="john@x.com", full_name="John")
        b = _StubCandidate(id="b", email="JOHN@x.com", full_name="Jonathan")
        groups = find_duplicates([a, b])
        assert len(groups) == 1
        assert {m.id for m in groups[0].members} == {"a", "b"}
        assert groups[0].reason == "exact_email"
        assert groups[0].confidence == 0.95

    def test_three_way_cluster_collapses_into_one_group(self):
        a = _StubCandidate(id="a", email="john@x.com", full_name="John Smith")
        b = _StubCandidate(
            id="b",
            email="JOHN@x.com",
            full_name="John Smith",
            phone="5551234567",
        )
        c = _StubCandidate(
            id="c",
            full_name="John Smith",
            phone="555.123.4567",
            location="NYC",
        )
        # a↔b on email (high), b↔c on name+phone (medium) — both connect the
        # three records into one cluster.
        groups = find_duplicates([a, b, c])
        assert len(groups) == 1
        assert {m.id for m in groups[0].members} == {"a", "b", "c"}
        # The strongest match in the cluster decides the group's headline
        # confidence / reason.
        assert groups[0].reason == "exact_email"
        assert groups[0].confidence == 0.95

    def test_threshold_filters_weak_matches(self):
        a = _StubCandidate(id="a", full_name="John Smith", location="NYC")
        b = _StubCandidate(id="b", full_name="John Smith", location="NYC")
        # name+location = 0.55 — below default threshold of 0.7
        assert find_duplicates([a, b]) == []
        # Lower the threshold to 0.4 and it should appear.
        groups = find_duplicates([a, b], threshold=0.4)
        assert len(groups) == 1
        assert groups[0].reason == "name_location"

    def test_threshold_keeps_name_phone_but_drops_name_location(self):
        a = _StubCandidate(id="a", full_name="John Smith", phone="111", location="X")
        b = _StubCandidate(id="b", full_name="John Smith", phone="111", location="Y")
        c = _StubCandidate(id="c", full_name="John Smith", location="Y")
        groups = find_duplicates([a, b, c])
        # a↔b at 0.75 (name+phone) survives; a↔c and b↔c at 0.55 (name+location
        # but with locations Y vs X) are filtered.  c is unconnected.
        assert len(groups) == 1
        assert {m.id for m in groups[0].members} == {"a", "b"}
        assert groups[0].reason == "name_phone"

    def test_no_false_positives_for_lookalike_records(self):
        a = _StubCandidate(id="a", email="john@x.com", full_name="John Smith")
        b = _StubCandidate(id="b", email="jane@x.com", full_name="John Smith", phone="111")
        c = _StubCandidate(id="c", email="john@x.com", full_name="Different Person")
        # a↔b: name matches but phone/location/email don't align → no match
        # a↔c: email matches (high confidence!) — they ARE duplicates
        # b↔c: different emails AND different names → no match
        groups = find_duplicates([a, b, c])
        assert len(groups) == 1
        assert {m.id for m in groups[0].members} == {"a", "c"}
        assert groups[0].reason == "exact_email"


class TestFindDuplicatesForNew:
    def test_returns_empty_when_no_existing(self):
        new = _StubCandidate(full_name="John Smith")
        assert find_duplicates_for_new(new, []) == []

    def test_skips_self(self):
        a = _StubCandidate(id="x", email="john@x.com", full_name="John")
        b = _StubCandidate(id="x", email="john@x.com", full_name="John")
        matches = find_duplicates_for_new(a, [b])
        assert matches == []

    def test_returns_match_on_email(self):
        new = _StubCandidate(id="new", email="john@x.com", full_name="John")
        existing = _StubCandidate(id="old", email="JOHN@x.com", full_name="Jonathan")
        matches = find_duplicates_for_new(new, [existing])
        assert len(matches) == 1
        assert matches[0].candidate_a.id == "new"
        assert matches[0].candidate_b.id == "old"
        assert matches[0].reason == "exact_email"

    def test_results_sorted_by_confidence_descending(self):
        new = _StubCandidate(
            id="new", email="new@x.com", full_name="John Smith", phone="555"
        )
        # Build existing candidates that match on different rules.
        email_dup = _StubCandidate(
            id="e", email="NEW@x.com", full_name="Other", phone="999"
        )
        phone_dup = _StubCandidate(
            id="p", email="other@x.com", full_name="John Smith", phone="555"
        )
        location_dup = _StubCandidate(
            id="l", email="loc@x.com", full_name="John Smith", phone="000", location="NYC"
        )
        new.location = "NYC"
        # Threshold 0 so the low-confidence name+location match is also
        # included in the result list — the test is about ordering, not
        # threshold filtering.
        matches = find_duplicates_for_new(
            new, [location_dup, email_dup, phone_dup], threshold=0.0
        )
        # Expect them in confidence order.
        assert [m.candidate_b.id for m in matches] == ["e", "p", "l"]
        assert [m.reason for m in matches] == [
            "exact_email",
            "name_phone",
            "name_location",
        ]


# ── Integration tests: through the API ─────────────────────────────────────


@pytest.mark.asyncio
async def test_detect_duplicates_endpoint_finds_groups(candidate_client, engine):
    """The endpoint should return groups for exact-email duplicates in the tenant."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")

    a = await _insert_candidate(
        engine, tenant_id=tenant, email="dup@x.com", full_name="John Smith"
    )
    b = await _insert_candidate(
        engine, tenant_id=tenant, email="DUP@x.com", full_name="Different Name"
    )
    # An unrelated record that should not show up in any group.
    await _insert_candidate(
        engine, tenant_id=tenant, email="solo@x.com", full_name="Solo Person"
    )

    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers,
        json={},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["candidates_scanned"] == 3
    assert body["threshold"] == 0.7
    group = body["groups"][0]
    assert sorted(group["member_ids"]) == sorted([a.id, b.id])
    assert group["reason"] == "exact_email"
    assert group["confidence"] == 0.95


@pytest.mark.asyncio
async def test_detect_duplicates_threshold_can_be_lowered(candidate_client, engine):
    """Lowering the threshold to 0.4 should surface name+location matches."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")

    await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="a@x.com",
        full_name="John Smith",
        location="NYC",
    )
    await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="b@x.com",
        full_name="john smith",
        location="nyc",
    )

    # Default threshold: nothing reported.
    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers,
        json={},
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0

    # Threshold lowered: name+location (0.55) is now reported.
    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers,
        json={"threshold": 0.4},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["threshold"] == 0.4
    assert body["groups"][0]["reason"] == "name_location"


@pytest.mark.asyncio
async def test_detect_duplicates_empty_tenant_returns_no_groups(candidate_client):
    """A tenant with zero candidates should return an empty list, not 404."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")

    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers,
        json={},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["groups"] == []
    assert body["total"] == 0
    assert body["candidates_scanned"] == 0


@pytest.mark.asyncio
async def test_possible_duplicates_for_candidate(candidate_client, engine):
    """GET /{id}/possible-duplicates returns ranked matches for that candidate."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")

    primary = await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="primary@x.com",
        full_name="John Smith",
        phone="5551234567",
    )
    # Exact email match (strongest).
    await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="PRIMARY@x.com",
        full_name="Different Name",
    )
    # Name + phone match.
    await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="other@x.com",
        full_name="John Smith",
        phone="(555) 123-4567",
    )
    # Unrelated record — must not appear.
    await _insert_candidate(
        engine, tenant_id=tenant, email="solo@x.com", full_name="Solo Person"
    )

    resp = await candidate_client.get(
        f"/api/v1/candidates/{primary.id}/possible-duplicates",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["candidate_id"] == primary.id
    assert body["total"] == 2
    reasons = [m["reason"] for m in body["matches"]]
    assert reasons == ["exact_email", "name_phone"]


@pytest.mark.asyncio
async def test_possible_duplicates_404_for_missing_candidate(candidate_client):
    """Asking for duplicates of a non-existent candidate returns 404."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")
    resp = await candidate_client.get(
        f"/api/v1/candidates/{uuid4()}/possible-duplicates",
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_two_candidates_moves_notes_and_deletes_secondary(
    candidate_client, engine
):
    """POST /merge moves activities onto primary and deletes the secondary."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")

    primary = await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="keep@x.com",
        full_name="Keep Person",
        phone="111",
        location="NYC",
    )
    secondary = await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="drop@x.com",
        full_name="Drop Person",
        phone="222",
        location="Boston",
    )
    # Two notes on the secondary that should move to the primary.
    await _insert_note(
        engine,
        tenant_id=tenant,
        candidate_id=secondary.id,
        content="First secondary note",
    )
    await _insert_note(
        engine,
        tenant_id=tenant,
        candidate_id=secondary.id,
        content="Second secondary note",
        title="Important",
    )

    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        headers=headers,
        json={"primary_id": primary.id, "secondary_id": secondary.id},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["secondary_id"] == secondary.id
    assert body["deleted"] is True
    assert body["activities_moved"] >= 2  # may include the auto-log
    assert body["notes_moved"] == 2
    # Primary data filled in from secondary where it was missing.
    assert body["primary"]["email"] == primary.email
    # The secondary is gone.
    assert body["primary"]["id"] == primary.id

    # The primary's notes list should now contain the secondary's notes.
    notes_resp = await candidate_client.get(
        f"/api/v1/candidates/{primary.id}/notes",
        headers=headers,
    )
    assert notes_resp.status_code == 200
    note_contents = {n["content"] for n in notes_resp.json()["data"]}
    assert "First secondary note" in note_contents
    assert "Second secondary note" in note_contents

    # And the secondary should return 404 on a direct GET.
    get_resp = await candidate_client.get(
        f"/api/v1/candidates/{secondary.id}",
        headers=headers,
    )
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_field_preferences_pick_secondary_value(candidate_client, engine):
    """``field_preferences`` lets the caller force a specific side to win."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")

    primary = await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="primary@x.com",
        full_name="Primary",
        phone="111-111-1111",
        location="NYC",
    )
    secondary = await _insert_candidate(
        engine,
        tenant_id=tenant,
        email="secondary@x.com",
        full_name="Secondary",
        phone="222-222-2222",
        location="Boston",
    )

    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        headers=headers,
        json={
            "primary_id": primary.id,
            "secondary_id": secondary.id,
            "field_preferences": {"phone": "secondary", "location": "primary"},
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Phone explicitly preferred from secondary.
    assert body["primary"]["phone"] == "222-222-2222"
    # Location explicitly preferred from primary (which already had NYC).
    assert body["primary"]["location"] == "NYC"


@pytest.mark.asyncio
async def test_merge_rejects_same_id(candidate_client):
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")
    cid = str(uuid4())
    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        headers=headers,
        json={"primary_id": cid, "secondary_id": cid},
    )
    assert resp.status_code == 400
    assert "different" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_merge_404_for_missing_candidate(candidate_client):
    """A merge request for a non-existent primary returns 404."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="recruiter")
    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        headers=headers,
        json={"primary_id": str(uuid4()), "secondary_id": str(uuid4())},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_merge_tenant_isolation(candidate_client, engine):
    """Tenant B cannot merge Tenant A's candidates — secondary 404s first."""
    tenant_a = f"tenant-a-{uuid4().hex[:8]}"
    tenant_b = f"tenant-b-{uuid4().hex[:8]}"

    # Tenant A owns both candidates.
    primary = await _insert_candidate(
        engine, tenant_id=tenant_a, email="p@a.com", full_name="P"
    )
    secondary = await _insert_candidate(
        engine, tenant_id=tenant_a, email="s@a.com", full_name="S"
    )

    # Tenant B's token is rejected: the primary doesn't exist for them.
    headers_b = _auth(tenant_b, role="recruiter")
    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        headers=headers_b,
        json={"primary_id": primary.id, "secondary_id": secondary.id},
    )
    assert resp.status_code == 404

    # Tenant A still owns both records.
    headers_a = _auth(tenant_a, role="recruiter")
    list_resp = await candidate_client.get(
        "/api/v1/candidates/",
        headers=headers_a,
    )
    assert list_resp.status_code == 200
    ids = {c["id"] for c in list_resp.json()["data"]}
    assert {primary.id, secondary.id}.issubset(ids)


@pytest.mark.asyncio
async def test_detect_duplicates_tenant_isolation(candidate_client, engine):
    """Tenant B's duplicates must not leak into Tenant A's report."""
    tenant_a = f"tenant-a-{uuid4().hex[:8]}"
    tenant_b = f"tenant-b-{uuid4().hex[:8]}"

    # Tenant A: a single unique candidate.
    await _insert_candidate(
        engine, tenant_id=tenant_a, email="a@a.com", full_name="A Person"
    )
    # Tenant B: a clear email duplicate pair.
    await _insert_candidate(
        engine, tenant_id=tenant_b, email="dup@b.com", full_name="B Person"
    )
    await _insert_candidate(
        engine, tenant_id=tenant_b, email="DUP@b.com", full_name="Other B"
    )

    headers_a = _auth(tenant_a, role="recruiter")
    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers_a,
        json={},
    )
    assert resp.status_code == 200
    body = resp.json()
    # Tenant A only has one candidate, so no groups.
    assert body["total"] == 0
    assert body["candidates_scanned"] == 1

    # Tenant B sees their pair.
    headers_b = _auth(tenant_b, role="recruiter")
    resp_b = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers_b,
        json={},
    )
    assert resp_b.status_code == 200
    assert resp_b.json()["total"] == 1


@pytest.mark.asyncio
async def test_possible_duplicates_tenant_isolation(candidate_client, engine):
    """Tenant A's candidate must not see Tenant B's duplicates."""
    tenant_a = f"tenant-a-{uuid4().hex[:8]}"
    tenant_b = f"tenant-b-{uuid4().hex[:8]}"

    primary = await _insert_candidate(
        engine, tenant_id=tenant_a, email="p@a.com", full_name="Same Name"
    )
    # Tenant B has a record with the same email but a different tenant — it
    # must never show up as a "possible duplicate" for tenant A.
    await _insert_candidate(
        engine, tenant_id=tenant_b, email="P@a.com", full_name="Other Tenant"
    )

    headers_a = _auth(tenant_a, role="recruiter")
    resp = await candidate_client.get(
        f"/api/v1/candidates/{primary.id}/possible-duplicates",
        headers=headers_a,
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


@pytest.mark.asyncio
async def test_endpoints_require_auth(candidate_client):
    """The new endpoints must reject unauthenticated callers with 401."""
    # No Authorization header at all.
    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates", json={}
    )
    assert resp.status_code == 401

    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        json={"primary_id": "x", "secondary_id": "y"},
    )
    assert resp.status_code == 401

    resp = await candidate_client.get(
        f"/api/v1/candidates/{uuid4()}/possible-duplicates"
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_endpoints_reject_viewer_role(candidate_client, engine):
    """The endpoints require member+ — a viewer token is rejected with 403."""
    tenant = f"tenant-{uuid4().hex[:8]}"
    headers = _auth(tenant, role="viewer")
    await _insert_candidate(
        engine, tenant_id=tenant, email="a@x.com", full_name="A"
    )

    resp = await candidate_client.post(
        "/api/v1/candidates/detect-duplicates",
        headers=headers,
        json={},
    )
    assert resp.status_code == 403

    resp = await candidate_client.post(
        "/api/v1/candidates/merge",
        headers=headers,
        json={"primary_id": "x", "secondary_id": "y"},
    )
    assert resp.status_code == 403
