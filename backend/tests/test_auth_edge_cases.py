"""Tests for auth edge cases — lockout, password reset, email verification, etc."""
from __future__ import annotations

import os
import sys
import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlmodel import SQLModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from shared.core.config import get_settings
from shared.core.database import get_db_dependency
from apps.auth_service.main import router as auth_router
from apps.mailing_service.main import router as mailing_router
from apps.auth_service.helpers import (
    auth_rate_limiter,
    compute_lockout_seconds,
    is_account_locked,
    normalize_email,
    normalize_name,
    should_lock_account,
)


pytestmark = [pytest.mark.integration, pytest.mark.auth, pytest.mark.edge_cases]


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine):
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1/auth")
    app.include_router(mailing_router, prefix="/api/v1/mailing")

    # Disable demo seed for these tests so we have a clean slate
    os.environ["DEMO_ENABLED"] = "false"
    get_settings.cache_clear()

    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_dependency] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    auth_rate_limiter.reset()
    get_settings.cache_clear()


# ── Normalization helpers ───────────────────────────────────────────────────


def test_normalize_email_lowercases_and_strips():
    assert normalize_email("  User@Example.COM  ") == "user@example.com"


def test_normalize_name_collapses_whitespace():
    assert normalize_name("  Jane   Q.   Recruiter  ") == "Jane Q. Recruiter"


# ── Lockout helpers ──────────────────────────────────────────────────────────


def test_should_lock_account_threshold():
    assert should_lock_account(4) is False
    assert should_lock_account(5) is True
    assert should_lock_account(10) is True


def test_compute_lockout_seconds_exponential():
    assert compute_lockout_seconds(1) == 30
    assert compute_lockout_seconds(2) == 60
    assert compute_lockout_seconds(3) == 120
    assert compute_lockout_seconds(4) == 240
    # Capped
    assert compute_lockout_seconds(20) <= 3600


# ── Registration edge cases ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_register_creates_user(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "user@example.com",
            "full_name": "User One",
            "password": "SecureP@ss123",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "user@example.com"
    assert body["created"] is True
    assert "access_token" in body


@pytest.mark.asyncio
async def test_register_duplicate_returns_409(client: AsyncClient):
    data = {
        "email": "dup@example.com",
        "full_name": "Dup",
        "password": "SecureP@ss123",
    }
    r1 = await client.post("/api/v1/auth/register", json=data)
    assert r1.status_code == 200
    r2 = await client.post("/api/v1/auth/register", json=data)
    assert r2.status_code == 409


@pytest.mark.asyncio
async def test_register_trims_and_lowercases_email(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "  MixedCase@Example.COM  ",
            "full_name": "  Jane  Q.  Doe  ",
            "password": "SecureP@ss123",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "mixedcase@example.com"
    assert body["full_name"] == "Jane Q. Doe"


@pytest.mark.asyncio
async def test_register_weak_password_rejected(client: AsyncClient):
    resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "weak@example.com",
            "full_name": "Weak",
            "password": "short",
        },
    )
    assert resp.status_code == 422  # Pydantic validation


@pytest.mark.asyncio
async def test_register_sends_verification_email(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "v@example.com",
            "full_name": "V User",
            "password": "SecureP@ss123",
        },
    )
    # The mailing service should have a "sent" email
    resp = await client.get("/api/v1/mailing/admin/emails?type=email_verification")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 1
    assert any("Verify" in e["subject"] for e in body["emails"])


# ── Email verification flow ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_email_with_token(client: AsyncClient):
    # Register
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "verifyme@example.com",
            "full_name": "Verify Me",
            "password": "SecureP@ss123",
        },
    )
    assert reg.status_code == 200
    user_id = reg.json()["id"]

    # Get the token
    resp = await client.get("/api/v1/mailing/admin/emails?type=email_verification&to=verifyme@example.com")
    assert resp.status_code == 200
    token = resp.json()["emails"][0]["extra"]["token"]

    # Verify
    resp = await client.post(f"/api/v1/auth/verify-email?token={token}")
    assert resp.status_code == 200
    assert resp.json()["verified"] is True
    assert resp.json()["user_id"] == user_id


