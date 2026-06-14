"""Advanced rate limiting: sliding window, token bucket, leaky bucket, burst protection.

Provides:

* :class:`SlidingWindowLimiter` — precise sliding window log algorithm.
* :class:`TokenBucketLimiter` — token bucket with configurable refill rate.
* :class:`LeakyBucketLimiter` — leaky bucket (metered processing).
* :class:`AdvancedRateLimiter` — composite limiter combining all three with
  per-user, per-IP, and per-endpoint scopes plus burst protection.
* :data:`security_router` — FastAPI router for security management endpoints.
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Deque, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

logger = logging.getLogger("security.rate_limit_advanced")


# ── Sliding Window Limiter ────────────────────────────────────────────────────


class SlidingWindowLimiter:
    """Sliding window log algorithm for rate limiting.

    Tracks exact timestamps of each request within the window.  More precise
    than fixed-window counters but uses more memory.
    """

    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._windows: dict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> tuple[bool, dict[str, Any]]:
        async with self._lock:
            now = time.time()
            dq = self._windows[key]
            cutoff = now - self.window_seconds

            while dq and dq[0] < cutoff:
                dq.popleft()

            count = len(dq)
            if count >= self.max_requests:
                retry_after = dq[0] - cutoff if dq else self.window_seconds
                return False, {
                    "algorithm": "sliding_window",
                    "limit": self.max_requests,
                    "used": count,
                    "remaining": 0,
                    "window_seconds": self.window_seconds,
                    "retry_after": round(retry_after, 2),
                }

            dq.append(now)
            return True, {
                "algorithm": "sliding_window",
                "limit": self.max_requests,
                "used": len(dq),
                "remaining": self.max_requests - len(dq),
                "window_seconds": self.window_seconds,
                "retry_after": 0,
            }

    async def get_status(self, key: str) -> dict[str, Any]:
        async with self._lock:
            now = time.time()
            dq = self._windows[key]
            cutoff = now - self.window_seconds
            while dq and dq[0] < cutoff:
                dq.popleft()
            return {
                "algorithm": "sliding_window",
                "limit": self.max_requests,
                "used": len(dq),
                "remaining": max(0, self.max_requests - len(dq)),
                "window_seconds": self.window_seconds,
            }

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._windows.pop(key, None)


# ── Token Bucket Limiter ─────────────────────────────────────────────────────


class TokenBucketLimiter:
    """Token bucket algorithm: tokens refill at a steady rate.

    Allows bursts up to ``capacity`` but sustains at ``refill_rate`` tokens/sec.
    """

    def __init__(self, capacity: int, refill_rate: float) -> None:
        self.capacity = capacity
        self.refill_rate = refill_rate
        self._buckets: dict[str, dict[str, float]] = {}
        self._lock = asyncio.Lock()

    async def allow(self, key: str, tokens: int = 1) -> tuple[bool, dict[str, Any]]:
        async with self._lock:
            now = time.time()
            if key not in self._buckets:
                self._buckets[key] = {
                    "tokens": float(self.capacity),
                    "last_refill": now,
                }

            bucket = self._buckets[key]
            elapsed = now - bucket["last_refill"]
            bucket["tokens"] = min(
                float(self.capacity),
                bucket["tokens"] + elapsed * self.refill_rate,
            )
            bucket["last_refill"] = now

            if bucket["tokens"] >= tokens:
                bucket["tokens"] -= tokens
                return True, {
                    "algorithm": "token_bucket",
                    "capacity": self.capacity,
                    "tokens_remaining": round(bucket["tokens"], 2),
                    "refill_rate": self.refill_rate,
                    "requested": tokens,
                }

            deficit = tokens - bucket["tokens"]
            retry_after = deficit / self.refill_rate if self.refill_rate > 0 else 0
            return False, {
                "algorithm": "token_bucket",
                "capacity": self.capacity,
                "tokens_remaining": round(bucket["tokens"], 2),
                "refill_rate": self.refill_rate,
                "requested": tokens,
                "retry_after": round(retry_after, 2),
            }

    async def get_status(self, key: str) -> dict[str, Any]:
        async with self._lock:
            now = time.time()
            if key not in self._buckets:
                return {
                    "algorithm": "token_bucket",
                    "capacity": self.capacity,
                    "tokens_remaining": float(self.capacity),
                    "refill_rate": self.refill_rate,
                }
            bucket = self._buckets[key]
            elapsed = now - bucket["last_refill"]
            current = min(
                float(self.capacity),
                bucket["tokens"] + elapsed * self.refill_rate,
            )
            return {
                "algorithm": "token_bucket",
                "capacity": self.capacity,
                "tokens_remaining": round(current, 2),
                "refill_rate": self.refill_rate,
            }

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._buckets.pop(key, None)


# ── Leaky Bucket Limiter ─────────────────────────────────────────────────────


class LeakyBucketLimiter:
    """Leaky bucket algorithm: processes requests at a fixed rate.

    Requests that arrive faster than the leak rate are queued (virtually).
    If the queue overflows, requests are rejected.
    """

    def __init__(self, rate: float, capacity: int) -> None:
        self.rate = rate
        self.capacity = capacity
        self._buckets: dict[str, dict[str, float]] = {}
        self._lock = asyncio.Lock()

    async def allow(self, key: str) -> tuple[bool, dict[str, Any]]:
        async with self._lock:
            now = time.time()
            if key not in self._buckets:
                self._buckets[key] = {
                    "water": 0.0,
                    "last_leak": now,
                }

            bucket = self._buckets[key]
            elapsed = now - bucket["last_leak"]
            leaked = elapsed * self.rate
            bucket["water"] = max(0.0, bucket["water"] - leaked)
            bucket["last_leak"] = now

            if bucket["water"] + 1 > self.capacity:
                retry_after = (bucket["water"] + 1 - self.capacity) / self.rate
                return False, {
                    "algorithm": "leaky_bucket",
                    "capacity": self.capacity,
                    "water_level": round(bucket["water"], 2),
                    "rate": self.rate,
                    "retry_after": round(retry_after, 2),
                }

            bucket["water"] += 1
            return True, {
                "algorithm": "leaky_bucket",
                "capacity": self.capacity,
                "water_level": round(bucket["water"], 2),
                "rate": self.rate,
            }

    async def get_status(self, key: str) -> dict[str, Any]:
        async with self._lock:
            now = time.time()
            if key not in self._buckets:
                return {
                    "algorithm": "leaky_bucket",
                    "capacity": self.capacity,
                    "water_level": 0.0,
                    "rate": self.rate,
                }
            bucket = self._buckets[key]
            elapsed = now - bucket["last_leak"]
            water = max(0.0, bucket["water"] - elapsed * self.rate)
            return {
                "algorithm": "leaky_bucket",
                "capacity": self.capacity,
                "water_level": round(water, 2),
                "rate": self.rate,
            }

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._buckets.pop(key, None)


# ── Burst Protection ─────────────────────────────────────────────────────────


class BurstProtector:
    """Detects and throttles request bursts."""

    def __init__(
        self,
        burst_threshold: int = 50,
        burst_window: float = 5.0,
        cooldown_seconds: float = 30.0,
    ) -> None:
        self.burst_threshold = burst_threshold
        self.burst_window = burst_window
        self.cooldown_seconds = cooldown_seconds
        self._timestamps: dict[str, Deque[float]] = defaultdict(deque)
        self._cooldowns: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def check(self, key: str) -> tuple[bool, dict[str, Any]]:
        async with self._lock:
            now = time.time()

            if key in self._cooldowns:
                if now < self._cooldowns[key]:
                    return False, {
                        "burst_detected": True,
                        "cooldown_remaining": round(self._cooldowns[key] - now, 2),
                    }
                del self._cooldowns[key]
                self._timestamps.pop(key, None)

            dq = self._timestamps[key]
            cutoff = now - self.burst_window
            while dq and dq[0] < cutoff:
                dq.popleft()

            dq.append(now)

            if len(dq) >= self.burst_threshold:
                self._cooldowns[key] = now + self.cooldown_seconds
                return False, {
                    "burst_detected": True,
                    "requests_in_window": len(dq),
                    "cooldown_seconds": self.cooldown_seconds,
                }

            return True, {
                "burst_detected": False,
                "requests_in_window": len(dq),
                "burst_threshold": self.burst_threshold,
            }

    async def reset(self, key: str) -> None:
        async with self._lock:
            self._timestamps.pop(key, None)
            self._cooldowns.pop(key, None)


# ── Rate Limit Config ────────────────────────────────────────────────────────


@dataclass
class RateLimitConfig:
    name: str
    scope: str
    algorithm: str
    max_requests: int
    window_seconds: float
    burst_threshold: int = 50
    burst_window: float = 5.0
    enabled: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "scope": self.scope,
            "algorithm": self.algorithm,
            "max_requests": self.max_requests,
            "window_seconds": self.window_seconds,
            "burst_threshold": self.burst_threshold,
            "burst_window": self.burst_window,
            "enabled": self.enabled,
        }


# ── Advanced Rate Limiter (composite) ────────────────────────────────────────


class AdvancedRateLimiter:
    """Composite limiter combining sliding window, token bucket, leaky bucket,
    and burst protection with per-user, per-IP, per-endpoint scopes."""

    def __init__(self) -> None:
        self._configs: dict[str, RateLimitConfig] = {}
        self._sliding_windows: dict[str, SlidingWindowLimiter] = {}
        self._token_buckets: dict[str, TokenBucketLimiter] = {}
        self._leaky_buckets: dict[str, LeakyBucketLimiter] = {}
        self._burst_protectors: dict[str, BurstProtector] = {}
        self._lock = asyncio.Lock()

        self._register_defaults()

    def _register_defaults(self) -> None:
        defaults = [
            RateLimitConfig("auth_ip", "ip", "sliding_window", 5, 60, burst_threshold=10, burst_window=5),
            RateLimitConfig("ai_user", "user", "token_bucket", 10, 60, burst_threshold=20, burst_window=10),
            RateLimitConfig("public_tenant", "tenant", "sliding_window", 100, 60, burst_threshold=200, burst_window=10),
            RateLimitConfig("default_user", "user", "leaky_bucket", 60, 60, burst_threshold=100, burst_window=10),
            RateLimitConfig("upload_endpoint", "user", "token_bucket", 5, 60, burst_threshold=8, burst_window=10),
            RateLimitConfig("search_endpoint", "user", "sliding_window", 30, 60, burst_threshold=50, burst_window=5),
        ]
        for cfg in defaults:
            self._configs[cfg.name] = cfg

    async def check(
        self,
        config_name: str,
        scope_key: str,
    ) -> tuple[bool, dict[str, Any]]:
        async with self._lock:
            cfg = self._configs.get(config_name)
            if not cfg:
                return True, {"error": f"unknown config: {config_name}"}
            if not cfg.enabled:
                return True, {"disabled": True}

        composite_key = f"{config_name}:{scope_key}"

        burst_key = f"burst:{config_name}:{scope_key}"
        if burst_key not in self._burst_protectors:
            async with self._lock:
                if burst_key not in self._burst_protectors:
                    self._burst_protectors[burst_key] = BurstProtector(
                        burst_threshold=cfg.burst_threshold,
                        burst_window=cfg.burst_window,
                    )
        burst_ok, burst_info = await self._burst_protectors[burst_key].check(composite_key)
        if not burst_ok:
            return False, {"blocked_by": "burst_protection", **burst_info}

        if cfg.algorithm == "sliding_window":
            limiter = self._get_sliding_window(config_name, cfg)
            return await limiter.allow(composite_key)
        elif cfg.algorithm == "token_bucket":
            limiter = self._get_token_bucket(config_name, cfg)
            return await limiter.allow(composite_key)
        elif cfg.algorithm == "leaky_bucket":
            limiter = self._get_leaky_bucket(config_name, cfg)
            return await limiter.allow(composite_key)
        else:
            return True, {"error": f"unknown algorithm: {cfg.algorithm}"}

    def _get_sliding_window(self, name: str, cfg: RateLimitConfig) -> SlidingWindowLimiter:
        if name not in self._sliding_windows:
            self._sliding_windows[name] = SlidingWindowLimiter(
                max_requests=cfg.max_requests,
                window_seconds=cfg.window_seconds,
            )
        return self._sliding_windows[name]

    def _get_token_bucket(self, name: str, cfg: RateLimitConfig) -> TokenBucketLimiter:
        if name not in self._token_buckets:
            refill = cfg.max_requests / cfg.window_seconds if cfg.window_seconds > 0 else 1.0
            self._token_buckets[name] = TokenBucketLimiter(
                capacity=cfg.max_requests,
                refill_rate=refill,
            )
        return self._token_buckets[name]

    def _get_leaky_bucket(self, name: str, cfg: RateLimitConfig) -> LeakyBucketLimiter:
        if name not in self._leaky_buckets:
            rate = cfg.max_requests / cfg.window_seconds if cfg.window_seconds > 0 else 1.0
            self._leaky_buckets[name] = LeakyBucketLimiter(
                rate=rate,
                capacity=cfg.max_requests,
            )
        return self._leaky_buckets[name]

    def get_configs(self) -> list[dict[str, Any]]:
        return [cfg.to_dict() for cfg in self._configs.values()]

    async def update_config(self, name: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        async with self._lock:
            cfg = self._configs.get(name)
            if not cfg:
                return None
            for key, value in updates.items():
                if hasattr(cfg, key) and key != "name":
                    setattr(cfg, key, value)
            return cfg.to_dict()

    async def add_config(self, config: RateLimitConfig) -> dict[str, Any]:
        async with self._lock:
            self._configs[config.name] = config
            return config.to_dict()

    async def remove_config(self, name: str) -> bool:
        async with self._lock:
            if name in self._configs:
                del self._configs[name]
                self._sliding_windows.pop(name, None)
                self._token_buckets.pop(name, None)
                self._leaky_buckets.pop(name, None)
                keys_to_remove = [
                    k for k in self._burst_protectors if k.startswith(f"burst:{name}:")
                ]
                for k in keys_to_remove:
                    del self._burst_protectors[k]
                return True
            return False


advanced_rate_limiter = AdvancedRateLimiter()


# ── Security Router (endpoints) ──────────────────────────────────────────────


security_router = APIRouter(prefix="/api/v1/security", tags=["Security"])


@security_router.get("/rate-limits")
async def list_rate_limit_configs(
    request: Request,
) -> dict[str, Any]:
    """List all rate limit configurations.

    Requires a valid bearer token (admin).
    """
    _require_auth(request)
    _require_admin_role(request)
    configs = advanced_rate_limiter.get_configs()
    return {"configs": configs, "total": len(configs)}


@security_router.post("/rate-limits")
async def configure_rate_limit(
    request: Request,
) -> dict[str, Any]:
    """Create or update a rate limit configuration.

    Requires admin role.
    """
    _require_auth(request)
    _require_admin_role(request)

    body = await request.json()
    name = body.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    existing = advanced_rate_limiter.get_configs()
    existing_names = {c["name"] for c in existing}

    if name in existing_names:
        updates = {k: v for k, v in body.items() if k != "name"}
        result = await advanced_rate_limiter.update_config(name, updates)
        return {"action": "updated", "config": result}
    else:
        config = RateLimitConfig(
            name=name,
            scope=body.get("scope", "user"),
            algorithm=body.get("algorithm", "sliding_window"),
            max_requests=body.get("max_requests", 60),
            window_seconds=body.get("window_seconds", 60),
            burst_threshold=body.get("burst_threshold", 50),
            burst_window=body.get("burst_window", 5.0),
            enabled=body.get("enabled", True),
        )
        result = await advanced_rate_limiter.add_config(config)
        return {"action": "created", "config": result}


@security_router.get("/blocked-ips")
async def list_blocked_ips(
    request: Request,
) -> dict[str, Any]:
    """List all currently blocked IPs.

    Requires admin role.
    """
    _require_auth(request)
    _require_admin_role(request)

    from shared.security.ddos import ddos_protection

    blocked = await ddos_protection.get_blocked_ips()
    return {"blocked_ips": blocked, "total": len(blocked)}


@security_router.post("/blocked-ips")
async def manage_blocked_ip(
    request: Request,
) -> dict[str, Any]:
    """Block or unblock an IP address.

    Requires admin role.
    """
    _require_auth(request)
    _require_admin_role(request)

    from shared.security.ddos import ddos_protection

    body = await request.json()
    ip = body.get("ip")
    action = body.get("action", "block")

    if not ip:
        raise HTTPException(status_code=400, detail="ip is required")

    if action == "block":
        reason = body.get("reason", "manual")
        duration = body.get("duration", 3600.0)
        result = await ddos_protection.block_ip(ip, reason, duration)
        return {"action": "blocked", "ip": result}
    elif action == "unblock":
        success = await ddos_protection.unblock_ip(ip)
        return {"action": "unblocked" if success else "not_found", "ip": ip}
    else:
        raise HTTPException(status_code=400, detail="action must be 'block' or 'unblock'")


# ── Auth helpers (lightweight, no DB dependency) ─────────────────────────────


def _require_auth(request: Request) -> dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
        )
    token = auth.split(" ", 1)[1].strip()
    try:
        from shared.core.security import decode_token
        payload = decode_token(token)
        if not payload or not payload.get("sub"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


def _require_admin_role(request: Request) -> dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    token = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else ""
    from shared.core.security import decode_token
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    role = str(payload.get("role", "")).lower()
    if role not in ("admin", "super_admin", "tenant_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return payload


__all__ = [
    "AdvancedRateLimiter",
    "BurstProtector",
    "LeakyBucketLimiter",
    "RateLimitConfig",
    "SlidingWindowLimiter",
    "TokenBucketLimiter",
    "advanced_rate_limiter",
    "security_router",
]
