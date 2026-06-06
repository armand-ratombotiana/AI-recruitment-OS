"""Rate limiting middleware — multi-window per-tenant / per-user / per-IP.

This module implements the production rate-limiting layer for AI-ROS.  It
exposes:

* :class:`RateLimiter`  — a multi-window limiter (per-minute / per-hour /
  per-day) that uses Redis when available and falls back to an in-process
  dict-of-deques otherwise.  The instance is safe to share across coroutines
  and across ASGI workers.
* :class:`RateLimitMiddleware` — a Starlette/FastAPI middleware that applies
  the correct limiter to a request based on its URL path (auth → IP, AI →
  user, public → tenant, default → user/IP).  Routes that have already been
  rate-limited by an explicit dependency are skipped, and ``super_admin``
  users bypass every check.
* :class:`rate_limit_router` — a FastAPI router that exposes
  ``GET /api/v1/rate-limit/status`` so callers can introspect their current
  usage.

The design intentionally mirrors the existing ``shared.core.ratelimit``
module but adds three capabilities required by the platform:

1. Multiple windows (minute / hour / day) so a single request can be charged
   against all of them simultaneously.
2. Per-tenant *and* per-user keys with shared middleware classification.
3. An ``X-RateLimit-*`` response header convention and a ``Retry-After``
   header on every 429, which the platform's other services honour.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Deque, Optional

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger("ratelimit.middleware")


# ── Optional Redis dependency ──────────────────────────────────────────────────

try:  # pragma: no cover - import shim
    from redis.asyncio import from_url as _redis_from_url  # type: ignore

    _REDIS_AVAILABLE = True
except Exception:  # pragma: no cover
    _REDIS_AVAILABLE = False


# ── Result dataclass ───────────────────────────────────────────────────────────


@dataclass
class RateLimitResult:
    """Outcome of a single rate-limit check."""

    allowed: bool
    limit: int
    remaining: int
    reset_seconds: int
    used: int
    window: str
    scope: str
    bypass: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "allowed": self.allowed,
            "limit": self.limit,
            "remaining": self.remaining,
            "reset_seconds": self.reset_seconds,
            "used": self.used,
            "window": self.window,
            "scope": self.scope,
            "bypass": self.bypass,
        }


# ── Backends ───────────────────────────────────────────────────────────────────


class _Backend:
    """Protocol for the two backends."""

    async def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        raise NotImplementedError

    async def get(self, key: str, window_seconds: int) -> tuple[int, int]:
        raise NotImplementedError

    async def close(self) -> None:  # pragma: no cover
        pass


class _InMemoryBackend(_Backend):
    """Sliding window using a per-key deque of timestamps."""

    def __init__(self) -> None:
        self._buckets: dict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        async with self._lock:
            now = time.time()
            cutoff = now - window_seconds
            dq = self._buckets[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            dq.append(now)
            reset = int(window_seconds - (now - dq[0]))
            if reset < 1:
                reset = window_seconds
            return len(dq), reset

    async def get(self, key: str, window_seconds: int) -> tuple[int, int]:
        async with self._lock:
            now = time.time()
            cutoff = now - window_seconds
            dq = self._buckets[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            reset = int(window_seconds - (now - dq[0])) if dq else window_seconds
            if reset < 1:
                reset = window_seconds
            return len(dq), reset

    async def close(self) -> None:
        self._buckets.clear()


class _RedisBackend(_Backend):
    """Fixed-window counter implemented with INCR + EXPIRE."""

    def __init__(self, url: str) -> None:
        self._client = _redis_from_url(url, encoding="utf-8", decode_responses=True)

    async def hit(self, key: str, window_seconds: int) -> tuple[int, int]:
        async with self._client.pipeline(transaction=True) as pipe:  # type: ignore[attr-defined]
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = await pipe.execute()
        if ttl == -1:
            await self._client.expire(key, window_seconds)  # type: ignore[attr-defined]
            ttl = window_seconds
        return int(count), max(1, int(ttl))

    async def get(self, key: str, window_seconds: int) -> tuple[int, int]:
        async with self._client.pipeline(transaction=True) as pipe:  # type: ignore[attr-defined]
            pipe.get(key)
            pipe.ttl(key)
            raw, ttl = await pipe.execute()
        count = int(raw) if raw else 0
        if ttl == -1:
            ttl = window_seconds
        return count, max(1, int(ttl))

    async def close(self) -> None:  # pragma: no cover
        try:
            await self._client.aclose()  # type: ignore[attr-defined]
        except Exception:
            pass


# ── Public RateLimiter ────────────────────────────────────────────────────────


class RateLimiter:
    """Multi-window rate limiter (per-minute / per-hour / per-day).

    A request is allowed only if **every** configured window still has
    remaining capacity.  The first window that runs out produces the 429.

    The limiter delegates storage to :class:`_InMemoryBackend` by default
    and switches to :class:`_RedisBackend` when ``redis_url`` (or the
    ``REDIS_URL`` env var) points at a reachable server.
    """

    _WINDOW_SECONDS: dict[str, int] = {
        "minute": 60,
        "hour": 3600,
        "day": 86400,
    }

    def __init__(
        self,
        name: str,
        per_minute: Optional[int] = None,
        per_hour: Optional[int] = None,
        per_day: Optional[int] = None,
        redis_url: Optional[str] = None,
    ) -> None:
        if per_minute is None and per_hour is None and per_day is None:
            raise ValueError("RateLimiter requires at least one of per_minute/per_hour/per_day")
        self.name = name
        self.per_minute = per_minute
        self.per_hour = per_hour
        self.per_day = per_day
        self._backend: _Backend = _InMemoryBackend()
        self._redis_url = redis_url or os.getenv("REDIS_URL")
        self._using_redis = False

    @property
    def backend(self) -> str:
        return "redis" if self._using_redis else "memory"

    @property
    def limits(self) -> dict[str, Optional[int]]:
        return {
            "minute": self.per_minute,
            "hour": self.per_hour,
            "day": self.per_day,
        }

    async def connect(self) -> None:
        if not self._redis_url or not _REDIS_AVAILABLE:
            return
        try:
            backend = _RedisBackend(self._redis_url)
            await backend._client.ping()  # type: ignore[attr-defined]
            self._backend = backend
            self._using_redis = True
            logger.info("rate_limit[%s]: using redis backend", self.name)
        except Exception as exc:  # pragma: no cover - depends on env
            logger.warning(
                "rate_limit[%s]: redis unavailable (%s) - using in-memory backend",
                self.name,
                exc,
            )

    async def close(self) -> None:
        await self._backend.close()

    # ── keying ────────────────────────────────────────────────────────────

    def _full_key(self, key: str, window: str) -> str:
        return f"rl:{self.name}:{window}:{key}"

    # ── public API ────────────────────────────────────────────────────────

    async def check(self, key: str, scope: str = "unknown") -> RateLimitResult:
        """Atomically charge the request against every configured window.

        Returns the first window that is over budget.  If every window has
        spare capacity, the *most restrictive* (lowest remaining) result is
        returned.
        """
        windows: list[tuple[str, int, int]] = []
        if self.per_minute is not None:
            windows.append(("minute", 60, self.per_minute))
        if self.per_hour is not None:
            windows.append(("hour", 3600, self.per_hour))
        if self.per_day is not None:
            windows.append(("day", 86400, self.per_day))

        most_restrictive: Optional[RateLimitResult] = None
        for window, window_seconds, max_requests in windows:
            count, reset = await self._backend.hit(
                self._full_key(key, window), window_seconds
            )
            remaining = max(0, max_requests - count)
            result = RateLimitResult(
                allowed=count <= max_requests,
                limit=max_requests,
                remaining=remaining,
                reset_seconds=reset,
                used=count,
                window=window,
                scope=scope,
            )
            if not result.allowed:
                return result
            if most_restrictive is None or result.remaining < most_restrictive.remaining:
                most_restrictive = result

        assert most_restrictive is not None  # guaranteed by ctor validation
        return most_restrictive

    async def status(self, key: str) -> dict[str, Any]:
        """Return current usage per window without consuming a token."""
        windows: list[dict[str, Any]] = []
        for window, window_seconds, max_requests in (
            ("minute", 60, self.per_minute),
            ("hour", 3600, self.per_hour),
            ("day", 86400, self.per_day),
        ):
            if max_requests is None:
                continue
            used, reset = await self._backend.get(
                self._full_key(key, window), window_seconds
            )
            windows.append(
                {
                    "window": window,
                    "limit": max_requests,
                    "used": used,
                    "remaining": max(0, max_requests - used),
                    "reset_seconds": reset,
                }
            )
        return {
            "name": self.name,
            "key": key,
            "backend": self.backend,
            "windows": windows,
        }


# ── Predefined limiters ───────────────────────────────────────────────────────
#
# The numeric limits match the platform spec:
#
# * auth endpoints (login / register / password reset) → 5/min per IP
# * AI endpoints                                       → 10/min per user
# * public API endpoints                               → 100/min per tenant
# * everything else                                    → 60/min per user
#
# Hour/day caps are sensible defaults so a single client cannot exhaust the
# entire daily quota inside the per-minute window.

auth_ip_limiter = RateLimiter("auth.ip", per_minute=5, per_hour=20, per_day=100)
ai_user_limiter = RateLimiter("ai.user", per_minute=10, per_hour=100, per_day=500)
public_tenant_limiter = RateLimiter(
    "public.tenant", per_minute=100, per_hour=1000, per_day=10000
)
default_user_limiter = RateLimiter(
    "default.user", per_minute=60, per_hour=1000, per_day=10000
)

ALL_LIMITERS: list[RateLimiter] = [
    auth_ip_limiter,
    ai_user_limiter,
    public_tenant_limiter,
    default_user_limiter,
]


async def init_rate_limiters() -> None:
    """Connect every default limiter to Redis.  Safe to call multiple times."""
    for lim in ALL_LIMITERS:
        await lim.connect()


async def close_rate_limiters() -> None:
    for lim in ALL_LIMITERS:
        try:
            await lim.close()
        except Exception:  # pragma: no cover
            pass


# ── Identity helpers ──────────────────────────────────────────────────────────


def _client_ip(request: StarletteRequest | Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _tenant_id(request: StarletteRequest | Request) -> str:
    explicit = request.headers.get("X-Tenant-ID")
    if explicit:
        return explicit
    state_value = getattr(request.state, "tenant_id", None)
    if state_value:
        return state_value
    # Fall back to the tenant_id embedded in the JWT, when present.
    payload = _decode_bearer_payload(request)
    if payload and payload.get("tenant_id"):
        return payload["tenant_id"]
    return "default"


def _decode_bearer_payload(request: StarletteRequest | Request) -> Optional[dict[str, Any]]:
    """Return the decoded JWT payload, or None if no/invalid token."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        from shared.core.security import decode_token

        return decode_token(token) or None
    except Exception:
        return None


