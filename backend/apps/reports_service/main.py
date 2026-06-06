"""Reports Service — Scheduled report management.

A small in-process store of report schedules keyed by tenant. Supports:

* ``POST   /api/v1/reports/schedule``             — create a new schedule
* ``GET    /api/v1/reports/scheduled``            — list schedules for the tenant
* ``GET    /api/v1/reports/scheduled/{id}``       — fetch a single schedule
* ``PUT    /api/v1/reports/scheduled/{id}``       — update a schedule
* ``DELETE /api/v1/reports/scheduled/{id}``       — cancel a schedule
* ``POST   /api/v1/reports/scheduled/{id}/run``   — trigger an immediate run

Persistence is in-memory (per-process) and protected by a module-level
threading lock so concurrent requests are safe. A real persistence layer
can be swapped in later by replacing the helpers at the top of the module.
"""
from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from shared.auth import require_tenant_id


# ── In-Memory Store ────────────────────────────────────────────────────────────

# Each entry is a plain dict; the module-level lock guards all mutations.
_REPORTS_LOCK = threading.RLock()
_REPORTS: list[dict[str, Any]] = []

# Valid enum-like fields. Kept as plain sets so we don't need a full Enum import.
VALID_FREQUENCIES = {"daily", "weekly", "monthly", "quarterly"}
VALID_FORMATS = {"csv", "xlsx", "pdf", "json"}
VALID_STATUSES = {"active", "paused", "cancelled", "running", "completed", "failed"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime | str | None) -> str:
    if dt is None:
        return ""
    if isinstance(dt, str):
        return dt
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _reset_store() -> None:
    """Clear all in-memory schedules. Intended for tests only."""
    with _REPORTS_LOCK:
        _REPORTS.clear()


# ── Schemas ───────────────────────────────────────────────────────────────────


ReportFrequency = Literal["daily", "weekly", "monthly", "quarterly"]
ReportFormat = Literal["csv", "xlsx", "pdf", "json"]


class ReportScheduleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    kind: str = Field(..., min_length=1, max_length=100, description="Report type, e.g. 'candidates', 'jobs'")
    frequency: ReportFrequency = "weekly"
    format: ReportFormat = "csv"
    recipients: list[str] = Field(default_factory=list, description="Email addresses to deliver the report to")
    cron: Optional[str] = Field(default=None, max_length=200, description="Optional cron expression override")
    params: dict[str, Any] = Field(default_factory=dict, description="Report-specific parameters")
    enabled: bool = True
    description: Optional[str] = Field(default=None, max_length=1000)


class ReportScheduleUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    frequency: Optional[ReportFrequency] = None
    format: Optional[ReportFormat] = None
    recipients: Optional[list[str]] = None
    cron: Optional[str] = Field(default=None, max_length=200)
    params: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None
    description: Optional[str] = Field(default=None, max_length=1000)


class ReportScheduleRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    kind: str
    frequency: str
    format: str
    recipients: list[str]
    cron: Optional[str] = None
    params: dict[str, Any]
    enabled: bool
    status: str
    description: Optional[str] = None
    created_at: str
    updated_at: str
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    run_count: int = 0


class ReportScheduleListResponse(BaseModel):
    data: list[ReportScheduleRead]
    total: int


class ReportRunResponse(BaseModel):
    id: str
    status: str
    run_id: str
    started_at: str
    message: str


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "reports"
    total_schedules: int


# ── Store helpers ─────────────────────────────────────────────────────────────


def _create_record(tenant_id: str, payload: ReportScheduleCreate) -> dict[str, Any]:
    if payload.frequency not in VALID_FREQUENCIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid frequency. Must be one of: {sorted(VALID_FREQUENCIES)}",
        )
    if payload.format not in VALID_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format. Must be one of: {sorted(VALID_FORMATS)}",
        )
    now = _now()
    record: dict[str, Any] = {
        "id": f"rpt_{uuid.uuid4().hex[:16]}",
        "tenant_id": tenant_id,
        "name": payload.name,
        "kind": payload.kind,
        "frequency": payload.frequency,
        "format": payload.format,
        "recipients": list(payload.recipients),
        "cron": payload.cron,
        "params": dict(payload.params),
        "enabled": payload.enabled,
        "status": "active" if payload.enabled else "paused",
        "description": payload.description,
        "created_at": _iso(now),
        "updated_at": _iso(now),
        "last_run_at": None,
        "next_run_at": None,
        "run_count": 0,
    }
    with _REPORTS_LOCK:
        _REPORTS.append(record)
    return record


def _list_for_tenant(tenant_id: str) -> list[dict[str, Any]]:
    with _REPORTS_LOCK:
        return [r for r in _REPORTS if r["tenant_id"] == tenant_id]


def _get_for_tenant(tenant_id: str, report_id: str) -> dict[str, Any]:
    with _REPORTS_LOCK:
        for record in _REPORTS:
            if record["id"] == report_id and record["tenant_id"] == tenant_id:
                return record
    raise HTTPException(status_code=404, detail=f"Report schedule '{report_id}' not found")


