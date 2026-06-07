"""Tests for API key management.

Covers:

* ``shared.api_keys.manager`` — key generation, hashing, persistence,
  revocation, listing, authentication, and expiration.
* ``apps.api_keys.main`` — full HTTP lifecycle of the management endpoints.
* Tenant isolation — keys for one tenant must be invisible to another.
* API-key-based authentication — ``Authorization: Bearer airos_<key>``
  resolves to the owning user and respects revocation / expiration.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from shared.api_keys import manager
from shared.core.config import Settings, get_settings
from shared.core.database import get_db_dependency
from shared.core.models.api_key import ApiKey
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.security import create_access_token, hash_password

from apps.api_keys.main import router as api_keys_router


# ── Fixtures ──────────────────────────────────────────────────────────────────


TEST_PASSWORD = "SuperSecret123!"


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
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
async def app_and_client(session_factory):
    app = FastAPI()
    app.include_router(api_keys_router)
    app.dependency_overrides[get_settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
        DEMO_ENABLED=False,
    )

    async def _override_db():
        async with session_factory() as s:
            yield s

    app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield app, c


async def _create_user(
    session_factory,
    *,
    email: str,
    tenant_id: str = "acme",
    password: str = TEST_PASSWORD,
    full_name: str = "API Key User",
    role: UserRole = UserRole.RECRUITER,
) -> User:
    async with session_factory() as s:
        u = User(
            email=email,
            tenant_id=tenant_id,
            full_name=full_name,
            hashed_password=hash_password(password),
            role=role,
            status=UserStatus.ACTIVE,
            email_verified=True,
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
    return u


async def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(
        {
            "sub": user.id,
            "email": user.email,
            "role": user.role.value,
            "tenant_id": user.tenant_id,
        }
    )
    return {"Authorization": f"Bearer {token}"}


# ── shared.api_keys.manager unit tests ──────────────────────────────────────


def test_generate_key_format_and_uniqueness():
    full, prefix, digest = manager.generate_key()
    assert full.startswith("airos_")
    assert len(prefix) == manager._PREFIX_LEN
    assert len(digest) == 64
    # Prefix in the metadata should be the first chars of the random part
    # (i.e. the part after the ``airos_`` marker).
    random_part = full[len("airos_"):]
    assert random_part.startswith(prefix)
    # Two consecutive keys must differ.
    other, _, _ = manager.generate_key()
    assert full != other


def test_verify_key_accepts_match_and_rejects_others():
    full, _, digest = manager.generate_key()
    assert manager.verify_key(full, digest) is True
    assert manager.verify_key(full + "x", digest) is False
    assert manager.verify_key("not-a-key", digest) is False
    assert manager.verify_key("", digest) is False
    assert manager.verify_key(full, "") is False


@pytest.mark.asyncio
async def test_create_api_key_persists_and_returns_plaintext(session_factory):
    user = await _create_user(session_factory, email="creator@acme.com")
    async with session_factory() as s:
        record, full_key = await manager.create_api_key(
            s,
            user_id=user.id,
            tenant_id=user.tenant_id,
            name="my key",
            scopes=["candidates:read", "jobs:write"],
            expires_in_days=30,
        )
        await s.commit()
        await s.refresh(record)
        record_id = record.id
        record_prefix = record.key_prefix

    assert full_key.startswith("airos_")
    assert manager.verify_key(full_key, record.key_hash) is True

    async with session_factory() as s:
        fresh = (await s.execute(select(ApiKey).where(ApiKey.id == record_id))).scalar_one()
        assert fresh.user_id == user.id
        assert fresh.tenant_id == "acme"
        assert fresh.name == "my key"
        assert fresh.key_prefix == record_prefix
        assert fresh.revoked is False
        assert fresh.expires_at is not None
        assert fresh.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)
        assert json.loads(fresh.scopes) == ["candidates:read", "jobs:write"]


@pytest.mark.asyncio
async def test_create_api_key_without_expiration(session_factory):
    user = await _create_user(session_factory, email="never-expire@acme.com")
    async with session_factory() as s:
        record, _ = await manager.create_api_key(
            s, user_id=user.id, tenant_id=user.tenant_id, name="forever"
        )
        await s.commit()
        await s.refresh(record)
    assert record.expires_at is None
    assert manager.is_expired(record) is False


@pytest.mark.asyncio
async def test_list_api_keys_filters_by_tenant_and_user(session_factory):
    user_acme = await _create_user(session_factory, email="a@acme.com", tenant_id="acme")
    user_other = await _create_user(session_factory, email="b@other.com", tenant_id="other")

    async with session_factory() as s:
        for name in ("alpha", "beta", "gamma"):
            await manager.create_api_key(
                s, user_id=user_acme.id, tenant_id=user_acme.tenant_id, name=name
            )
        await manager.create_api_key(
            s, user_id=user_other.id, tenant_id=user_other.tenant_id, name="other-key"
        )
        await s.commit()

    async with session_factory() as s:
        acme_keys = await manager.list_api_keys(s, "acme")
        other_keys = await manager.list_api_keys(s, "other")
        acme_for_a = await manager.list_api_keys(s, "acme", user_id=user_acme.id)
        acme_for_b = await manager.list_api_keys(s, "acme", user_id=user_other.id)

    assert len(acme_keys) == 3
    assert len(other_keys) == 1
    assert len(acme_for_a) == 3
    assert len(acme_for_b) == 0
    # Newest first.
    assert acme_keys[0].name == "gamma"
    assert acme_keys[-1].name == "alpha"


@pytest.mark.asyncio
async def test_revoke_api_key_only_targets_tenant(session_factory):
    user_acme = await _create_user(session_factory, email="rev@acme.com", tenant_id="acme")
    user_other = await _create_user(session_factory, email="rev@other.com", tenant_id="other")

    async with session_factory() as s:
        rec_acme, _ = await manager.create_api_key(
            s, user_id=user_acme.id, tenant_id="acme", name="acme-k"
        )
        rec_other, _ = await manager.create_api_key(
            s, user_id=user_other.id, tenant_id="other", name="other-k"
        )
        await s.commit()
        acme_id = rec_acme.id
        other_id = rec_other.id

    # Revoking with the wrong tenant must NOT touch the row.
    async with session_factory() as s:
        ok = await manager.revoke_api_key(s, other_id, "acme")
        await s.commit()
    assert ok is False

    async with session_factory() as s:
        other_rec = (await s.execute(select(ApiKey).where(ApiKey.id == other_id))).scalar_one()
        assert other_rec.revoked is False

    # Revoke with the right tenant.
    async with session_factory() as s:
        ok = await manager.revoke_api_key(s, acme_id, "acme")
        await s.commit()
    assert ok is True

    async with session_factory() as s:
        rec = (await s.execute(select(ApiKey).where(ApiKey.id == acme_id))).scalar_one()
        assert rec.revoked is True

    # Revoke a non-existent id.
    async with session_factory() as s:
        assert await manager.revoke_api_key(s, "missing", "acme") is False


@pytest.mark.asyncio
async def test_authenticate_api_key_valid_revoked_expired(session_factory):
    user = await _create_user(session_factory, email="auth@acme.com")

    # Valid key
    async with session_factory() as s:
        good, good_plain = await manager.create_api_key(
            s, user_id=user.id, tenant_id=user.tenant_id, name="good"
        )
        revoked, revoked_plain = await manager.create_api_key(
            s, user_id=user.id, tenant_id=user.tenant_id, name="revoked"
        )
        expired, expired_plain = await manager.create_api_key(
            s,
            user_id=user.id,
            tenant_id=user.tenant_id,
            name="expired",
            expires_in_days=-1,
        )
        await s.commit()
        revoked_id = revoked.id
        expired_id = expired.id

    async with session_factory() as s:
        resolved = await manager.authenticate_api_key(s, good_plain)
        assert resolved is not None
        assert resolved.id == good.id

        assert await manager.authenticate_api_key(s, revoked_plain) is None
        assert await manager.authenticate_api_key(s, expired_plain) is None
        assert await manager.authenticate_api_key(s, "airos_bogus") is None
        assert await manager.authenticate_api_key(s, "not-prefixed") is None
        assert await manager.authenticate_api_key(s, "") is None

    # Revoke and re-check.
    async with session_factory() as s:
        await manager.revoke_api_key(s, revoked_id, "acme")
        await s.commit()
    async with session_factory() as s:
        assert await manager.authenticate_api_key(s, revoked_plain) is None

    # An expired key should also be considered unauthenticatable.
    async with session_factory() as s:
        await manager.revoke_api_key(s, expired_id, "acme")
        await s.commit()


# ── HTTP endpoint tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_list_create_revoke_flow(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="flow@acme.com")
    headers = await _auth_headers(user)

    # Empty list.
    r = await c.get("/", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body == {"data": [], "total": 0}

    # Create one.
    r = await c.post(
        "/",
        headers=headers,
        json={"name": "integration", "scopes": ["candidates:read"]},
    )
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["key"]["name"] == "integration"
    assert created["key"]["key_prefix"]  # non-empty
    assert created["key"]["scopes"] == ["candidates:read"]
    full_key = created["full_key"]
    assert full_key.startswith("airos_")
    assert "Store this key securely" in created["warning"]
    key_id = created["key"]["id"]

    # Listing now returns the key.
    r = await c.get("/", headers=headers)
    body = r.json()
    assert body["total"] == 1
    assert body["data"][0]["id"] == key_id

    # Get by id.
    r = await c.get(f"/{key_id}", headers=headers)
    assert r.status_code == 200
    assert r.json()["id"] == key_id

    # Update.
    r = await c.put(
        f"/{key_id}",
        headers=headers,
        json={"name": "renamed", "scopes": ["candidates:read", "jobs:read"]},
    )
    assert r.status_code == 200
    updated = r.json()
    assert updated["name"] == "renamed"
    assert updated["scopes"] == ["candidates:read", "jobs:read"]

    # Usage.
    r = await c.get(f"/{key_id}/usage", headers=headers)
    assert r.status_code == 200
    usage = r.json()
    assert usage["id"] == key_id
    assert usage["name"] == "renamed"
    assert "total_requests" in usage

    # Delete (revoke).
    r = await c.delete(f"/{key_id}", headers=headers)
    assert r.status_code == 204

    # Subsequent auth with that key should fail.
    async with session_factory() as s:
        assert await manager.authenticate_api_key(s, full_key) is None


@pytest.mark.asyncio
async def test_http_requires_authentication(app_and_client):
    _, c = app_and_client
    r = await c.get("/")
    assert r.status_code == 401
    r = await c.post("/", json={"name": "x"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_http_create_validation(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="valid@acme.com")
    headers = await _auth_headers(user)

    # Missing name.
    r = await c.post("/", headers=headers, json={})
    assert r.status_code == 422

    # Empty name.
    r = await c.post("/", headers=headers, json={"name": ""})
    assert r.status_code == 422

    # Negative expiration.
    r = await c.post("/", headers=headers, json={"name": "ok", "expires_in_days": -1})
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_http_key_not_found(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="missing@acme.com")
    headers = await _auth_headers(user)
    missing_id = str(uuid4())

    r = await c.get(f"/{missing_id}", headers=headers)
    assert r.status_code == 404

    r = await c.put(f"/{missing_id}", headers=headers, json={"name": "x"})
    assert r.status_code == 404

    r = await c.delete(f"/{missing_id}", headers=headers)
    assert r.status_code == 404

    r = await c.get(f"/{missing_id}/usage", headers=headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_http_tenant_isolation(app_and_client, session_factory):
    _, c = app_and_client
    user_acme = await _create_user(session_factory, email="a@acme.com", tenant_id="acme")
    user_other = await _create_user(session_factory, email="b@other.com", tenant_id="other")
    h_acme = await _auth_headers(user_acme)
    h_other = await _auth_headers(user_other)

    # Acme creates a key.
    r = await c.post("/", headers=h_acme, json={"name": "acme-only"})
    assert r.status_code == 201
    acme_key_id = r.json()["key"]["id"]

    # Other-tenant user listing must be empty.
    r = await c.get("/", headers=h_other)
    assert r.status_code == 200
    assert r.json() == {"data": [], "total": 0}

    # Other-tenant user cannot read the acme key by id.
    r = await c.get(f"/{acme_key_id}", headers=h_other)
    assert r.status_code == 404

    r = await c.put(f"/{acme_key_id}", headers=h_other, json={"name": "hijack"})
    assert r.status_code == 404

    r = await c.delete(f"/{acme_key_id}", headers=h_other)
    assert r.status_code == 404

    r = await c.get(f"/{acme_key_id}/usage", headers=h_other)
    assert r.status_code == 404

    # Acme user can still see and use the key.
    r = await c.get(f"/{acme_key_id}", headers=h_acme)
    assert r.status_code == 200
    assert r.json()["id"] == acme_key_id


@pytest.mark.asyncio
async def test_http_update_only_changes_supplied_fields(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="partial@acme.com")
    headers = await _auth_headers(user)

    r = await c.post(
        "/",
        headers=headers,
        json={"name": "orig", "scopes": ["x:read"]},
    )
    key_id = r.json()["key"]["id"]

    r = await c.put(f"/{key_id}", headers=headers, json={"name": "renamed"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "renamed"
    assert body["scopes"] == ["x:read"]

    r = await c.put(f"/{key_id}", headers=headers, json={"scopes": []})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "renamed"
    assert body["scopes"] == []


@pytest.mark.asyncio
async def test_http_create_with_expiration_is_visible_in_metadata(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="exp@acme.com")
    headers = await _auth_headers(user)

    r = await c.post(
        "/",
        headers=headers,
        json={"name": "short", "expires_in_days": 7},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["key"]["expires_at"] is not None
    expires = datetime.fromisoformat(body["key"]["expires_at"])
    delta = expires - datetime.now(timezone.utc).replace(tzinfo=None)
    assert timedelta(days=6) < delta < timedelta(days=8)


@pytest.mark.asyncio
async def test_http_usage_reports_expired_keys(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="usgexp@acme.com")
    headers = await _auth_headers(user)

    # Create with negative expiration via manager so the DB row is
    # already past its expiry.
    async with session_factory() as s:
        record, _ = await manager.create_api_key(
            s,
            user_id=user.id,
            tenant_id=user.tenant_id,
            name="old",
            expires_in_days=-1,
        )
        await s.commit()
        key_id = record.id

    r = await c.get(f"/{key_id}/usage", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["is_expired"] is True


@pytest.mark.asyncio
async def test_authenticate_via_bearer_airos_header(app_and_client, session_factory):
    """``Authorization: Bearer airos_<key>`` must resolve to a user dict."""
    from shared.auth import require_api_key_or_user
    from fastapi import Depends

    _, c = app_and_client
    user = await _create_user(session_factory, email="bearer@acme.com")
    jw_headers = await _auth_headers(user)

    r = await c.post("/", headers=jw_headers, json={"name": "service"})
    assert r.status_code == 201
    full_key = r.json()["full_key"]
    assert full_key.startswith("airos_")

    # Build a small FastAPI app that exposes a single protected route to
    # verify the dependency resolves an API-key bearer token.
    probe_app = FastAPI()

    @probe_app.get("/whoami")
    async def whoami(user=Depends(require_api_key_or_user)):
        return {
            "id": user.get("id"),
            "tenant_id": user.get("tenant_id"),
            "role": user.get("role"),
        }

    # Override the DB so the dependency uses our in-memory session factory.
    async def _override_db():
        async with session_factory() as s:
            yield s

    probe_app.dependency_overrides[get_db_dependency] = _override_db

    transport = ASGITransport(app=probe_app)
    async with AsyncClient(transport=transport, base_url="http://test") as probe:
        # 1. Valid API key via Bearer.
        r = await probe.get(
            "/whoami",
            headers={"Authorization": f"Bearer {full_key}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] == user.id
        assert body["tenant_id"] == "acme"
        assert body["role"] == "service"

        # 2. Valid API key via X-API-Key header (legacy).
        r = await probe.get(
            "/whoami",
            headers={"X-API-Key": full_key},
        )
        assert r.status_code == 200
        assert r.json()["id"] == user.id

        # 3. Bogus API key.
        r = await probe.get(
            "/whoami",
            headers={"Authorization": "Bearer airos_bogus_value"},
        )
        assert r.status_code == 401

        # 4. Plain JWT still works.
        jwt_token = create_access_token(
            {
                "sub": user.id,
                "email": user.email,
                "role": user.role.value,
                "tenant_id": user.tenant_id,
            }
        )
        r = await probe.get(
            "/whoami",
            headers={"Authorization": f"Bearer {jwt_token}"},
        )
        assert r.status_code == 200
        assert r.json()["role"] == user.role.value


@pytest.mark.asyncio
async def test_revoked_key_cannot_authenticate_via_bearer(app_and_client, session_factory):
    """After DELETE, the bearer token must be rejected."""
    from shared.auth import require_api_key_or_user
    from fastapi import Depends

    _, c = app_and_client
    user = await _create_user(session_factory, email="revauth@acme.com")
    headers = await _auth_headers(user)

    r = await c.post("/", headers=headers, json={"name": "doomed"})
    key_id = r.json()["key"]["id"]
    full_key = r.json()["full_key"]

    # Sanity check: works while active.
    probe_app = FastAPI()

    @probe_app.get("/whoami")
    async def whoami(user=Depends(require_api_key_or_user)):
        return {"id": user.get("id")}

    async def _override_db():
        async with session_factory() as s:
            yield s

    probe_app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=probe_app)
    async with AsyncClient(transport=transport, base_url="http://test") as probe:
        r = await probe.get(
            "/whoami", headers={"Authorization": f"Bearer {full_key}"}
        )
        assert r.status_code == 200

    # Revoke via DELETE.
    r = await c.delete(f"/{key_id}", headers=headers)
    assert r.status_code == 204

    # Bearer with the revoked key must now 401.
    async with AsyncClient(transport=transport, base_url="http://test") as probe:
        r = await probe.get(
            "/whoami", headers={"Authorization": f"Bearer {full_key}"}
        )
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_expired_key_cannot_authenticate(session_factory):
    user = await _create_user(session_factory, email="expauth@acme.com")
    async with session_factory() as s:
        record, full_key = await manager.create_api_key(
            s,
            user_id=user.id,
            tenant_id=user.tenant_id,
            name="already-dead",
            expires_in_days=-1,
        )
        await s.commit()

    async with session_factory() as s:
        assert await manager.authenticate_api_key(s, full_key) is None


@pytest.mark.asyncio
async def test_update_keeps_secret_stable(app_and_client, session_factory):
    """Renaming / scope changes must not rotate the secret."""
    _, c = app_and_client
    user = await _create_user(session_factory, email="stable@acme.com")
    headers = await _auth_headers(user)

    r = await c.post("/", headers=headers, json={"name": "stable"})
    key_id = r.json()["key"]["id"]
    full_key = r.json()["full_key"]

    r = await c.put(f"/{key_id}", headers=headers, json={"name": "renamed"})
    assert r.status_code == 200

    # Auth still works.
    async with session_factory() as s:
        resolved = await manager.authenticate_api_key(s, full_key)
        assert resolved is not None
        assert resolved.id == key_id
        assert resolved.name == "renamed"


@pytest.mark.asyncio
async def test_health_endpoint(app_and_client):
    _, c = app_and_client
    r = await c.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "healthy", "service": "api-keys"}