def _is_super_admin(request: StarletteRequest | Request) -> bool:
    payload = _decode_bearer_payload(request)
    if not payload:
        return False
    return payload.get("role") == "super_admin"


def _user_id(request: StarletteRequest | Request) -> Optional[str]:
    payload = _decode_bearer_payload(request)
    if not payload:
        return None
    if payload.get("type") not in (None, "access"):
        return None
    return payload.get("sub")


# ── Dependencies ──────────────────────────────────────────────────────────────


def _bypass_result() -> RateLimitResult:
    return RateLimitResult(
        allowed=True,
        limit=0,
        remaining=0,
        reset_seconds=0,
        used=0,
        window="bypass",
        scope="super_admin",
        bypass=True,
    )


def rate_limit_auth() -> Callable[[Request], Awaitable[RateLimitResult]]:
    """FastAPI dependency: 5/min per IP for auth endpoints.

    Skips for ``super_admin`` users.
    """

    async def _dep(request: Request) -> RateLimitResult:
        if _is_super_admin(request):
            return _bypass_result()
        ip = _client_ip(request)
        result = await auth_ip_limiter.check(f"ip:{ip}", scope="ip")
        if not result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Too many requests on this auth endpoint. "
                    f"Try again in {result.reset_seconds}s."
                ),
                headers={
                    "Retry-After": str(result.reset_seconds),
                    "X-RateLimit-Limit": str(result.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(result.reset_seconds),
                },
            )
        return result

    return _dep