def _update(tenant_id: str, report_id: str, payload: ReportScheduleUpdate) -> dict[str, Any]:
    with _REPORTS_LOCK:
        for record in _REPORTS:
            if record["id"] == report_id and record["tenant_id"] == tenant_id:
                data = payload.model_dump(exclude_unset=True)
                if "frequency" in data and data["frequency"] not in VALID_FREQUENCIES:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid frequency. Must be one of: {sorted(VALID_FREQUENCIES)}",
                    )
                if "format" in data and data["format"] not in VALID_FORMATS:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid format. Must be one of: {sorted(VALID_FORMATS)}",
                    )
                for key, value in data.items():
                    record[key] = value
                if "enabled" in data:
                    record["status"] = "active" if data["enabled"] else "paused"
                record["updated_at"] = _iso(_now())
                return record
    raise HTTPException(status_code=404, detail=f"Report schedule '{report_id}' not found")


def _cancel(tenant_id: str, report_id: str) -> dict[str, Any]:
    with _REPORTS_LOCK:
        for record in _REPORTS:
            if record["id"] == report_id and record["tenant_id"] == tenant_id:
                record["status"] = "cancelled"
                record["enabled"] = False
                record["updated_at"] = _iso(_now())
                return record
    raise HTTPException(status_code=404, detail=f"Report schedule '{report_id}' not found")


def _run(tenant_id: str, report_id: str) -> dict[str, Any]:
    with _REPORTS_LOCK:
        for record in _REPORTS:
            if record["id"] == report_id and record["tenant_id"] == tenant_id:
                if record["status"] == "cancelled":
                    raise HTTPException(
                        status_code=409,
                        detail="Cannot run a cancelled report — reactivate it first",
                    )
                record["status"] = "running"
                record["last_run_at"] = _iso(_now())
                record["run_count"] = int(record.get("run_count", 0)) + 1
                record["updated_at"] = _iso(_now())
                return record
    raise HTTPException(status_code=404, detail=f"Report schedule '{report_id}' not found")


# ── Router ────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Reports"], summary="Reports service health")
async def health() -> HealthResponse:
    with _REPORTS_LOCK:
        total = len(_REPORTS)
    return HealthResponse(status="healthy", service="reports", total_schedules=total)


@router.post(
    "/schedule",
    response_model=ReportScheduleRead,
    status_code=status.HTTP_201_CREATED,
    tags=["Reports"],
    summary="Schedule a new report",
)
async def schedule_report(
    payload: ReportScheduleCreate,
    tenant_id: str = Depends(require_tenant_id),
) -> ReportScheduleRead:
    record = _create_record(tenant_id, payload)
    return ReportScheduleRead(**record)


@router.get(
    "/scheduled",
    response_model=ReportScheduleListResponse,
    tags=["Reports"],
    summary="List scheduled reports for the current tenant",
)
async def list_scheduled_reports(
    kind: Optional[str] = Query(default=None, description="Filter by report kind"),
    enabled: Optional[bool] = Query(default=None, description="Filter by enabled flag"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
) -> ReportScheduleListResponse:
    items = _list_for_tenant(tenant_id)
    if kind is not None:
        items = [r for r in items if r["kind"] == kind]
    if enabled is not None:
        items = [r for r in items if bool(r.get("enabled")) == bool(enabled)]
    items.sort(key=lambda r: r["created_at"], reverse=True)
    sliced = items[offset : offset + limit]
    return ReportScheduleListResponse(
        data=[ReportScheduleRead(**r) for r in sliced],
        total=len(items),
    )


@router.get(
    "/scheduled/{report_id}",
    response_model=ReportScheduleRead,
    tags=["Reports"],
    summary="Get a single scheduled report",
)
async def get_scheduled_report(
    report_id: str,
    tenant_id: str = Depends(require_tenant_id),
) -> ReportScheduleRead:
    record = _get_for_tenant(tenant_id, report_id)
    return ReportScheduleRead(**record)


@router.put(
    "/scheduled/{report_id}",
    response_model=ReportScheduleRead,
    tags=["Reports"],
    summary="Update a scheduled report",
)
async def update_scheduled_report(
    report_id: str,
    payload: ReportScheduleUpdate,
    tenant_id: str = Depends(require_tenant_id),
) -> ReportScheduleRead:
    record = _update(tenant_id, report_id, payload)
    return ReportScheduleRead(**record)


@router.delete(
    "/scheduled/{report_id}",
    response_model=ReportScheduleRead,
    tags=["Reports"],
    summary="Cancel a scheduled report",
)
async def cancel_scheduled_report(
    report_id: str,
    tenant_id: str = Depends(require_tenant_id),
) -> ReportScheduleRead:
    record = _cancel(tenant_id, report_id)
    return ReportScheduleRead(**record)


@router.post(
    "/scheduled/{report_id}/run",
    response_model=ReportRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Reports"],
    summary="Run a scheduled report immediately",
)
async def run_scheduled_report(
    report_id: str,
    tenant_id: str = Depends(require_tenant_id),
) -> ReportRunResponse:
    record = _run(tenant_id, report_id)
    return ReportRunResponse(
        id=record["id"],
        status=record["status"],
        run_id=f"run_{uuid.uuid4().hex[:16]}",
        started_at=record["last_run_at"] or _iso(_now()),
        message="Report run triggered successfully",
    )
