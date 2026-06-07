"""ApiKey domain model — tenant-scoped API keys for service-to-service auth.

Keys are issued via ``POST /api/v1/api-keys``.  The full plaintext key is
returned to the caller exactly once at creation time; only the SHA-256
``key_hash`` and a short ``key_prefix`` are persisted for verification and
listing purposes.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import Field as SQLField, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class ApiKey(SQLModel, table=True):
    __tablename__ = "user_api_keys"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    user_id: str = SQLField(index=True)
    name: str
    key_prefix: str = SQLField(index=True)
    key_hash: str = SQLField(index=True, unique=True)
    scopes: str = "[]"
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=_utcnow)
    revoked: bool = False
