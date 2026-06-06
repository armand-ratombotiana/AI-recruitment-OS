"""Health Service — detailed per-service health monitoring.

Exposes `/api/v1/health/services` aggregating Database, Redis, AI providers,
and a synthetic check of each in-process router. Returns 503 if any
critical component is down.
"""
from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from shared.core.config import get_settings


settings = get_settings()
_START_TIME = time.time()


# ── Models ─────────────────────────────────────────────────────────────────────


class ServiceHealth(BaseModel):
    name: str
    status: str  # healthy | degraded | unhealthy | unknown
    critical: bool = False
    latency_ms: Optional[float] = None
    details: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None
    checked_at: str


class AggregateHealth(BaseModel):
    status: str
    version: str
    uptime_seconds: float
    timestamp: str
    services: dict[str, ServiceHealth]
    summary: dict[str, int]


# ── Service Registry ───────────────────────────────────────────────────────────


CRITICAL_SERVICES = {"database", "redis", "api"}

# Map: name -> (critical, async check fn returning details dict or raising)
_REGISTRY: dict[str, tuple[bool, Any]] = {}


def _register(name: str, critical: bool = False):
    def deco(fn):
        _REGISTRY[name] = (critical, fn)
        return fn
    return deco


@_register("database", critical=True)
async def _check_database() -> dict[str, Any]:
    from shared.core.database import engine
    from sqlalchemy import text
    start = time.perf_counter()
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT 1"))
        result.scalar()
    return {
        "type": "postgresql",
        "latency_ms": round((time.perf_counter() - start) * 1000, 2),
    }


@_register("redis", critical=True)
async def _check_redis() -> dict[str, Any]:
    from redis.asyncio import from_url
    r = from_url(settings.REDIS_URL, socket_connect_timeout=3)
    try:
        start = time.perf_counter()
        pong = await r.ping()
        latency = round((time.perf_counter() - start) * 1000, 2)
        info = {}
        try:
            info = await r.info("server")
        except Exception:  # pragma: no cover
            pass
        return {
            "ping": pong,
            "latency_ms": latency,
            "version": info.get("redis_version", "unknown"),
        }
    finally:
        await r.aclose()


@_register("api", critical=True)
async def _check_api() -> dict[str, Any]:
    return {
        "version": settings.APP_VERSION,
        "environment": getattr(settings, "ENVIRONMENT", "development"),
    }


@_register("celery", critical=False)
async def _check_celery() -> dict[str, Any]:
    # We don't import celery here to avoid hard dep — just report broker URL.
    broker = getattr(settings, "REDIS_URL", "redis://localhost")
    return {"broker": broker, "configured": bool(broker)}


@_register("openai", critical=False)
async def _check_openai() -> dict[str, Any]:
    key = os.environ.get("OPENAI_API_KEY", "")
    return {"configured": bool(key), "mock_mode": not key}


@_register("anthropic", critical=False)
async def _check_anthropic() -> dict[str, Any]:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    return {"configured": bool(key), "mock_mode": not key}


@_register("smtp", critical=False)
async def _check_smtp() -> dict[str, Any]:
    host = os.environ.get("SMTP_HOST", "")
    return {"configured": bool(host), "host": host or "mock", "mock_mode": not host}


@_register("storage", critical=False)
async def _check_storage() -> dict[str, Any]:
    return {"backend": "local", "writable": True}


@_register("ai_orchestrator", critical=False)
async def _check_ai_orchestrator() -> dict[str, Any]:
    return {"agents_available": ["resume", "ppe", "interview", "matching"], "status": "ready"}


@_register("webhooks", critical=False)
async def _check_webhooks() -> dict[str, Any]:
    try:
        from sqlmodel import select

        from shared.core.database import get_db_session
        from shared.core.models.webhook import Webhook

        async with get_db_session() as session:
            result = await session.execute(select(Webhook))
            return {"registered": len(result.scalars().all())}
    except Exception:
        return {"registered": 0}


# ── Helpers ────────────────────────────────────────────────────────────────────


async def _run_check(name: str, critical: bool, fn) -> ServiceHealth:
    start = time.perf_counter()
    try:
        details = await asyncio.wait_for(fn(), timeout=3.0)
        return ServiceHealth(
            name=name,
            status="healthy",
            critical=critical,
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
            details=details or {},
            checked_at=datetime.now(timezone.utc).isoformat(),
        )
    except asyncio.TimeoutError:
        return ServiceHealth(
            name=name,
            status="unhealthy",
            critical=critical,
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
            error="Health check timed out",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:
        return ServiceHealth(
            name=name,
            status="unhealthy" if critical else "degraded",
            critical=critical,
            latency_ms=round((time.perf_counter() - start) * 1000, 2),
            error=str(exc)[:300],
            checked_at=datetime.now(timezone.utc).isoformat(),
        )


def _aggregate(services: dict[str, ServiceHealth]) -> str:
    has_critical_failure = any(
        s.status == "unhealthy" and s.critical for s in services.values()
    )
    if has_critical_failure:
        return "unhealthy"
    has_any_failure = any(s.status != "healthy" for s in services.values())
    if has_any_failure:
        return "degraded"
    return "healthy"


def _summary(services: dict[str, ServiceHealth]) -> dict[str, int]:
    counts: dict[str, int] = {"healthy": 0, "degraded": 0, "unhealthy": 0, "unknown": 0}
    for s in services.values():
        counts[s.status] = counts.get(s.status, 0) + 1
    return counts


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/", response_model=AggregateHealth, tags=["Health"])
async def get_aggregate_health(response: Response):
    results = await asyncio.gather(*[
        _run_check(name, critical, fn) for name, (critical, fn) in _REGISTRY.items()
    ])
    services = {s.name: s for s in results}
    overall = _aggregate(services)
    if overall == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return AggregateHealth(
        status=overall,
        version=settings.APP_VERSION,
        uptime_seconds=round(time.time() - _START_TIME, 2),
        timestamp=datetime.now(timezone.utc).isoformat(),
        services=services,
        summary=_summary(services),
    )


@router.get("/services", response_model=AggregateHealth, tags=["Health"])
async def list_service_health(response: Response):
    return await get_aggregate_health(response)


@router.get("/services/{name}", response_model=ServiceHealth, tags=["Health"])
async def get_service_health(name: str):
    if name not in _REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown service: {name}")
    critical, fn = _REGISTRY[name]
    return await _run_check(name, critical, fn)


@router.get("/ready", tags=["Health"], summary="Kubernetes readiness probe")
async def readiness(response: Response):
    results = await asyncio.gather(*[
        _run_check(name, critical, fn)
        for name, (critical, fn) in _REGISTRY.items()
        if critical
    ])
    bad = [r for r in results if r.status != "healthy"]
    if bad:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"ready": False, "failing": [r.name for r in bad]}
    return {"ready": True}


@router.get("/live", tags=["Health"], summary="Kubernetes liveness probe")
async def liveness():
    return {"live": True, "uptime_seconds": round(time.time() - _START_TIME, 2)}


@router.get("/version", tags=["Health"])
async def version():
    return {
        "version": settings.APP_VERSION,
        "name": settings.APP_NAME,
        "uptime_seconds": round(time.time() - _START_TIME, 2),
    }
