"""Versioning & migration introspection endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncEngine

from shared.auth import require_admin, require_tenant_id
from shared.versioning.api_version import (
    CURRENT_API_VERSION,
    SUPPORTED_API_VERSIONS,
    DEPRECATED_VERSIONS,
    SUNSET_DATES,
)
from shared.core.database import engine as _default_engine
from shared.migrations.manager import MigrationManager

router = APIRouter()


def _get_engine() -> AsyncEngine:
    return _default_engine


@router.get("/version")
async def get_api_version(
    _tenant_id: str = Depends(require_tenant_id),
):
    return {
        "current": CURRENT_API_VERSION,
        "supported": list(SUPPORTED_API_VERSIONS),
        "deprecated": list(DEPRECATED_VERSIONS),
        "sunset_dates": dict(SUNSET_DATES),
    }


@router.get("/migrations")
async def list_migrations(
    _tenant_id: str = Depends(require_tenant_id),
    engine: AsyncEngine = Depends(_get_engine),
):
    manager = MigrationManager(engine)
    status = await manager.get_status()
    return status


@router.post("/migrations")
async def run_migrations(
    _tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
    engine: AsyncEngine = Depends(_get_engine),
):
    manager = MigrationManager(engine)
    results = await manager.run_pending()
    applied = [
        {"version": r.version, "action": r.action, "success": r.success, "message": r.message, "duration_ms": round(r.duration_ms, 2)}
        for r in results
    ]
    all_ok = all(r.success for r in results)
    return JSONResponse(
        status_code=200 if all_ok else 500,
        content={
            "applied": applied,
            "total": len(applied),
            "success": all_ok,
        },
    )


@router.post("/migrations/rollback")
async def rollback_migration(
    _tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
    engine: AsyncEngine = Depends(_get_engine),
):
    manager = MigrationManager(engine)
    results = await manager.rollback()
    rolled = [
        {"version": r.version, "action": r.action, "success": r.success, "message": r.message}
        for r in results
    ]
    all_ok = all(r.success for r in results)
    return JSONResponse(
        status_code=200 if all_ok else 500,
        content={"rolled_back": rolled, "total": len(rolled), "success": all_ok},
    )
