"""Tests for advanced logging, observability, and distributed tracing.

Covers:
- Structured logging (JSON format, log levels)
- Log correlation (request_id, user_id, tenant_id)
- Sensitive data masking
- Log destinations (console, file, cloudwatch, datadog)
- Distributed tracing (spans, trace store, exporters)
- Observability endpoints (traces list, trace detail, metrics)
"""
from __future__ import annotations

import io
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import AsyncGenerator
from unittest.mock import patch

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from shared.core.security import create_access_token
from shared.logging.structured import (
    JSONFormatter,
    StructuredLogger,
    get_structured_logger,
    mask_dict,
    mask_value,
    request_id_ctx,
    tenant_id_ctx,
    user_id_ctx,
)
from shared.logging.destinations import (
    CloudWatchDestination,
    ConsoleDestination,
    DatadogDestination,
    FileDestination,
    create_destination,
)
from shared.observability.tracing import (
    InMemorySpanExporter,
    InMemoryTraceStore,
    SpanRecord,
    finish_span,
    get_tracer,
    init_tracing,
    start_span,
    trace_store,
)


TENANT_ID = "test-tenant-obs"
ADMIN_TOKEN = create_access_token({
    "sub": "admin-user-id",
    "email": "admin@test.com",
    "role": "admin",
    "tenant_id": TENANT_ID,
    "type": "access",
})
RECRUITER_TOKEN = create_access_token({
    "sub": "recruiter-user-id",
    "email": "recruiter@test.com",
    "role": "recruiter",
    "tenant_id": TENANT_ID,
    "type": "access",
})


def _build_app() -> FastAPI:
    from apps.observability_service.main import router as obs_router
    app = FastAPI()
    app.include_router(obs_router, prefix="/api/v1/observability")
    return app


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=_build_app())
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


@pytest.fixture
def recruiter_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {RECRUITER_TOKEN}"}


@pytest.fixture(autouse=True)
def clean_trace_store():
    trace_store.clear()
    yield
    trace_store.clear()


# ── Tests: Structured Logging ────────────────────────────────────────────────


class TestStructuredLogging:

    def test_json_formatter_produces_valid_json(self):
        logger = get_structured_logger("test.json_format")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.info("test message", custom_field="custom_value")

        output = buf.getvalue()
        parsed = json.loads(output.strip())
        assert parsed["level"] == "INFO"
        assert parsed["message"] == "test message"
        assert "timestamp" in parsed
        assert parsed["logger"] == "test.json_format"

    def test_log_levels_debug(self):
        logger = get_structured_logger("test.levels")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.debug("debug msg")
        parsed = json.loads(buf.getvalue().strip())
        assert parsed["level"] == "DEBUG"

    def test_log_levels_warning(self):
        logger = get_structured_logger("test.levels_warn")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.warning("warn msg")
        parsed = json.loads(buf.getvalue().strip())
        assert parsed["level"] == "WARNING"

    def test_log_levels_error(self):
        logger = get_structured_logger("test.levels_err")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.error("error msg")
        parsed = json.loads(buf.getvalue().strip())
        assert parsed["level"] == "ERROR"

    def test_log_levels_critical(self):
        logger = get_structured_logger("test.levels_crit")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.critical("critical msg")
        parsed = json.loads(buf.getvalue().strip())
        assert parsed["level"] == "CRITICAL"

    def test_extra_fields_included(self):
        logger = get_structured_logger("test.extra")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.info("with extras", action="login", request_count=42)
        parsed = json.loads(buf.getvalue().strip())
        assert parsed["action"] == "login"
        assert parsed["request_count"] == 42


# ── Tests: Log Correlation ───────────────────────────────────────────────────


class TestLogCorrelation:

    def test_request_id_in_log_output(self):
        logger = get_structured_logger("test.corr_rid")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        token = request_id_ctx.set("req-12345")
        try:
            logger.info("correlated request")
            parsed = json.loads(buf.getvalue().strip())
            assert parsed["request_id"] == "req-12345"
        finally:
            request_id_ctx.reset(token)

    def test_user_id_in_log_output(self):
        logger = get_structured_logger("test.corr_uid")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        token = user_id_ctx.set("user-abc")
        try:
            logger.info("user action")
            parsed = json.loads(buf.getvalue().strip())
            assert parsed["user_id"] == "user-abc"
        finally:
            user_id_ctx.reset(token)

    def test_tenant_id_in_log_output(self):
        logger = get_structured_logger("test.corr_tid")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        token = tenant_id_ctx.set("tenant-xyz")
        try:
            logger.info("tenant action")
            parsed = json.loads(buf.getvalue().strip())
            assert parsed["tenant_id"] == "tenant-xyz"
        finally:
            tenant_id_ctx.reset(token)

    def test_all_correlation_fields_together(self):
        logger = get_structured_logger("test.corr_all")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        t1 = request_id_ctx.set("req-all")
        t2 = user_id_ctx.set("user-all")
        t3 = tenant_id_ctx.set("tenant-all")
        try:
            logger.info("full correlation")
            parsed = json.loads(buf.getvalue().strip())
            assert parsed["request_id"] == "req-all"
            assert parsed["user_id"] == "user-all"
            assert parsed["tenant_id"] == "tenant-all"
        finally:
            request_id_ctx.reset(t1)
            user_id_ctx.reset(t2)
            tenant_id_ctx.reset(t3)

    def test_set_correlation_helper(self):
        logger = get_structured_logger("test.corr_helper")
        buf = io.StringIO()
        handler = logging.StreamHandler(buf)
        handler.setFormatter(JSONFormatter())
        logger.logger.handlers.clear()
        logger.logger.addHandler(handler)
        logger.logger.setLevel(logging.DEBUG)

        logger.set_correlation(request_id="r-1", user_id="u-1", tenant_id="t-1")
        logger.info("via helper")
        parsed = json.loads(buf.getvalue().strip())
        assert parsed["request_id"] == "r-1"
        assert parsed["user_id"] == "u-1"
        assert parsed["tenant_id"] == "t-1"


