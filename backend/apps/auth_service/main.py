"""Auth Service — Authentication, registration, MFA, and token management."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, Field


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
async def register(data: RegisterRequest):
    return RegisterResponse(id="user_new", email=data.email, full_name=data.full_name, role=data.role)


@router.post(
    "/login",
    response_model=LoginResponse,
    tags=["Auth"],
    summary="Authenticate user",
    description="Verify credentials and return JWT access + refresh tokens.",
)
async def login(data: LoginRequest):
    return LoginResponse(
        access_token="eyJhbGciOiJIUzI1NiJ9.mock_token",
        refresh_token="refresh_mock",
    )


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    tags=["Auth"],
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new access token.",
)
async def refresh():
    return RefreshResponse(access_token="eyJhbGciOiJIUzI1NiJ9.new_token")


@router.post(
    "/logout",
    response_model=LogoutResponse,
    tags=["Auth"],
    summary="Logout user",
    description="Invalidate the current session and refresh token.",
)
async def logout():
    return LogoutResponse()


@router.post(
    "/mfa/enable",
    response_model=MFAEnableResponse,
    tags=["Auth"],
    summary="Enable MFA",
    description="Generate TOTP secret and QR code for multi-factor authentication setup.",
)
async def enable_mfa():
    return MFAEnableResponse(
        secret="JBSWY3DPEHPK3PXP",
        qr_code="data:image/png;base64,...",
        backup_codes=["123456", "789012"],
    )


@router.post(
    "/mfa/verify",
    response_model=MFAVerifyResponse,
    tags=["Auth"],
    summary="Verify MFA code",
    description="Validate a TOTP code to complete MFA enrollment.",
)
async def verify_mfa(code: str = "000000"):
    return MFAVerifyResponse()
