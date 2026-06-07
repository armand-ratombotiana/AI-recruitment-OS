"""Tenant Service — Multi-tenant organization management, settings, branding, and usage tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from apps.billing_service.plans import get_plan
from shared.auth import require_admin, require_tenant_id
from shared.core.database import get_db_dependency
from shared.tenants import QuotaExceededError, TenantManager


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_tenants: dict[str, dict[str, Any]] = {}
_tenant_settings: dict[str, dict[str, Any]] = {}
_tenant_branding: dict[str, dict[str, Any]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Organization name")
    slug: str = Field(..., min_length=1, max_length=100, description="URL-friendly identifier")
    plan: str = Field(default="free", description="Subscription plan")


class TenantUpdateRequest(BaseModel):
    name: str | None = Field(None, description="Organization name")
    plan: str | None = Field(None, description="Subscription plan")
    status: str | None = Field(None, description="active | suspended | deleted")


class CurrentTenantUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255, description="Organization name")
    plan: str | None = Field(None, description="Subscription plan (free | starter | pro | enterprise)")
    status: str | None = Field(None, description="active | suspended | deleted")


class TenantSettingsUpdateRequest(BaseModel):
    notifications: bool | None = Field(None, description="Enable notifications")
    ai_enabled: bool | None = Field(None, description="Enable AI features")
    max_users: int | None = Field(None, ge=1, description="Maximum user seats")
    default_language: str | None = Field(None, description="Default UI language")
    timezone: str | None = Field(None, description="Tenant timezone")


class BrandingUpdateRequest(BaseModel):
    primary_color: str | None = Field(None, description="Primary brand color (hex)")
    logo_url: str | None = Field(None, description="Logo image URL")
    company_name: str | None = Field(None, description="Display company name")
    favicon_url: str | None = Field(None, description="Favicon image URL")
    custom_css: str | None = Field(None, description="Custom CSS overrides")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "tenant"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Tenants"])
async def health():
    return HealthResponse()


@router.get("/", tags=["Tenants"], summary="List tenants")
async def list_tenants(
    caller_tenant_id: str = Depends(require_tenant_id),
):
    items = list(_tenants.values())
    if caller_tenant_id != "default":
        items = [t for t in items if t["id"] == caller_tenant_id]
    return {"data": items, "total": len(items)}


@router.post("/", tags=["Tenants"], summary="Create tenant")
async def create_tenant(
    data: TenantCreateRequest,
    _admin: dict = Depends(require_admin),
):
    tenant_id = f"t_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    tenant = {
        "id": tenant_id, "name": data.name, "slug": data.slug, "plan": data.plan,
        "status": "active", "created_at": now, "updated_at": now,
    }
    _tenants[tenant_id] = tenant
    _tenant_settings[tenant_id] = {
        "tenant_id": tenant_id,
        "settings": {"notifications": True, "ai_enabled": True, "max_users": 100, "default_language": "en", "timezone": "UTC"},
    }
    _tenant_branding[tenant_id] = {
        "tenant_id": tenant_id,
        "branding": {"primary_color": "#3b82f6", "logo_url": "/logo.svg", "company_name": data.name},
    }
    return {"id": tenant_id, "name": data.name, "slug": data.slug, "plan": data.plan, "created": True}


@router.get("/{tenant_id}", tags=["Tenants"], summary="Get tenant details")
async def get_tenant(
    tenant_id: str,
    caller_tenant_id: str = Depends(require_tenant_id),
):
    if tenant_id not in _tenants:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _tenants[tenant_id]


@router.put("/{tenant_id}", tags=["Tenants"], summary="Update tenant")
async def update_tenant(
    tenant_id: str,
    data: TenantUpdateRequest,
    caller_tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    if tenant_id not in _tenants:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    now = datetime.now(timezone.utc).isoformat()
    if data.name is not None:
        _tenants[tenant_id]["name"] = data.name
    if data.plan is not None:
        _tenants[tenant_id]["plan"] = data.plan
    if data.status is not None:
        _tenants[tenant_id]["status"] = data.status
    _tenants[tenant_id]["updated_at"] = now
    return {"id": tenant_id, "updated": True}


@router.delete("/{tenant_id}", tags=["Tenants"], summary="Delete tenant")
async def delete_tenant(
    tenant_id: str,
    caller_tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    if tenant_id not in _tenants:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    del _tenants[tenant_id]
    _tenant_settings.pop(tenant_id, None)
    _tenant_branding.pop(tenant_id, None)
    return {"id": tenant_id, "deleted": True}


@router.get("/{tenant_id}/settings", tags=["Tenants"], summary="Get tenant settings")
async def get_tenant_settings(
    tenant_id: str,
    caller_tenant_id: str = Depends(require_tenant_id),
):
    if tenant_id not in _tenant_settings:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _tenant_settings[tenant_id]


@router.put("/{tenant_id}/settings", tags=["Tenants"], summary="Update tenant settings")
async def update_tenant_settings(
    tenant_id: str,
    data: TenantSettingsUpdateRequest,
    caller_tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    if tenant_id not in _tenant_settings:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    settings = _tenant_settings[tenant_id]["settings"]
    if data.notifications is not None:
        settings["notifications"] = data.notifications
    if data.ai_enabled is not None:
        settings["ai_enabled"] = data.ai_enabled
    if data.max_users is not None:
        settings["max_users"] = data.max_users
    if data.default_language is not None:
        settings["default_language"] = data.default_language
    if data.timezone is not None:
        settings["timezone"] = data.timezone
    return _tenant_settings[tenant_id]


@router.get("/{tenant_id}/branding", tags=["Tenants"], summary="Get tenant branding")
async def get_branding(
    tenant_id: str,
    caller_tenant_id: str = Depends(require_tenant_id),
):
    if tenant_id not in _tenant_branding:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return _tenant_branding[tenant_id]


@router.put("/{tenant_id}/branding", tags=["Tenants"], summary="Update tenant branding")
async def update_branding(
    tenant_id: str,
    data: BrandingUpdateRequest,
    caller_tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    if tenant_id not in _tenant_branding:
        raise HTTPException(status_code=404, detail="Tenant not found")
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    branding = _tenant_branding[tenant_id]["branding"]
    if data.primary_color is not None:
        branding["primary_color"] = data.primary_color
    if data.logo_url is not None:
        branding["logo_url"] = data.logo_url
    if data.company_name is not None:
        branding["company_name"] = data.company_name
    if data.favicon_url is not None:
        branding["favicon_url"] = data.favicon_url
    if data.custom_css is not None:
        branding["custom_css"] = data.custom_css
    return _tenant_branding[tenant_id]


@router.get("/{tenant_id}/usage", tags=["Tenants"], summary="Get tenant usage")
async def get_tenant_usage(
    tenant_id: str,
    caller_tenant_id: str = Depends(require_tenant_id),
):
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "tenant_id": tenant_id, "period": "2025-01",
        "users_active": 23, "users_total": 50, "candidates": 156, "jobs": 12,
        "interviews": 42, "ai_tokens_used": 1250000, "storage_gb": 12.5, "api_calls": 84320,
    }


@router.get("/{tenant_id}/usage/history", tags=["Tenants"], summary="Get tenant usage history")
async def get_tenant_usage_history(
    tenant_id: str,
    caller_tenant_id: str = Depends(require_tenant_id),
):
    if caller_tenant_id != "default" and tenant_id != caller_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {
        "tenant_id": tenant_id,
        "history": [
            {"period": "2025-01", "users_active": 23, "candidates": 156, "jobs": 12, "ai_tokens_used": 1250000, "storage_gb": 12.5},
            {"period": "2024-12", "users_active": 21, "candidates": 142, "jobs": 10, "ai_tokens_used": 1100000, "storage_gb": 11.8},
            {"period": "2024-11", "users_active": 19, "candidates": 128, "jobs": 8, "ai_tokens_used": 980000, "storage_gb": 10.2},
        ],
    }


# ── /api/v1/tenants/current — convenience router scoped to the caller ────────
#
# These endpoints do not require a tenant id path parameter: they implicitly
# use the tenant id extracted from the caller's bearer token via
# ``require_tenant_id``.  This matches the spec in the task brief and gives
# the frontend a stable contract for "my tenant" operations.
#


v1_current = APIRouter(prefix="/api/v1/tenants/current", tags=["Tenants — Current"])


def _build_manager(db: AsyncSession | None = None) -> TenantManager:
    """Helper that constructs a TenantManager bound to the caller's DB session."""
    return TenantManager(db=db)


