"""Auth Service — Authentication, registration, MFA, token management, and account security.

Includes:
- Account lockout with exponential backoff
- Password reset flow (request + confirm with token)
- Email verification on registration (with resend endpoint)
- Refresh token rotation (old token invalidated when new one issued)
- Token revocation on logout
- Account deactivation/reactivation
- Case-insensitive email lookup with whitespace trimming
- Rate limiting on auth endpoints
- Generic error messages (no user-existence leaks)
- Atomic registration (handles concurrent registrations of the same email)
- Demo account seeding on startup
- Mailing integration for transactional emails
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
from contextlib import suppress
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

from jose import JWTError, jwt

from shared.core.config import get_settings
from shared.core.database import get_db_dependency
from shared.core.models.identity import User, UserRole, UserStatus, Session, APIKey
from shared.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_api_key,
    hash_api_key,
)
from shared.audit import audit
from shared.auth.mfa import (
    generate_backup_codes,
    generate_secret,
    otpauth_url,
    verify_totp,
)
from shared.auth.two_factor import (
    generate_backup_codes as tf_generate_backup_codes,
    generate_secret as tf_generate_secret,
    hash_backup_code,
    provisioning_uri,
    qr_data_url,
    verify_totp as tf_verify_totp,
)

from apps.auth_service.helpers import (
    auth_rate_limiter,
    compute_lockout_seconds,
    is_account_locked,
    lockout_remaining_seconds,
    normalize_email,
    normalize_name,
    record_failed_attempt,
    record_successful_login,
    seed_demo_account,
    should_lock_account,
)
from shared.middleware.rate_limit import rate_limit_auth as _rate_limit_auth_dep


logger = logging.getLogger("auth_service")
settings = get_settings()


# ── Request Models ─────────────────────────────────────────────────────────────


def _validate_password_complexity(password: str, bypass: bool = False) -> str:
    """Validate password has uppercase, lowercase, digit, and special character.

    If `bypass` is True (e.g. for the demo account) the complexity check is skipped
    but the minimum length of 8 is still enforced.
    """
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if bypass:
        return password
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one digit")
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", password):
        raise ValueError("Password must contain at least one special character (!@#$%^&* etc.)")
    return password


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address", examples=["user@acme.com"])
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name", examples=["Jane Recruiter"])
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 chars, must include uppercase, lowercase, digit, special char)", examples=["SecureP@ss123"])
    role: str = Field(default="candidate", description="User role", examples=["candidate"])
    bypass_password_complexity: bool = Field(
        default=False,
        description="Internal: skip complexity rules (for the demo account only).",
    )

    @field_validator("email")
    @classmethod
    def _email_norm(cls, v: str) -> str:
        return normalize_email(v)

    @field_validator("full_name")
    @classmethod
    def _name_norm(cls, v: str) -> str:
        return normalize_name(v)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str, info) -> str:
        bypass = bool(info.data.get("bypass_password_complexity", False))
        return _validate_password_complexity(v, bypass=bypass)

    model_config = {"json_schema_extra": {"examples": [
        {"email": "user@acme.com", "full_name": "Jane Recruiter", "password": "SecureP@ss123", "role": "candidate"}
    ]}}


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address", examples=["user@acme.com"])
    password: str = Field(..., description="User password", examples=["SecureP@ss123"])

    @field_validator("email")
    @classmethod
    def _email_norm(cls, v: str) -> str:
        return normalize_email(v)

    model_config = {"json_schema_extra": {"examples": [
        {"email": "user@acme.com", "password": "SecureP@ss123"}
    ]}}


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Account email")

    @field_validator("email")
    @classmethod
    def _email_norm(cls, v: str) -> str:
        return normalize_email(v)


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=8, description="Reset token received by email")
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _validate(cls, v: str) -> str:
        return _validate_password_complexity(v)


class ResendVerificationRequest(BaseModel):
    email: EmailStr = Field(..., description="Account email")

    @field_validator("email")
    @classmethod
    def _email_norm(cls, v: str) -> str:
        return normalize_email(v)


class DeactivateRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class MFAVerifyRequest(BaseModel):
    user_id: str = Field(..., description="User ID whose secret to verify against")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code", examples=["123456"])


class MFAEnableRequest(BaseModel):
    user_id: str = Field(..., description="User ID to enable MFA for")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = Field(default="healthy")
    service: str = Field(default="auth")


class RegisterResponse(BaseModel):
    id: str = Field(..., description="Created user id")
    email: str = Field(..., description="User email")
    full_name: str = Field(..., description="User full name")
    role: str = Field(..., description="User role")
    created: bool = Field(default=True)
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="Refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(default=1800, description="Token lifetime in seconds")
    user: dict = Field(..., description="Created user profile")
    verification_email_sent: bool = Field(default=True, description="Whether a verification email was sent")


class LoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="Refresh token for obtaining new access tokens")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(default=1800, description="Token lifetime in seconds")
    user: dict | None = Field(default=None, description="Authenticated user profile")


class RefreshResponse(BaseModel):
    access_token: str = Field(..., description="New JWT access token")
    refresh_token: str | None = Field(default=None, description="New refresh token (rotated)")
    token_type: str = Field(default="bearer")
    expires_in: int = Field(default=1800, description="Token lifetime in seconds")


class RefreshRotationRequest(BaseModel):
    refresh_token: str = Field(..., description="Current refresh token")
    revoke_other_sessions: bool = Field(
        default=False,
        description="If true, revoke every other active session for this user (useful after a suspected compromise).",
    )


class RefreshRotationResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    rotated: bool = True
    sessions_revoked: int = 0
    other_sessions_revoked: bool = False


class LogoutResponse(BaseModel):
    logged_out: bool = Field(default=True)


class MessageResponse(BaseModel):
    message: str


class VerifyEmailResponse(BaseModel):
    verified: bool = Field(default=True)
    user_id: str | None = None
    email: str | None = None


class ForgotPasswordResponse(BaseModel):
    message: str = Field(default="If the account exists, a reset email has been sent.")


class ResetPasswordResponse(BaseModel):
    message: str = Field(default="Password has been reset successfully.")


class MFAEnableResponse(BaseModel):
    secret: str = Field(..., description="TOTP secret key (base32)")
    otpauth_url: str = Field(..., description="otpauth:// URL for authenticator apps")
    backup_codes: list[str] = Field(..., description="One-time backup codes")


class MFAVerifyResponse(BaseModel):
    verified: bool
    message: str | None = None


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: str
    email_verified: bool = False
    avatar_url: str | None = None
    phone: str | None = None
    mfa_enabled: bool = False
    tenant_id: str
    created_at: datetime
    last_login_at: datetime | None = None
    is_demo: bool = False


# ── Helper functions ───────────────────────────────────────────────────────────


async def _send_verification_email_background(user_id: str, email: str, full_name: str) -> None:
    """Send verification email in the background (best-effort, never raises)."""
    try:
        from apps.mailing_service.main import send_verification_email
        await send_verification_email(user_id, email, full_name)
    except Exception as exc:
        logger.warning("Failed to send verification email to %s: %s", email, exc)


async def _send_welcome_email_background(user_id: str, email: str, full_name: str) -> None:
    try:
        from apps.mailing_service.main import send_welcome_email
        await send_welcome_email(user_id, email, full_name)
    except Exception as exc:
        logger.warning("Failed to send welcome email to %s: %s", email, exc)


def _client_key(request: Request, email: str) -> str:
    """Build a rate-limit key that combines the IP and the email when available."""
    ip = request.client.host if request.client else "unknown"
    return f"{ip}|{email.lower()}"


# ── Router ─────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["Auth"],
    summary="Auth service health check",
)
async def health():
    return HealthResponse()


@router.post(
    "/register",
    response_model=RegisterResponse,
    tags=["Auth"],
    summary="Register a new user",
    description=(
        "Create a new user account. Sends a verification email. The new user is "
        "auto-logged in. Re-registration with an already-verified account is rejected."
    ),
)
async def register(
    data: RegisterRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db_dependency),
    _: None = Depends(_rate_limit_auth_dep),
):
    # Rate limit per-IP+email
    allowed, _ = await auth_rate_limiter.check(
        f"register:{_client_key(request, data.email)}",
        settings.AUTH_REGISTER_RATE_LIMIT_PER_MIN,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later.",
        )

    # Map role string to enum
    try:
        role = UserRole(data.role)
    except ValueError:
        role = UserRole.CANDIDATE

    # Pre-check: if a user with this email already exists, fail fast. The
    # insert below also relies on a unique index on the email column to
    # handle the concurrent-registration race.
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    # Atomic insert: rely on unique email constraint at the DB level to handle
    # the race where two concurrent requests try to register the same email.
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=role,
        status=UserStatus.ACTIVE,
        tenant_id="default",
        email_verified=False,
        is_demo=False,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )
    await db.refresh(user)

    # Generate tokens
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value, "tenant_id": user.tenant_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    refresh_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    session = Session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_token_hash=refresh_hash,
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        ).replace(tzinfo=None),
    )
    db.add(session)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="user.register",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    # Send verification email in the background
    background.add_task(_send_verification_email_background, user.id, user.email, user.full_name)

    return RegisterResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        created=True,
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "email_verified": False,
            "created_at": user.created_at.isoformat() if user.created_at else None,
        },
        verification_email_sent=True,
    )


@router.post(
    "/login",
    tags=["Auth"],
    summary="Authenticate user",
    description="Verify credentials and return JWT access + refresh tokens. "
                "Account is locked after 5 consecutive failed attempts (exponential backoff). "
                "If the account has 2FA enabled, returns a ``mfa_required`` payload with a "
                "``pending_token`` that must be exchanged at ``/login/2fa``.",
)
async def login(
    data: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_dependency),
    _: None = Depends(_rate_limit_auth_dep),
):
    # Rate limit per-IP+email
    allowed, _ = await auth_rate_limiter.check(
        f"login:{_client_key(request, data.email)}",
        settings.AUTH_LOGIN_RATE_LIMIT_PER_MIN,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
        )

    # Demo accounts are exempt from rate limiting
    is_demo_login = data.email == normalize_email(settings.DEMO_EMAIL)

    # Find user (case-insensitive by normalizing the email column too).
    # The `User.email` column is indexed, so we do an exact match on the
    # normalized email (Pydantic already normalized it).
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    # Always run bcrypt-verify on something to keep timing similar even when user doesn't exist
    # This is a pre-computed valid bcrypt hash of "dummy-password-string"
    _DUMMY_BCRYPT = "$2b$12$StCb9/3SjmzH2RI31Ut3P.gXuFFqROrfdN2mHY69JcYLW2LfDh87."
    if not user:
        verify_password(data.password, _DUMMY_BCRYPT)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Lockout check
    if is_account_locked(user):
        remaining = lockout_remaining_seconds(user)
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account is temporarily locked. Try again in {remaining} seconds.",
        )

    # Verify password
    if not verify_password(data.password, user.hashed_password):
        record_failed_attempt(user)
        db.add(user)
        await db.commit()
        if is_account_locked(user):
            remaining = lockout_remaining_seconds(user)
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account is temporarily locked. Try again in {remaining} seconds.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check user status
    if user.status == UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended",
        )
    if user.status == UserStatus.INACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact support.",
        )
    if user.deactivated_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Reset failed attempts on success
    record_successful_login(user)

    # If 2FA is enabled, do NOT issue tokens — require a TOTP step instead.
    if user.totp_enabled:
        await audit(
            db,
            tenant_id=user.tenant_id,
            action="user.login.2fa_required",
            resource_type="user",
            resource_id=user.id,
            actor_id=user.id,
            actor_email=user.email,
            ip_address=request.client.host if request.client else None,
        )
        await db.commit()
        return _pending_2fa_login_response(user)

    # Generate tokens
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value, "tenant_id": user.tenant_id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    refresh_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    session = Session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_token_hash=refresh_hash,
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        ).replace(tzinfo=None),
    )
    db.add(session)
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="user.login",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
        ip_address=request.client.host if request.client else None,
    )
    await db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "email_verified": bool(user.email_verified),
            "is_demo": bool(user.is_demo),
        },
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    tags=["Auth"],
    summary="Refresh access token (with refresh-token rotation)",
    description="Exchange a valid refresh token for a new access token. The old refresh "
                "token is invalidated (rotation) and a new one is returned.",
)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db_dependency)):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE or user.deactivated_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    refresh_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    session_result = await db.execute(
        select(Session).where(
            Session.user_id == user_id,
            Session.refresh_token_hash == refresh_hash,
            Session.revoked_at.is_(None),
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found or revoked",
        )

    # Rotate: revoke old, create new
    session.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(session)

    token_data = {"sub": user.id, "email": user.email, "role": user.role.value, "tenant_id": user.tenant_id}
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)
    new_hash = hashlib.sha256(new_refresh.encode()).hexdigest()
    new_session = Session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_token_hash=new_hash,
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        ).replace(tzinfo=None),
    )
    db.add(new_session)
    await db.commit()

    return RefreshResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/refresh-rotation",
    response_model=RefreshRotationResponse,
    tags=["Auth"],
    summary="Rotate refresh token and optionally revoke other sessions",
    description=(
        "Strict superset of ``/refresh`` that also rotates the refresh token "
        "and can revoke every other active session for the user. Use this when "
        "you suspect the current session may be compromised."
    ),
)
async def refresh_rotation(
    data: RefreshRotationRequest,
    db: AsyncSession = Depends(get_db_dependency),
) -> RefreshRotationResponse:
    """Rotate the refresh token and (optionally) nuke every other session.

    Identical happy-path to ``/refresh``, but the response is shaped for
    security tooling (returns the rotation flag and number of other
    sessions that were revoked).
    """
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE or user.deactivated_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    refresh_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    session_result = await db.execute(
        select(Session).where(
            Session.user_id == user_id,
            Session.refresh_token_hash == refresh_hash,
            Session.revoked_at.is_(None),
        )
    )
    current_session = session_result.scalar_one_or_none()
    if not current_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session not found or revoked",
        )

    # Rotate the current session.
    current_session.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(current_session)

    other_revoked = 0
    if data.revoke_other_sessions:
        other_result = await db.execute(
            select(Session).where(
                Session.user_id == user_id,
                Session.revoked_at.is_(None),
                Session.id != current_session.id,
            )
        )
        for s in other_result.scalars().all():
            s.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
            db.add(s)
            other_revoked += 1

    token_data = {
        "sub": user.id,
        "email": user.email,
        "role": user.role.value,
        "tenant_id": user.tenant_id,
    }
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)
    new_hash = hashlib.sha256(new_refresh.encode()).hexdigest()
    new_session = Session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_token_hash=new_hash,
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        ).replace(tzinfo=None),
    )
    db.add(new_session)
    await db.commit()

    return RefreshRotationResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        sessions_revoked=other_revoked,
        other_sessions_revoked=data.revoke_other_sessions,
    )


@router.post(
    "/logout",
    response_model=LogoutResponse,
    tags=["Auth"],
    summary="Logout user (revoke refresh token)",
    description="Invalidate the current session and refresh token. Optionally revoke all sessions.",
)
async def logout(
    data: RefreshRequest,
    revoke_all: bool = False,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    # Revoke the specific session matching the supplied refresh token
    refresh_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(Session).where(Session.refresh_token_hash == refresh_hash)
    )
    session = result.scalar_one_or_none()
    if session:
        session.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(session)

    # Optionally revoke all sessions for the user (extracted from bearer token)
    if revoke_all and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = decode_token(token)
        if payload and payload.get("sub"):
            user_id = payload.get("sub")
            sess_result = await db.execute(
                select(Session).where(
                    Session.user_id == user_id,
                    Session.revoked_at.is_(None),
                )
            )
            for s in sess_result.scalars().all():
                s.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.add(s)
    await db.commit()
    return LogoutResponse()


# ── Email verification ────────────────────────────────────────────────────────


@router.post(
    "/verify-email",
    response_model=VerifyEmailResponse,
    tags=["Auth"],
    summary="Verify email with token",
    description="Marks the user's email as verified.",
)
async def verify_email(
    token: str = Query(..., min_length=8, description="Token received by email"),
    db: AsyncSession = Depends(get_db_dependency),
):
    from apps.mailing_service.main import email_service

    rec = email_service.consume_verification_token(token)
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    result = await db.execute(select(User).where(User.id == rec["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.email_verified:
        return VerifyEmailResponse(
            verified=True,
            user_id=user.id,
            email=user.email,
        )

    user.email_verified = True
    user.email_verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    await db.commit()
    return VerifyEmailResponse(verified=True, user_id=user.id, email=user.email)


@router.post(
    "/resend-verification",
    response_model=MessageResponse,
    tags=["Auth"],
    summary="Resend email verification",
    description="Sends a new verification email. Always returns success to avoid leaking user existence.",
)
async def resend_verification(
    data: ResendVerificationRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db_dependency),
):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user and not user.email_verified:
        background.add_task(
            _send_verification_email_background,
            user.id,
            user.email,
            user.full_name,
        )
    return MessageResponse(
        message="If the account exists and is not yet verified, a verification email has been sent."
    )


# ── Password reset ────────────────────────────────────────────────────────────


@router.post(
    "/forgot-password",
    response_model=ForgotPasswordResponse,
    tags=["Auth"],
    summary="Request a password reset",
    description="Sends a password reset email if the account exists. Always returns success.",
)
async def forgot_password(
    data: ForgotPasswordRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db_dependency),
    _: None = Depends(_rate_limit_auth_dep),
):
    allowed, _ = await auth_rate_limiter.check(
        f"forgot:{_client_key(request, data.email)}",
        settings.AUTH_FORGOT_PASSWORD_RATE_LIMIT_PER_MIN,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please try again later.",
        )

    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user and not user.is_demo:
        from apps.mailing_service.main import send_password_reset_email
        background.add_task(
            send_password_reset_email,
            user.id,
            user.email,
            user.full_name,
        )
    return ForgotPasswordResponse()


@router.post(
    "/reset-password",
    response_model=ResetPasswordResponse,
    tags=["Auth"],
    summary="Reset password with token",
    description="Sets a new password using the token from the reset email.",
)
async def reset_password(
    data: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db_dependency),
):
    from apps.mailing_service.main import email_service

    rec = email_service.consume_password_reset_token(data.token)
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    result = await db.execute(select(User).where(User.id == rec["user_id"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.hashed_password = hash_password(data.new_password)
    # Reset lockout state when password is changed
    record_successful_login(user)
    db.add(user)

    # Revoke all existing sessions for safety
    sess_result = await db.execute(
        select(Session).where(
            Session.user_id == user.id,
            Session.revoked_at.is_(None),
        )
    )
    for s in sess_result.scalars().all():
        s.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(s)
    await db.commit()
    return ResetPasswordResponse()


# ── Account deactivation / reactivation ───────────────────────────────────────


@router.post(
    "/deactivate",
    response_model=MessageResponse,
    tags=["Auth"],
    summary="Deactivate current account",
    description="Soft-deletes the current account and revokes all sessions.",
)
async def deactivate(
    data: DeactivateRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )
    payload = decode_token(authorization[7:])
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.status = UserStatus.INACTIVE
    user.deactivated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    # Revoke all sessions
    sess_result = await db.execute(
        select(Session).where(
            Session.user_id == user.id,
            Session.revoked_at.is_(None),
        )
    )
    for s in sess_result.scalars().all():
        s.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(s)
    await db.commit()
    return MessageResponse(message="Account has been deactivated.")


@router.post(
    "/reactivate",
    response_model=MessageResponse,
    tags=["Auth"],
    summary="Reactivate a deactivated account",
    description="Reactivates the current account. Requires valid login credentials.",
)
async def reactivate(
    data: LoginRequest,
    db: AsyncSession = Depends(get_db_dependency),
):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if user.status == UserStatus.ACTIVE and user.deactivated_at is None:
        return MessageResponse(message="Account is already active.")
    user.status = UserStatus.ACTIVE
    user.deactivated_at = None
    user.failed_login_attempts = 0
    user.locked_until = None
    db.add(user)
    await db.commit()
    return MessageResponse(message="Account has been reactivated.")


# ── Password change & profile update ───────────────────────────────────────────


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, description="Current password")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password (8+ chars, complexity enforced)")


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=32)
    avatar_url: str | None = Field(default=None, max_length=512)


@router.post(
    "/change-password",
    response_model=MessageResponse,
    tags=["Auth"],
    summary="Change the authenticated user's password",
    description="Verifies the current password, then replaces it with the new one (rotates all refresh tokens).",
)
async def change_password(
    data: ChangePasswordRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    user = await _current_user(authorization, db)
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    try:
        _validate_password_complexity(data.new_password)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    user.hashed_password = hash_password(data.new_password)
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    # Rotate all refresh tokens so any leaked session is invalidated
    await db.execute(
        Session.__table__.update()
        .where(Session.user_id == user.id, Session.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc).replace(tzinfo=None))
    )
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="user.password_changed",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()
    return MessageResponse(message="Password updated successfully")


@router.put(
    "/me",
    tags=["Auth"],
    summary="Update the authenticated user's profile",
    description="Update editable profile fields (full_name, phone, avatar_url). Returns the updated profile.",
)
async def update_profile(
    data: ProfileUpdateRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    user = await _current_user(authorization, db)
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    for field, value in update_data.items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="user.profile_updated",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
        details={"fields": list(update_data.keys())},
    )
    await db.commit()
    await db.refresh(user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "avatar_url": user.avatar_url,
        "role": user.role.value,
        "tenant_id": user.tenant_id,
    }


# ── MFA Endpoints ──────────────────────────────────────────────────────────────


@router.post(
    "/mfa/enable",
    response_model=MFAEnableResponse,
    tags=["Auth"],
    summary="Enable MFA",
    description=(
        "Generate a TOTP secret for the given user and return it (base32) along "
        "with an otpauth:// URL the user's authenticator app can consume.  The "
        "secret is persisted to ``user.mfa_secret`` but MFA is not yet marked "
        "as enabled — the user must call /mfa/verify with a valid code first."
    ),
)
async def enable_mfa(
    data: MFAEnableRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    current_user = await _current_user(authorization, db)
    if data.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify another user's MFA settings",
        )

    result = await db.execute(select(User).where(User.id == data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    secret = generate_secret()
    user.mfa_secret = secret
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="mfa.enabled",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()

    return MFAEnableResponse(
        secret=secret,
        otpauth_url=otpauth_url(secret=secret, account=user.email),
        backup_codes=generate_backup_codes(),
    )


@router.post(
    "/mfa/verify",
    response_model=MFAVerifyResponse,
    tags=["Auth"],
    summary="Verify MFA code",
    description=(
        "Verify a 6-digit TOTP code against the user's stored secret.  Returns "
        "``verified=true`` and flips ``user.mfa_enabled`` to true on the first "
        "successful verification.  A 30-second clock-skew window is allowed."
    ),
)
async def verify_mfa(
    data: MFAVerifyRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    current_user = await _current_user(authorization, db)
    if data.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot verify another user's MFA",
        )

    result = await db.execute(select(User).where(User.id == data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not user.mfa_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MFA is not enabled for this user",
        )

    if not verify_totp(user.mfa_secret, data.code):
        await audit(
            db,
            tenant_id=user.tenant_id,
            action="mfa.verify",
            resource_type="user",
            resource_id=user.id,
            actor_id=user.id,
            actor_email=user.email,
            outcome="failure",
        )
        await db.commit()
        return MFAVerifyResponse(verified=False, message="Invalid or expired code")

    if not user.mfa_enabled:
        user.mfa_enabled = True
        db.add(user)

    await audit(
        db,
        tenant_id=user.tenant_id,
        action="mfa.verify",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()
    return MFAVerifyResponse(verified=True, message="Code accepted")


# ── Current user ──────────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=MeResponse,
    tags=["Auth"],
    summary="Get current user",
)
async def get_current_user(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(authorization[7:])
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
        email_verified=bool(user.email_verified),
        avatar_url=user.avatar_url,
        phone=user.phone,
        mfa_enabled=user.mfa_enabled,
        tenant_id=user.tenant_id,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        is_demo=bool(user.is_demo),
    )


# ── API Key management ────────────────────────────────────────────────────────


class APIKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Friendly name for the key")
    scopes: list[str] = Field(default_factory=list, description="Permission scopes (e.g. 'read:candidates')")
    expires_in_days: int | None = Field(default=None, ge=1, le=365, description="Optional expiry in days")


class APIKeyCreatedResponse(BaseModel):
    id: str
    name: str
    key: str = Field(..., description="The full API key.  This is the ONLY time the plaintext is returned — store it now.")
    scopes: list[str]
    expires_at: datetime | None
    created_at: datetime


class APIKeyRead(BaseModel):
    id: str
    name: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    revoked: bool


async def _current_user(
    authorization: str | None,
    db: AsyncSession,
    x_api_key: str | None = None,
) -> User:
    """Resolve the authenticated user from the Authorization header or X-API-Key.

    Supports two service-to-service flows:
    1. ``Authorization: Bearer <jwt>`` — existing JWT path.
    2. ``Authorization: Bearer <api_key>`` — API key in the Bearer header. Useful
       for SDKs that only support a single Authorization header.
    3. ``X-API-Key: <key>`` — explicit API key header.
    """
    bearer = None
    if authorization and authorization.startswith("Bearer "):
        bearer = authorization[7:]

    # Try API key path first when explicitly provided.
    api_key = x_api_key or bearer
    if api_key and not api_key.startswith("eyJ"):
        from shared.auth.api_key import resolve_api_key

        record = await resolve_api_key(db, api_key)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API key",
                headers={"WWW-Authenticate": "ApiKey"},
            )
        result = await db.execute(select(User).where(User.id == record.user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return user

    if not bearer:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(bearer)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.post(
    "/api-keys",
    response_model=APIKeyCreatedResponse,
    tags=["Auth"],
    summary="Create a new API key",
    description=(
        "Generates a new API key for the authenticated user.  The plaintext "
        "key is returned ONLY in this response — store it securely.  Future "
        "requests authenticate by passing it as ``X-API-Key``."
    ),
)
async def create_api_key(
    data: APIKeyCreateRequest,
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db_dependency),
):
    user = await _current_user(authorization, db, x_api_key=x_api_key)

    plaintext = generate_api_key()
    key_hash = hash_api_key(plaintext)
    expires_at = (
        (datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)).replace(tzinfo=None)
        if data.expires_in_days
        else None
    )
    record = APIKey(
        tenant_id=user.tenant_id,
        user_id=user.id,
        name=data.name,
        key_hash=key_hash,
        scopes=json.dumps(data.scopes),
        expires_at=expires_at,
    )
    db.add(record)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="api_key.create",
        resource_type="api_key",
        resource_id=record.id,
        actor_id=user.id,
        actor_email=user.email,
        details={"name": data.name, "scopes": data.scopes},
    )
    await db.commit()
    await db.refresh(record)
    return APIKeyCreatedResponse(
        id=record.id,
        name=record.name,
        key=plaintext,
        scopes=json.loads(record.scopes) if record.scopes else [],
        expires_at=record.expires_at,
        created_at=record.created_at,
    )


@router.get(
    "/api-keys",
    tags=["Auth"],
    summary="List the authenticated user's API keys",
)
async def list_api_keys(
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db_dependency),
):
    user = await _current_user(authorization, db, x_api_key=x_api_key)
    result = await db.execute(
        select(APIKey)
        .where(APIKey.user_id == user.id, APIKey.tenant_id == user.tenant_id)
        .order_by(APIKey.created_at.desc())
    )
    rows = result.scalars().all()
    return {
        "data": [
            APIKeyRead(
                id=r.id,
                name=r.name,
                scopes=json.loads(r.scopes) if r.scopes else [],
                last_used_at=r.last_used_at,
                expires_at=r.expires_at,
                created_at=r.created_at,
                revoked=r.revoked_at is not None,
            )
            for r in rows
        ],
        "total": len(rows),
    }


@router.delete(
    "/api-keys/{key_id}",
    tags=["Auth"],
    summary="Revoke an API key",
)
async def revoke_api_key(
    key_id: str,
    authorization: str | None = Header(None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db_dependency),
):
    user = await _current_user(authorization, db, x_api_key=x_api_key)
    result = await db.execute(
        select(APIKey).where(
            APIKey.id == key_id,
            APIKey.user_id == user.id,
            APIKey.tenant_id == user.tenant_id,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    if record.revoked_at is not None:
        return {"id": key_id, "revoked": True, "already_revoked": True}
    record.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(record)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="api_key.revoke",
        resource_type="api_key",
        resource_id=key_id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()
    return {"id": key_id, "revoked": True}


# ── SSO (kept as before) ──────────────────────────────────────────────────────


class SSOLoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="Refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    provider: str = Field(..., description="SSO provider name")
    is_new_user: bool = Field(default=False, description="Whether this is a new user")


@router.post(
    "/sso/{provider}",
    response_model=SSOLoginResponse,
    tags=["Auth"],
    summary="Login via SSO provider",
)
async def sso_login(provider: str, code: str, redirect_uri: str):
    return SSOLoginResponse(
        access_token=f"sso_token_{provider}",
        refresh_token=f"sso_refresh_{provider}",
        provider=provider,
        is_new_user=False,
    )


# ── Demo seeding (admin/dev) ───────────────────────────────────────────────────


@router.post(
    "/admin/seed-demo",
    response_model=MessageResponse,
    tags=["Auth"],
    summary="Seed or refresh the demo account (idempotent)",
    description="Seeds demo@airos.io with password demo1234 and sample data. Safe to call repeatedly.",
)
async def admin_seed_demo(db: AsyncSession = Depends(get_db_dependency)):
    result = await seed_demo_account(db=db)
    return MessageResponse(message=f"Demo seed complete: {result}")


# ── Startup hook ──────────────────────────────────────────────────────────────


async def seed_demo_on_startup() -> None:
    """Called from the main app lifespan to ensure the demo account exists."""
    try:
        await seed_demo_account()
    except Exception as exc:
        logger.warning("Demo seed on startup failed (non-fatal): %s", exc)


# ── 2FA (TOTP) — user-facing flow ────────────────────────────────────────────
#
# Endpoints
#   POST /2fa/setup        — authenticated; returns secret + QR data URL
#   POST /2fa/enable       — authenticated; verifies TOTP, activates 2FA, returns backup codes
#   POST /2fa/disable      — authenticated; verifies current password, deactivates
#   GET  /2fa/status       — authenticated; reports enablement + remaining backup codes
#   POST /login/2fa        — exchanges a short-lived pending-2FA token + TOTP for real tokens
#


class TwoFactorSetupResponse(BaseModel):
    secret: str = Field(..., description="Base32 TOTP secret.  Treat as sensitive.")
    otpauth_url: str = Field(..., description="otpauth:// provisioning URL")
    qr_code_data_url: str = Field(..., description="Base64 PNG data URL for inline rendering")
    issuer: str = Field(default="AI-ROS")


class TwoFactorEnableRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code from the user's authenticator app")


class TwoFactorEnableResponse(BaseModel):
    enabled: bool = True
    backup_codes: list[str] = Field(..., description="One-time recovery codes — shown to the user ONCE")
    message: str = Field(default="Two-factor authentication has been enabled.")


class TwoFactorDisableRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Current account password")


class TwoFactorStatusResponse(BaseModel):
    enabled: bool
    backup_codes_remaining: int = Field(default=0, description="How many unused backup codes remain")


class PendingTwoFactorLoginRequest(BaseModel):
    pending_token: str = Field(..., min_length=8, description="Short-lived token returned by /login when 2FA is required")
    code: str = Field(
        ...,
        min_length=6,
        max_length=32,
        description="6-digit TOTP code OR an 11-character backup code (e.g. ``ABCD-1234``)",
    )
    use_backup_code: bool = Field(default=False, description="Set to true if submitting a backup code instead of a TOTP code")


def _issue_pending_2fa_token(user: User) -> str:
    """Mint a 5-minute JWT that authorises completing a 2FA-protected login."""
    payload = {
        "sub": user.id,
        "email": user.email,
        "tenant_id": user.tenant_id,
        "type": "pending_2fa",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_pending_2fa_token(token: str) -> dict[str, Any] | None:
    """Validate and decode a pending-2FA token.  Returns the payload or None."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
    if not payload or payload.get("type") != "pending_2fa":
        return None
    return payload


