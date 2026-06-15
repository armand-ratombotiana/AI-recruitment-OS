"""Comprehensive cache system tests: CacheManager, CDN, strategies, stampede, tenant isolation."""
from __future__ import annotations

import asyncio
import os
import sys
import time
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.pop("REDIS_URL", None)

from shared.cache.manager import CacheManager, _InMemoryBackend, cached, get_cache_manager, invalidate
from shared.cache.cdn import (
    CDNClient,
    CDNConfig,
    CDNProvider,
    InvalidationResult,
    WarmResult,
    generate_edge_headers,
    generate_tenant_cache_key,
    reset_cdn_client,
)
from shared.cache.strategies import (
    CacheAside,
    StampedePrevention,
    WriteBehind,
    WriteThrough,
)


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def cache() -> CacheManager:
    return CacheManager()


@pytest.fixture
def cdn_disabled() -> CDNClient:
    return CDNClient(CDNConfig(enabled=False))


@pytest.fixture
def cdn_cf_enabled() -> CDNClient:
    return CDNClient(CDNConfig(
        provider=CDNProvider.CLOUDFRONT,
        distribution_id="DIST-TEST",
        api_token="aws-test-token",
        enabled=True,
    ))


@pytest.fixture
def cdn_cf_enabled_client() -> CDNClient:
    return CDNClient(CDNConfig(
        provider=CDNProvider.CLOUDFLARE,
        api_token="cf-test-token",
        zone_id="zone-test",
        enabled=True,
    ))


# ── CacheManager: get / set / delete ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_and_get_dict(cache: CacheManager):
    await cache.set("k1", {"name": "alice"}, ttl=60)
    assert await cache.get("k1") == {"name": "alice"}


@pytest.mark.asyncio
async def test_set_and_get_list(cache: CacheManager):
    await cache.set("k2", [1, 2, 3], ttl=60)
    assert await cache.get("k2") == [1, 2, 3]


@pytest.mark.asyncio
async def test_set_and_get_string(cache: CacheManager):
    await cache.set("k3", "hello", ttl=60)
    assert await cache.get("k3") == "hello"


@pytest.mark.asyncio
async def test_set_and_get_int(cache: CacheManager):
    await cache.set("k4", 42, ttl=60)
    assert await cache.get("k4") == 42


@pytest.mark.asyncio
async def test_set_and_get_nested(cache: CacheManager):
    payload = {"users": [{"id": 1}, {"id": 2}], "meta": {"total": 2}}
    await cache.set("k5", payload, ttl=60)
    assert await cache.get("k5") == payload


@pytest.mark.asyncio
async def test_get_missing_key_returns_none(cache: CacheManager):
    assert await cache.get("nonexistent") is None


@pytest.mark.asyncio
async def test_delete_removes_key(cache: CacheManager):
    await cache.set("del1", "value")
    await cache.delete("del1")
    assert await cache.get("del1") is None


@pytest.mark.asyncio
async def test_delete_nonexistent_key_no_error(cache: CacheManager):
    await cache.delete("does-not-exist")


@pytest.mark.asyncio
async def test_delete_many(cache: CacheManager):
    await cache.set("dm1", "a")
    await cache.set("dm2", "b")
    await cache.set("dm3", "c")
    count = await cache.delete_many(["dm1", "dm2"])
    assert count == 2
    assert await cache.get("dm1") is None
    assert await cache.get("dm2") is None
    assert await cache.get("dm3") == "c"


@pytest.mark.asyncio
async def test_delete_many_empty(cache: CacheManager):
    count = await cache.delete_many([])
    assert count == 0


@pytest.mark.asyncio
async def test_clear(cache: CacheManager):
    await cache.set("c1", "a")
    await cache.set("c2", "b")
    await cache.clear()
    assert await cache.get("c1") is None
    assert await cache.get("c2") is None


@pytest.mark.asyncio
async def test_overwrite_existing_key(cache: CacheManager):
    await cache.set("ow1", "first")
    await cache.set("ow1", "second")
    assert await cache.get("ow1") == "second"


