"""API Key authentication helpers.

API keys are issued via ``POST /api/v1/auth/api-keys`` and are stored
hashed (SHA-256) in the ``APIKey`` table.  This module exposes a
FastAPI dependency that accepts either:
- ``Authorization: Bearer <jwt>`` (existing behaviour), OR
- ``X-API-Key: <key>`` (service-to-service auth)

When the X-API-Key header is present, we look up the hash, verify the
key is not revoked / expired, and resolve the associated user/tenant.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from fastapi import Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db_dependency
from shared.core.models.identity import APIKey

logger = logging.getLogger("api_key_auth")


def _hash(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


async def resolve_api_key(
    db: AsyncSession,
    plaintext: str,
) -> APIKey | None:
    """Return the active, unexpired ``APIKey`` row matching ``plaintext``."""
    if not plaintext or len(plaintext) < 16:
        return None
    digest = _hash(plaintext)
    result = await db.execute(
        select(APIKey).where(APIKey.key_hash == digest, APIKey.revoked_at.is_(None))
    )
    return result.scalar_one_or_none()


async def authenticate_with_api_key(
    db: AsyncSession,
    x_api_key: str | None,
) -> dict[str, Any] | None:
    """Resolve the user behind an API key, returning a dict shaped like
    ``require_user``'s output, or ``None`` if the key is invalid."""
    if not x_api_key:
        return None
    record = await resolve_api_key(db, x_api_key)
    if not record:
        return None
    if record.expires_at is not None:
        from datetime import datetime, timezone

        if record.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            return None
    return {
        "id": record.user_id,
        "email": None,
        "role": "service",
        "tenant_id": record.tenant_id,
        "api_key_id": record.id,
        "scopes": json.loads(record.scopes) if record.scopes else [],
    }


async def require_api_key_or_user(
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = get_db_dependency,
) -> dict[str, Any]:
    """FastAPI dependency that accepts either Bearer JWT or X-API-Key.

    API keys may be supplied in two ways:

    * ``X-API-Key: <key>`` header (explicit API key header)
    * ``Authorization: Bearer airos_<key>`` (the ``airos_`` prefix marks
      the bearer token as an API key rather than a JWT)
    """
    # 1. Explicit X-API-Key header.
    if x_api_key:
        user = await authenticate_with_api_key(db, x_api_key)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # 2. Authorization: Bearer airos_<key> — service marker distinguishes
    #    an API key from a JWT (which also uses Bearer).
    if authorization and authorization.startswith("Bearer airos_"):
        api_key = authorization[len("Bearer "):]
        user = await authenticate_with_api_key(db, api_key)
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    # 3. Fall back to JWT via existing helper.
    from shared.core.security import require_user

    return require_user(authorization=authorization)
