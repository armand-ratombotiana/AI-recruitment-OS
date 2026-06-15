"""API Key management service.

Exposes CRUD endpoints for tenant-scoped API keys:

* ``GET    /api/v1/api-keys``              list keys
* ``POST   /api/v1/api-keys``              create key (returns secret ONCE)
* ``GET    /api/v1/api-keys/{id}``         fetch metadata
* ``PUT    /api/v1/api-keys/{id}``         update name / scopes
* ``DELETE /api/v1/api-keys/{id}``         revoke key
* ``GET    /api/v1/api-keys/{id}/usage``   basic usage stats
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.api_keys import manager
from shared.auth import require_tenant_id, require_user
from shared.core.database import get_db_dependency
from shared.core.models.api_key import ApiKey


router = APIRouter()


# ── Pydantic schemas ─────────────────────────────────────────────────────────


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=list)
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)


class ApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    scopes: list[str] | None = None


class ApiKeyRead(BaseModel):
    id: str
    tenant_id: str
    user_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime
    revoked: bool

    @classmethod
    def from_record(cls, record: ApiKey) -> "ApiKeyRead":
        return cls(
            id=record.id,
            tenant_id=record.tenant_id,
            user_id=record.user_id,
            name=record.name,
            key_prefix=record.key_prefix,
            scopes=manager.record_scopes(record),
            last_used_at=record.last_used_at,
            expires_at=record.expires_at,
            created_at=record.created_at,
            revoked=record.revoked,
        )


class ApiKeyCreateResponse(BaseModel):
    key: ApiKeyRead
    full_key: str
    warning: str = "Store this key securely — it will not be shown again."


class ApiKeyListResponse(BaseModel):
    data: list[ApiKeyRead]
    total: int


class ApiKeyUsageResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    revoked: bool
    last_used_at: datetime | None
    created_at: datetime
    expires_at: datetime | None
    is_expired: bool
    total_requests: int = 0
    requests_last_24h: int = 0
    requests_last_7d: int = 0


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get(
    "/health",
    tags=["API Keys"],
    summary="API key service health",
)
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "api-keys"}


@router.get(
    "/",
    response_model=ApiKeyListResponse,
    tags=["API Keys"],
    summary="List API keys",
    description=(
        "Return the API keys owned by the authenticated user.  Tenant "
        "isolation is enforced automatically."
    ),
)
async def list_keys(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_user),
) -> ApiKeyListResponse:
    records = await manager.list_api_keys(db, tenant_id, user_id=user["id"])
    items = [ApiKeyRead.from_record(r) for r in records]
    return ApiKeyListResponse(data=items, total=len(items))


@router.post(
    "/",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["API Keys"],
    summary="Create a new API key",
    description=(
        "Mints a new API key for the authenticated user.  The full key is "
        "returned **once** — store it securely."
    ),
)
async def create_key(
    payload: ApiKeyCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_user),
) -> ApiKeyCreateResponse:
    record, full_key = await manager.create_api_key(
        db,
        user_id=user["id"],
        tenant_id=tenant_id,
        name=payload.name,
        scopes=payload.scopes,
        expires_in_days=payload.expires_in_days,
    )
    await db.commit()
    await db.refresh(record)
    return ApiKeyCreateResponse(
        key=ApiKeyRead.from_record(record),
        full_key=full_key,
    )


@router.get(
    "/{key_id}",
    response_model=ApiKeyRead,
    tags=["API Keys"],
    summary="Get API key metadata",
)
async def get_key(
    key_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_user),
) -> ApiKeyRead:
    record = await manager.get_api_key(db, key_id, tenant_id)
    if record is None or record.user_id != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )
    return ApiKeyRead.from_record(record)


@router.put(
    "/{key_id}",
    response_model=ApiKeyRead,
    tags=["API Keys"],
    summary="Update an API key",
    description="Update the key's ``name`` and/or ``scopes``.",
)
async def update_key(
    key_id: str,
    payload: ApiKeyUpdate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_user),
) -> ApiKeyRead:
    existing = await manager.get_api_key(db, key_id, tenant_id)
    if existing is None or existing.user_id != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )
    record = await manager.update_api_key(
        db,
        key_id,
        tenant_id,
        name=payload.name,
        scopes=payload.scopes,
    )
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )
    await db.commit()
    await db.refresh(record)
    return ApiKeyRead.from_record(record)


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["API Keys"],
    summary="Revoke an API key",
)
async def revoke_key(
    key_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_user),
) -> Response:
    existing = await manager.get_api_key(db, key_id, tenant_id)
    if existing is None or existing.user_id != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )
    revoked = await manager.revoke_api_key(db, key_id, tenant_id)
    if not revoked:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )
    await db.commit()
    return Response(status_code=204)


@router.get(
    "/{key_id}/usage",
    response_model=ApiKeyUsageResponse,
    tags=["API Keys"],
    summary="Get usage statistics for an API key",
    description=(
        "Returns the key's last-used timestamp, expiration status, and "
        "request counters for the last 24 hours and 7 days."
    ),
)
async def key_usage(
    key_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict[str, Any] = Depends(require_user),
) -> ApiKeyUsageResponse:
    record = await manager.get_api_key(db, key_id, tenant_id)
    if record is None or record.user_id != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="API key not found"
        )

    # Best-effort usage stats.  We don't currently log every API key
    # request, so the counters degrade gracefully to 0.  The endpoint is
    # designed so an audit/usage table can be wired in later without
    # changing the contract.
    total = 0
    last_24h = 0
    last_7d = 0
    try:
        from shared.core.models.audit_log import AuditLog  # noqa: WPS433

        result = await db.execute(
            select(AuditLog).where(
                AuditLog.tenant_id == tenant_id,
                AuditLog.action == "api_key_auth",
                AuditLog.resource_id == key_id,
            )
        )
        rows = list(result.scalars().all())
        total = len(rows)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        for row in rows:
            ts = row.created_at
            if ts is None:
                continue
            if ts.tzinfo is not None:
                ts = ts.replace(tzinfo=None)
            delta = now - ts
            if delta.total_seconds() <= 86400:
                last_24h += 1
            if delta.total_seconds() <= 86400 * 7:
                last_7d += 1
    except Exception:
        # AuditLog is optional; if the table isn't available we still
        # return the basic metadata.
        total = 0
        last_24h = 0
        last_7d = 0

    return ApiKeyUsageResponse(
        id=record.id,
        name=record.name,
        key_prefix=record.key_prefix,
        revoked=record.revoked,
        last_used_at=record.last_used_at,
        created_at=record.created_at,
        expires_at=record.expires_at,
        is_expired=manager.is_expired(record),
        total_requests=total,
        requests_last_24h=last_24h,
        requests_last_7d=last_7d,
    )