# ── Tests: Sensitive Data Masking ────────────────────────────────────────────


class TestSensitiveDataMasking:

    def test_mask_password_field(self):
        result = mask_value("password", "super_secret_123")
        assert result == "***MASKED***"

    def test_mask_api_key_field(self):
        result = mask_value("api_key", "sk-1234567890abcdef")
        assert result == "***MASKED***"

    def test_mask_authorization_field(self):
        result = mask_value("authorization", "Bearer eyJhbGciOi...")
        assert result == "***MASKED***"

    def test_mask_credit_card_pattern(self):
        result = mask_value("notes", "Card: 4111 1111 1111 1111")
        assert "***CARD***" in result

    def test_mask_ssn_pattern(self):
        result = mask_value("info", "SSN: 123-45-6789")
        assert "***SSN***" in result

    def test_mask_email_pattern(self):
        result = mask_value("info", "Contact: user@example.com")
        assert "***EMAIL***" in result

    def test_mask_bearer_token_pattern(self):
        result = mask_value("info", "Auth: Bearer abc123def456ghi789")
        assert "Bearer ***TOKEN***" in result

    def test_mask_dict_masks_sensitive_keys(self):
        data = {
            "username": "john",
            "password": "secret123",
            "email": "john@example.com",
            "api_key": "sk-abc123",
        }
        masked = mask_dict(data)
        assert masked["username"] == "john"
        assert masked["password"] == "***MASKED***"
        assert masked["api_key"] == "***MASKED***"

    def test_mask_dict_preserves_non_sensitive(self):
        data = {"name": "Alice", "role": "admin"}
        masked = mask_dict(data)
        assert masked == data


# ── Tests: Log Destinations ──────────────────────────────────────────────────


class TestLogDestinations:

    def test_console_destination_creates_handler(self):
        dest = ConsoleDestination(level=logging.INFO)
        handler = dest.get_handler()
        assert handler is not None
        assert handler.level == logging.INFO

    def test_file_destination_creates_rotating_handler(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.log")
            dest = FileDestination(filepath=filepath, level=logging.WARNING)
            handler = dest.get_handler()
            assert handler is not None
            assert handler.level == logging.WARNING
            handler.close()

    def test_file_destination_creates_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "subdir", "test.log")
            dest = FileDestination(filepath=filepath)
            handler = dest.get_handler()
            assert handler is not None
            assert os.path.isdir(os.path.join(tmpdir, "subdir"))
            handler.close()

    def test_cloudwatch_destination_init(self):
        dest = CloudWatchDestination(log_group="/test/app", region="us-east-1")
        assert dest.log_group == "/test/app"
        assert dest.region == "us-east-1"
        handler = dest.get_handler()
        assert handler is not None

    def test_datadog_destination_init(self):
        dest = DatadogDestination(host="localhost", port=10518, service="test-svc")
        assert dest.host == "localhost"
        assert dest.port == 10518
        assert dest.service == "test-svc"
        handler = dest.get_handler()
        assert handler is not None

    def test_create_destination_factory(self):
        dest = create_destination("console", level=logging.DEBUG)
        assert isinstance(dest, ConsoleDestination)

    def test_create_destination_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown destination type"):
            create_destination("nonexistent")


# ── Tests: Distributed Tracing ───────────────────────────────────────────────


