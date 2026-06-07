"""Tests for the 2FA (TOTP) flow on the auth service.

Covers:
* ``shared.auth.two_factor`` — secret generation, TOTP verification, backup codes
* ``/2fa/setup`` — returns secret + QR data URL
* ``/2fa/enable`` — verifies code, activates 2FA, returns backup codes
* ``/2fa/disable`` — verifies password, deactivates
* ``/login/2fa`` — completes a 2FA-protected login
* Tenant isolation — 2FA actions only target the caller's tenant
"""
from __future__ import annotations

import base64
import json

import pyotp
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from jose import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from shared.auth.two_factor import (
    generate_backup_codes,
    generate_secret,
    hash_backup_code,
    provisioning_uri,
    qr_data_url,
    verify_totp,
)
from shared.core.config import Settings, get_settings
from shared.core.database import get_db_dependency
from shared.core.models.identity import User, UserRole, UserStatus
from shared.core.security import create_access_token, hash_password

from apps.auth_service.main import router as auth_router


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
    app.include_router(auth_router)
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
    full_name: str = "Two Factor User",
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


async def _access_token_for(user: User) -> str:
    return create_access_token(
        {
            "sub": user.id,
            "email": user.email,
            "role": user.role.value,
            "tenant_id": user.tenant_id,
        }
    )


async def _get_user(session_factory, user_id: str) -> User:
    async with session_factory() as s:
        return (await s.execute(select(User).where(User.id == user_id))).scalar_one()


# ── shared.auth.two_factor unit tests ────────────────────────────────────────


def test_generate_secret_is_base32():
    s = generate_secret()
    # 20 random bytes -> 32 base32 characters (no padding)
    assert len(s) == 32
    alphabet = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567")
    assert all(c in alphabet for c in s)


def test_generate_secret_unique():
    assert generate_secret() != generate_secret()


def test_verify_totp_accepts_current_code():
    secret = generate_secret()
    code = pyotp.TOTP(secret).now()
    assert verify_totp(secret, code) is True


def test_verify_totp_rejects_garbage_codes():
    secret = generate_secret()
    assert verify_totp(secret, "abcdef") is False
    assert verify_totp(secret, "123") is False
    assert verify_totp(secret, "1234567") is False
    assert verify_totp(secret, "") is False
    assert verify_totp(secret, None) is False  # type: ignore[arg-type]


def test_verify_totp_rejects_wrong_code():
    secret = generate_secret()
    # Generate a code for an obviously different secret to ensure we don't
    # accept codes minted for someone else's secret.
    other = pyotp.TOTP(generate_secret()).now()
    assert verify_totp(secret, other) is False


def test_verify_totp_wrong_secret():
    code = pyotp.TOTP(generate_secret()).now()
    assert verify_totp(generate_secret(), code) is False


def test_generate_backup_codes_default_count():
    codes = generate_backup_codes()
    assert len(codes) == 10
    assert len(set(codes)) == 10  # unique
    for c in codes:
        # Format: ABCDE-FGHIJ
        assert len(c) == 11
        assert c[5] == "-"
        body = c.replace("-", "")
        assert body.isalnum()
        assert body == body.upper()


def test_generate_backup_codes_custom_count():
    assert len(generate_backup_codes(count=3)) == 3
    assert len(generate_backup_codes(count=25)) == 25


def test_hash_backup_code_is_deterministic_and_normalises():
    a = hash_backup_code("ABCD-1234")
    b = hash_backup_code("abcd-1234")
    c = hash_backup_code("  abcd-1234  ")
    assert a == b == c
    assert len(a) == 64  # sha256 hex