def rate_limit_ai() -> Callable[[Request], Awaitable[RateLimitResult]]:
    """FastAPI dependency: 10/min per user for AI endpoints.

    Falls back to per-IP for unauthenticated callers.
    Skips for ``super_admin`` users.
    """

    async def _dep(request: Request) -> RateLimitResult:
        if _is_super_admin(request):
            return _bypass_result()
        uid = _user_id(request)
        scope_key = f"user:{uid}" if uid else f"ip:{_client_ip(request)}"
        result = await ai_user_limiter.check(scope_key, scope="user" if uid else "ip")
        if not result.allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "AI rate limit exceeded. "
                    f"Try again in {result.reset_seconds}s."
                ),
                headers={
                    "Retry-After": str(result.reset_seconds),
                    "X-RateLimit-Limit": str(result.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(result.reset_seconds),
                },
            )
        return result

    return _dep


# ── Middleware ────────────────────────────────────────────────────────────────


# Auth routes handled by the explicit ``rate_limit_auth`` dependency.
_AUTH_ROUTES = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/resend-verification",
}

# Routes that are exempt from rate limiting entirely.
_SKIP_PATHS = {
    "/",
    "/favicon.ico",
    "/docs",
    "/redoc",
    "/openapi.json",
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-tenant / per-user / per-IP limits to every request.

    Classification:

    * Auth routes  → handled by ``rate_limit_auth`` dependency (skipped here).
    * AI routes    → handled by ``rate_limit_ai`` dependency (skipped here).
    * Public       → 100/min per tenant.
    * All others   → 60/min per user, falling back to per-IP for anonymous.

    ``super_admin`` callers always bypass every limiter.

    The set of public prefixes is a class-level tuple so individual apps can
    override it (typically used by tests):

        RateLimitMiddleware.public_prefixes = ("/api/v1/foo", ...)
    """

    # Public route prefixes that are rate-limited per tenant.
    public_prefixes: tuple[str, ...] = (
        "/api/v1/health",
        "/health",
        "/api/v1/monitoring",
        "/metrics",
        "/api/v1/rate-limit",
    )

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self, request: StarletteRequest, call_next: Callable[[StarletteRequest], Awaitable[Response]]
    ) -> Response:
        path = request.url.path

        # Exempt static / docs / health
        if path in _SKIP_PATHS or path.startswith(("/docs", "/redoc")):
            return await call_next(request)

        # Auth / AI routes have their own explicit dependency.
        if path in _AUTH_ROUTES or path.startswith("/api/v1/ai") or path == "/api/v1/ai":
            return await call_next(request)

        if _is_super_admin(request):
            response = await call_next(request)
            self._stamp_bypass_headers(response)
            return response

        tenant = _tenant_id(request)
        uid = _user_id(request)

        if any(path.startswith(p) for p in self.public_prefixes):
            limiter = public_tenant_limiter
            scope_key = f"tenant:{tenant}"
            scope_label = "tenant"
        else:
            limiter = default_user_limiter
            scope_key = f"user:{uid}" if uid else f"ip:{_client_ip(request)}"
            scope_label = "user" if uid else "ip"

        result = await limiter.check(scope_key, scope=scope_label)
        if not result.allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": (
                            f"Rate limit exceeded on '{limiter.name}' "
                            f"({scope_label}). Try again in {result.reset_seconds}s."
                        ),
                        "limit": result.limit,
                        "window": result.window,
                        "reset_seconds": result.reset_seconds,
                    }
                },
                headers={
                    "Retry-After": str(result.reset_seconds),
                    "X-RateLimit-Limit": str(result.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(result.reset_seconds),
                    "X-RateLimit-Scope": scope_label,
                },
            )

        response = await call_next(request)
        # Use ``setdefault`` so we never overwrite headers set by a route
        # dependency (e.g. ``rate_limit_auth`` reporting the per-IP limit
        # of 5/min on an /api/v1/auth/login 429).
        response.headers.setdefault("X-RateLimit-Limit", str(result.limit))
        response.headers.setdefault("X-RateLimit-Remaining", str(result.remaining))
        response.headers.setdefault("X-RateLimit-Reset", str(result.reset_seconds))
        response.headers.setdefault("X-RateLimit-Scope", scope_label)
        return response

    @staticmethod
    def _stamp_bypass_headers(response: Response) -> None:
        response.headers.setdefault("X-RateLimit-Bypass", "super_admin")
        response.headers.setdefault("X-RateLimit-Scope", "super_admin")


# ── Status endpoint ───────────────────────────────────────────────────────────


rate_limit_router = APIRouter(tags=["Rate Limit"])


@rate_limit_router.get("/rate-limit/status")
async def rate_limit_status(request: Request) -> dict[str, Any]:
    """Return current rate-limit usage for the calling client.

    The response includes the scope (user / tenant / IP), whether the caller
    is a ``super_admin`` (and therefore exempt from every limiter), and the
    live usage of every registered limiter keyed on the caller's identity.
    """
    tenant = _tenant_id(request)
    uid = _user_id(request) or f"ip:{_client_ip(request)}"
    ip = _client_ip(request)
    is_admin = _is_super_admin(request)

    return {
        "scope": {
            "user_id": uid,
            "tenant_id": tenant,
            "ip": ip,
            "is_super_admin": is_admin,
        },
        "limiters": [
            {
                "name": "default.user",
                "scope": "user",
                **await default_user_limiter.status(f"user:{uid}"),
            },
            {
                "name": "ai.user",
                "scope": "user",
                **await ai_user_limiter.status(f"user:{uid}"),
            },
            {
                "name": "auth.ip",
                "scope": "ip",
                **await auth_ip_limiter.status(f"ip:{ip}"),
            },
            {
                "name": "public.tenant",
                "scope": "tenant",
                **await public_tenant_limiter.status(f"tenant:{tenant}"),
            },
        ],
    }


__all__ = [
    "ALL_LIMITERS",
    "RateLimiter",
    "RateLimitMiddleware",
    "RateLimitResult",
    "ai_user_limiter",
    "auth_ip_limiter",
    "close_rate_limiters",
    "default_user_limiter",
    "init_rate_limiters",
    "public_tenant_limiter",
    "rate_limit_ai",
    "rate_limit_auth",
    "rate_limit_router",
]
