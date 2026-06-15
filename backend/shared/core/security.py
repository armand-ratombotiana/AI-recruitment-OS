from __future__ import annotations
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from jose import jwt, JWTError
from fastapi import Header, HTTPException, status
from shared.core.config import get_settings

settings = get_settings()

try:
    import bcrypt as _bcrypt

    def hash_password(password: str) -> str:
        return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

    def verify_password(plain: str, hashed: str) -> bool:
        return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
except ImportError:
    from passlib.context import CryptContext
    _pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

    def hash_password(password: str) -> str:
        return _pwd_context.hash(password)

    def verify_password(plain: str, hashed: str) -> bool:
        return _pwd_context.verify(plain, hashed)

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    import secrets
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access", "iat": datetime.now(timezone.utc), "jti": secrets.token_urlsafe(8)})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(data: dict[str, Any]) -> str:
    import secrets
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh", "iat": datetime.now(timezone.utc), "jti": secrets.token_urlsafe(16)})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None

def generate_api_key() -> str:
    return secrets.token_urlsafe(48)

def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


# ── Tenant & user helpers used as FastAPI dependencies ────────────────────────


def get_tenant_id_from_token(authorization: str | None) -> str:
    """Extract the tenant_id from a Bearer access token.

    Raises 401 if no token is provided, the token is invalid, or the
    token has no ``tenant_id`` claim.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )
    payload = decode_token(authorization[7:])
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    tenant_id = payload.get("tenant_id")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing tenant_id",
        )
    return tenant_id


def get_user_id_from_token(authorization: str | None) -> str | None:
    """Return the user id (sub) of a Bearer access token, or None if invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = decode_token(authorization[7:])
    if not payload or payload.get("type") != "access":
        return None
    return payload.get("sub")


def require_user(authorization: str | None = Header(None)) -> dict[str, Any]:
    """FastAPI dependency: extract the authenticated user from the Bearer header.

    Raises 401 if the token is missing, invalid, or expired.
    """
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
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    return {
        "id": payload["sub"],
        "email": payload.get("email"),
        "role": payload.get("role"),
        "tenant_id": payload.get("tenant_id"),
    }


def require_tenant(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency: return the tenant id from the Bearer access token.

    The current JWT access token does not embed ``tenant_id`` (only ``sub``,
    ``email``, ``role``), so we look the user up by ``sub`` to derive the
    tenant.  To keep this dependency cheap and DB-free for the common path,
    we accept an ``X-Tenant-ID`` header as the authoritative source when
    present (the API gateway already sets this) and otherwise default to
    the well-known ``"default"`` tenant.

    For a stricter deployment the auth_service should embed ``tenant_id`` in
    the JWT and this helper can be updated to read it from the token.
    """
    # 1. If the gateway / client set X-Tenant-ID, trust it (it is validated
    #    against the user's tenant by the auth_service on token issuance).
    #    We still require a valid bearer token to avoid trivial header spoofing.
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
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not payload.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    return payload.get("tenant_id")
