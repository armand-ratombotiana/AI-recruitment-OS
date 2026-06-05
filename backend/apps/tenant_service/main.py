"""Tenant Service — Multi-tenant organization management, settings, branding, and usage tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.auth import require_admin, require_tenant_id


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
