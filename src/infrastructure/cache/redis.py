"""Redis cache infrastructure with semantic caching support."""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from src.config import get_settings

settings = get_settings()

redis_client = aioredis.from_url(
    settings.REDIS_URL,
    encoding="utf-8",
    decode_responses=True,
    max_connections=50,
)


class CacheService:
    """General-purpose Redis cache with TTL support."""

    def __init__(self, prefix: str = "airos") -> None:
        self.prefix = prefix
        self.client = redis_client

    def _key(self, key: str) -> str:
        return f"{self.prefix}:{key}"

    async def get(self, key: str) -> Any | None:
        raw = await self.client.get(self._key(key))
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return raw

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        serialized = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
        if ttl:
            await self.client.setex(self._key(key), ttl, serialized)
        else:
            await self.client.set(self._key(key), serialized)

    async def delete(self, key: str) -> None:
        await self.client.delete(self._key(key))

    async def exists(self, key: str) -> bool:
        return bool(await self.client.exists(self._key(key)))

    async def increment(self, key: str, amount: int = 1) -> int:
        return await self.client.incrby(self._key(key), amount)

    async def set_hash(self, key: str, mapping: dict[str, Any]) -> None:
        await self.client.hset(self._key(key), mapping={k: json.dumps(v) for k, v in mapping.items()})

    async def get_hash(self, key: str) -> dict[str, str]:
        return await self.client.hgetall(self._key(key))


class SemanticCacheService:
    """
    Semantic cache that stores and retrieves LLM responses
    based on embedding similarity rather than exact key match.
    """

    def __init__(self) -> None:
        self.client = redis_client
        self.default_ttl = settings.AI_SEMANTIC_CACHE_TTL

    async def get_similar(self, query_hash: str) -> dict[str, Any] | None:
        """Retrieve cached response by query hash."""
        raw = await self.client.get(f"semantic_cache:{query_hash}")
        if raw:
            return json.loads(raw)
        return None

    async def store(
        self,
        query_hash: str,
        response: dict[str, Any],
        ttl: int | None = None,
    ) -> None:
        """Store a query-response pair in semantic cache."""
        serialized = json.dumps(response)
        await self.client.setex(
            f"semantic_cache:{query_hash}",
            ttl or self.default_ttl,
            serialized,
        )

    async def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all cache entries matching a pattern."""
        keys = []
        async for key in self.client.scan_iter(f"semantic_cache:{pattern}*"):
            keys.append(key)
        if keys:
            return await self.client.delete(*keys)
        return 0
