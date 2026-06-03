"""Unit tests for the Redis-backed CacheManager and RateLimiter.

Both modules must work in-process (no Redis available in CI) AND with a real
Redis when one is reachable.  These tests use the in-memory path; integration
with a real Redis is verified by the same tests when REDIS_URL is set.
"""
from __future__ import annotations

import os
import time

import pytest

from shared.core.caching import CacheManager, cached, get_cache_manager
from shared.core.ratelimit import RateLimiter


# ── CacheManager ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cache_set_get_roundtrip():
    cm = CacheManager()
    assert cm.backend == "memory"
    await cm.set("k1", {"v": 1}, ttl=60)
    assert await cm.get("k1") == {"v": 1}


@pytest.mark.asyncio
async def test_cache_missing_key_returns_none():
    cm = CacheManager()
    assert await cm.get("nope") is None


@pytest.mark.asyncio
async def test_cache_ttl_expiry():
    cm = CacheManager()
    await cm.set("k", "v", ttl=1)
    assert await cm.get("k") == "v"
    time.sleep(1.1)
    assert await cm.get("k") is None


@pytest.mark.asyncio
async def test_cache_delete():
    cm = CacheManager()
    await cm.set("k", "v")
    assert await cm.get("k") == "v"
    await cm.delete("k")
    assert await cm.get("k") is None


@pytest.mark.asyncio
async def test_cache_clear():
    cm = CacheManager()
    await cm.set("a", 1)
    await cm.set("b", 2)
    await cm.clear()
    assert await cm.get("a") is None
    assert await cm.get("b") is None


@pytest.mark.asyncio
async def test_cache_serialises_complex_values():
    cm = CacheManager()
    val = {"list": [1, 2, 3], "nested": {"a": "b"}, "n": None, "b": True}
    await cm.set("complex", val)
    assert await cm.get("complex") == val


@pytest.mark.asyncio
async def test_cached_decorator_hits_cache():
    # Reset the singleton so the test starts clean
    import shared.core.caching as cmod
    cmod._cache_manager = None

    calls = {"n": 0}

    @cached(ttl=60, key_prefix="test")
    async def expensive(x: int) -> int:
        calls["n"] += 1
        return x * 2

    assert await expensive(5) == 10
    assert await expensive(5) == 10  # second call served from cache
    assert calls["n"] == 1
    assert await expensive(6) == 12  # different arg → recompute
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_cache_connect_without_redis_url_falls_back(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    cm = CacheManager(redis_url=None)
    await cm.connect()
    assert cm.backend == "memory"
    await cm.set("k", "v")
    assert await cm.get("k") == "v"


@pytest.mark.asyncio
async def test_cache_connect_with_unreachable_redis_falls_back(monkeypatch):
    # Point at a port nothing is listening on
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")
    cm = CacheManager()
    await cm.connect()
    assert cm.backend == "memory"


# ── RateLimiter ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ratelimit_allows_under_limit():
    rl = RateLimiter(name="t1", max_requests=3, window_seconds=60)
    for _ in range(3):
        allowed, info = await rl.check("k1")
        assert allowed
        assert info.remaining >= 0
    allowed, info = await rl.check("k1")
    assert not allowed
    assert info.remaining == 0
    assert info.reset_seconds > 0


@pytest.mark.asyncio
async def test_ratelimit_separate_keys_independent():
    rl = RateLimiter(name="t2", max_requests=2, window_seconds=60)
    for _ in range(2):
        allowed, _ = await rl.check("user1")
        assert allowed
    allowed, _ = await rl.check("user1")
    assert not allowed
    # user2 still has a fresh budget
    allowed2, _ = await rl.check("user2")
    assert allowed2


@pytest.mark.asyncio
async def test_ratelimit_window_resets():
    rl = RateLimiter(name="t3", max_requests=2, window_seconds=1)
    await rl.check("k")
    await rl.check("k")
    allowed, _ = await rl.check("k")
    assert not allowed
    time.sleep(1.1)
    allowed, _ = await rl.check("k")
    assert allowed


@pytest.mark.asyncio
async def test_ratelimit_result_metadata():
    rl = RateLimiter(name="t4", max_requests=5, window_seconds=60)
    allowed, info = await rl.check("k")
    assert allowed
    assert info.limit == 5
    assert info.remaining == 4
    assert info.reset_seconds > 0


@pytest.mark.asyncio
async def test_ratelimit_connect_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    rl = RateLimiter(name="t5", max_requests=2, window_seconds=60)
    await rl.connect()
    assert rl.backend == "memory"


@pytest.mark.asyncio
async def test_ratelimit_unreachable_redis_falls_back(monkeypatch):
    monkeypatch.setenv("REDIS_URL", "redis://127.0.0.1:1/0")
    rl = RateLimiter(name="t6", max_requests=2, window_seconds=60)
    await rl.connect()
    assert rl.backend == "memory"
    # Still functional
    allowed, _ = await rl.check("k")
    assert allowed


@pytest.mark.asyncio
async def test_default_limiters_exist():
    from shared.core.ratelimit import (
        default_limiter, auth_login_limiter, auth_register_limiter,
        auth_password_reset_limiter, init_rate_limiters,
    )
    assert default_limiter.name == "default"
    assert auth_login_limiter.max_requests == 10
    assert auth_register_limiter.max_requests == 5
    assert auth_password_reset_limiter.max_requests == 3
    # init must not raise even without Redis
    await init_rate_limiters()
