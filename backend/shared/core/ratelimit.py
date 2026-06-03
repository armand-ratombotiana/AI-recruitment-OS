"""Rate limiting — fixed-window counters, Redis-backed with in-memory fallback.

Each ``RateLimiter`` is keyed by a name (e.g. ``"auth.login"``) and a client
key (e.g. ``"ip:1.2.3.4:user@x.com"``).  Counters are incremented under a
single Redis key with a TTL equal to the window length — no race, no
distributed-lock dance.  In-memory fallback uses a per-process dict.
"""
from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Protocol

logger = logging.getLogger("ratelimit")


try:
    from redis.asyncio import from_url as _redis_from_url  # type: ignore

    _REDIS_AVAILABLE = True
except Exception:  # pragma: no cover
    _REDIS_AVAILABLE = False


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    reset_seconds: int
    limit: int


# ── Backends ───────────────────────────────────────────────────────────────────


class _Backend(Protocol):
    async def hit(self, key: str, window_seconds: int) -> tuple[int, int]: ...
    async def close(self) -> None: ...


class _InMemoryBackend:
    def __init__(self) -> None:
        self._buckets: dict[str, list[float]] = defaultdict(list)

    async def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        now = time.time()
        cutoff = now - window_seconds
        recent = [t for t in self._buckets[key] if t > cutoff]
        recent.append(now)
        self._buckets[key] = recent
        # Time until the oldest entry in the window expires
        reset = max(1, int(window_seconds - (now - recent[0]))) if recent else window_seconds
        return len(recent), reset

    async def close(self) -> None:
        pass


class _RedisBackend:
    def __init__(self, url: str) -> None:
        self._client = _redis_from_url(url, encoding="utf-8", decode_responses=True)

    async def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        # INCR + EXPIRE on first increment; this is the standard pattern.
        async with self._client.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = await pipe.execute()
        if ttl == -1:
            # Key was just created — set its TTL.
            await self._client.expire(key, window_seconds)
            ttl = window_seconds
        return int(count), max(1, int(ttl))

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass


# ── Public RateLimiter ────────────────────────────────────────────────────────


class RateLimiter:
    """Async rate limiter that delegates to Redis when available, else in-memory."""

    def __init__(
        self,
        name: str,
        max_requests: int = 100,
        window_seconds: int = 60,
        redis_url: str | None = None,
    ) -> None:
        self.name = name
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._backend: _Backend = _InMemoryBackend()
        self._redis_url = redis_url or os.getenv("REDIS_URL")
        self._using_redis = False

    async def connect(self) -> None:
        if not self._redis_url or not _REDIS_AVAILABLE:
            return
        try:
            backend = _RedisBackend(self._redis_url)
            # Quick sanity ping
            await backend._client.ping()  # type: ignore[attr-defined]
            self._backend = backend
            self._using_redis = True
            logger.info("ratelimit[%s]: using redis backend", self.name)
        except Exception as exc:
            logger.warning("ratelimit[%s]: redis unavailable (%s) — using in-memory", self.name, exc)

    @property
    def backend(self) -> str:
        return "redis" if self._using_redis else "memory"

    def _full_key(self, key: str) -> str:
        return f"rl:{self.name}:{key}"

    async def check(self, key: str) -> tuple[bool, RateLimitResult]:
        full = self._full_key(key)
        count, reset = await self._backend.hit(full, self.window_seconds)
        remaining = max(0, self.max_requests - count)
        allowed = count <= self.max_requests
        return allowed, RateLimitResult(
            allowed=allowed,
            remaining=remaining,
            reset_seconds=reset,
            limit=self.max_requests,
        )

    async def close(self) -> None:
        await self._backend.close()


# ── Default limiters (registered at import time) ──────────────────────────────

default_limiter = RateLimiter(name="default", max_requests=100, window_seconds=60)
auth_login_limiter = RateLimiter(name="auth.login", max_requests=10, window_seconds=60)
auth_register_limiter = RateLimiter(name="auth.register", max_requests=5, window_seconds=60)
auth_password_reset_limiter = RateLimiter(name="auth.password_reset", max_requests=3, window_seconds=60)


async def init_rate_limiters() -> None:
    """Connect every default limiter to Redis.  Safe to call multiple times."""
    for lim in (default_limiter, auth_login_limiter, auth_register_limiter, auth_password_reset_limiter):
        await lim.connect()