@pytest.mark.asyncio
async def test_verify_email_invalid_token(client: AsyncClient):
    resp = await client.post("/api/v1/auth/verify-email?token=invalidtoken1234")
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_verify_email_token_consumed_only_once(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "once@example.com",
            "full_name": "Once",
            "password": "SecureP@ss123",
        },
    )
    resp = await client.get("/api/v1/mailing/admin/emails?type=email_verification&to=once@example.com")
    token = resp.json()["emails"][0]["extra"]["token"]
    # First use -> ok
    r1 = await client.post(f"/api/v1/auth/verify-email?token={token}")
    assert r1.status_code == 200
    # Second use -> invalid
    r2 = await client.post(f"/api/v1/auth/verify-email?token={token}")
    assert r2.status_code == 400


@pytest.mark.asyncio
async def test_resend_verification(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "resend@example.com",
            "full_name": "Resend",
            "password": "SecureP@ss123",
        },
    )
    # Resend
    resp = await client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "resend@example.com"},
    )
    assert resp.status_code == 200
    # Should have at least 2 verification emails now
    resp = await client.get("/api/v1/mailing/admin/emails?type=email_verification&to=resend@example.com")
    assert resp.json()["total"] >= 2


@pytest.mark.asyncio
async def test_resend_verification_doesnt_leak_user_existence(client: AsyncClient):
    """A request to resend for a non-existent email should still return 200."""
    resp = await client.post(
        "/api/v1/auth/resend-verification",
        json={"email": "nobody@nowhere.com"},
    )
    assert resp.status_code == 200


# ── Login & lockout ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "login@example.com",
            "full_name": "Login",
            "password": "SecureP@ss123",
        },
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "SecureP@ss123"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["user"]["email_verified"] is False  # not yet verified


@pytest.mark.asyncio
async def test_login_wrong_password_doesnt_leak_user_existence(client: AsyncClient):
    """Whether the email exists or not, an invalid login returns the same message."""
    r1 = await client.post(
        "/api/v1/auth/login",
        json={"email": "exists@example.com", "password": "SecureP@ss123"},
    )
    r2 = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "SecureP@ss123"},
    )
    # Both are 401
    assert r1.status_code == 401
    assert r2.status_code == 401
    # Same generic message
    assert r1.json()["detail"] == r2.json()["detail"]


@pytest.mark.asyncio
async def test_account_lockout_after_failed_attempts(client: AsyncClient):
    """After 5 failed login attempts the account gets locked."""
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "lockme@example.com",
            "full_name": "Lock",
            "password": "SecureP@ss123",
        },
    )
    # 5 wrong attempts
    for _ in range(5):
        r = await client.post(
            "/api/v1/auth/login",
            json={"email": "lockme@example.com", "password": "wrong"},
        )
        assert r.status_code in (401, 423)

    # 6th attempt (with correct password) should be locked
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "lockme@example.com", "password": "SecureP@ss123"},
    )
    assert r.status_code == 423
    assert "locked" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_case_insensitive(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "case@example.com",
            "full_name": "Case",
            "password": "SecureP@ss123",
        },
    )
    r = await client.post(
        "/api/v1/auth/login",
        json={"email": "CASE@EXAMPLE.COM", "password": "SecureP@ss123"},
    )
    assert r.status_code == 200


# ── Refresh token rotation ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_refresh_token_rotates(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "refresh@example.com",
            "full_name": "Refresh",
            "password": "SecureP@ss123",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "refresh@example.com", "password": "SecureP@ss123"},
    )
    rt1 = login.json()["refresh_token"]

    # Refresh once
    r1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": rt1})
    assert r1.status_code == 200
    rt2 = r1.json().get("refresh_token")
    assert rt2 is not None
    assert rt2 != rt1  # rotated

    # Old token should now be invalid
    r_old = await client.post("/api/v1/auth/refresh", json={"refresh_token": rt1})
    assert r_old.status_code == 401

    # New token should still work
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": rt2})
    assert r2.status_code == 200