# ── TTL expiration ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ttl_expiration(cache: CacheManager):
    await cache.set("ttl1", "expires-soon", ttl=1)
    assert await cache.get("ttl1") == "expires-soon"
    await asyncio.sleep(1.1)
    assert await cache.get("ttl1") is None


@pytest.mark.asyncio
async def test_no_ttl_persists(cache: CacheManager):
    await cache.set("persist", "forever", ttl=0)
    await asyncio.sleep(0.2)
    assert await cache.get("persist") == "forever"


@pytest.mark.asyncio
async def test_ttl_multiple_keys_independent(cache: CacheManager):
    await cache.set("short", "data", ttl=1)
    await cache.set("long", "data", ttl=10)
    await asyncio.sleep(1.1)
    assert await cache.get("short") is None
    assert await cache.get("long") == "data"


# ── Cache statistics ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stats_initial(cache: CacheManager):
    s = cache.stats()
    assert s["hits"] == 0
    assert s["misses"] == 0
    assert s["sets"] == 0
    assert s["hit_rate"] == 0.0
    assert s["backend"] == "memory"


@pytest.mark.asyncio
async def test_stats_after_operations(cache: CacheManager):
    await cache.set("s1", "v1")
    await cache.set("s2", "v2")
    await cache.get("s1")
    await cache.get("s1")
    await cache.get("missing")
    s = cache.stats()
    assert s["sets"] == 2
    assert s["hits"] == 2
    assert s["misses"] == 1
    assert s["hit_rate"] == pytest.approx(66.67, abs=0.1)
    assert "size" in s


@pytest.mark.asyncio
async def test_stats_hit_rate_100(cache: CacheManager):
    await cache.set("hr1", "val")
    await cache.get("hr1")
    s = cache.stats()
    assert s["hit_rate"] == 100.0


@pytest.mark.asyncio
async def test_stats_delete_counted(cache: CacheManager):
    await cache.set("d1", "v")
    await cache.delete("d1")
    s = cache.stats()
    assert s["deletes"] == 1


# ── Cache keys pattern matching ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_keys_pattern(cache: CacheManager):
    await cache.set("user:1", "a")
    await cache.set("user:2", "b")
    await cache.set("job:1", "c")
    keys = await cache.keys("user:*")
    assert sorted(keys) == ["user:1", "user:2"]


@pytest.mark.asyncio
async def test_keys_all(cache: CacheManager):
    await cache.set("x1", "a")
    await cache.set("x2", "b")
    keys = await cache.keys("*")
    assert len(keys) >= 2


# ── Cache invalidation (module-level) ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_invalidate_module_level():
    import shared.cache.manager as mod
    old = mod._cache_manager
    try:
        cm = CacheManager()
        mod._cache_manager = cm
        await cm.set("inv-a", 1)
        await cm.set("inv-b", 2)
        count = await invalidate(["inv-a", "inv-b"])
        assert count == 2
        assert await cm.get("inv-a") is None
    finally:
        mod._cache_manager = old


# ── CDN integration: invalidate ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cdn_invalidate_disabled_returns_success(cdn_disabled: CDNClient):
    result = await cdn_disabled.invalidate_paths(["/api/v1/jobs"])
    assert result.success is True
    assert result.invalidated_paths == ["/api/v1/jobs"]
    assert result.invalidation_id.startswith("local-")


@pytest.mark.asyncio
async def test_cdn_invalidate_empty_paths(cdn_disabled: CDNClient):
    result = await cdn_disabled.invalidate_paths([])
    assert result.success is True
    assert result.invalidated_paths == []


@pytest.mark.asyncio
async def test_cdn_invalidation_log(cdn_disabled: CDNClient):
    await cdn_disabled.invalidate_paths(["/a"])
    await cdn_disabled.invalidate_paths(["/b"])
    log = cdn_disabled.invalidation_log
    assert len(log) == 2
    assert log[0].invalidated_paths == ["/a"]
    assert log[1].invalidated_paths == ["/b"]


