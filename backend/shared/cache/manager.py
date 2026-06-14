"""Cache manager with Redis backend and in-memory fallback.

Re-exports the core CacheManager and adds convenience helpers
(``invalidate``, ``cached``) used throughout the application.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from functools import wraps
from typing import Any, Callable

logger = logging.getLogger("cache.manager")

try:
    from redis.asyncio import from_url as _redis_from_url  # type: ignore
    _REDIS_AVAILABLE = True
except Exception:
    _REDIS_AVAILABLE = False


class _InMemoryBackend:
    def __init__(self) -> None:
        self._data: dict[str, tuple[str, float | None]] = {}
        self._hits = 0
        self._misses = 0
        self._sets = 0
        self._deletes = 0

    async def get(self, key: str) -> str | None:
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
        expires_at = time.time() + ttl if ttl else None
        self._data[key] = (value, expires_at)
        self._sets += 1

    async def delete(self, key: str) -> None:
        self._data.pop(key, None)
        self._deletes += 1

    async def delete_many(self, keys: list[str]) -> int:
        count = 0
        for k in keys:
            if self._data.pop(k, None) is not None:
                count += 1
                self._deletes += 1
        return count

    async def clear(self) -> None:
        self._data.clear()

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass

    async def keys(self, pattern: str = "*") -> list[str]:
        import fnmatch
        return [k for k in self._data if fnmatch.fnmatch(k, pattern)]

    def stats(self) -> dict[str, Any]:
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0.0
        return {
            "hits": self._hits,
            "misses": self._misses,
            "sets": self._sets,
            "deletes": self._deletes,
            "size": len(self._data),
            "hit_rate": round(hit_rate, 2),
        }


class _RedisBackend:
    def __init__(self, url: str) -> None:
        self._client = _redis_from_url(url, encoding="utf-8", decode_responses=True)
        self._hits = 0
        self._misses = 0
        self._sets = 0
        self._deletes = 0

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
        self._sets += 1

    async def delete(self, key: str) -> None:
        await self._client.delete(key)
        self._deletes += 1

    async def delete_many(self, keys: list[str]) -> int:
        if not keys:
            return 0
        count = await self._client.delete(*keys)
        self._deletes += count
        return count

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

    async def keys(self, pattern: str = "*") -> list[str]:
        return await self._client.keys(pattern)

    def stats(self) -> dict[str, Any]:
        total = self._hits + self._misses
        hit_rate = (self._hits / total * 100) if total > 0 else 0.0
        return {
            "hits": self._hits,
            "misses": self._misses,
            "sets": self._sets,
            "deletes": self._deletes,
            "hit_rate": round(hit_rate, 2),
        }


class CacheManager:
    def __init__(self, redis_url: str | None = None) -> None:
        self._backend: _InMemoryBackend | _RedisBackend = _InMemoryBackend()
        self._redis_url = redis_url or os.getenv("REDIS_URL")
        self._connected_to_redis = False

    async def connect(self) -> None:
        if not self._redis_url or not _REDIS_AVAILABLE:
            logger.info("cache: using in-memory backend")
            return
        try:
            backend = _RedisBackend(self._redis_url)
            if await backend.ping():
                self._backend = backend
                self._connected_to_redis = True
                logger.info("cache: connected to redis at %s", self._redis_url)
            else:
                logger.warning("cache: redis ping failed, using in-memory")
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

    async def delete_many(self, keys: list[str]) -> int:
        return await self._backend.delete_many(keys)

    async def clear(self) -> None:
        await self._backend.clear()

    async def close(self) -> None:
        await self._backend.close()

    async def keys(self, pattern: str = "*") -> list[str]:
        return await self._backend.keys(pattern)

    def stats(self) -> dict[str, Any]:
        s = self._backend.stats()
        s["backend"] = self.backend
        return s


_cache_manager: CacheManager | None = None


def get_cache_manager() -> CacheManager:
    global _cache_manager
    if _cache_manager is None:
        _cache_manager = CacheManager()
    return _cache_manager


def cached(ttl: int = 300, key_prefix: str = ""):
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


async def invalidate(keys: list[str]) -> int:
    cm = get_cache_manager()
    return await cm.delete_many(keys)
