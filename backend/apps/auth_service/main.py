"""Auth Service — Authentication, registration, MFA, and token management."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.config import get_settings
from shared.core.database import get_db_dependency
from shared.core.models.identity import User, UserRole, UserStatus, Session
from shared.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_api_key,
)


settings = get_settings()


# ── Request Models ──────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address", examples=["user@acme.com"])
    full_name: str = Field(..., min_length=1, max_length=255, description="Full name", examples=["Jane Recruiter"])
    password: str = Field(..., min_length=8, max_length=128, description="Password (min 8 chars)", examples=["SecureP@ss123"])
    role: str = Field(default="candidate", description="User role", examples=["candidate"])

    model_config = {"json_schema_extra": {"examples": [
        {"email": "user@acme.com", "full_name": "Jane Recruiter", "password": "SecureP@ss123", "role": "candidate"}
    ]}}


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address", examples=["user@acme.com"])
    password: str = Field(..., description="User password", examples=["SecureP@ss123"])

    model_config = {"json_schema_extra": {"examples": [
        {"email": "user@acme.com", "password": "SecureP@ss123"}
    ]}}


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Refresh token")


class MFAVerifyRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code", examples=["123456"])


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = Field(default="healthy")
    service: str = Field(default="auth")


class RegisterResponse(BaseModel):
    id: str = Field(..., description="Newly created user ID")
    email: str = Field(..., description="Registered email")
    full_name: str = Field(..., description="User full name")
    role: str = Field(default="candidate", description="Assigned role")
    created: bool = Field(default=True)


class LoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="Refresh token for obtaining new access tokens")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(default=1800, description="Token lifetime in seconds")


class RefreshResponse(BaseModel):
    access_token: str = Field(..., description="New JWT access token")
    expires_in: int = Field(default=1800, description="Token lifetime in seconds")


class LogoutResponse(BaseModel):
    logged_out: bool = Field(default=True)


class MFAEnableResponse(BaseModel):
    secret: str = Field(..., description="TOTP secret key")
    qr_code: str = Field(..., description="Base64-encoded QR code image")
    backup_codes: list[str] = Field(..., description="One-time backup codes")


class MFAVerifyResponse(BaseModel):
    verified: bool = Field(default=True)


class MeResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    status: str
    avatar_url: str | None = None
    phone: str | None = None
    mfa_enabled: bool = False
    tenant_id: str
    created_at: datetime
    last_login_at: datetime | None = None


# ── Router ──────────────────────────────────────────────────────────────────────

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
    description="Create a new user account. Returns the created user profile.",
)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db_dependency)):
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == data.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    # Map role string to enum
    try:
        role = UserRole(data.role)
    except ValueError:
        role = UserRole.CANDIDATE

    # Create user with hashed password
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=role,
        status=UserStatus.ACTIVE,
        tenant_id="default",
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return RegisterResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        created=True,
    )


@router.post(
    "/login",
    response_model=LoginResponse,
    tags=["Auth"],
    summary="Authenticate user",
    description="Verify credentials and return JWT access + refresh tokens.",
)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db_dependency)):
    # Find user by email
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Verify password
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Check user status
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not active",
        )

    # Generate tokens
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Store session with refresh token hash
    refresh_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    session = Session(
        user_id=user.id,
        tenant_id=user.tenant_id,
        refresh_token_hash=refresh_hash,
        expires_at=(datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)).replace(tzinfo=None),
    )
    db.add(session)

    # Update last login
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(user)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    tags=["Auth"],
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new access token.",
)
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db_dependency)):
    # Decode the refresh token
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

    # Find user
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Verify session exists and is not revoked
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

    # Generate new access token
    token_data = {"sub": user.id, "email": user.email, "role": user.role.value}
    access_token = create_access_token(token_data)

    return RefreshResponse(
        access_token=access_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post(
    "/logout",
    response_model=LogoutResponse,
    tags=["Auth"],
    summary="Logout user",
    description="Invalidate the current session and refresh token.",
)
async def logout(data: RefreshRequest, db: AsyncSession = Depends(get_db_dependency)):
    # Revoke the session
    refresh_hash = hashlib.sha256(data.refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(Session).where(Session.refresh_token_hash == refresh_hash)
    )
    session = result.scalar_one_or_none()
    if session:
        session.revoked_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(session)

    return LogoutResponse()


@router.post(
    "/mfa/enable",
    response_model=MFAEnableResponse,
    tags=["Auth"],
    summary="Enable MFA",
    description="Generate TOTP secret and QR code for multi-factor authentication setup.",
)
async def enable_mfa():
    # Generate a random secret for TOTP
    secret = secrets.token_hex(20).upper()
    backup_codes = [secrets.token_hex(3) for _ in range(8)]

    return MFAEnableResponse(
        secret=secret,
        qr_code="data:image/png;base64,...",
        backup_codes=backup_codes,
    )


@router.post(
    "/mfa/verify",
    response_model=MFAVerifyResponse,
    tags=["Auth"],
    summary="Verify MFA code",
    description="Validate a TOTP code to complete MFA enrollment.",
)
async def verify_mfa(data: MFAVerifyRequest):
    # In production, this would validate the TOTP code
    return MFAVerifyResponse(verified=True)


# ── SSO Response Models ────────────────────────────────────────────────────────

class SSOLoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="Refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    provider: str = Field(..., description="SSO provider name")
    is_new_user: bool = Field(default=False, description="Whether this is a new user")


# ── SSO Endpoints ──────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=MeResponse,
    tags=["Auth"],
    summary="Get current user",
    description="Return the authenticated user's profile.",
)
async def get_current_user(authorization: str | None = None, db: AsyncSession = Depends(get_db_dependency)):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return MeResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role.value,
        status=user.status.value,
        avatar_url=user.avatar_url,
        phone=user.phone,
        mfa_enabled=user.mfa_enabled,
        tenant_id=user.tenant_id,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


@router.post(
    "/sso/{provider}",
    response_model=SSOLoginResponse,
    tags=["Auth"],
    summary="Login via SSO provider",
    description="Authenticate using Google, LinkedIn, Microsoft, or Apple SSO.",
)
async def sso_login(provider: str, code: str, redirect_uri: str):
    """Login via SSO provider."""
    # In production, this would exchange the code with the SSO provider
    return SSOLoginResponse(
        access_token=f"sso_token_{provider}",
        refresh_token=f"sso_refresh_{provider}",
        provider=provider,
        is_new_user=False,
    )
