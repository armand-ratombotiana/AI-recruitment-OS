"""Region Service — multi-region deployment, data residency, geo-routing."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from shared.auth.dependencies import require_tenant_id, require_member
from shared.regions.manager import region_manager, RegionStatus
from shared.regions.routing import region_router

logger = logging.getLogger(__name__)

router = APIRouter()


class RegionSelectRequest(BaseModel):
    region_id: str = Field(..., description="Region identifier to select as preferred")


class RegionResponse(BaseModel):
    id: str
    name: str
    country: str
    continent: str
    city: str
    latitude: float
    longitude: float
    status: str
    data_residency_zones: list[str]
    capabilities: list[str]
    weight: int


class CurrentRegionResponse(BaseModel):
    current_region: str
    preferred_region: str | None = None
    tenant_id: str
    resolved_region: str


class RegionSelectResponse(BaseModel):
    tenant_id: str
    preferred_region: str
    region_details: dict[str, Any] | None = None


class RegionHealthResponse(BaseModel):
    regions: list[dict[str, Any]]
    overall_status: str
    healthy_count: int
    total_count: int


class ResidencyCheckRequest(BaseModel):
    zone: str
    region_id: str


class RoutingRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None
    zone: str | None = None


@router.get("", response_model=list[RegionResponse])
async def list_regions(
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    regions = region_manager.list_regions()
    return [RegionResponse(**r) for r in regions]


@router.get("/current", response_model=CurrentRegionResponse)
async def get_current_region(
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    current = region_manager.get_current_region()
    preferred = region_manager.get_tenant_preference(tenant_id)
    resolved = region_manager.resolve_tenant_region(tenant_id)
    return CurrentRegionResponse(
        current_region=current,
        preferred_region=preferred,
        tenant_id=tenant_id,
        resolved_region=resolved,
    )


@router.post("/select", response_model=RegionSelectResponse)
async def select_region(
    body: RegionSelectRequest,
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    region = region_manager.get_region(body.region_id)
    if not region:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region '{body.region_id}' not found",
        )
    result = region_manager.set_tenant_preference(tenant_id, body.region_id)
    details = {
        "id": region.id,
        "name": region.name,
        "country": region.country,
        "status": region.status.value,
        "data_residency_zones": list(region.data_residency_zones),
    }
    return RegionSelectResponse(
        tenant_id=result["tenant_id"],
        preferred_region=result["preferred_region"],
        region_details=details,
    )


@router.get("/health", response_model=RegionHealthResponse)
async def get_region_health(
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    health_data = region_manager.get_health()
    if not isinstance(health_data, list):
        health_data = [health_data]
    healthy_count = sum(
        1 for r in health_data
        if r.get("status") in ("healthy", "degraded")
    )
    total = len(health_data)
    overall = "healthy" if healthy_count == total else (
        "degraded" if healthy_count > 0 else "unhealthy"
    )
    return RegionHealthResponse(
        regions=health_data,
        overall_status=overall,
        healthy_count=healthy_count,
        total_count=total,
    )


@router.post("/residency/check")
async def check_residency(
    body: ResidencyCheckRequest,
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    return region_manager.check_residency(body.zone, body.region_id)


@router.get("/residency/zones")
async def list_residency_zones(
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    from shared.regions.manager import RESIDENCY_RULES
    return {
        zone: {
            "allowed_regions": rule["allowed_regions"],
            "enforcement": rule["enforcement"],
            "description": rule["description"],
        }
        for zone, rule in RESIDENCY_RULES.items()
    }


@router.post("/route/geo")
async def geo_route(
    body: RoutingRequest,
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    if body.latitude is None or body.longitude is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="latitude and longitude are required for geo-routing",
        )
    return region_router.geo_route(body.latitude, body.longitude, zone=body.zone)


@router.post("/route/latency")
async def latency_route(
    body: RoutingRequest,
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    return region_router.latency_route(zone=body.zone)


@router.post("/route/failover")
async def failover_route(
    body: dict[str, Any],
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    preferred = body.get("preferred_region")
    if not preferred:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="preferred_region is required",
        )
    return region_router.route_with_failover(preferred, zone=body.get("zone"))


@router.get("/replication")
async def get_replication(
    _tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
):
    return region_manager.get_replication_state()
