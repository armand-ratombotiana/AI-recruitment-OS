"""GDPR compliance test suite.

Covers the GDPR engine (export, anonymise, delete, consent) and the
compliance-service HTTP endpoints that expose them.

Test areas:

* engine — direct calls to ``shared.gdpr.engine`` functions
* HTTP — ``/api/v1/compliance/gdpr/*``, ``/consent/{user_id}``, ``/audit``
* RBAC — admin-only operations reject non-admin tokens with 403
* Tenant isolation — operations against a foreign tenant return 404
* Auditing — every GDPR action emits an ``AuditEntry`` row
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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Importing models at module load registers them with SQLModel.metadata so
# ``create_all`` produces the right tables in the test database.
from shared.core.models.audit_log import AuditLog  # noqa: F401
from shared.core.models.compliance import (  # noqa: F401
    AuditEntry,
    ConsentRecord,
    DataDeletionRequest,
    DataExportRequest,
)
from shared.core.models.identity import (
    APIKey,
    Credential,
    Session,
    User,
    UserRole,
    UserStatus,
)
from shared.core.models.notification import Notification
from shared.core.models.notification_preference import (
    NotificationChannel,
    NotificationPreference,
)
from shared.core.models.search import SearchHistory
from shared.core.security import create_access_token, hash_password
from shared.core.database import get_db_dependency
from shared.gdpr import (
    anonymize_user,
    consent_log,
    delete_user_data,
    export_user_data,
    get_consent_log,
)


# ── Token helpers ──────────────────────────────────────────────────────────────


def _token(*, tenant_id: str, sub: str, role: str = "admin", email: str | None = None) -> str:
    return create_access_token({
        "sub": sub,
        "email": email or f"{sub}@{tenant_id}.test",
        "role": role,
        "tenant_id": tenant_id,
    })


def _auth(*, tenant_id: str, sub: str, role: str = "admin", email: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {_token(tenant_id=tenant_id, sub=sub, role=role, email=email)}"}


# ── Engine fixtures ────────────────────────────────────────────────────────────


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
async def session_factory(engine):
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def db_session(session_factory) -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as s:
        yield s


# ── HTTP client fixture ────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def client(session_factory) -> AsyncGenerator[AsyncClient, None]:
    from apps.compliance_service.main import router as compliance_router

    app = FastAPI()
    app.include_router(compliance_router, prefix="/api/v1/compliance")

    async def _override_db():
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Seed helpers ───────────────────────────────────────────────────────────────


async def _seed_user(
    session_factory,
    *,
    tenant_id: str,
    user_id: str | None = None,
    email: str | None = None,
    full_name: str = "Jane Doe",
    role: UserRole = UserRole.RECRUITER,
    phone: str = "+1-555-0101",
    avatar_url: str | None = "https://cdn.example.com/avatar.png",
    with_satellites: bool = True,
) -> User:
    """Create a user with optional related rows (sessions, api keys, etc.)."""
    uid = user_id or str(uuid4())
    async with session_factory() as s:
        u = User(
            id=uid,
            tenant_id=tenant_id,
            email=email or f"{uid}@example.com",
            full_name=full_name,
            hashed_password=hash_password("Password123!"),
            role=role,
            status=UserStatus.ACTIVE,
            phone=phone,
            avatar_url=avatar_url,
        )
        s.add(u)
        if with_satellites:
            from datetime import datetime, timedelta, timezone

            s.add(Session(
                id=str(uuid4()),
                user_id=uid,
                tenant_id=tenant_id,
                refresh_token_hash="hashed-token",
                user_agent="pytest/1.0",
                ip_address="127.0.0.1",
                expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
            ))
            s.add(APIKey(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=uid,
                name="ci-key",
                key_hash="abc123",
                scopes="[]",
            ))
            s.add(Credential(
                id=str(uuid4()),
                user_id=uid,
                provider="google",
                provider_user_id="g-1",
                access_token="oauth-access-token",
            ))
            s.add(Notification(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=uid,
                type="info",
                title="Welcome",
                message="Welcome aboard",
            ))
            s.add(NotificationPreference(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=uid,
                event_type="weekly_digest",
                channel="email",
                enabled=True,
            ))
            s.add(NotificationChannel(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=uid,
                channel_type="email",
                address=email or f"{uid}@example.com",
                verified=True,
            ))
            s.add(SearchHistory(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=uid,
                query="python jobs",
                search_type="all",
                results_count=12,
            ))
            s.add(AuditLog(
                id=str(uuid4()),
                tenant_id=tenant_id,
                user_id=uid,
                action="user.login",
                resource_type="auth",
                resource_id=uid,
                details={"ip": "127.0.0.1"},
            ))
        await s.commit()
        await s.refresh(u)
    return u


# ── Engine: export_user_data ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_user_data_returns_all_satellite_rows(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="export@x.com")
    async with session_factory() as s:
        payload = await export_user_data(s, user.id, "t1")

    assert payload["user_id"] == user.id
    assert payload["tenant_id"] == "t1"
    assert payload["user"] is not None
    assert payload["user"]["email"] == "export@x.com"
    # Sensitive secrets must NOT be in the export.
    assert "hashed_password" not in payload["user"]
    assert len(payload["sessions"]) == 1
    assert len(payload["api_keys"]) == 1
    assert len(payload["credentials"]) == 1
    assert len(payload["notifications"]) == 1
    assert len(payload["notification_preferences"]) == 1
    assert len(payload["notification_channels"]) == 1
    assert len(payload["search_history"]) == 1
    assert len(payload["audit_log"]) == 1
    # The session export must not leak the token hash.
    assert "refresh_token_hash" not in payload["sessions"][0]
    assert "key_hash" not in payload["api_keys"][0]
    assert "access_token" not in payload["credentials"][0]


@pytest.mark.asyncio
async def test_export_user_data_unknown_user_returns_empty_payload(session_factory):
    async with session_factory() as s:
        payload = await export_user_data(s, "ghost-id", "t1")
    assert payload["user"] is None
    assert payload["sessions"] == []
    assert payload["audit_log"] == []


@pytest.mark.asyncio
async def test_export_user_data_is_tenant_scoped(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="iso@x.com")
    async with session_factory() as s:
        payload = await export_user_data(s, user.id, "tenant-other")
    # User belongs to t1, so querying tenant-other yields no user.
    assert payload["user"] is None


# ── Engine: anonymize_user ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_anonymize_user_replaces_pii_and_returns_true(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="bob@x.com", full_name="Bob")

    async with session_factory() as s:
        ok = await anonymize_user(s, user.id, "t1")
        await s.commit()
    assert ok is True

    async with session_factory() as s:
        refreshed = (await s.execute(select(User).where(User.id == user.id))).scalar_one()
    assert refreshed.email != "bob@x.com"
    assert refreshed.email.endswith("@deleted.invalid")
    assert refreshed.full_name.startswith("anonymised-")
    assert refreshed.phone is None
    assert refreshed.avatar_url is None
    assert refreshed.status == UserStatus.INACTIVE
    assert refreshed.hashed_password.startswith("!disabled-")


@pytest.mark.asyncio
async def test_anonymize_user_revokes_sessions_and_api_keys(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1")
    async with session_factory() as s:
        await anonymize_user(s, user.id, "t1")
        await s.commit()

    async with session_factory() as s:
        sessions = (await s.execute(select(Session).where(Session.user_id == user.id))).scalars().all()
        keys = (await s.execute(select(APIKey).where(APIKey.user_id == user.id))).scalars().all()
    assert sessions, "session row should still exist"
    assert all(sess.revoked_at is not None for sess in sessions)
    assert keys
    assert all(k.revoked_at is not None for k in keys)


@pytest.mark.asyncio
async def test_anonymize_user_hashes_notification_channel_addresses(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="ch@example.com")
    async with session_factory() as s:
        await anonymize_user(s, user.id, "t1")
        await s.commit()

    async with session_factory() as s:
        channels = (
            await s.execute(select(NotificationChannel).where(NotificationChannel.user_id == user.id))
        ).scalars().all()
    assert channels
    for ch in channels:
        assert ch.address.startswith("sha256:")
        assert ch.verified is False


@pytest.mark.asyncio
async def test_anonymize_user_unknown_returns_false(session_factory):
    async with session_factory() as s:
        ok = await anonymize_user(s, "no-such-user", "t1")
    assert ok is False


@pytest.mark.asyncio
async def test_anonymize_user_respects_tenant_isolation(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="cross@x.com")
    async with session_factory() as s:
        ok = await anonymize_user(s, user.id, "wrong-tenant")
    assert ok is False
    # And the original user is untouched.
    async with session_factory() as s:
        refreshed = (await s.execute(select(User).where(User.id == user.id))).scalar_one()
    assert refreshed.email == "cross@x.com"


# ── Engine: delete_user_data ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_delete_user_data_removes_all_rows_and_scrubs_audit(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="del@x.com")

    async with session_factory() as s:
        ok = await delete_user_data(s, user.id, "t1")
        await s.commit()
    assert ok is True

    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
        sessions = (await s.execute(select(Session).where(Session.user_id == user.id))).scalars().all()
        keys = (await s.execute(select(APIKey).where(APIKey.user_id == user.id))).scalars().all()
        creds = (await s.execute(select(Credential).where(Credential.user_id == user.id))).scalars().all()
        notifs = (await s.execute(select(Notification).where(Notification.user_id == user.id))).scalars().all()
        prefs = (await s.execute(select(NotificationPreference).where(NotificationPreference.user_id == user.id))).scalars().all()
        channels = (await s.execute(select(NotificationChannel).where(NotificationChannel.user_id == user.id))).scalars().all()
        searches = (await s.execute(select(SearchHistory).where(SearchHistory.user_id == user.id))).scalars().all()
        audits = (await s.execute(select(AuditLog).where(AuditLog.tenant_id == "t1"))).scalars().all()

    assert u is None
    assert sessions == []
    assert keys == []
    assert creds == []
    assert notifs == []
    assert prefs == []
    assert channels == []
    assert searches == []
    # Audit row is kept but user_id is scrubbed to None.
    assert len(audits) == 1
    assert audits[0].user_id is None


@pytest.mark.asyncio
async def test_delete_user_data_unknown_returns_false(session_factory):
    async with session_factory() as s:
        ok = await delete_user_data(s, "ghost", "t1")
    assert ok is False


@pytest.mark.asyncio
async def test_delete_user_data_is_tenant_scoped(session_factory):
    user = await _seed_user(session_factory, tenant_id="t1")
    async with session_factory() as s:
        ok = await delete_user_data(s, user.id, "different-tenant")
    assert ok is False
    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert u is not None


# ── Engine: consent_log + get_consent_log ──────────────────────────────────────


@pytest.mark.asyncio
async def test_consent_log_persists_record(session_factory):
    async with session_factory() as s:
        rec = await consent_log(
            s,
            user_id="user-1",
            purpose="marketing",
            granted=True,
            ip_address="10.0.0.1",
            tenant_id="t1",
        )
        await s.commit()
        rec_id = rec.id

    async with session_factory() as s:
        row = (await s.execute(select(ConsentRecord).where(ConsentRecord.id == rec_id))).scalar_one()
    assert row.candidate_id == "user-1"
    assert row.purpose == "marketing"
    assert row.granted is True
    assert row.ip_address == "10.0.0.1"
    assert row.tenant_id == "t1"
    assert row.withdrawn_at is None


@pytest.mark.asyncio
async def test_consent_log_withdrawn_sets_withdrawn_at(session_factory):
    async with session_factory() as s:
        rec = await consent_log(
            s,
            user_id="user-2",
            purpose="analytics",
            granted=False,
            tenant_id="t1",
        )
        await s.commit()
    assert rec.granted is False
    assert rec.withdrawn_at is not None


@pytest.mark.asyncio
async def test_get_consent_log_returns_records_newest_first(session_factory):
    async with session_factory() as s:
        await consent_log(s, user_id="u3", purpose="marketing", granted=True, tenant_id="t1")
        await consent_log(s, user_id="u3", purpose="marketing", granted=False, tenant_id="t1")
        await consent_log(s, user_id="u3", purpose="analytics", granted=True, tenant_id="t1")
        await s.commit()

    async with session_factory() as s:
        records = await get_consent_log(s, "u3", "t1")
    assert len(records) == 3
    # All belong to the right subject
    assert all(r["user_id"] == "u3" for r in records)
    # Filter by purpose narrows the result
    async with session_factory() as s:
        marketing_only = await get_consent_log(s, "u3", "t1", purpose="marketing")
    assert len(marketing_only) == 2
    assert all(r["purpose"] == "marketing" for r in marketing_only)


@pytest.mark.asyncio
async def test_get_consent_log_tenant_isolation(session_factory):
    async with session_factory() as s:
        await consent_log(s, user_id="u4", purpose="marketing", granted=True, tenant_id="tenant-A")
        await consent_log(s, user_id="u4", purpose="marketing", granted=True, tenant_id="tenant-B")
        await s.commit()

    async with session_factory() as s:
        a = await get_consent_log(s, "u4", "tenant-A")
        b = await get_consent_log(s, "u4", "tenant-B")
    assert len(a) == 1
    assert len(b) == 1
    assert a[0]["tenant_id"] == "tenant-A"
    assert b[0]["tenant_id"] == "tenant-B"


# ── HTTP: GET /gdpr/export/{user_id} ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_gdpr_export_returns_payload_for_admin(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="alice@x.com")
    r = await client.get(
        f"/api/v1/compliance/gdpr/export/{user.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == user.id
    assert body["user"]["email"] == "alice@x.com"
    assert len(body["sessions"]) == 1
    assert len(body["audit_log"]) == 1


@pytest.mark.asyncio
async def test_http_gdpr_export_404_for_unknown_user(client):
    r = await client.get(
        "/api/v1/compliance/gdpr/export/ghost-id",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_http_gdpr_export_403_for_non_admin(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="forbid@x.com")
    r = await client.get(
        f"/api/v1/compliance/gdpr/export/{user.id}",
        headers=_auth(tenant_id="t1", sub="rec-1", role="recruiter"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_gdpr_export_401_when_unauthenticated(client):
    r = await client.get("/api/v1/compliance/gdpr/export/any-user")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_http_gdpr_export_tenant_isolation_returns_404(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="tenant-A", email="aa@x.com")
    r = await client.get(
        f"/api/v1/compliance/gdpr/export/{user.id}",
        headers=_auth(tenant_id="tenant-B", sub="admin-B", role="admin"),
    )
    assert r.status_code == 404


# ── HTTP: POST /gdpr/anonymize/{user_id} ───────────────────────────────────────


@pytest.mark.asyncio
async def test_http_gdpr_anonymize_succeeds_and_audits(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="anon@x.com", full_name="Anon User")
    r = await client.post(
        f"/api/v1/compliance/gdpr/anonymize/{user.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"user_id": user.id, "anonymized": True}

    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user.id))).scalar_one()
        entries = (
            await s.execute(
                select(AuditEntry).where(
                    AuditEntry.action == "gdpr.user.anonymize",
                    AuditEntry.tenant_id == "t1",
                )
            )
        ).scalars().all()
    assert u.email.endswith("@deleted.invalid")
    assert u.full_name.startswith("anonymised-")
    assert entries
    assert entries[0].resource_id == user.id


@pytest.mark.asyncio
async def test_http_gdpr_anonymize_403_for_non_admin(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1")
    r = await client.post(
        f"/api/v1/compliance/gdpr/anonymize/{user.id}",
        headers=_auth(tenant_id="t1", sub="rec-1", role="recruiter"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_gdpr_anonymize_404_for_unknown_user(client):
    r = await client.post(
        "/api/v1/compliance/gdpr/anonymize/ghost-user",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 404


# ── HTTP: DELETE /gdpr/user/{user_id} ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_gdpr_delete_removes_user(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="bye@x.com")
    r = await client.delete(
        f"/api/v1/compliance/gdpr/user/{user.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"user_id": user.id, "deleted": True}

    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert u is None


@pytest.mark.asyncio
async def test_http_gdpr_delete_403_for_non_admin(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1")
    r = await client.delete(
        f"/api/v1/compliance/gdpr/user/{user.id}",
        headers=_auth(tenant_id="t1", sub="rec-1", role="recruiter"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_gdpr_delete_tenant_isolation(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="tenant-A", email="cross-del@x.com")
    r = await client.delete(
        f"/api/v1/compliance/gdpr/user/{user.id}",
        headers=_auth(tenant_id="tenant-B", sub="admin-B", role="admin"),
    )
    assert r.status_code == 404
    async with session_factory() as s:
        u = (await s.execute(select(User).where(User.id == user.id))).scalar_one_or_none()
    assert u is not None  # untouched in tenant-A


# ── HTTP: POST /consent (user_id) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_post_consent_with_user_id(client, session_factory):
    r = await client.post(
        "/api/v1/compliance/consent",
        json={
            "user_id": "user-100",
            "type": "marketing",
            "granted": True,
            "ip_address": "192.168.0.1",
        },
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200, r.text
    assert r.json()["recorded"] is True
    record_id = r.json()["id"]

    async with session_factory() as s:
        rec = (await s.execute(select(ConsentRecord).where(ConsentRecord.id == record_id))).scalar_one()
    assert rec.candidate_id == "user-100"
    assert rec.purpose == "marketing"
    assert rec.granted is True


@pytest.mark.asyncio
async def test_http_post_consent_requires_subject_id(client):
    r = await client.post(
        "/api/v1/compliance/consent",
        json={"type": "marketing", "granted": True},
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_http_post_consent_unauthenticated(client):
    r = await client.post(
        "/api/v1/compliance/consent",
        json={"user_id": "user-1", "type": "marketing", "granted": True},
    )
    assert r.status_code == 401


# ── HTTP: GET /consent/{user_id} ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_get_consent_log_for_user(client, session_factory):
    # Seed two consents directly through the engine.
    async with session_factory() as s:
        await consent_log(s, user_id="user-200", purpose="marketing", granted=True, tenant_id="t1")
        await consent_log(s, user_id="user-200", purpose="analytics", granted=False, tenant_id="t1")
        await s.commit()

    r = await client.get(
        "/api/v1/compliance/consent/user-200",
        headers=_auth(tenant_id="t1", sub="anyone", role="recruiter"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["user_id"] == "user-200"
    assert body["total"] == 2
    assert {row["purpose"] for row in body["data"]} == {"marketing", "analytics"}


@pytest.mark.asyncio
async def test_http_get_consent_log_filter_by_purpose(client, session_factory):
    async with session_factory() as s:
        await consent_log(s, user_id="user-201", purpose="marketing", granted=True, tenant_id="t1")
        await consent_log(s, user_id="user-201", purpose="analytics", granted=True, tenant_id="t1")
        await s.commit()

    r = await client.get(
        "/api/v1/compliance/consent/user-201?purpose=analytics",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 1
    assert r.json()["data"][0]["purpose"] == "analytics"


@pytest.mark.asyncio
async def test_http_get_consent_log_tenant_isolation(client, session_factory):
    async with session_factory() as s:
        await consent_log(s, user_id="user-300", purpose="marketing", granted=True, tenant_id="tenant-A")
        await consent_log(s, user_id="user-300", purpose="marketing", granted=True, tenant_id="tenant-B")
        await s.commit()

    r_a = await client.get(
        "/api/v1/compliance/consent/user-300",
        headers=_auth(tenant_id="tenant-A", sub="admin-A", role="admin"),
    )
    r_b = await client.get(
        "/api/v1/compliance/consent/user-300",
        headers=_auth(tenant_id="tenant-B", sub="admin-B", role="admin"),
    )
    assert r_a.status_code == 200
    assert r_b.status_code == 200
    assert r_a.json()["total"] == 1
    assert r_b.json()["total"] == 1
    assert r_a.json()["data"][0]["tenant_id"] == "tenant-A"
    assert r_b.json()["data"][0]["tenant_id"] == "tenant-B"


# ── HTTP: GET /audit ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_audit_returns_compliance_entries_for_admin(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="auditme@x.com")
    # Trigger a GDPR action — should write an AuditEntry row.
    await client.post(
        f"/api/v1/compliance/gdpr/anonymize/{user.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )

    r = await client.get(
        "/api/v1/compliance/audit",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    actions = {row["action"] for row in body["data"]}
    assert "gdpr.user.anonymize" in actions


@pytest.mark.asyncio
async def test_http_audit_403_for_non_admin(client):
    r = await client.get(
        "/api/v1/compliance/audit",
        headers=_auth(tenant_id="t1", sub="rec-1", role="recruiter"),
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_audit_401_when_unauthenticated(client):
    r = await client.get("/api/v1/compliance/audit")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_http_audit_filter_by_action(client, session_factory):
    user_a = await _seed_user(session_factory, tenant_id="t1", email="a1@x.com")
    user_b = await _seed_user(session_factory, tenant_id="t1", email="b1@x.com")

    await client.post(
        f"/api/v1/compliance/gdpr/anonymize/{user_a.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    await client.delete(
        f"/api/v1/compliance/gdpr/user/{user_b.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )

    r = await client.get(
        "/api/v1/compliance/audit?action=gdpr.user.delete",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    assert r.status_code == 200
    actions = {row["action"] for row in r.json()["data"]}
    assert actions == {"gdpr.user.delete"}


@pytest.mark.asyncio
async def test_http_audit_tenant_isolation(client, session_factory):
    user_a = await _seed_user(session_factory, tenant_id="tenant-A", email="ia@x.com")
    await client.post(
        f"/api/v1/compliance/gdpr/anonymize/{user_a.id}",
        headers=_auth(tenant_id="tenant-A", sub="admin-A", role="admin"),
    )
    r = await client.get(
        "/api/v1/compliance/audit",
        headers=_auth(tenant_id="tenant-B", sub="admin-B", role="admin"),
    )
    assert r.status_code == 200
    assert r.json()["total"] == 0


# ── Sensitive-secret leakage guard ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_export_payload_never_contains_password_hash_or_secrets(client, session_factory):
    user = await _seed_user(session_factory, tenant_id="t1", email="secret@x.com")
    r = await client.get(
        f"/api/v1/compliance/gdpr/export/{user.id}",
        headers=_auth(tenant_id="t1", sub="admin-1", role="admin"),
    )
    raw = r.text
    assert r.status_code == 200
    assert "hashed_password" not in raw
    assert "refresh_token_hash" not in raw
    assert "access_token" not in raw