def _consume_backup_code(user: User, code: str, db: AsyncSession) -> bool:
    """Pop ``code`` from the user's backup code set.  Returns True if it matched."""
    if not user.backup_codes:
        return False
    try:
        stored: list[str] = json.loads(user.backup_codes)
    except (ValueError, TypeError):
        return False
    target = hash_backup_code(code)
    if target in stored:
        stored.remove(target)
        user.backup_codes = json.dumps(stored)
        db.add(user)
        return True
    return False


@router.post(
    "/2fa/setup",
    response_model=TwoFactorSetupResponse,
    tags=["Auth", "2FA"],
    summary="Begin 2FA enrolment (returns a TOTP secret and QR code)",
    description=(
        "Generates a fresh base32 TOTP secret, persists it to the authenticated "
        "user (without flipping ``totp_enabled``), and returns the secret, the "
        "otpauth:// provisioning URL, and a PNG data URL of the QR code. The "
        "user must then call ``/2fa/enable`` with a valid code to activate 2FA."
    ),
)
async def two_factor_setup(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
) -> TwoFactorSetupResponse:
    user = await _current_user(authorization, db)

    secret = tf_generate_secret()
    user.totp_secret = secret
    user.totp_enabled = False
    user.backup_codes = None
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="2fa.setup",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()

    uri = provisioning_uri(secret=secret, account=user.email, issuer="AI-ROS")
    return TwoFactorSetupResponse(
        secret=secret,
        otpauth_url=uri,
        qr_code_data_url=qr_data_url(uri),
    )


