"""Observability Service — distributed tracing and metrics endpoints.

Exposes endpoints under ``/api/v1/observability``:

* ``GET /api/v1/observability/traces`` — list recent traces
* ``GET /api/v1/observability/traces/{trace_id}`` — get trace details with spans
* ``GET /api/v1/observability/metrics`` — observability metrics summary

All endpoints require authentication and admin role.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from shared.auth.dependencies import require_admin, require_tenant_id
from shared.observability.tracing import trace_store


router = APIRouter()


class TraceSummary(BaseModel):
    trace_id: str
    root_operation: str
    service_name: str
    start_time: float
    duration_ms: float
    span_count: int
    status: str


class TraceListResponse(BaseModel):
    traces: list[TraceSummary]
    total: int
    limit: int
    offset: int


class SpanDetail(BaseModel):
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    operation_name: str
    service_name: str
    start_time: float
    end_time: float
    duration_ms: float
    status: str
    tags: dict[str, Any] = Field(default_factory=dict)
    logs: list[dict[str, Any]] = Field(default_factory=list)


class TraceDetailResponse(BaseModel):
    trace_id: str
    spans: list[SpanDetail]
    total_spans: int
    duration_ms: float


class ObservabilityMetricsResponse(BaseModel):
    total_traces: int
    total_spans: int
    avg_duration_ms: float
    p50_duration_ms: float
    p95_duration_ms: float
    p99_duration_ms: float
    error_rate: float
    services: list[str]


@router.get(
    "/traces",
    response_model=TraceListResponse,
    summary="List recent traces",
    dependencies=[Depends(require_admin)],
)
async def list_traces(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(require_tenant_id),
) -> TraceListResponse:
    traces = trace_store.list_traces(limit=limit, offset=offset)
    return TraceListResponse(
        traces=[TraceSummary(**t) for t in traces],
        total=len(traces),
        limit=limit,
        offset=offset,
    )


@router.get(
    "/traces/{trace_id}",
    response_model=TraceDetailResponse,
    summary="Get trace details with all spans",
    dependencies=[Depends(require_admin)],
)
async def get_trace(
    trace_id: str,
    tenant_id: str = Depends(require_tenant_id),
) -> TraceDetailResponse:
    spans = trace_store.get_trace(trace_id)
    if not spans:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trace {trace_id} not found",
        )
    total_duration = max(s.end_time for s in spans) - min(s.start_time for s in spans)
    return TraceDetailResponse(
        trace_id=trace_id,
        spans=[
            SpanDetail(
                trace_id=s.trace_id,
                span_id=s.span_id,
                parent_span_id=s.parent_span_id,
                operation_name=s.operation_name,
                service_name=s.service_name,
                start_time=s.start_time,
                end_time=s.end_time,
                duration_ms=s.duration_ms,
                status=s.status,
                tags=s.tags,
                logs=s.logs,
            )
            for s in spans
        ],
        total_spans=len(spans),
        duration_ms=round(total_duration * 1000, 2),
    )


@router.get(
    "/metrics",
    response_model=ObservabilityMetricsResponse,
    summary="Observability metrics summary",
    dependencies=[Depends(require_admin)],
)
async def observability_metrics(
    tenant_id: str = Depends(require_tenant_id),
) -> ObservabilityMetricsResponse:
    metrics = trace_store.get_metrics()
    return ObservabilityMetricsResponse(**metrics)


__all__ = ["router"]
