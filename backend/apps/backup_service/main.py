"""Backup & Restore Service.

Tenant-scoped CRUD over :class:`~shared.core.models.backup.Backup`
with admin-only writes.  The actual snapshot payload lives in the
in-memory store in :mod:`shared.backup.engine`; this service exposes
the HTTP surface for create, list, get, download, restore, and delete.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from shared.auth import require_admin, require_tenant_id
from shared.backup import engine as backup_engine
from shared.backup.engine import (
    ALLOWED_BACKUP_TYPES,
    create_backup as _create_backup,
    delete_backup as _delete_backup,
    get_backup as _get_backup,
    get_backup_payload,
    list_backups as _list_backups,
    restore_backup as _restore_backup,
)
from shared.core.database import get_db_dependency
from shared.core.models.backup import Backup


router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────────


class BackupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(
        default="full",
        description="full | candidates | jobs | workflows | config",
    )


class BackupRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    type: str
    size_bytes: int
    status: str
    created_by: Optional[str] = None
    meta: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BackupListResponse(BaseModel):
    data: list[BackupRead]
    total: int


class RestoreResponse(BaseModel):
    status: str
    backup_id: str
    type: Optional[str] = None
    restored_at: Optional[str] = None
    payload: Optional[dict[str, Any]] = None
    error: Optional[str] = None


class DeleteResponse(BaseModel):
    id: str
    deleted: bool


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "backups"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _to_read(row: Backup) -> BackupRead:
    return BackupRead(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        type=row.type,
        size_bytes=row.size_bytes,
        status=row.status,
        created_by=row.created_by,
        meta=row.meta,
        created_at=row.created_at,
    )


def _validate_type(backup_type: str) -> str:
    if not backup_type:
        return "full"
    cleaned = backup_type.strip().lower()
    if cleaned not in ALLOWED_BACKUP_TYPES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Invalid backup type '{backup_type}'. "
                f"Allowed: {sorted(ALLOWED_BACKUP_TYPES)}"
            ),
        )
    return cleaned


# ── Router ─────────────────────────────────────────────────────────────────────


@router.get("/health", response_model=HealthResponse, tags=["Backups"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get(
    "/",
    response_model=BackupListResponse,
    tags=["Backups"],
    summary="List backups for the current tenant",
)
async def list_backups(
    type: Optional[str] = Query(
        default=None,
        description="Filter by backup type (full | candidates | jobs | workflows | config)",
    ),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> BackupListResponse:
    rows = await _list_backups(db, tenant_id)
    if type:
        cleaned = _validate_type(type)
        rows = [r for r in rows if r.type == cleaned]
    data = [_to_read(r) for r in rows]
    return BackupListResponse(data=data, total=len(data))


@router.post(
    "/",
    response_model=BackupRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Backups"],
    summary="Create a new backup (admin only)",
)
async def create_backup(
    payload: BackupCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
) -> BackupRead:
    backup_type = _validate_type(payload.type)
    user_id = admin.get("id") or admin.get("sub")
    row = await _create_backup(
        db=db,
        tenant_id=tenant_id,
        user_id=str(user_id) if user_id else "",
        name=payload.name,
        type=backup_type,
    )
    return _to_read(row)


@router.get(
    "/{backup_id}",
    response_model=BackupRead,
    tags=["Backups"],
    summary="Get a single backup by id",
)
async def get_backup(
    backup_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> BackupRead:
    row = await _get_backup(db, backup_id, tenant_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Backup not found")
    return _to_read(row)


@router.delete(
    "/{backup_id}",
    response_model=DeleteResponse,
    tags=["Backups"],
    summary="Delete a backup (admin only)",
)
async def delete_backup(
    backup_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> DeleteResponse:
    ok = await _delete_backup(db, backup_id, tenant_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Backup not found")
    return DeleteResponse(id=backup_id, deleted=True)


@router.get(
    "/{backup_id}/download",
    tags=["Backups"],
    summary="Download a backup's raw JSON content",
)
async def download_backup(
    backup_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    row = await _get_backup(db, backup_id, tenant_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Backup not found")
    payload = await get_backup_payload(backup_id)
    if payload is None:
        raise HTTPException(
            status_code=410,
            detail="Backup payload is no longer available",
        )
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "size_bytes": row.size_bytes,
        "created_at": row.created_at.isoformat(),
        "content": payload,
    }


@router.post(
    "/{backup_id}/restore",
    response_model=RestoreResponse,
    tags=["Backups"],
    summary="Restore a backup (admin only)",
)
async def restore_backup(
    backup_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
) -> RestoreResponse:
    result = await _restore_backup(db, backup_id, tenant_id)
    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Backup not found")
    return RestoreResponse(**result)
