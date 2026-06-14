"""Cache management API endpoints.

POST /api/v1/cache/warm - warm cache for specific paths
POST /api/v1/cache/invalidate - invalidate cache keys
GET /api/v1/cache/stats - cache statistics
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from shared.auth import require_admin, require_tenant_id
from shared.cache.manager import get_cache_manager
from shared.cache.cdn import get_cdn_client, generate_edge_headers, CDNProvider

logger = logging.getLogger("cache.service")

router = APIRouter()


class CacheWarmRequest(BaseModel):
    paths: list[str] = Field(..., min_length=1, description="List of paths to warm")
    base_url: str | None = Field(None, description="Base URL for warming requests")
    headers: dict[str, str] | None = Field(None, description="Headers to include in warming requests")


class CacheWarmResponse(BaseModel):
    success: bool
    warmed_paths: list[str]
    errors: dict[str, str]
    message: str


class CacheInvalidateRequest(BaseModel):
    keys: list[str] | None = Field(None, description="Specific cache keys to invalidate")
    patterns: list[str] | None = Field(None, description="Cache key patterns to invalidate")
    paths: list[str] | None = Field(None, description="CDN paths to invalidate")
    include_cdn: bool = Field(False, description="Also invalidate CDN cache")


class CacheInvalidateResponse(BaseModel):
    success: bool
    invalidated_keys: int
    cdn_result: dict[str, Any] | None = None
    message: str


class CacheStatsResponse(BaseModel):
    backend: str
    hits: int
    misses: int
    sets: int = 0
    deletes: int = 0
    size: int = 0
    hit_rate: float
    cdn_enabled: bool
    cdn_provider: str | None = None


@router.post("/warm", response_model=CacheWarmResponse, status_code=status.HTTP_200_OK)
async def warm_cache(
    request: CacheWarmRequest,
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
) -> CacheWarmResponse:
    """Warm cache for specific paths by making requests to them."""
    cdn_client = get_cdn_client()
    result = await cdn_client.warm_paths(
        paths=request.paths,
        base_url=request.base_url,
        headers=request.headers,
    )

    return CacheWarmResponse(
        success=result.success,
        warmed_paths=result.warmed_paths,
        errors=result.errors,
        message=f"Warmed {len(result.warmed_paths)} paths" if result.success else f"Failed to warm {len(result.errors)} paths",
    )


@router.post("/invalidate", response_model=CacheInvalidateResponse, status_code=status.HTTP_200_OK)
async def invalidate_cache(
    request: CacheInvalidateRequest,
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
) -> CacheInvalidateResponse:
    """Invalidate cache keys and optionally CDN cache."""
    cache_manager = get_cache_manager()
    invalidated_count = 0

    if request.keys:
        invalidated_count = await cache_manager.delete_many(request.keys)

    if request.patterns:
        for pattern in request.patterns:
            matching_keys = await cache_manager.keys(pattern)
            if matching_keys:
                count = await cache_manager.delete_many(matching_keys)
                invalidated_count += count

    cdn_result = None
    if request.include_cdn and request.paths:
        cdn_client = get_cdn_client()
        result = await cdn_client.invalidate_paths(request.paths)
        cdn_result = {
            "success": result.success,
            "provider": result.provider.value,
            "invalidation_id": result.invalidation_id,
            "error": result.error,
        }

    return CacheInvalidateResponse(
        success=True,
        invalidated_keys=invalidated_count,
        cdn_result=cdn_result,
        message=f"Invalidated {invalidated_count} cache keys",
    )


@router.get("/stats", response_model=CacheStatsResponse, status_code=status.HTTP_200_OK)
async def get_cache_stats(
    tenant_id: str = Depends(require_tenant_id),
    admin: dict = Depends(require_admin),
) -> CacheStatsResponse:
    """Get cache statistics."""
    cache_manager = get_cache_manager()
    stats = cache_manager.stats()
    cdn_client = get_cdn_client()

    return CacheStatsResponse(
        backend=stats["backend"],
        hits=stats["hits"],
        misses=stats["misses"],
        sets=stats.get("sets", 0),
        deletes=stats.get("deletes", 0),
        size=stats.get("size", 0),
        hit_rate=stats["hit_rate"],
        cdn_enabled=cdn_client.config.enabled,
        cdn_provider=cdn_client.config.provider.value if cdn_client.config.enabled else None,
    )


@router.get("/headers", status_code=status.HTTP_200_OK)
async def get_edge_headers(
    ttl: int = 300,
    is_public: bool = True,
    surrogate_key: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, str]:
    """Generate edge caching headers for a response."""
    return generate_edge_headers(
        ttl=ttl,
        is_public=is_public,
        surrogate_key=surrogate_key,
    )
