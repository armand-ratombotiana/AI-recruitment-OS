"""Reusable rate-limiter dependencies for write endpoints.

Each dependency reads ``X-Forwarded-For``/``X-Real-IP``/``request.client.host``
and applies the supplied ``RateLimiter`` keyed by the caller IP + the
endpoint name.  Returns 429 with a ``Retry-After`` header on rejection.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status

from shared.core.ratelimit import RateLimiter, default_limiter

logger = logging.getLogger("ratelimit_dep")


def _client_key(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("X-Real-IP")
    if real:
        return real
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def make_write_rate_limit(
    name: str,
    max_requests: int = 30,
    window_seconds: int = 60,
    limiter: Optional[RateLimiter] = None,
):
    """Factory: produce a FastAPI dependency that rate-limits write endpoints."""
    bucket_limiter = limiter or RateLimiter(
        name=name, max_requests=max_requests, window_seconds=window_seconds
    )

    async def _dep(request: Request) -> None:
        # Best-effort connect to Redis — non-fatal if it fails.
        try:
            await bucket_limiter.connect()
        except Exception:
            pass
        client = _client_key(request)
        allowed, result = await bucket_limiter.check(f"{name}:{client}")
        if not allowed:
            logger.warning(
                "rate_limit_exceeded name=%s client=%s count=%d",
                name,
                client,
                result.limit,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded for {name}",
                headers={
                    "Retry-After": str(result.reset_seconds),
                    "X-RateLimit-Limit": str(result.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(result.reset_seconds),
                },
            )

    return _dep


# Sensible per-resource default rate limiters for the gateway.  These are
# deliberately generous (60 writes per minute per IP) but still cap abuse.
candidate_write_rate = make_write_rate_limit("write.candidates", max_requests=60, window_seconds=60)
job_write_rate = make_write_rate_limit("write.jobs", max_requests=30, window_seconds=60)
interview_write_rate = make_write_rate_limit("write.interviews", max_requests=30, window_seconds=60)
notification_write_rate = make_write_rate_limit("write.notifications", max_requests=60, window_seconds=60)
user_write_rate = make_write_rate_limit("write.users", max_requests=30, window_seconds=60)
export_rate = make_write_rate_limit("write.exports", max_requests=20, window_seconds=60)
webhook_write_rate = make_write_rate_limit("write.webhooks", max_requests=20, window_seconds=60)
api_key_rate = make_write_rate_limit("write.api_keys", max_requests=10, window_seconds=60)
billing_write_rate = make_write_rate_limit("write.billing", max_requests=20, window_seconds=60)
default_write_rate = make_write_rate_limit("write.default", max_requests=60, window_seconds=60)
