"""Audit Service — queryable, admin-only view over the ``audit_logs`` table.

All endpoints are scoped to the caller's tenant.  Only ``admin`` and
``super_admin`` roles can read logs — recruiter / member / viewer roles
get a 403.

Endpoints:

* ``GET    /api/v1/audit/logs``                              — paginated list
* ``GET    /api/v1/audit/logs/{id}``                          — fetch one
* ``GET    /api/v1/audit/logs/user/{user_id}``                — filter by user
* ``GET    /api/v1/audit/logs/resource/{type}/{id}``          — filter by resource
* ``GET    /api/v1/audit/logs/action/{action}``               — filter by action
* ``POST   /api/v1/audit/logs``                              — append a new row
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from shared.auth import require_admin, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.audit_log import AuditLog


# ── Schemas ────────────────────────────────────────────────────────────────────


class AuditLogRead(BaseModel):
    id: str
    tenant_id: str
    user_id: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    data: list[AuditLogRead]
    total: int
    limit: int
    offset: int


class AuditLogCreate(BaseModel):
    action: str = Field(..., min_length=1, max_length=200)
    resource_type: str = Field(..., min_length=1, max_length=100)
    resource_id: Optional[str] = Field(default=None, max_length=200)
    user_id: Optional[str] = Field(default=None, max_length=100)
    details: dict[str, Any] = Field(default_factory=dict)
    ip_address: Optional[str] = Field(default=None, max_length=64)
    user_agent: Optional[str] = Field(default=None, max_length=512)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _to_read(row: AuditLog) -> AuditLogRead:
    return AuditLogRead(
        id=row.id,
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        action=row.action,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        details=row.details or {},
        ip_address=row.ip_address,
        user_agent=row.user_agent,
        created_at=row.created_at,
    )


async def _paginate(
    db: AsyncSession,
    *,
    tenant_id: str,
    stmt,
    limit: int,
    offset: int,
) -> AuditLogListResponse:
    page = (await db.execute(stmt.limit(limit).offset(offset))).scalars().all()
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()
    return AuditLogListResponse(
        data=[_to_read(r) for r in page],
        total=int(total),
        limit=limit,
        offset=offset,
    )


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", tags=["Audit"])
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "audit"}


@router.get(
    "/logs",
    response_model=AuditLogListResponse,
    tags=["Audit"],
    summary="List audit logs for the current tenant (admin only)",
)
async def list_logs(
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
) -> AuditLogListResponse:
    stmt = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.created_at.desc())
    )
    return await _paginate(db, tenant_id=tenant_id, stmt=stmt, limit=limit, offset=offset)


@router.get(
    "/logs/{log_id}",
    response_model=AuditLogRead,
    tags=["Audit"],
    summary="Get a single audit log entry (admin only)",
)
async def get_log(
    log_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
) -> AuditLogRead:
    row = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.id == log_id,
                AuditLog.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Audit log {log_id} not found")
    return _to_read(row)


@router.get(
    "/logs/user/{user_id}",
    response_model=AuditLogListResponse,
    tags=["Audit"],
    summary="List audit logs filtered by user (admin only)",
)
async def list_logs_by_user(
    user_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
) -> AuditLogListResponse:
    stmt = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant_id, AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
    )
    return await _paginate(db, tenant_id=tenant_id, stmt=stmt, limit=limit, offset=offset)


@router.get(
    "/logs/resource/{resource_type}/{resource_id}",
    response_model=AuditLogListResponse,
    tags=["Audit"],
    summary="List audit logs filtered by resource (admin only)",
)
async def list_logs_by_resource(
    resource_type: str,
    resource_id: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
) -> AuditLogListResponse:
    stmt = (
        select(AuditLog)
        .where(
            AuditLog.tenant_id == tenant_id,
            AuditLog.resource_type == resource_type,
            AuditLog.resource_id == resource_id,
        )
        .order_by(AuditLog.created_at.desc())
    )
    return await _paginate(db, tenant_id=tenant_id, stmt=stmt, limit=limit, offset=offset)


@router.get(
    "/logs/action/{action}",
    response_model=AuditLogListResponse,
    tags=["Audit"],
    summary="List audit logs filtered by action (admin only)",
)
async def list_logs_by_action(
    action: str,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
) -> AuditLogListResponse:
    stmt = (
        select(AuditLog)
        .where(AuditLog.tenant_id == tenant_id, AuditLog.action == action)
        .order_by(AuditLog.created_at.desc())
    )
    return await _paginate(db, tenant_id=tenant_id, stmt=stmt, limit=limit, offset=offset)


@router.post(
    "/logs",
    response_model=AuditLogRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Audit"],
    summary="Append a new audit log entry",
)
async def create_log(
    payload: AuditLogCreate,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    _admin: dict = Depends(require_admin),
) -> AuditLogRead:
    row = AuditLog(
        tenant_id=tenant_id,
        user_id=payload.user_id,
        action=payload.action,
        resource_type=payload.resource_type,
        resource_id=payload.resource_id,
        details=payload.details,
        ip_address=payload.ip_address,
        user_agent=payload.user_agent,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_read(row)