# ── Logout ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_logout_revokes_token(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout@example.com",
            "full_name": "Logout",
            "password": "SecureP@ss123",
        },
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "logout@example.com", "password": "SecureP@ss123"},
    )
    rt = login.json()["refresh_token"]

    # Logout
    r = await client.post("/api/v1/auth/logout", json={"refresh_token": rt})
    assert r.status_code == 200
    assert r.json()["logged_out"] is True

    # Refresh should now fail
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert r2.status_code == 401


# ── Password reset flow ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_forgot_password_sends_email(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "forgot@example.com",
            "full_name": "Forgot",
            "password": "SecureP@ss123",
        },
    )
    resp = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "forgot@example.com"},
    )
    assert resp.status_code == 200
    # Verify a reset email was sent
    emails = await client.get("/api/v1/mailing/admin/emails?type=password_reset&to=forgot@example.com")
    assert emails.status_code == 200
    assert emails.json()["total"] >= 1


@pytest.mark.asyncio
async def test_forgot_password_doesnt_leak_user_existence(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "nobody@nowhere.com"},
    )
    assert r.status_code == 200
    assert "If the account exists" in r.json()["message"]


@pytest.mark.asyncio
async def test_password_reset_full_flow(client: AsyncClient):
    await client.post(
        "/api/v1/auth/register",
        json={
            "email": "reset@example.com",
            "full_name": "Reset",
            "password": "OldP@ssword123",
        },
    )
    # Request reset
    await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset@example.com"},
    )
    # Get token
    emails = await client.get(
        "/api/v1/mailing/admin/emails?type=password_reset&to=reset@example.com"
    )
    token = emails.json()["emails"][0]["extra"]["token"]

    # Reset
    r = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": token, "new_password": "NewP@ssword456"},
    )
    assert r.status_code == 200

    # Login with new password
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "reset@example.com", "password": "NewP@ssword456"},
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_password_reset_invalid_token(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/reset-password",
        json={"token": "invalidtoken1234", "new_password": "NewP@ssword456"},
    )
    assert r.status_code == 400


# ── Deactivation / reactivation ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_deactivate_account(client: AsyncClient):
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "deact@example.com",
            "full_name": "Deact",
            "password": "SecureP@ss123",
        },
    )
    token = reg.json()["access_token"]
    r = await client.post(
        "/api/v1/auth/deactivate",
        json={"reason": "test"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200
    # Login should now fail
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "deact@example.com", "password": "SecureP@ss123"},
    )
    assert login.status_code == 403


@pytest.mark.asyncio
async def test_reactivate_account(client: AsyncClient):
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "react@example.com",
            "full_name": "React",
            "password": "SecureP@ss123",
        },
    )
    token = reg.json()["access_token"]
    await client.post(
        "/api/v1/auth/deactivate",
        json={},
        headers={"Authorization": f"Bearer {token}"},
    )
    r = await client.post(
        "/api/v1/auth/reactivate",
        json={"email": "react@example.com", "password": "SecureP@ss123"},
    )
    assert r.status_code == 200
    # Login should now work
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "react@example.com", "password": "SecureP@ss123"},
    )
    assert login.status_code == 200


# ── Already-verified user re-registering ────────────────────────────────────


@pytest.mark.asyncio
async def test_register_already_verified_blocks(client: AsyncClient, db_engine):
    reg = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "verified@example.com",
            "full_name": "Verified",
            "password": "SecureP@ss123",
        },
    )
    user_id = reg.json()["id"]
    # Manually mark verified using the test engine
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from shared.core.models.identity import User
    from sqlalchemy import select
    session_factory = async_sessionmaker(db_engine, expire_on_commit=False)
    async with session_factory() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one()
        user.email_verified = True
        session.add(user)
        await session.commit()
    # Re-registering should still 409
    r = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "verified@example.com",
            "full_name": "Verified",
            "password": "SecureP@ss123",
        },
    )
    assert r.status_code == 409