@router.post(
    "/2fa/enable",
    response_model=TwoFactorEnableResponse,
    tags=["Auth", "2FA"],
    summary="Activate 2FA after verifying a TOTP code",
    description=(
        "Verifies the supplied 6-digit code against the pending ``totp_secret`` "
        "set by ``/2fa/setup``. On success, flips ``totp_enabled`` to true and "
        "returns a fresh set of one-time backup codes."
    ),
)
async def two_factor_enable(
    data: TwoFactorEnableRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
) -> TwoFactorEnableResponse:
    user = await _current_user(authorization, db)

    if not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup has not been started. Call /2fa/setup first.",
        )
    if not tf_verify_totp(user.totp_secret, data.code):
        await audit(
            db,
            tenant_id=user.tenant_id,
            action="2fa.enable",
            resource_type="user",
            resource_id=user.id,
            actor_id=user.id,
            actor_email=user.email,
            outcome="failure",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code. Please try again with a fresh code from your authenticator app.",
        )

    backup_codes_plain = tf_generate_backup_codes()
    backup_codes_hashed = [hash_backup_code(c) for c in backup_codes_plain]

    user.totp_enabled = True
    user.backup_codes = json.dumps(backup_codes_hashed)
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="2fa.enable",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()

    return TwoFactorEnableResponse(
        enabled=True,
        backup_codes=backup_codes_plain,
    )


