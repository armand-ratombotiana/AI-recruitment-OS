"""API key generation, persistence, and authentication.

The key format is::

    airos_<prefix><secret>

* ``airos_`` — service marker so we can distinguish API keys from JWTs that
  happen to be sent in the ``Authorization: Bearer`` header.
* ``prefix`` — first 8 url-safe characters of the secret (32 bits).  Stored
  verbatim on the row so list/usage UIs can show it.
* ``secret`` — remaining url-safe random bytes (32 bytes / 256 bits).

The full key is returned to the caller exactly once on creation.  Only the
SHA-256 hex digest is stored; verification is a constant-time comparison
against the digest.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.api_key import ApiKey


KEY_PREFIX = "airos_"
_PREFIX_LEN = 8
_SECRET_BYTES = 32


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_key() -> tuple[str, str, str]:
    """Mint a fresh API key.

    Returns ``(full_key, prefix, hash)``:

    * ``full_key`` — what the caller stores.  Format ``airos_<prefix><secret>``.
    * ``prefix``   — first ``PREFIX_LEN`` characters of the random part
      (after the ``airos_`` marker); safe to display in the dashboard.
    * ``hash``     — SHA-256 hex digest of the full key.  This is the only
      value that ever lands in the database.
    """
    raw = secrets.token_urlsafe(_SECRET_BYTES)
    prefix = raw[:_PREFIX_LEN]
    full_key = f"{KEY_PREFIX}{raw}"
    return full_key, prefix, _hash(full_key)


def verify_key(key: str, hash_value: str) -> bool:
    """Constant-time check that ``key`` hashes to ``hash_value``."""
    if not key or not hash_value:
        return False
    return hmac.compare_digest(_hash(key), hash_value)


def _serialize_scopes(scopes: Iterable[str] | str | None) -> str:
    if scopes is None:
        return "[]"
    if isinstance(scopes, str):
        try:
            parsed = json.loads(scopes)
            if isinstance(parsed, list):
                return json.dumps(parsed)
        except (ValueError, TypeError):
            pass
        return json.dumps([scopes])
    return json.dumps(list(scopes))


def _deserialize_scopes(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(s) for s in parsed]
    except (ValueError, TypeError):
        return []
    return []


def is_expired(record: ApiKey) -> bool:
    if record.expires_at is None:
        return False
    expires = record.expires_at
    if expires.tzinfo is not None:
        expires = expires.replace(tzinfo=None)
    return expires < _utcnow()


async def create_api_key(
    db: AsyncSession,
    *,
    user_id: str,
    tenant_id: str,
    name: str,
    scopes: Iterable[str] | str | None = None,
    expires_in_days: int | None = None,
) -> tuple[ApiKey, str]:
    """Create and persist a new ``ApiKey``.

    Returns ``(record, full_key)``.  ``full_key`` is the only chance the
    caller has to capture the secret — only the hash is stored.
    """
    full_key, prefix, digest = generate_key()
    record = ApiKey(
        tenant_id=tenant_id,
        user_id=user_id,
        name=name,
        key_prefix=prefix,
        key_hash=digest,
        scopes=_serialize_scopes(scopes),
    )
    if expires_in_days is not None:
        record.expires_at = _utcnow() + timedelta(days=int(expires_in_days))
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record, full_key


async def revoke_api_key(db: AsyncSession, key_id: str, tenant_id: str) -> bool:
    """Revoke a single key.  Returns True when a row was updated."""
    record = (
        await db.execute(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if record is None:
        return False
    if record.revoked:
        return True
    record.revoked = True
    await db.flush()
    return True


async def list_api_keys(db: AsyncSession, tenant_id: str, *, user_id: str | None = None) -> list[ApiKey]:
    """List keys for a tenant, optionally narrowed to a single user.

    Most-recently-created first.
    """
    stmt = select(ApiKey).where(ApiKey.tenant_id == tenant_id)
    if user_id is not None:
        stmt = stmt.where(ApiKey.user_id == user_id)
    stmt = stmt.order_by(ApiKey.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_api_key(db: AsyncSession, key_id: str, tenant_id: str) -> ApiKey | None:
    return (
        await db.execute(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()


async def update_api_key(
    db: AsyncSession,
    key_id: str,
    tenant_id: str,
    *,
    name: str | None = None,
    scopes: Iterable[str] | str | None = None,
) -> ApiKey | None:
    """Update mutable fields (``name``, ``scopes``).  Returns the updated row."""
    record = await get_api_key(db, key_id, tenant_id)
    if record is None:
        return None
    if name is not None:
        cleaned = name.strip()
        if cleaned:
            record.name = cleaned
    if scopes is not None:
        record.scopes = _serialize_scopes(scopes)
    await db.flush()
    await db.refresh(record)
    return record


async def authenticate_api_key(db: AsyncSession, key: str) -> ApiKey | None:
    """Resolve a plaintext API key into its database row.

    Returns ``None`` for unknown, revoked, or expired keys.
    """
    if not key or not key.startswith(KEY_PREFIX):
        return None
    digest = _hash(key)
    record = (
        await db.execute(
            select(ApiKey).where(ApiKey.key_hash == digest, ApiKey.revoked.is_(False))
        )
    ).scalar_one_or_none()
    if record is None:
        return None
    if is_expired(record):
        return None
    return record


async def touch_last_used(db: AsyncSession, record: ApiKey) -> None:
    """Bump ``last_used_at`` to now.  Best-effort — never raises."""
    record.last_used_at = _utcnow()
    try:
        await db.flush()
    except Exception:
        await db.rollback()


def record_scopes(record: ApiKey) -> list[str]:
    return _deserialize_scopes(record.scopes)


def to_user_dict(record: ApiKey) -> dict[str, Any]:
    """Shape the resolved record as a ``require_user``-style payload."""
    return {
        "id": record.user_id,
        "email": None,
        "role": "service",
        "tenant_id": record.tenant_id,
        "api_key_id": record.id,
        "scopes": record_scopes(record),
    }