# ── /2fa/setup endpoint ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_setup_returns_secret_and_qr(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="setup@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    r = await c.post("/2fa/setup", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()

    assert "secret" in body and len(body["secret"]) == 32
    assert body["otpauth_url"].startswith("otpauth://totp/")
    assert "secret=" in body["otpauth_url"]
    assert body["qr_code_data_url"].startswith("data:image/png;base64,")

    # PNG data URL is base64-encoded bytes; we should be able to decode it.
    _, b64 = body["qr_code_data_url"].split(",", 1)
    decoded = base64.b64decode(b64)
    assert decoded[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic number

    # And the secret must have been persisted (but not enabled yet).
    fresh = await _get_user(session_factory, user.id)
    assert fresh.totp_secret == body["secret"]
    assert fresh.totp_enabled is False
    assert fresh.backup_codes is None


@pytest.mark.asyncio
async def test_setup_requires_authentication(app_and_client):
    _, c = app_and_client
    r = await c.post("/2fa/setup")
    assert r.status_code == 401


# ── /2fa/enable endpoint ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_enable_activates_and_returns_backup_codes(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="enable@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    setup = await c.post("/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    code = pyotp.TOTP(secret).now()

    r = await c.post("/2fa/enable", headers=headers, json={"code": code})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["enabled"] is True
    assert len(body["backup_codes"]) == 10
    assert all(len(c) == 11 for c in body["backup_codes"])

    fresh = await _get_user(session_factory, user.id)
    assert fresh.totp_enabled is True
    assert fresh.backup_codes is not None
    stored = json.loads(fresh.backup_codes)
    assert len(stored) == 10
    # Stored as hashes, not plaintext.
    for plain, hashed in zip(body["backup_codes"], stored):
        assert hash_backup_code(plain) == hashed


@pytest.mark.asyncio
async def test_enable_rejects_invalid_code(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="bad@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    await c.post("/2fa/setup", headers=headers)
    r = await c.post("/2fa/enable", headers=headers, json={"code": "000000"})
    assert r.status_code == 400
    assert "invalid" in r.json()["detail"].lower()

    fresh = await _get_user(session_factory, user.id)
    assert fresh.totp_enabled is False


@pytest.mark.asyncio
async def test_enable_requires_setup_first(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="nosetup@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    r = await c.post("/2fa/enable", headers=headers, json={"code": "123456"})
    assert r.status_code == 400
    assert "setup" in r.json()["detail"].lower()


# ── /2fa/disable endpoint ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_disable_with_correct_password(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="disable@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    # Enable 2FA first.
    setup = await c.post("/2fa/setup", headers=headers)
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await c.post("/2fa/enable", headers=headers, json={"code": code})

    # Now disable.
    r = await c.post("/2fa/disable", headers=headers, json={"password": TEST_PASSWORD})
    assert r.status_code == 200
    assert r.json()["enabled"] is False

    fresh = await _get_user(session_factory, user.id)
    assert fresh.totp_enabled is False
    assert fresh.totp_secret is None
    assert fresh.backup_codes is None


@pytest.mark.asyncio
async def test_disable_with_wrong_password(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="wrongpass@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    setup = await c.post("/2fa/setup", headers=headers)
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await c.post("/2fa/enable", headers=headers, json={"code": code})

    r = await c.post("/2fa/disable", headers=headers, json={"password": "not-the-password"})
    assert r.status_code == 401

    fresh = await _get_user(session_factory, user.id)
    assert fresh.totp_enabled is True  # unchanged


# ── /2fa/status endpoint ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_status_reflects_enablement_and_remaining_codes(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="status@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    # Before enabling.
    r = await c.get("/2fa/status", headers=headers)
    assert r.status_code == 200
    assert r.json() == {"enabled": False, "backup_codes_remaining": 0}

    # After enabling.
    setup = await c.post("/2fa/setup", headers=headers)
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await c.post("/2fa/enable", headers=headers, json={"code": code})

    r = await c.get("/2fa/status", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert body["backup_codes_remaining"] == 10


# ── Login + /login/2fa flow ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_with_2fa_returns_pending_token(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="login2fa@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    setup = await c.post("/2fa/setup", headers=headers)
    code = pyotp.TOTP(setup.json()["secret"]).now()
    await c.post("/2fa/enable", headers=headers, json={"code": code})

    r = await c.post(
        "/login",
        json={"email": "login2fa@acme.com", "password": TEST_PASSWORD},
    )
    assert r.status_code == 200
    body = r.json()
    # When 2FA is on, /login must NOT issue access/refresh tokens.
    assert body.get("mfa_required") is True
    assert body.get("two_factor_required") is True
    assert "pending_token" in body
    assert "access_token" not in body
    assert "refresh_token" not in body


@pytest.mark.asyncio
async def test_login_2fa_completes_with_valid_totp(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="complete@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    setup = await c.post("/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    await c.post("/2fa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})

    login = await c.post(
        "/login",
        json={"email": "complete@acme.com", "password": TEST_PASSWORD},
    )
    pending = login.json()["pending_token"]

    r = await c.post(
        "/login/2fa",
        json={"pending_token": pending, "code": pyotp.TOTP(secret).now()},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["two_factor_enabled"] is True


@pytest.mark.asyncio
async def test_login_2fa_rejects_invalid_totp(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="rejecttotp@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    setup = await c.post("/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    await c.post("/2fa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})

    pending = (
        await c.post("/login", json={"email": "rejecttotp@acme.com", "password": TEST_PASSWORD})
    ).json()["pending_token"]

    r = await c.post(
        "/login/2fa",
        json={"pending_token": pending, "code": "000000"},
    )
    assert r.status_code == 401
    assert "invalid" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_2fa_backup_code_is_single_use(app_and_client, session_factory):
    _, c = app_and_client
    user = await _create_user(session_factory, email="backup@acme.com")
    headers = {"Authorization": f"Bearer {(await _access_token_for(user))}"}

    setup = await c.post("/2fa/setup", headers=headers)
    secret = setup.json()["secret"]
    enable = await c.post("/2fa/enable", headers=headers, json={"code": pyotp.TOTP(secret).now()})
    backup = enable.json()["backup_codes"][0]

    pending = (
        await c.post("/login", json={"email": "backup@acme.com", "password": TEST_PASSWORD})
    ).json()["pending_token"]

    # First use — should succeed.
    r1 = await c.post(
        "/login/2fa",
        json={"pending_token": pending, "code": backup, "use_backup_code": True},
    )
    assert r1.status_code == 200
    assert r1.json()["user"]["two_factor_enabled"] is True

    # 9 codes should remain.
    fresh = await _get_user(session_factory, user.id)
    assert len(json.loads(fresh.backup_codes)) == 9

    # Reuse the same code — should fail (and not affect remaining 9).
    pending2 = (
        await c.post("/login", json={"email": "backup@acme.com", "password": TEST_PASSWORD})
    ).json()["pending_token"]
    r2 = await c.post(
        "/login/2fa",
        json={"pending_token": pending2, "code": backup, "use_backup_code": True},
    )
    assert r2.status_code == 401

    fresh = await _get_user(session_factory, user.id)
    assert len(json.loads(fresh.backup_codes)) == 9


@pytest.mark.asyncio
async def test_login_2fa_rejects_invalid_pending_token(app_and_client, session_factory):
    _, c = app_and_client
    r = await c.post(
        "/login/2fa",
        json={"pending_token": "not-a-real-token", "code": "123456"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_login_2fa_rejects_token_signed_for_other_purpose(app_and_client):
    _, c = app_and_client
    # A regular access token is *not* a valid pending-2FA token.
    bogus = create_access_token({"sub": "u", "email": "x", "type": "access"})
    r = await c.post("/login/2fa", json={"pending_token": bogus, "code": "123456"})
    assert r.status_code == 401


# ── Tenant isolation ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_2fa_actions_are_scoped_to_callers_tenant(app_and_client, session_factory):
    """The 2FA endpoints derive the target user from the JWT — not from the body.

    A user from tenant A cannot enable 2FA on a user that belongs to tenant B
    by spoofing the user_id.  Concretely: when tenant A's user calls
    /2fa/setup, the resulting ``totp_secret`` is written to *their* row, not
    a row in another tenant — there is no user_id parameter to spoof.
    """
    _, c = app_and_client
    user_a = await _create_user(session_factory, email="a@acme.com", tenant_id="tenant-a")
    user_b = await _create_user(session_factory, email="b@globex.com", tenant_id="tenant-b")

    headers_a = {"Authorization": f"Bearer {(await _access_token_for(user_a))}"}
    r = await c.post("/2fa/setup", headers=headers_a)
    assert r.status_code == 200

    a = await _get_user(session_factory, user_a.id)
    b = await _get_user(session_factory, user_b.id)
    assert a.totp_secret is not None
    assert b.totp_secret is None  # untouched

    # And the status endpoint only reports the caller's row.
    status = await c.get("/2fa/status", headers=headers_a)
    assert status.json()["enabled"] is False
    assert (await c.get("/2fa/status", headers={
        "Authorization": f"Bearer {(await _access_token_for(user_b))}"
    })).json()["enabled"] is False


@pytest.mark.asyncio
async def test_login_2fa_only_accepts_token_for_that_user(app_and_client, session_factory):
    """A pending-2FA token minted for user A cannot complete user B's login."""
    _, c = app_and_client
    user_a = await _create_user(session_factory, email="aa@acme.com", tenant_id="tenant-a")
    user_b = await _create_user(session_factory, email="bb@globex.com", tenant_id="tenant-b")

    # Enable 2FA for B.
    headers_b = {"Authorization": f"Bearer {(await _access_token_for(user_b))}"}
    setup = await c.post("/2fa/setup", headers=headers_b)
    secret = setup.json()["secret"]
    await c.post("/2fa/enable", headers=headers_b, json={"code": pyotp.TOTP(secret).now()})

    # Mint a pending-2FA token directly for user A.
    bogus = jwt.encode(
        {
            "sub": user_a.id,
            "email": user_a.email,
            "tenant_id": user_a.tenant_id,
            "type": "pending_2fa",
            "exp": 9999999999,
        },
        "test-secret-key-that-is-at-least-32-chars-long!!",
        algorithm="HS256",
    )
    r = await c.post("/login/2fa", json={"pending_token": bogus, "code": "123456"})
    assert r.status_code == 401  # user_a has no 2FA, rejected
