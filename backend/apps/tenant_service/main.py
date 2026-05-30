"""Tenant Service — Multi-tenant organization management, settings, branding, and usage tracking."""
from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class TenantCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Organization name", examples=["Acme Corp"])
    slug: str = Field(..., min_length=1, max_length=100, description="URL-friendly identifier", examples=["acme"])
    plan: str = Field(default="free", description="Subscription plan", examples=["enterprise"])

    model_config = {"json_schema_extra": {"examples": [
        {"name": "Acme Corp", "slug": "acme", "plan": "enterprise"}
    ]}}


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
    allow_candidate_export: bool | None = Field(None, description="Allow exporting candidate data")
    require_mfa: bool | None = Field(None, description="Require MFA for all users")


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


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    status: str
    created_at: str
    updated_at: str


class TenantCreateResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    created: bool = True


class TenantUpdateResponse(BaseModel):
    id: str
    updated: bool = True


class TenantDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class TenantSummary(BaseModel):
    id: str
    name: str
    slug: str
    plan: str
    status: str


class TenantListResponse(BaseModel):
    data: list[TenantSummary]
    total: int


class TenantSettingsResponse(BaseModel):
    tenant_id: str
    settings: dict = Field(default_factory=dict, description="Tenant settings key-value pairs")


class BrandingResponse(BaseModel):
    tenant_id: str
    branding: dict = Field(default_factory=dict, description="Branding configuration")


class TenantUsageResponse(BaseModel):
    tenant_id: str
    period: str
    users_active: int
    users_total: int
    candidates: int
    jobs: int
    interviews: int
    ai_tokens_used: int
    storage_gb: float
    api_calls: int


class TenantUsageHistoryEntry(BaseModel):
    period: str
    users_active: int
    candidates: int
    jobs: int
    ai_tokens_used: int
    storage_gb: float


class TenantUsageHistoryResponse(BaseModel):
    tenant_id: str
    history: list[TenantUsageHistoryEntry]


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Tenants"], summary="Tenant service health check")
async def health():
    return HealthResponse()


# ── CRUD Operations ────────────────────────────────────────────────────────────

@router.get("/", response_model=TenantListResponse, tags=["Tenants"], summary="List tenants",
            description="Retrieve all tenants for the current organization.")
async def list_tenants():
    return TenantListResponse(data=[
        TenantSummary(id="t1", name="Acme Corp", slug="acme", plan="enterprise", status="active"),
        TenantSummary(id="t2", name="Beta Inc", slug="beta", plan="pro", status="active"),
    ], total=2)


@router.post("/", response_model=TenantCreateResponse, tags=["Tenants"], summary="Create tenant",
             description="Provision a new tenant organization with default settings.")
async def create_tenant(data: TenantCreateRequest):
    return TenantCreateResponse(id="tenant_new", name=data.name, slug=data.slug, plan=data.plan)


@router.get("/{tenant_id}", response_model=TenantResponse, tags=["Tenants"], summary="Get tenant details")
async def get_tenant(tenant_id: str):
    return TenantResponse(
        id=tenant_id, name="Acme Corp", slug="acme", plan="enterprise", status="active",
        created_at="2024-01-01T00:00:00Z", updated_at="2025-01-20T10:00:00Z",
    )


@router.put("/{tenant_id}", response_model=TenantUpdateResponse, tags=["Tenants"], summary="Update tenant")
async def update_tenant(tenant_id: str, data: TenantUpdateRequest):
    return TenantUpdateResponse(id=tenant_id)


@router.delete("/{tenant_id}", response_model=TenantDeleteResponse, tags=["Tenants"], summary="Delete tenant",
               description="Soft-delete a tenant and all associated data.")
async def delete_tenant(tenant_id: str):
    return TenantDeleteResponse(id=tenant_id)


# ── Settings Management ────────────────────────────────────────────────────────

@router.get("/{tenant_id}/settings", response_model=TenantSettingsResponse, tags=["Tenants"],
            summary="Get tenant settings")
async def get_tenant_settings(tenant_id: str):
    return TenantSettingsResponse(tenant_id=tenant_id, settings={
        "notifications": True, "ai_enabled": True, "max_users": 100,
        "default_language": "en", "timezone": "UTC",
        "allow_candidate_export": True, "require_mfa": False,
    })


@router.put("/{tenant_id}/settings", response_model=TenantSettingsResponse, tags=["Tenants"],
            summary="Update tenant settings")
async def update_tenant_settings(tenant_id: str, data: TenantSettingsUpdateRequest):
    return TenantSettingsResponse(tenant_id=tenant_id, settings={
        "notifications": data.notifications if data.notifications is not None else True,
        "ai_enabled": data.ai_enabled if data.ai_enabled is not None else True,
        "max_users": data.max_users if data.max_users is not None else 100,
    })


# ── Branding Customization ─────────────────────────────────────────────────────

@router.get("/{tenant_id}/branding", response_model=BrandingResponse, tags=["Tenants"],
            summary="Get tenant branding")
async def get_branding(tenant_id: str):
    return BrandingResponse(tenant_id=tenant_id, branding={
        "primary_color": "#3b82f6", "logo_url": "/logo.svg",
        "company_name": "Acme Corp", "favicon_url": "/favicon.ico", "custom_css": "",
    })


@router.put("/{tenant_id}/branding", response_model=BrandingResponse, tags=["Tenants"],
            summary="Update tenant branding")
async def update_branding(tenant_id: str, data: BrandingUpdateRequest):
    return BrandingResponse(tenant_id=tenant_id, branding={
        "primary_color": data.primary_color or "#3b82f6",
        "logo_url": data.logo_url or "/logo.svg",
        "company_name": data.company_name or "Acme Corp",
    })


# ── Usage Tracking ─────────────────────────────────────────────────────────────

@router.get("/{tenant_id}/usage", response_model=TenantUsageResponse, tags=["Tenants"],
            summary="Get tenant usage for current period",
            description="Resource consumption metrics for the current billing period.")
async def get_tenant_usage(tenant_id: str):
    return TenantUsageResponse(
        tenant_id=tenant_id, period="2025-01",
        users_active=23, users_total=50, candidates=156, jobs=12,
        interviews=42, ai_tokens_used=1250000, storage_gb=12.5, api_calls=84320,
    )


@router.get("/{tenant_id}/usage/history", response_model=TenantUsageHistoryResponse, tags=["Tenants"],
            summary="Get tenant usage history",
            description="Historical usage data for trend analysis.")
async def get_tenant_usage_history(tenant_id: str):
    return TenantUsageHistoryResponse(tenant_id=tenant_id, history=[
        TenantUsageHistoryEntry(period="2025-01", users_active=23, candidates=156, jobs=12, ai_tokens_used=1250000, storage_gb=12.5),
        TenantUsageHistoryEntry(period="2024-12", users_active=21, candidates=142, jobs=10, ai_tokens_used=1100000, storage_gb=11.8),
        TenantUsageHistoryEntry(period="2024-11", users_active=19, candidates=128, jobs=8, ai_tokens_used=980000, storage_gb=10.2),
    ])
