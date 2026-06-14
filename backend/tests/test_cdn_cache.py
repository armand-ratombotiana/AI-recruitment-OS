"""Tests for CDN integration, cache strategies, and cache management API.

Covers:
- Cache warming
- Cache invalidation
- Cache strategies (cache-aside, write-through, write-behind)
- Stampede prevention
- CDN headers generation
- Cache statistics
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.pop("REDIS_URL", None)

from shared.cache.manager import CacheManager, get_cache_manager
from shared.cache.cdn import (
    CDNClient,
    CDNConfig,
    CDNProvider,
    generate_edge_headers,
    generate_tenant_cache_key,
    reset_cdn_client,
)
from shared.cache.strategies import (
    CacheAside,
    WriteThrough,
    WriteBehind,
    StampedePrevention,
)
from shared.core.security import create_access_token


@pytest.fixture
def cache_manager() -> CacheManager:
    return CacheManager()


@pytest.fixture
def cdn_config() -> CDNConfig:
    return CDNConfig(
        provider=CDNProvider.CLOUDFLARE,
        api_token="test-token",
        zone_id="test-zone",
        enabled=False,
    )


@pytest.fixture
def cdn_client(cdn_config) -> CDNClient:
    return CDNClient(cdn_config)


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    from apps.cache_service.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/cache")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def admin_token() -> str:
    return create_access_token({
        "sub": "admin-user-id",
        "email": "admin@example.com",
        "role": "admin",
        "tenant_id": "test-tenant",
    })


@pytest.fixture
def non_admin_token() -> str:
    return create_access_token({
        "sub": "user-id",
        "email": "user@example.com",
        "role": "recruiter",
        "tenant_id": "test-tenant",
    })


# ── Tests: CacheManager ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_manager_set_and_get(cache_manager):
    await cache_manager.set("test-key", {"data": "value"}, ttl=60)
    result = await cache_manager.get("test-key")
    assert result == {"data": "value"}


@pytest.mark.asyncio
async def test_cache_manager_delete(cache_manager):
    await cache_manager.set("key1", "value1")
    await cache_manager.set("key2", "value2")
    await cache_manager.delete("key1")
    assert await cache_manager.get("key1") is None
    assert await cache_manager.get("key2") == "value2"


@pytest.mark.asyncio
async def test_cache_manager_delete_many(cache_manager):
    await cache_manager.set("k1", "v1")
    await cache_manager.set("k2", "v2")
    await cache_manager.set("k3", "v3")
    count = await cache_manager.delete_many(["k1", "k2"])
    assert count == 2
    assert await cache_manager.get("k1") is None
    assert await cache_manager.get("k3") == "v3"


@pytest.mark.asyncio
async def test_cache_manager_stats(cache_manager):
    await cache_manager.set("stat-key", "value")
    await cache_manager.get("stat-key")
    await cache_manager.get("missing-key")
    stats = cache_manager.stats()
    assert stats["hits"] >= 1
    assert stats["misses"] >= 1
    assert stats["sets"] >= 1
    assert "hit_rate" in stats


@pytest.mark.asyncio
async def test_cache_manager_keys_pattern(cache_manager):
    await cache_manager.set("user:1", "alice")
    await cache_manager.set("user:2", "bob")
    await cache_manager.set("job:1", "engineer")
    keys = await cache_manager.keys("user:*")
    assert len(keys) == 2
    assert "user:1" in keys
    assert "user:2" in keys


# ── Tests: CDN Client ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cdn_invalidate_paths_disabled(cdn_client):
    result = await cdn_client.invalidate_paths(["/api/v1/candidates", "/api/v1/jobs"])
    assert result.success is True
    assert len(result.invalidated_paths) == 2
    assert result.provider == CDNProvider.CLOUDFLARE


@pytest.mark.asyncio
async def test_cdn_invalidate_empty_paths(cdn_client):
    result = await cdn_client.invalidate_paths([])
    assert result.success is True
    assert len(result.invalidated_paths) == 0


@pytest.mark.asyncio
async def test_cdn_warm_paths(cdn_client):
    mock_http = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_http.get = AsyncMock(return_value=mock_response)
    cdn_client._http = mock_http

    result = await cdn_client.warm_paths(["/health", "/api/v1/stats"])
    assert result.success is True
    assert len(result.warmed_paths) == 2
    assert len(result.errors) == 0


@pytest.mark.asyncio
async def test_cdn_warm_paths_with_errors(cdn_client):
    mock_http = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_http.get = AsyncMock(return_value=mock_response)
    cdn_client._http = mock_http

    result = await cdn_client.warm_paths(["/missing-path"])
    assert result.success is False
    assert len(result.warmed_paths) == 0
    assert "/missing-path" in result.errors


@pytest.mark.asyncio
async def test_cdn_cloudflare_invalidation(cdn_client):
    cdn_client._config.enabled = True
    mock_http = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_http.post = AsyncMock(return_value=mock_response)
    cdn_client._http = mock_http

    result = await cdn_client.invalidate_paths(["/api/v1/candidates"])
    assert result.success is True
    assert result.provider == CDNProvider.CLOUDFLARE
    assert result.invalidation_id.startswith("CF-")


@pytest.mark.asyncio
async def test_cdn_cloudfront_invalidation():
    config = CDNConfig(
        provider=CDNProvider.CLOUDFRONT,
        distribution_id="DIST123",
        api_token="aws-token",
        enabled=True,
    )
    client = CDNClient(config)
    mock_http = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 202
    mock_http.post = AsyncMock(return_value=mock_response)
    client._http = mock_http

    result = await client.invalidate_paths(["/api/v1/jobs"])
    assert result.success is True
    assert result.provider == CDNProvider.CLOUDFRONT
    assert result.invalidation_id.startswith("INV-")


# ── Tests: Edge Headers ────────────────────────────────────────────────────────


def test_generate_edge_headers_default():
    headers = generate_edge_headers()
    assert "Cache-Control" in headers
    assert "public" in headers["Cache-Control"]
    assert "max-age=300" in headers["Cache-Control"]
    assert "stale-while-revalidate=60" in headers["Cache-Control"]
    assert "Vary" in headers
    assert "CDN-Cache-Control" in headers
    assert headers["X-Cache-Status"] == "MISS"


def test_generate_edge_headers_private():
    headers = generate_edge_headers(is_public=False, ttl=600)
    assert "private" in headers["Cache-Control"]
    assert "max-age=600" in headers["Cache-Control"]


def test_generate_edge_headers_surrogate_key():
    headers = generate_edge_headers(surrogate_key="tenant-123", ttl=120)
    assert headers["Surrogate-Key"] == "tenant-123"
    assert "max-age=120" in headers["Surrogate-Control"]


def test_generate_edge_headers_custom_vary():
    headers = generate_edge_headers(vary=["Accept", "X-Custom"])
    assert headers["Vary"] == "Accept, X-Custom"


def test_generate_tenant_cache_key():
    key = generate_tenant_cache_key("tenant-1", "/api/v1/candidates", {"page": "1", "limit": "10"})
    assert "tenant:tenant-1" in key
    assert "api/v1/candidates" in key
    assert "limit=10" in key
    assert "page=1" in key


# ── Tests: Cache Strategies ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_aside_get_or_set(cache_manager):
    strategy = CacheAside()
    call_count = 0

    async def factory():
        nonlocal call_count
        call_count += 1
        return {"computed": True}

    result1 = await strategy.get_or_set("aside-key", factory, ttl=60, cache_manager=cache_manager)
    result2 = await strategy.get_or_set("aside-key", factory, ttl=60, cache_manager=cache_manager)

    assert result1 == {"computed": True}
    assert result2 == {"computed": True}
    assert call_count == 1


@pytest.mark.asyncio
async def test_write_through_write_and_read(cache_manager):
    strategy = WriteThrough()
    persisted = {}

    async def persist_fn(key, value):
        persisted[key] = value

    async def load_fn(key):
        return persisted.get(key)

    await strategy.write("wt-key", {"data": "test"}, persist_fn, ttl=60, cache_manager=cache_manager)
    assert persisted["wt-key"] == {"data": "test"}

    result = await strategy.read("wt-key", load_fn, ttl=60, cache_manager=cache_manager)
    assert result == {"data": "test"}


@pytest.mark.asyncio
async def test_write_behind_batch_flush():
    strategy = WriteBehind(flush_interval=0.1, batch_size=3)
    flushed_data = []

    async def persist_fn(pairs):
        flushed_data.extend(pairs)

    await strategy.start(persist_fn)
    await strategy.write("wb-1", "value1")
    await strategy.write("wb-2", "value2")
    await strategy.write("wb-3", "value3")

    await asyncio.sleep(0.05)
    assert len(flushed_data) >= 3

    await strategy.stop()


@pytest.mark.asyncio
async def test_write_behind_manual_flush():
    strategy = WriteBehind(flush_interval=10.0, batch_size=100)
    flushed_data = []

    async def persist_fn(pairs):
        flushed_data.extend(pairs)

    await strategy.start(persist_fn)
    await strategy.write("wb-4", "value4")
    await strategy.write("wb-5", "value5")

    assert strategy.pending_count == 2
    await strategy.flush()
    assert strategy.pending_count == 0
    assert len(flushed_data) == 2

    await strategy.stop()


@pytest.mark.asyncio
async def test_stampede_prevention_concurrent_access(cache_manager):
    strategy = StampedePrevention()
    call_count = 0

    async def factory():
        nonlocal call_count
        call_count += 1
        await asyncio.sleep(0.05)
        return {"computed": True, "count": call_count}

    tasks = [
        strategy.get_or_set("stampede-key", factory, ttl=60, cache_manager=cache_manager)
        for _ in range(10)
    ]
    results = await asyncio.gather(*tasks)

    assert all(r == {"computed": True, "count": 1} for r in results)
    assert call_count == 1
    strategy.clear_locks()


@pytest.mark.asyncio
async def test_stampede_prevention_stale_value(cache_manager):
    strategy = StampedePrevention()
    call_count = 0

    async def factory():
        nonlocal call_count
        call_count += 1
        return {"version": call_count}

    result1 = await strategy.get_or_set("stale-key", factory, ttl=1, stale_ttl=10, cache_manager=cache_manager)
    assert result1["version"] == 1

    await asyncio.sleep(1.1)

    result2 = await strategy.get_or_set("stale-key", factory, ttl=1, stale_ttl=10, cache_manager=cache_manager)
    assert result2["version"] == 1 or result2["version"] == 2

    await asyncio.sleep(0.1)
    strategy.clear_locks()


# ── Tests: Cache API Endpoints ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_stats_requires_auth(client):
    response = await client.get("/api/v1/cache/stats")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_cache_stats_requires_admin(client, non_admin_token):
    response = await client.get(
        "/api/v1/cache/stats",
        headers={"Authorization": f"Bearer {non_admin_token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cache_stats_success(client, admin_token):
    response = await client.get(
        "/api/v1/cache/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "backend" in data
    assert "hits" in data
    assert "misses" in data
    assert "hit_rate" in data


@pytest.mark.asyncio
async def test_cache_invalidate_requires_admin(client, non_admin_token):
    response = await client.post(
        "/api/v1/cache/invalidate",
        json={"keys": ["test-key"]},
        headers={"Authorization": f"Bearer {non_admin_token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cache_invalidate_success(client, admin_token):
    cache_manager = get_cache_manager()
    await cache_manager.set("inv-key-1", "value1")
    await cache_manager.set("inv-key-2", "value2")

    response = await client.post(
        "/api/v1/cache/invalidate",
        json={"keys": ["inv-key-1", "inv-key-2"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["invalidated_keys"] >= 2


@pytest.mark.asyncio
async def test_cache_invalidate_with_patterns(client, admin_token):
    cache_manager = get_cache_manager()
    await cache_manager.set("pattern:user:1", "alice")
    await cache_manager.set("pattern:user:2", "bob")
    await cache_manager.set("pattern:job:1", "engineer")

    response = await client.post(
        "/api/v1/cache/invalidate",
        json={"patterns": ["pattern:user:*"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["invalidated_keys"] >= 2


@pytest.mark.asyncio
async def test_cache_warm_requires_admin(client, non_admin_token):
    response = await client.post(
        "/api/v1/cache/warm",
        json={"paths": ["/health"]},
        headers={"Authorization": f"Bearer {non_admin_token}"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_cache_warm_success(client, admin_token):
    reset_cdn_client()
    response = await client.post(
        "/api/v1/cache/warm",
        json={"paths": ["/health", "/api/v1/stats"]},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "success" in data
    assert "warmed_paths" in data
    assert "errors" in data


@pytest.mark.asyncio
async def test_edge_headers_endpoint(client, admin_token):
    response = await client.get(
        "/api/v1/cache/headers",
        params={"ttl": 600, "is_public": True, "surrogate_key": "test-key"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "Cache-Control" in data
    assert "max-age=600" in data["Cache-Control"]
    assert data["Surrogate-Key"] == "test-key"
