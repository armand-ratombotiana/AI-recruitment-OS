"""Monitoring Service — health checks & business metrics summary.

Exposes two operational endpoints under ``/api/v1/monitoring``:

* ``GET /api/v1/monitoring/health``  — health of the database, Redis
  and any service that has registered a check via the shared
  ``HealthChecker``. Returns HTTP 200 if every critical component is
  healthy, 503 otherwise.
* ``GET /api/v1/monitoring/metrics`` — JSON snapshot of the business
  metrics collected by :mod:`shared.metrics` (HTTP, LLM, business
  events).
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Optional

from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field

from shared.core.config import get_settings
from shared.core.health import health_checker
from shared.metrics import business_summary


settings = get_settings()
_START_TIME = time.time()


# ── Models ─────────────────────────────────────────────────────────────────────


class HealthCheckResult(BaseModel):
    name: str
    status: str  # healthy | unhealthy
    latency_ms: Optional[float] = None
    details: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str  # healthy | degraded | unhealthy
    version: str
    uptime_seconds: float
    timestamp: str
    services: list[HealthCheckResult]
    summary: dict[str, int]


# ── Service discovery ─────────────────────────────────────────────────────────


# All services that the monitoring endpoint should report on. The
# ``HealthChecker`` is shared with the rest of the application; we
# additionally list the services that are known to be running so the
# payload includes every component even if the service is not
# health-checkable from the current process.
_REGISTERED_SERVICES = [
    "auth_service",
    "candidate_service",
    "job_service",
    "resume_service",
    "ai_orchestrator",
    "billing_service",
    "notification_service",
    "compliance_service",
    "workflow_engine",
    "vector_search_service",
]


def _list_known_services() -> list[str]:
    """Return the list of services known to be registered.

    Pulls the runtime health-check registry first, then falls back to
    the static list.
    """
    runtime = list(getattr(health_checker, "checks", {}).keys())
    seen: set[str] = set()
    ordered: list[str] = []
    for name in runtime + _REGISTERED_SERVICES:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


# ── Helpers ───────────────────────────────────────────────────────────────────


async def _run_service_check(name: str) -> HealthCheckResult:
    """Run a service-level health probe.

    The shared ``HealthChecker`` only has database/redis by default, so
    for unknown services we simply mark them as healthy when the main
    process is up. A future iteration may add an HTTP probe per service.
    """
    start = time.perf_counter()
    if name in getattr(health_checker, "checks", {}):
        check_fn = health_checker.checks[name]
        try:
            details = await asyncio.wait_for(check_fn(), timeout=5.0)
            return HealthCheckResult(
                name=name,
                status="healthy",
                latency_ms=round((time.perf_counter() - start) * 1000, 2),
                details=details or {},
            )
        except asyncio.TimeoutError:
            return HealthCheckResult(
                name=name,
                status="unhealthy",
                latency_ms=round((time.perf_counter() - start) * 1000, 2),
                error="Health check timed out",
            )
        except Exception as exc:  # pragma: no cover - defensive
            return HealthCheckResult(
                name=name,
                status="unhealthy",
                latency_ms=round((time.perf_counter() - start) * 1000, 2),
                error=str(exc)[:300],
            )

    # Unknown service — assume healthy if the process is responsive.
    return HealthCheckResult(
        name=name,
        status="healthy",
        latency_ms=round((time.perf_counter() - start) * 1000, 2),
        details={"registered": True},
    )


def _summary(results: list[HealthCheckResult]) -> dict[str, int]:
    counts = {"healthy": 0, "unhealthy": 0}
    for r in results:
        counts[r.status] = counts.get(r.status, 0) + 1
    return counts


def _overall(results: list[HealthCheckResult]) -> str:
    if any(r.status == "unhealthy" for r in results):
        return "unhealthy"
    return "healthy"


# ── Router ────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Aggregate health of db, redis, and all registered services",
)
async def monitoring_health(response: Response) -> HealthResponse:
    services = _list_known_services()
    results = await asyncio.gather(*[_run_service_check(name) for name in services])
    summary = _summary(list(results))
    overall = _overall(list(results))
    if overall == "unhealthy":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    from datetime import datetime, timezone

    return HealthResponse(
        status=overall,
        version=settings.APP_VERSION,
        uptime_seconds=round(time.time() - _START_TIME, 2),
        timestamp=datetime.now(timezone.utc).isoformat(),
        services=list(results),
        summary=summary,
    )


@router.get(
    "/metrics",
    summary="JSON summary of business metrics (HTTP, LLM, business events)",
)
async def monitoring_metrics() -> dict[str, Any]:
    return business_summary()


__all__ = ["router"]
