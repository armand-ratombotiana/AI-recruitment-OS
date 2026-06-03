"""Redis-backed cache with in-memory fallback.

When ``REDIS_URL`` is set and reachable, all operations hit Redis using
``redis.asyncio``; otherwise the manager falls back to a per-process dict
suitable for tests and local development.  The fallback is process-local
and will NOT share state across workers — that is acceptable because
``Settings.REDIS_URL`` is the only path intended for production.
"""
from __future__ import annotations

import json
import logging
import os
from functools import wraps
from typing import Any, Callable

logger = logging.getLogger("cache")


# ── Optional Redis import — the cache must work without redis-py at import time ─
try:
    from redis.asyncio import from_url as _redis_from_url  # type: ignore

    _REDIS_AVAILABLE = True
except Exception:  # pragma: no cover
    _REDIS_AVAILABLE = False


# ── Backend implementations ────────────────────────────────────────────────────


class _InMemoryBackend:
    """Tiny TTL-aware dict — used in tests and as fallback when Redis is down."""

    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}
        self._hits = 0
        self._misses = 0

    async def get(self, key: str) -> str | None:
        import time

        entry = self._data.get(key)
        if entry is None:
            self._misses += 1
            return None
        value, expires_at = entry
        if expires_at is not None and expires_at < time.time():
            self._data.pop(key, None)
            self._misses += 1
            return None
        self._hits += 1
        return value

    async def set(self, key: str, value: str, ttl: int | None = None) -> None:
        import time

        expires_at = time.time() + ttl if ttl else None
        self._data[key] = (value, expires_at)

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)

    async def clear(self) -> None:
        self._data.clear()

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass

    def stats(self) -> dict[str, int]:
        return {"hits": self._hits, "misses": self._misses, "size": len(self._data)}


class _RedisBackend:
    """Async Redis wrapper that exposes the same string API as the in-memory backend."""

    def __init__(self, url: str) -> None:
        self._client = _redis_from_url(url, encoding="utf-8", decode_responses=True)
        self._hits = 0
        self._misses = 0

    async def get(self, key: str) -> str | None:
        value = await self._client.get(key)
        if value is None:
            self._misses += 1
        else:
            self._hits += 1
        return value

    async def set(self, key: str, value: str, ttl: int | None = None) -> None:
        if ttl:
            await self._client.set(key, value, ex=ttl)
        else:
            await self._client.set(key, value)

    async def delete(self, key: str) -> None:
        await self._client.delete(key)

    async def clear(self) -> None:
        await self._client.flushdb()

    async def ping(self) -> bool:
        try:
            return bool(await self._client.ping())
        except Exception:
            return False

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass

    def stats(self) -> dict[str, int]:
        return {"hits": self._hits, "misses": self._misses}


# ── Public CacheManager ────────────────────────────────────────────────────────


class CacheManager:
    """Async cache facade — picks Redis when reachable, else in-memory."""

    def __init__(self, redis_url: str | None = None) -> None:
        self._backend: _InMemoryBackend | _RedisBackend = _InMemoryBackend()
        self._redis_url = redis_url or os.getenv("REDIS_URL")
        self._connected_to_redis = False

    async def connect(self) -> None:
        """Try to connect to Redis.  Falls back silently to in-memory on any failure."""
        if not self._redis_url or not _REDIS_AVAILABLE:
            logger.info("cache: using in-memory backend (REDIS_URL not set or redis-py missing)")
            return
        try:
            backend = _RedisBackend(self._redis_url)
            if await backend.ping():
                self._backend = backend
                self._connected_to_redis = True
                logger.info("cache: connected to redis at %s", self._redis_url)
            else:
                logger.warning("cache: redis ping failed at %s, using in-memory", self._redis_url)
        except Exception as exc:
            logger.warning("cache: redis connect failed (%s), using in-memory", exc)

    @property
    def backend(self) -> str:
        return "redis" if self._connected_to_redis else "memory"

    async def get(self, key: str) -> Any | None:
        raw = await self._backend.get(key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (TypeError, ValueError):
            return raw

    async def set(self, key: str, value: Any, ttl: int = 300) -> None:
        await self._backend.set(key, json.dumps(value, default=str), ttl=ttl)

    async def delete(self, key: str) -> None:
        await self._backend.delete(key)

    async def clear(self) -> None:
        await self._backend.clear()

    async def close(self) -> None:
        await self._backend.close()

    def stats(self) -> dict[str, int]:
        return self._backend.stats()


# ── Decorator ─────────────────────────────────────────────────────────────────


_cache_manager: CacheManager | None = None


def get_cache_manager() -> CacheManager:
    """Lazy singleton — first call builds the manager and connects to Redis."""
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager()
    return _cache_manager


def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator that caches an async function's return value."""

    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{key_prefix}:{func.__name__}:{hash(str(args) + str(kwargs))}"
            cm = get_cache_manager()
            cached_value = await cm.get(cache_key)
            if cached_value is not None:
                return cached_value
            result = await func(*args, **kwargs)
            await cm.set(cache_key, result, ttl)
            return result

        return wrapper

    return decorator