@v1_current.get("", summary="Get current tenant")
async def get_current_tenant(
    tenant_id: str = Depends(require_tenant_id),
):
    """Return the caller's tenant record.  Auto-creates a default record on
    first access so newly onboarded tenants always have something to look
    at without a separate provisioning call.
    """
    manager = _build_manager()
    record = manager.get_or_create_tenant(tenant_id)
    return record


@v1_current.put("", summary="Update current tenant (admin only)")
async def update_current_tenant(
    payload: CurrentTenantUpdateRequest,
    tenant_id: str = Depends(require_tenant_id),
    _admin: dict = Depends(require_admin),
):
    """Update mutable fields on the caller's tenant.  Requires admin role."""
    manager = _build_manager()
    if payload.plan is not None:
        if not get_plan(plan_id := payload.plan):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown plan '{plan_id}'",
            )
    if payload.status is not None and payload.status not in {"active", "suspended", "deleted"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="status must be one of: active, suspended, deleted",
        )
    update_fields = payload.model_dump(exclude_unset=True)
    record = manager.update_tenant(tenant_id, **update_fields)
    return {"id": record["id"], "updated": True, "tenant": record}


@v1_current.get("/usage", summary="Get current tenant usage")
async def get_current_usage(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    """Return live resource usage for the caller's tenant.

    Counts rows in the ``users``, ``candidates``, and ``jobs`` tables
    scoped to the caller's tenant.  Storage is approximated from the
    candidate count (configurable per ``TenantManager``).
    """
    manager = _build_manager(db=db)
    usage = await manager.get_usage(tenant_id)
    return usage


@v1_current.get("/limits", summary="Get current tenant plan limits vs usage")
async def get_current_limits(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    """Return plan limits combined with current usage so the UI can render
    a single progress-bar panel without making two calls.
    """
    manager = _build_manager(db=db)
    limits = manager.get_limits(tenant_id)
    usage = await manager.get_usage(tenant_id)
    return {
        "tenant_id": tenant_id,
        "plan_id": limits["plan_id"],
        "plan_name": limits["plan_name"],
        "limits": {
            "max_users": _to_wire(limits["max_users"]),
            "max_candidates": _to_wire(limits["max_candidates"]),
            "max_jobs": _to_wire(limits["max_jobs"]),
            "max_storage_mb": _to_wire(limits["max_storage_mb"]),
        },
        "unlimited": limits["unlimited"],
        "usage": {
            "users": usage["users"],
            "candidates": usage["candidates"],
            "jobs": usage["jobs"],
            "storage_mb": usage["storage_mb"],
        },
        "remaining": {
            "users": _remaining(limits["max_users"], usage["users"]),
            "candidates": _remaining(limits["max_candidates"], usage["candidates"]),
            "jobs": _remaining(limits["max_jobs"], usage["jobs"]),
            "storage_mb": _remaining(limits["max_storage_mb"], usage["storage_mb"]),
        },
    }


@v1_current.get("/billing", summary="Get current tenant billing summary")
async def get_current_billing(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    """Return the billing summary for the caller's tenant.

    Combines the plan, current usage, and a deterministic overage
    calculation.  The endpoint is read-only and never creates invoices.
    """
    manager = _build_manager(db=db)
    summary = await manager.get_billing_summary(tenant_id)
    return summary


# Make the new convenience router addressable both as
# ``/api/v1/tenants/current`` and ``/tenants/current`` (mounted via the
# module-level ``router`` below).
router.include_router(v1_current)


def _to_wire(value: float) -> int:
    """Translate :data:`math.inf` to ``-1`` for JSON-serialisable output."""
    import math as _math

    if _math.isinf(value):
        return -1
    return int(value)


def _remaining(limit: float, used: int) -> int:
    """Return the headroom remaining (``-1`` for unlimited plans)."""
    import math as _math

    if _math.isinf(limit):
        return -1
    return max(0, int(limit) - int(used))