@pytest.mark.asyncio
async def test_cdn_cloudfront_invalidate_success(cdn_cf_enabled: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 202
    mock_http.post = AsyncMock(return_value=resp)
    cdn_cf_enabled._http = mock_http

    result = await cdn_cf_enabled.invalidate_paths(["/api/v1/candidates"])
    assert result.success is True
    assert result.provider == CDNProvider.CLOUDFRONT
    assert result.invalidation_id.startswith("INV-")
    assert result.invalidated_paths == ["/api/v1/candidates"]


@pytest.mark.asyncio
async def test_cdn_cloudfront_invalidate_failure(cdn_cf_enabled: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 500
    resp.text = "Internal Server Error"
    mock_http.post = AsyncMock(return_value=resp)
    cdn_cf_enabled._http = mock_http

    result = await cdn_cf_enabled.invalidate_paths(["/api/v1/jobs"])
    assert result.success is False
    assert "500" in result.error


@pytest.mark.asyncio
async def test_cdn_cloudflare_invalidate_success(cdn_cf_enabled_client: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 200
    mock_http.post = AsyncMock(return_value=resp)
    cdn_cf_enabled_client._http = mock_http

    result = await cdn_cf_enabled_client.invalidate_paths(["/api/v1/candidates"])
    assert result.success is True
    assert result.provider == CDNProvider.CLOUDFLARE
    assert result.invalidation_id.startswith("CF-")


@pytest.mark.asyncio
async def test_cdn_cloudflare_invalidate_failure(cdn_cf_enabled_client: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 403
    resp.text = "Forbidden"
    mock_http.post = AsyncMock(return_value=resp)
    cdn_cf_enabled_client._http = mock_http

    result = await cdn_cf_enabled_client.invalidate_paths(["/api/v1/jobs"])
    assert result.success is False
    assert "403" in result.error


@pytest.mark.asyncio
async def test_cdn_invalidate_exception_handling(cdn_cf_enabled: CDNClient):
    mock_http = AsyncMock()
    mock_http.post = AsyncMock(side_effect=Exception("network error"))
    cdn_cf_enabled._http = mock_http

    result = await cdn_cf_enabled.invalidate_paths(["/api/v1/test"])
    assert result.success is False
    assert "network error" in result.error


# ── CDN integration: warm ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cdn_warm_all_success(cdn_disabled: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 200
    mock_http.get = AsyncMock(return_value=resp)
    cdn_disabled._http = mock_http

    result = await cdn_disabled.warm_paths(["/health", "/api/v1/stats"])
    assert result.success is True
    assert sorted(result.warmed_paths) == ["/api/v1/stats", "/health"]
    assert result.errors == {}


@pytest.mark.asyncio
async def test_cdn_warm_partial_failure(cdn_disabled: CDNClient):
    mock_http = AsyncMock()
    call_count = 0

    async def mock_get(url, **kwargs):
        nonlocal call_count
        call_count += 1
        r = MagicMock()
        r.status_code = 200 if call_count == 1 else 500
        return r

    mock_http.get = mock_get
    cdn_disabled._http = mock_http

    result = await cdn_disabled.warm_paths(["/ok", "/fail"])
    assert result.success is False
    assert "/ok" in result.warmed_paths
    assert "/fail" in result.errors


@pytest.mark.asyncio
async def test_cdn_warm_all_failure(cdn_disabled: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 503
    mock_http.get = AsyncMock(return_value=resp)
    cdn_disabled._http = mock_http

    result = await cdn_disabled.warm_paths(["/down"])
    assert result.success is False
    assert len(result.warmed_paths) == 0
    assert "/down" in result.errors


@pytest.mark.asyncio
async def test_cdn_warm_with_base_url(cdn_disabled: CDNClient):
    mock_http = AsyncMock()
    resp = MagicMock()
    resp.status_code = 200
    mock_http.get = AsyncMock(return_value=resp)
    cdn_disabled._http = mock_http

    await cdn_disabled.warm_paths(["/api/v1/test"], base_url="https://example.com")
    call_args = mock_http.get.call_args
    assert call_args[0][0] == "https://example.com/api/v1/test"


@pytest.mark.asyncio
async def test_cdn_warm_exception_handling(cdn_disabled: CDNClient):
    mock_http = AsyncMock()
    mock_http.get = AsyncMock(side_effect=Exception("timeout"))
    cdn_disabled._http = mock_http

    result = await cdn_disabled.warm_paths(["/slow"])
    assert result.success is False
    assert "timeout" in result.errors["/slow"]


# ── CDN: edge headers ─────────────────────────────────────────────────────────


def test_edge_headers_defaults():
    h = generate_edge_headers()
    assert "public" in h["Cache-Control"]
    assert "max-age=300" in h["Cache-Control"]
    assert "stale-while-revalidate=60" in h["Cache-Control"]
    assert "stale-if-error=3600" in h["Cache-Control"]
    assert h["Vary"] == "Accept, Accept-Encoding, Authorization"
    assert h["CDN-Cache-Control"] == "max-age=300"
    assert h["X-Cache-Status"] == "MISS"


def test_edge_headers_private():
    h = generate_edge_headers(is_public=False)
    assert "private" in h["Cache-Control"]


def test_edge_headers_custom_ttl():
    h = generate_edge_headers(ttl=1200)
    assert "max-age=1200" in h["Cache-Control"]


def test_edge_headers_surrogate():
    h = generate_edge_headers(surrogate_key="tenant-abc", ttl=60)
    assert h["Surrogate-Key"] == "tenant-abc"
    assert "max-age=60" in h["Surrogate-Control"]


def test_edge_headers_custom_vary():
    h = generate_edge_headers(vary=["X-Tenant", "Accept"])
    assert h["Vary"] == "X-Tenant, Accept"


def test_edge_headers_custom_cache_control():
    h = generate_edge_headers(cache_control="no-store")
    assert h["Cache-Control"] == "no-store"


# ── CDN: tenant cache key ─────────────────────────────────────────────────────


def test_tenant_cache_key_basic():
    key = generate_tenant_cache_key("t1", "/api/v1/candidates")
    assert key == "tenant:t1:api/v1/candidates"


def test_tenant_cache_key_with_params():
    key = generate_tenant_cache_key("t1", "/api/v1/jobs", {"page": "2", "limit": "20"})
    assert "tenant:t1" in key
    assert "api/v1/jobs" in key
    assert "limit=20" in key
    assert "page=2" in key


def test_tenant_cache_key_params_sorted():
    key = generate_tenant_cache_key("t1", "/path", {"z": "1", "a": "2"})
    assert "a=2" in key
    idx_a = key.index("a=2")
    idx_z = key.index("z=1")
    assert idx_a < idx_z


def test_tenant_cache_key_isolation():
    key1 = generate_tenant_cache_key("tenant-A", "/api/data")
    key2 = generate_tenant_cache_key("tenant-B", "/api/data")
    assert key1 != key2


# ── Strategy: CacheAside ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_aside_miss_then_hit(cache: CacheManager):
    strategy = CacheAside()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        return {"result": calls}

    r1 = await strategy.get_or_set("aside1", factory, ttl=60, cache_manager=cache)
    r2 = await strategy.get_or_set("aside1", factory, ttl=60, cache_manager=cache)
    assert r1 == {"result": 1}
    assert r2 == {"result": 1}
    assert calls == 1


@pytest.mark.asyncio
async def test_cache_aside_different_keys(cache: CacheManager):
    strategy = CacheAside()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        return calls

    r1 = await strategy.get_or_set("a", factory, cache_manager=cache)
    r2 = await strategy.get_or_set("b", factory, cache_manager=cache)
    assert r1 == 1
    assert r2 == 2
    assert calls == 2


@pytest.mark.asyncio
async def test_cache_aside_ttl_expiry(cache: CacheManager):
    strategy = CacheAside()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        return calls

    await strategy.get_or_set("aside-ttl", factory, ttl=1, cache_manager=cache)
    await asyncio.sleep(1.1)
    result = await strategy.get_or_set("aside-ttl", factory, ttl=60, cache_manager=cache)
    assert result == 2
    assert calls == 2


# ── Strategy: WriteThrough ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_write_through_persists_and_caches(cache: CacheManager):
    strategy = WriteThrough()
    store: dict = {}

    async def persist(key, value):
        store[key] = value

    await strategy.write("wt1", {"data": "test"}, persist, cache_manager=cache)
    assert store["wt1"] == {"data": "test"}
    assert await cache.get("wt1") == {"data": "test"}


@pytest.mark.asyncio
async def test_write_through_read_cache_hit(cache: CacheManager):
    strategy = WriteThrough()
    store: dict = {}
    load_calls = 0

    async def persist(key, value):
        store[key] = value

    async def load(key):
        nonlocal load_calls
        load_calls += 1
        return store.get(key)

    await strategy.write("wt2", "val", persist, cache_manager=cache)
    r1 = await strategy.read("wt2", load, cache_manager=cache)
    r2 = await strategy.read("wt2", load, cache_manager=cache)
    assert r1 == "val"
    assert r2 == "val"
    assert load_calls == 0


@pytest.mark.asyncio
async def test_write_through_read_cache_miss(cache: CacheManager):
    strategy = WriteThrough()
    store = {"db-key": "from-db"}
    load_calls = 0

    async def load(key):
        nonlocal load_calls
        load_calls += 1
        return store.get(key)

    result = await strategy.read("db-key", load, ttl=60, cache_manager=cache)
    assert result == "from-db"
    assert load_calls == 1
    cached_val = await cache.get("db-key")
    assert cached_val == "from-db"


# ── Strategy: WriteBehind ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_write_behind_manual_flush():
    wb = WriteBehind(flush_interval=999, batch_size=100)
    flushed = []

    async def persist(pairs):
        flushed.extend(pairs)

    await wb.start(persist)
    await wb.write("wb1", "v1")
    await wb.write("wb2", "v2")
    assert wb.pending_count == 2
    assert len(flushed) == 0

    await wb.flush()
    assert wb.pending_count == 0
    assert len(flushed) == 2
    keys = {k for k, _ in flushed}
    assert keys == {"wb1", "wb2"}
    await wb.stop()


@pytest.mark.asyncio
async def test_write_behind_auto_flush_on_batch_size():
    wb = WriteBehind(flush_interval=999, batch_size=3)
    flushed = []

    async def persist(pairs):
        flushed.extend(pairs)

    await wb.start(persist)
    await wb.write("a", 1)
    await wb.write("b", 2)
    assert wb.pending_count == 2
    await wb.write("c", 3)
    assert wb.pending_count == 0
    assert len(flushed) == 3
    await wb.stop()


@pytest.mark.asyncio
async def test_write_behind_periodic_flush():
    wb = WriteBehind(flush_interval=0.2, batch_size=100)
    flushed = []

    async def persist(pairs):
        flushed.extend(pairs)

    await wb.start(persist)
    await wb.write("periodic1", "val")
    assert len(flushed) == 0
    await asyncio.sleep(0.4)
    assert len(flushed) >= 1
    await wb.stop()


@pytest.mark.asyncio
async def test_write_behind_flushed_batches():
    wb = WriteBehind(flush_interval=999, batch_size=100)
    flushed = []

    async def persist(pairs):
        flushed.extend(pairs)

    await wb.start(persist)
    await wb.write("x", 1)
    await wb.flush()
    await wb.write("y", 2)
    await wb.flush()
    batches = wb.flushed_batches
    assert len(batches) == 2
    await wb.stop()


@pytest.mark.asyncio
async def test_write_behind_stop_flushes_remaining():
    wb = WriteBehind(flush_interval=999, batch_size=100)
    flushed = []

    async def persist(pairs):
        flushed.extend(pairs)

    await wb.start(persist)
    await wb.write("final1", "v1")
    await wb.write("final2", "v2")
    await wb.stop()
    assert len(flushed) == 2


@pytest.mark.asyncio
async def test_write_behind_updates_cache():
    wb = WriteBehind(flush_interval=999, batch_size=100)
    cm = CacheManager()

    async def persist(pairs):
        pass

    await wb.start(persist)
    await wb.write("cached-key", "cached-val", cache_manager=cm)
    assert await cm.get("cached-key") == "cached-val"
    await wb.stop()


# ── Stampede prevention ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_stampede_single_factory_call(cache: CacheManager):
    sp = StampedePrevention()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return {"v": calls}

    results = await asyncio.gather(*(
        sp.get_or_set("sp1", factory, ttl=60, cache_manager=cache)
        for _ in range(20)
    ))
    assert all(r == {"v": 1} for r in results)
    assert calls == 1
    sp.clear_locks()


@pytest.mark.asyncio
async def test_stampede_stale_value_served(cache: CacheManager):
    sp = StampedePrevention()
    calls = 0

    async def factory():
        nonlocal calls
        calls += 1
        return {"version": calls}

    r1 = await sp.get_or_set("sp-stale", factory, ttl=1, stale_ttl=10, cache_manager=cache)
    assert r1["version"] == 1

    await asyncio.sleep(1.1)

    r2 = await sp.get_or_set("sp-stale", factory, ttl=1, stale_ttl=10, cache_manager=cache)
    assert r2["version"] in (1, 2)

    await asyncio.sleep(0.2)
    sp.clear_locks()


@pytest.mark.asyncio
async def test_stampede_different_keys(cache: CacheManager):
    sp = StampedePrevention()
    calls_a = 0
    calls_b = 0

    async def factory_a():
        nonlocal calls_a
        calls_a += 1
        return "a"

    async def factory_b():
        nonlocal calls_b
        calls_b += 1
        return "b"

    ra = await sp.get_or_set("key-a", factory_a, cache_manager=cache)
    rb = await sp.get_or_set("key-b", factory_b, cache_manager=cache)
    assert ra == "a"
    assert rb == "b"
    assert calls_a == 1
    assert calls_b == 1
    sp.clear_locks()


@pytest.mark.asyncio
async def test_stampede_clear_locks(cache: CacheManager):
    sp = StampedePrevention()

    async def factory():
        return "val"

    await sp.get_or_set("lock-test", factory, cache_manager=cache)
    assert len(sp._locks) > 0
    sp.clear_locks()
    assert len(sp._locks) == 0


# ── Tenant isolation ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_different_keys(cache: CacheManager):
    await cache.set(generate_tenant_cache_key("T1", "/data"), {"tenant": "T1"})
    await cache.set(generate_tenant_cache_key("T2", "/data"), {"tenant": "T2"})

    r1 = await cache.get(generate_tenant_cache_key("T1", "/data"))
    r2 = await cache.get(generate_tenant_cache_key("T2", "/data"))
    assert r1 == {"tenant": "T1"}
    assert r2 == {"tenant": "T2"}


@pytest.mark.asyncio
async def test_tenant_isolation_delete_one(cache: CacheManager):
    k1 = generate_tenant_cache_key("T1", "/items")
    k2 = generate_tenant_cache_key("T2", "/items")
    await cache.set(k1, "t1-data")
    await cache.set(k2, "t2-data")

    await cache.delete(k1)
    assert await cache.get(k1) is None
    assert await cache.get(k2) == "t2-data"


@pytest.mark.asyncio
async def test_tenant_isolation_pattern_scoped(cache: CacheManager):
    await cache.set(generate_tenant_cache_key("T1", "/users"), "u1")
    await cache.set(generate_tenant_cache_key("T1", "/jobs"), "j1")
    await cache.set(generate_tenant_cache_key("T2", "/users"), "u2")

    t1_keys = await cache.keys("tenant:T1:*")
    assert len(t1_keys) == 2
    t2_keys = await cache.keys("tenant:T2:*")
    assert len(t2_keys) == 1


@pytest.mark.asyncio
async def test_tenant_isolation_cache_aside(cache: CacheManager):
    strategy = CacheAside()

    async def factory_t1():
        return {"tenant": "T1", "data": "secret"}

    async def factory_t2():
        return {"tenant": "T2", "data": "secret"}

    k1 = generate_tenant_cache_key("T1", "/secret")
    k2 = generate_tenant_cache_key("T2", "/secret")

    r1 = await strategy.get_or_set(k1, factory_t1, cache_manager=cache)
    r2 = await strategy.get_or_set(k2, factory_t2, cache_manager=cache)
    assert r1["tenant"] == "T1"
    assert r2["tenant"] == "T2"


@pytest.mark.asyncio
async def test_tenant_isolation_invalidate_one_tenant(cache: CacheManager):
    keys_t1 = [generate_tenant_cache_key("T1", f"/r/{i}") for i in range(5)]
    keys_t2 = [generate_tenant_cache_key("T2", f"/r/{i}") for i in range(5)]

    for k in keys_t1:
        await cache.set(k, "t1")
    for k in keys_t2:
        await cache.set(k, "t2")

    await cache.delete_many(keys_t1)

    for k in keys_t1:
        assert await cache.get(k) is None
    for k in keys_t2:
        assert await cache.get(k) == "t2"


# ── InMemoryBackend direct tests ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_inmemory_backend_ping():
    b = _InMemoryBackend()
    assert await b.ping() is True


@pytest.mark.asyncio
async def test_inmemory_backend_stats():
    b = _InMemoryBackend()
    await b.set("k", "v")
    await b.get("k")
    await b.get("missing")
    s = b.stats()
    assert s["hits"] == 1
    assert s["misses"] == 1
    assert s["sets"] == 1
    assert s["size"] == 1


@pytest.mark.asyncio
async def test_inmemory_backend_delete_many_partial():
    b = _InMemoryBackend()
    await b.set("a", "1")
    await b.set("b", "2")
    count = await b.delete_many(["a", "c"])
    assert count == 1


# ── CacheManager connect (in-memory fallback) ─────────────────────────────────


@pytest.mark.asyncio
async def test_connect_no_redis_url():
    cm = CacheManager(redis_url=None)
    os.environ.pop("REDIS_URL", None)
    await cm.connect()
    assert cm.backend == "memory"


@pytest.mark.asyncio
async def test_backend_property_memory():
    cm = CacheManager()
    assert cm.backend == "memory"


# ── cached decorator ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cached_decorator():
    import shared.cache.manager as mod
    old = mod._cache_manager
    try:
        cm = CacheManager()
        mod._cache_manager = cm
        calls = 0

        @cached(ttl=60, key_prefix="test")
        async def compute(x: int):
            nonlocal calls
            calls += 1
            return x * 2

        r1 = await compute(5)
        r2 = await compute(5)
        assert r1 == 10
        assert r2 == 10
        assert calls == 1
    finally:
        mod._cache_manager = old


# ── CDN client lifecycle ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cdn_client_close():
    client = CDNClient(CDNConfig(enabled=False))
    await client.close()


@pytest.mark.asyncio
async def test_reset_cdn_client():
    reset_cdn_client()
    import shared.cache.cdn as cdn_mod
    assert cdn_mod._cdn_client is None


@pytest.mark.asyncio
async def test_cdn_invalidation_log_immutable():
    client = CDNClient(CDNConfig(enabled=False))
    await client.invalidate_paths(["/a"])
    log = client.invalidation_log
    log.clear()
    assert len(client.invalidation_log) == 1