class TestDistributedTracing:

    def test_init_tracing_memory_exporter(self):
        init_tracing(service_name="test-service", exporter_type="memory")
        tracer = get_tracer("test")
        assert tracer is not None

    def test_start_and_finish_span(self):
        init_tracing(service_name="test-service", exporter_type="memory")
        span = start_span("test-operation", tags={"key": "value"})
        assert span is not None
        finish_span(span, status="ok")

    def test_in_memory_trace_store_add_and_get(self):
        store = InMemoryTraceStore()
        record = SpanRecord(
            trace_id="abc123",
            span_id="span1",
            parent_span_id=None,
            operation_name="root",
            service_name="test",
            start_time=1000.0,
            end_time=1001.0,
            duration_ms=1000.0,
            status="ok",
        )
        store.add_span(record)
        spans = store.get_trace("abc123")
        assert len(spans) == 1
        assert spans[0].operation_name == "root"

    def test_in_memory_trace_store_list_traces(self):
        store = InMemoryTraceStore()
        for i in range(3):
            record = SpanRecord(
                trace_id=f"trace-{i}",
                span_id=f"span-{i}",
                parent_span_id=None,
                operation_name=f"op-{i}",
                service_name="test",
                start_time=float(1000 + i),
                end_time=float(1001 + i),
                duration_ms=1000.0,
                status="ok",
            )
            store.add_span(record)
        traces = store.list_traces(limit=10)
        assert len(traces) == 3

    def test_in_memory_trace_store_metrics(self):
        store = InMemoryTraceStore()
        record = SpanRecord(
            trace_id="metrics-trace",
            span_id="span-m",
            parent_span_id=None,
            operation_name="metrics-op",
            service_name="svc-a",
            start_time=1000.0,
            end_time=1001.5,
            duration_ms=1500.0,
            status="ok",
        )
        store.add_span(record)
        metrics = store.get_metrics()
        assert metrics["total_traces"] == 1
        assert metrics["total_spans"] == 1
        assert metrics["services"] == ["svc-a"]

    def test_in_memory_trace_store_max_traces_eviction(self):
        store = InMemoryTraceStore(max_traces=2)
        for i in range(5):
            record = SpanRecord(
                trace_id=f"evict-{i}",
                span_id=f"span-{i}",
                parent_span_id=None,
                operation_name="op",
                service_name="test",
                start_time=float(i),
                end_time=float(i + 1),
                duration_ms=1000.0,
                status="ok",
            )
            store.add_span(record)
        traces = store.list_traces(limit=100)
        assert len(traces) <= 2

    def test_in_memory_trace_store_clear(self):
        store = InMemoryTraceStore()
        record = SpanRecord(
            trace_id="clear-trace",
            span_id="span-c",
            parent_span_id=None,
            operation_name="op",
            service_name="test",
            start_time=1000.0,
            end_time=1001.0,
            duration_ms=1000.0,
            status="ok",
        )
        store.add_span(record)
        store.clear()
        assert store.list_traces() == []

    def test_finish_span_with_error(self):
        init_tracing(service_name="test-service", exporter_type="memory")
        span = start_span("error-operation")
        assert span is not None
        finish_span(span, status="error", error=RuntimeError("boom"))

    def test_empty_store_metrics(self):
        store = InMemoryTraceStore()
        metrics = store.get_metrics()
        assert metrics["total_traces"] == 0
        assert metrics["total_spans"] == 0
        assert metrics["avg_duration_ms"] == 0


# ── Tests: Observability Endpoints ───────────────────────────────────────────


class TestObservabilityEndpoints:

    @pytest.mark.asyncio
    async def test_list_traces_requires_admin(self, client, recruiter_headers):
        response = await client.get("/api/v1/observability/traces", headers=recruiter_headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_list_traces_with_admin(self, client, admin_headers):
        response = await client.get("/api/v1/observability/traces", headers=admin_headers)
        assert response.status_code == 200
        body = response.json()
        assert "traces" in body
        assert "total" in body
        assert "limit" in body
        assert "offset" in body

    @pytest.mark.asyncio
    async def test_list_traces_returns_data_after_span(self, client, admin_headers):
        init_tracing(service_name="test-svc", exporter_type="memory")
        span = start_span("http-request", tags={"http.method": "GET"})
        finish_span(span, status="ok")

        response = await client.get("/api/v1/observability/traces", headers=admin_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["total"] >= 1

    @pytest.mark.asyncio
    async def test_get_trace_not_found(self, client, admin_headers):
        response = await client.get(
            "/api/v1/observability/traces/nonexistent-trace-id",
            headers=admin_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_get_trace_detail(self, client, admin_headers):
        init_tracing(service_name="test-svc", exporter_type="memory")
        span = start_span("detail-operation", tags={"env": "test"})
        finish_span(span, status="ok")

        traces = trace_store.list_traces(limit=1)
        assert len(traces) >= 1
        trace_id = traces[0]["trace_id"]

        response = await client.get(
            f"/api/v1/observability/traces/{trace_id}",
            headers=admin_headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["trace_id"] == trace_id
        assert "spans" in body
        assert body["total_spans"] >= 1

    @pytest.mark.asyncio
    async def test_observability_metrics_endpoint(self, client, admin_headers):
        response = await client.get("/api/v1/observability/metrics", headers=admin_headers)
        assert response.status_code == 200
        body = response.json()
        assert "total_traces" in body
        assert "total_spans" in body
        assert "avg_duration_ms" in body
        assert "error_rate" in body
        assert "services" in body

    @pytest.mark.asyncio
    async def test_observability_metrics_requires_admin(self, client, recruiter_headers):
        response = await client.get("/api/v1/observability/metrics", headers=recruiter_headers)
        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_observability_endpoints_require_auth(self, client):
        response = await client.get("/api/v1/observability/traces")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_list_traces_pagination(self, client, admin_headers):
        response = await client.get(
            "/api/v1/observability/traces?limit=10&offset=0",
            headers=admin_headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["limit"] == 10
        assert body["offset"] == 0
