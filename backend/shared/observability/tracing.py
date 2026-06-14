"""Distributed tracing with OpenTelemetry.

Provides:
- TracerProvider with configurable exporters (OTLP, Jaeger, Zipkin)
- Span creation for each request
- Custom spans for operations
- In-memory trace store for observability endpoints
"""
from __future__ import annotations

import time
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any, Optional

try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import (
        BatchSpanProcessor,
        SimpleSpanProcessor,
        SpanExporter,
        SpanExportResult,
    )
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.trace import StatusCode, Status, SpanKind
    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False

current_trace_id_ctx: ContextVar[str] = ContextVar("trace_id", default="")
current_span_id_ctx: ContextVar[str] = ContextVar("span_id", default="")


@dataclass
class SpanRecord:
    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    operation_name: str
    service_name: str
    start_time: float
    end_time: float
    duration_ms: float
    status: str
    tags: dict[str, Any] = field(default_factory=dict)
    logs: list[dict[str, Any]] = field(default_factory=list)


class InMemoryTraceStore:
    def __init__(self, max_traces: int = 1000):
        self._traces: dict[str, list[SpanRecord]] = {}
        self._max_traces = max_traces

    def add_span(self, span: SpanRecord) -> None:
        if span.trace_id not in self._traces:
            if len(self._traces) >= self._max_traces:
                oldest = next(iter(self._traces))
                del self._traces[oldest]
            self._traces[span.trace_id] = []
        self._traces[span.trace_id].append(span)

    def get_trace(self, trace_id: str) -> list[SpanRecord]:
        return self._traces.get(trace_id, [])

    def list_traces(self, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
        result = []
        all_trace_ids = list(self._traces.keys())
        for tid in all_trace_ids[offset:offset + limit]:
            spans = self._traces[tid]
            if not spans:
                continue
            first = spans[0]
            last = spans[-1]
            total_duration = max(s.end_time for s in spans) - min(s.start_time for s in spans)
            result.append({
                "trace_id": tid,
                "root_operation": first.operation_name,
                "service_name": first.service_name,
                "start_time": first.start_time,
                "duration_ms": round(total_duration * 1000, 2),
                "span_count": len(spans),
                "status": "error" if any(s.status == "error" for s in spans) else "ok",
            })
        result.sort(key=lambda x: x["start_time"], reverse=True)
        return result

    def get_metrics(self) -> dict[str, Any]:
        all_spans = []
        for spans in self._traces.values():
            all_spans.extend(spans)
        if not all_spans:
            return {
                "total_traces": 0,
                "total_spans": 0,
                "avg_duration_ms": 0,
                "p50_duration_ms": 0,
                "p95_duration_ms": 0,
                "p99_duration_ms": 0,
                "error_rate": 0,
                "services": [],
            }
        durations = [s.duration_ms for s in all_spans]
        error_count = sum(1 for s in all_spans if s.status == "error")
        services = list(set(s.service_name for s in all_spans))
        return {
            "total_traces": len(self._traces),
            "total_spans": len(all_spans),
            "avg_duration_ms": round(sum(durations) / len(durations), 2),
            "p50_duration_ms": round(sorted(durations)[len(durations) // 2], 2),
            "p95_duration_ms": round(sorted(durations)[int(len(durations) * 0.95)], 2),
            "p99_duration_ms": round(sorted(durations)[int(len(durations) * 0.99)], 2),
            "error_rate": round(error_count / len(all_spans), 4),
            "services": services,
        }

    def clear(self) -> None:
        self._traces.clear()


trace_store = InMemoryTraceStore()


class InMemorySpanExporter(SpanExporter):
    def __init__(self, store: InMemoryTraceStore):
        self._store = store

    def export(self, spans: Any) -> SpanExportResult:
        try:
            for sdk_span in spans:
                ctx = sdk_span.get_span_context()
                trace_id = format(ctx.trace_id, "032x")
                span_id = format(ctx.span_id, "016x")
                parent_span_id = None
                if sdk_span.parent:
                    parent_span_id = format(sdk_span.parent.span_id, "016x")

                attributes = dict(sdk_span.attributes) if sdk_span.attributes else {}
                logs = []
                for event in sdk_span.events:
                    logs.append({
                        "timestamp": event.timestamp,
                        "name": event.name,
                        "attributes": dict(event.attributes) if event.attributes else {},
                    })

                status_str = "ok"
                if sdk_span.status:
                    if hasattr(sdk_span.status, "status_code"):
                        sc = sdk_span.status.status_code
                        if hasattr(sc, "value"):
                            status_str = "error" if sc.value == 2 else "ok"
                        elif sc == 2:
                            status_str = "error"

                start_ns = sdk_span.start_time or 0
                end_ns = sdk_span.end_time or 0
                duration_ms = (end_ns - start_ns) / 1_000_000 if end_ns > start_ns else 0

                record = SpanRecord(
                    trace_id=trace_id,
                    span_id=span_id,
                    parent_span_id=parent_span_id,
                    operation_name=sdk_span.name,
                    service_name=attributes.get("service.name", "ai-ros"),
                    start_time=start_ns / 1e9,
                    end_time=end_ns / 1e9,
                    duration_ms=round(duration_ms, 2),
                    status=status_str,
                    tags=attributes,
                    logs=logs,
                )
                self._store.add_span(record)
            return SpanExportResult.SUCCESS
        except Exception:
            return SpanExportResult.FAILURE

    def shutdown(self) -> None:
        pass

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


def init_tracing(
    service_name: str = "ai-ros",
    exporter_type: str = "memory",
    otlp_endpoint: Optional[str] = None,
    jaeger_endpoint: Optional[str] = None,
    zipkin_endpoint: Optional[str] = None,
) -> None:
    if not _OTEL_AVAILABLE:
        return

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)

    if exporter_type == "memory":
        exporter = InMemorySpanExporter(trace_store)
        provider.add_span_processor(SimpleSpanProcessor(exporter))
    elif exporter_type == "otlp" and otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except ImportError:
            pass
    elif exporter_type == "jaeger" and jaeger_endpoint:
        try:
            from opentelemetry.exporter.jaeger.thrift import JaegerExporter
            exporter = JaegerExporter(agent_host_name=jaeger_endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except ImportError:
            pass
    elif exporter_type == "zipkin" and zipkin_endpoint:
        try:
            from opentelemetry.exporter.zipkin.proto.http import ZipkinExporter
            exporter = ZipkinExporter(endpoint=zipkin_endpoint)
            provider.add_span_processor(BatchSpanProcessor(exporter))
        except ImportError:
            pass

    trace.set_tracer_provider(provider)


def get_tracer(name: str = "ai-ros") -> Any:
    if not _OTEL_AVAILABLE:
        return None
    return trace.get_tracer(name)


def start_span(
    operation_name: str,
    service_name: str = "ai-ros",
    tags: Optional[dict[str, Any]] = None,
    span_kind: Any = None,
) -> Any:
    if not _OTEL_AVAILABLE:
        return None
    tracer = get_tracer(service_name)
    kind = span_kind or SpanKind.INTERNAL
    span = tracer.start_span(operation_name, kind=kind)
    if tags:
        for k, v in tags.items():
            span.set_attribute(k, v)
    ctx = span.get_span_context()
    current_trace_id_ctx.set(format(ctx.trace_id, "032x"))
    current_span_id_ctx.set(format(ctx.span_id, "016x"))
    return span


def finish_span(span: Any, status: str = "ok", error: Optional[Exception] = None) -> None:
    if span is None:
        return
    if error:
        span.set_status(Status(StatusCode.ERROR, str(error)))
        span.record_exception(error)
    else:
        span.set_status(Status(StatusCode.OK))
    span.end()