@router.post(
    "/2fa/disable",
    response_model=TwoFactorStatusResponse,
    tags=["Auth", "2FA"],
    summary="Disable 2FA (requires current password)",
    description=(
        "Verifies the user's current password, then clears the TOTP secret, "
        "the enabled flag, and all remaining backup codes."
    ),
)
async def two_factor_disable(
    data: TwoFactorDisableRequest,
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
) -> TwoFactorStatusResponse:
    user = await _current_user(authorization, db)

    if not verify_password(data.password, user.hashed_password):
        await audit(
            db,
            tenant_id=user.tenant_id,
            action="2fa.disable",
            resource_type="user",
            resource_id=user.id,
            actor_id=user.id,
            actor_email=user.email,
            outcome="failure",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    user.totp_secret = None
    user.totp_enabled = False
    user.backup_codes = None
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="2fa.disable",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
    )
    await db.commit()
    return TwoFactorStatusResponse(enabled=False, backup_codes_remaining=0)


@router.get(
    "/2fa/status",
    response_model=TwoFactorStatusResponse,
    tags=["Auth", "2FA"],
    summary="Get the authenticated user's 2FA status",
)
async def two_factor_status(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db_dependency),
) -> TwoFactorStatusResponse:
    user = await _current_user(authorization, db)
    remaining = 0
    if user.backup_codes:
        try:
            remaining = len(json.loads(user.backup_codes))
        except (ValueError, TypeError):
            remaining = 0
    return TwoFactorStatusResponse(enabled=bool(user.totp_enabled), backup_codes_remaining=remaining)


