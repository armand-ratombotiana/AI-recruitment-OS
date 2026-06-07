"""Identity domain — User, Session, Credential, MFA models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, EmailStr, Field
from sqlmodel import SQLModel, Field as SQLField


class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    TENANT_ADMIN = "tenant_admin"
    RECRUITER = "recruiter"
    HIRING_MANAGER = "hiring_manager"
    INTERVIEWER = "interviewer"
    CANDIDATE = "candidate"


class UserStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    email: str = SQLField(index=True, unique=True)
    full_name: str
    hashed_password: str
    role: UserRole = UserRole.CANDIDATE
    status: UserStatus = UserStatus.ACTIVE
    avatar_url: str | None = None
    phone: str | None = None
    mfa_enabled: bool = False
    mfa_secret: str | None = None
    totp_secret: str | None = None
    totp_enabled: bool = False
    backup_codes: str | None = None
    last_login_at: datetime | None = None
    email_verified: bool = False
    email_verified_at: datetime | None = None
    is_demo: bool = False
    failed_login_attempts: int = 0
    locked_until: datetime | None = None
    deactivated_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    refresh_token_hash: str
    user_agent: str | None = None
    ip_address: str | None = None
    expires_at: datetime
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    revoked_at: datetime | None = None


class APIKey(SQLModel, table=True):
    __tablename__ = "api_keys"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    user_id: str = SQLField(index=True)
    name: str
    key_hash: str
    scopes: str = "[]"
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    revoked_at: datetime | None = None


class Credential(SQLModel, table=True):
    __tablename__ = "credentials"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = SQLField(index=True)
    provider: str
    provider_user_id: str | None = None
    access_token: str | None = None
    refresh_token: str | None = None
    expires_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# --- API Schemas ---


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8)
    role: UserRole = UserRole.CANDIDATE


class UserRead(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: str
    role: UserRole
    status: UserStatus
    avatar_url: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=8)
    role: UserRole = UserRole.CANDIDATE


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordReset(BaseModel):
    token: str
    new_password: str = Field(min_length=8)
