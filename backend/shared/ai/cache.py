"""LRU cache for LLM responses with TTL and Redis fallback.

This module provides a dedicated cache for chat-completion responses keyed
on ``(model, prompt_hash, temperature)``.  It is intentionally separate from
:mod:`shared.core.caching` because:

* LLM responses have very different access patterns (long prompts, expensive
  computation, deterministic for ``temperature == 0``).
* We want an LRU eviction policy with a bounded in-memory footprint so the
  router stays predictable in long-running processes.
* The cache key derivation needs to be stable across processes so a Redis
  hit on worker A is recoverable on worker B.

Two storage tiers are stacked:

1. **In-memory LRU** — process-local, bounded (``max_size`` entries), fast.
   Entries past their TTL are skipped lazily on access.
2. **Redis** — shared across all workers, persists until the TTL expires.
   On miss in memory, we consult Redis and promote the value back into the
   memory tier.

Both tiers are optional.  If Redis is unavailable or no URL is configured
the cache silently degrades to memory-only.  If even the memory tier is
disabled (``max_size=0``), :meth:`get`/:meth:`set` become no-ops, which is
useful for tests that want to force every call through the LLM.

The cache always serialises stored values as JSON so the same entry can be
read by both the memory and Redis tiers without surprises.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("ai.llm_cache")


# ── Optional Redis import ─────────────────────────────────────────────────────


try:  # pragma: no cover - import shim
    from redis.asyncio import from_url as _redis_from_url  # type: ignore

    _REDIS_AVAILABLE = True
except Exception:  # pragma: no cover
    _REDIS_AVAILABLE = False


# ── Defaults ──────────────────────────────────────────────────────────────────


DEFAULT_TTL_SECONDS: int = 3600          # 1 hour
DEFAULT_MAX_SIZE: int = 1024             # in-memory LRU bound
KEY_PREFIX: str = "llm:cache:v1"         # namespaced Redis key prefix


# ── Stats ─────────────────────────────────────────────────────────────────────


@dataclass
class CacheStats:
    """Lightweight counters useful for observability."""

    hits: int = 0
    memory_hits: int = 0
    redis_hits: int = 0
    misses: int = 0
    sets: int = 0
    evictions: int = 0
    redis_errors: int = 0

    def as_dict(self) -> dict[str, int]:
        return {
            "hits": self.hits,
            "memory_hits": self.memory_hits,
            "redis_hits": self.redis_hits,
            "misses": self.misses,
            "sets": self.sets,
            "evictions": self.evictions,
            "redis_errors": self.redis_errors,
        }

    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return round(self.hits / total, 4) if total else 0.0


# ── LRU memory backend ────────────────────────────────────────────────────────


class _LRUMemoryBackend:
    """Tiny TTL-aware ordered dict — most-recently-used at the end."""

    def __init__(self, max_size: int = DEFAULT_MAX_SIZE) -> None:
        if max_size < 0:
            raise ValueError("max_size must be >= 0")
        self._max_size = max_size
        self._data: OrderedDict[str, tuple[str, float | None]] = OrderedDict()
        self._lock = asyncio.Lock()
        self.evictions = 0

    @property
    def max_size(self) -> int:
        return self._max_size

    def __len__(self) -> int:
        return len(self._data)

    async def get(self, key: str) -> str | None:
        if self._max_size == 0:
            return None
        async with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if expires_at is not None and expires_at < time.time():
                self._data.pop(key, None)
                return None
            self._data.move_to_end(key)
            return value

    async def set(self, key: str, value: str, ttl: int | None = None) -> None:
        if self._max_size == 0:
            return
        async with self._lock:
            expires_at = time.time() + ttl if ttl else None
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = (value, expires_at)
            while len(self._data) > self._max_size:
                self._data.popitem(last=False)
                self.evictions += 1

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._data.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._data.clear()


# ── Public LLM cache facade ──────────────────────────────────────────────────


class LLMCache:
    """LRU + Redis cache for chat-completion responses.

    Example
    -------
    >>> cache = LLMCache()
    >>> key = cache.make_key("gpt-4o", [{"role": "user", "content": "hi"}], temperature=0.7)
    >>> await cache.get(key)              # None on first call
    >>> await cache.set(key, {"content": "Hello!"})
    >>> await cache.get(key)              # cached payload
    """

    def __init__(
        self,
        *,
        max_size: int = DEFAULT_MAX_SIZE,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        redis_url: str | None = None,
        key_prefix: str = KEY_PREFIX,
    ) -> None:
        self._memory = _LRUMemoryBackend(max_size=max_size)
        self._ttl = ttl_seconds
        self._prefix = key_prefix
        self._stats = CacheStats()
        self._redis_url = redis_url if redis_url is not None else os.getenv("REDIS_URL")
        self._redis: Any = None
        self._redis_ready: bool = False
        self._redis_lock = asyncio.Lock()

    # ── stats / introspection ─────────────────────────────────────────────

    @property
    def ttl_seconds(self) -> int:
        return self._ttl

    @property
    def max_size(self) -> int:
        return self._memory.max_size

    def stats(self) -> dict[str, Any]:
        s = self._stats.as_dict()
        s["evictions"] = self._memory.evictions
        s["memory_size"] = len(self._memory)
        s["max_size"] = self._memory.max_size
        s["ttl_seconds"] = self._ttl
        s["hit_rate"] = self._stats.hit_rate()
        s["redis_connected"] = self._redis_ready
        return s

    def reset_stats(self) -> None:
        self._stats = CacheStats()
        self._memory.evictions = 0

    # ── key derivation ────────────────────────────────────────────────────

    @staticmethod
    def hash_prompt(messages: list[dict[str, str]]) -> str:
        """Return a stable sha256 fingerprint of the message list."""
        payload = json.dumps(messages, sort_keys=True, default=str)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def make_key(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float,
        *,
        tenant_id: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str:
        """Build the canonical cache key ``(model, prompt_hash, temperature)``.

        ``tenant_id`` and ``extra`` are folded into the hash so different
        tenants and different request shapes (e.g. JSON-mode vs free text)
        never collide.  The temperature is rounded to 4 decimal places so
        callers using ``0.20000001`` and ``0.2`` get the same cache slot.
        """
        prompt_hash = self.hash_prompt(messages)
        temp_key = f"{round(float(temperature), 4):.4f}"
        ns = tenant_id or "global"
        extra_hash = ""
        if extra:
            extra_json = json.dumps(extra, sort_keys=True, default=str)
            extra_hash = ":" + hashlib.sha256(extra_json.encode("utf-8")).hexdigest()[:16]
        return f"{self._prefix}:{ns}:{model}:{temp_key}:{prompt_hash}{extra_hash}"

    # ── core get / set / invalidate ──────────────────────────────────────

    async def get(self, key: str) -> dict[str, Any] | None:
        """Return the cached payload for ``key`` or ``None`` on miss."""
        raw = await self._memory.get(key)
        if raw is not None:
            self._stats.hits += 1
            self._stats.memory_hits += 1
            return self._decode(raw)

        # Memory miss — try Redis if available.
        redis = await self._ensure_redis()
        if redis is not None:
            try:
                raw = await redis.get(key)
            except Exception as exc:  # pragma: no cover - defensive
                self._stats.redis_errors += 1
                logger.debug("llm_cache.redis_get_failed key=%s err=%s", key, exc)
                raw = None
            if raw is not None:
                self._stats.hits += 1
                self._stats.redis_hits += 1
                # Promote into memory for subsequent calls.
                await self._memory.set(key, raw, ttl=self._ttl)
                return self._decode(raw)

        self._stats.misses += 1
        return None

    async def set(
        self,
        key: str,
        value: dict[str, Any],
        *,
        ttl: int | None = None,
    ) -> None:
        """Store ``value`` under ``key`` in both tiers."""
        ttl = ttl if ttl is not None else self._ttl
        raw = json.dumps(value, default=str)
        await self._memory.set(key, raw, ttl=ttl)
        self._stats.sets += 1

        redis = await self._ensure_redis()
        if redis is not None:
            try:
                await redis.set(key, raw, ex=ttl)
            except Exception as exc:  # pragma: no cover - defensive
                self._stats.redis_errors += 1
                logger.debug("llm_cache.redis_set_failed key=%s err=%s", key, exc)

    async def invalidate(self, key: str) -> None:
        """Remove ``key`` from both tiers."""
        await self._memory.delete(key)
        redis = await self._ensure_redis()
        if redis is not None:
            try:
                await redis.delete(key)
            except Exception as exc:  # pragma: no cover - defensive
                self._stats.redis_errors += 1
                logger.debug("llm_cache.redis_delete_failed key=%s err=%s", key, exc)

    async def clear(self) -> None:
        """Drop every entry from both tiers (the memory tier only when not shared)."""
        await self._memory.clear()
        self.reset_stats()
        # Intentionally do NOT flush Redis — that backend may be shared with
        # other services.  Use ``invalidate`` for per-key removal.

    async def close(self) -> None:
        if self._redis is not None:
            try:
                await self._redis.aclose()
            except Exception:  # pragma: no cover - defensive
                pass
            self._redis = None
            self._redis_ready = False

    # ── internals ────────────────────────────────────────────────────────

    @staticmethod
    def _decode(raw: str) -> dict[str, Any]:
        try:
            data = json.loads(raw)
        except (TypeError, ValueError):
            return {"content": raw}
        if not isinstance(data, dict):
            return {"content": data}
        return data

    async def _ensure_redis(self) -> Any:
        if not self._redis_url or not _REDIS_AVAILABLE:
            return None
        if self._redis_ready:
            return self._redis
        async with self._redis_lock:
            if self._redis_ready:
                return self._redis
            try:
                client = _redis_from_url(
                    self._redis_url, encoding="utf-8", decode_responses=True
                )
                if await client.ping():
                    self._redis = client
                    self._redis_ready = True
                    logger.info("llm_cache.redis_connected url=%s", self._redis_url)
                    return self._redis
            except Exception as exc:
                self._stats.redis_errors += 1
                logger.debug("llm_cache.redis_connect_failed err=%s", exc)
            return None


# ── Module singleton ─────────────────────────────────────────────────────────


_llm_cache: LLMCache | None = None


def get_llm_cache() -> LLMCache:
    """Lazy module-level singleton used by the LLM router."""
    global _llm_cache
    if _llm_cache is None:
        _llm_cache = LLMCache()
    return _llm_cache


def set_llm_cache(cache: LLMCache | None) -> None:
    """Override the module singleton — used by tests."""
    global _llm_cache
    _llm_cache = cache


__all__ = [
    "CacheStats",
    "DEFAULT_MAX_SIZE",
    "DEFAULT_TTL_SECONDS",
    "KEY_PREFIX",
    "LLMCache",
    "get_llm_cache",
    "set_llm_cache",
]