@router.post(
    "/login/2fa",
    tags=["Auth", "2FA"],
    summary="Complete a 2FA-protected login",
    description=(
        "Exchanges a short-lived pending-2FA token (returned by ``/login`` when "
        "the account has 2FA enabled) plus a 6-digit TOTP code (or a backup "
        "code) for a full token pair.  Backup codes are single-use and are "
        "removed from the user's account on successful consumption."
    ),
)
async def login_2fa(
    data: PendingTwoFactorLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db_dependency),
):
    payload = _decode_pending_2fa_token(data.pending_token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Pending 2FA token is invalid or has expired. Please log in again.",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE or user.deactivated_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this account",
        )

    accepted = False
    used_backup = False
    if data.use_backup_code:
        if _consume_backup_code(user, data.code, db):
            accepted = True
            used_backup = True
    else:
        if tf_verify_totp(user.totp_secret, data.code):
            accepted = True

    if not accepted:
        record_failed_attempt(user)
        db.add(user)
        await audit(
            db,
            tenant_id=user.tenant_id,
            action="2fa.login",
            resource_type="user",
            resource_id=user.id,
            actor_id=user.id,
            actor_email=user.email,
            outcome="failure",
        )
        await db.commit()
        if is_account_locked(user):
            remaining = lockout_remaining_seconds(user)
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account is temporarily locked. Try again in {remaining} seconds.",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code",
        )

    record_successful_login(user)

    token_data = {
        "sub": user.id,
        "email": user.email,
        "role": user.role.value,
        "tenant_id": user.tenant_id,
    }
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    refresh_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    session = Session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_token_hash=refresh_hash,
        expires_at=(
            datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        ).replace(tzinfo=None),
    )
    db.add(session)
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)
    await audit(
        db,
        tenant_id=user.tenant_id,
        action="2fa.login",
        resource_type="user",
        resource_id=user.id,
        actor_id=user.id,
        actor_email=user.email,
        details={"used_backup_code": used_backup},
    )
    await db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user={
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.value,
            "email_verified": bool(user.email_verified),
            "is_demo": bool(user.is_demo),
            "two_factor_enabled": True,
        },
    )


def _pending_2fa_login_response(user: User) -> dict[str, Any]:
    """Build the response returned by /login when a 2FA challenge is required."""
    return {
        "mfa_required": True,
        "two_factor_required": True,
        "pending_token": _issue_pending_2fa_token(user),
        "message": "Two-factor authentication required. Submit a TOTP code to /login/2fa.",
    }
