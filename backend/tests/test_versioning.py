"""Tests for API versioning — header parsing, routing, deprecation warnings."""
from __future__ import annotations

import os
import sys

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.versioning.api_version import (
    CURRENT_API_VERSION,
    SUPPORTED_API_VERSIONS,
    DEPRECATED_VERSIONS,
    SUNSET_DATES,
    APIVersioningMiddleware,
    VersionedResponseSchema,
    api_version_ctx,
    get_active_api_version,
    get_deprecation_headers,
    is_deprecated,
    parse_version_header,
    _extract_version,
)


# ── parse_version_header ──────────────────────────────────────────────────────


class TestParseVersionHeader:
    def test_valid_v1(self):
        assert parse_version_header("v1") == "v1"

    def test_valid_v2(self):
        assert parse_version_header("v2") == "v2"

    def test_valid_v3(self):
        assert parse_version_header("v3") == "v3"

    def test_bare_number(self):
        assert parse_version_header("2") == "v2"

    def test_uppercase_normalized(self):
        assert parse_version_header("V1") == "v1"

    def test_whitespace_stripped(self):
        assert parse_version_header("  v3  ") == "v3"

    def test_unsupported_version_returns_none(self):
        assert parse_version_header("v99") is None

    def test_invalid_string_returns_none(self):
        assert parse_version_header("abc") is None

    def test_empty_string_returns_none(self):
        assert parse_version_header("") is None

    def test_v0_returns_none(self):
        assert parse_version_header("v0") is None


# ── _extract_version from ASGI scope ─────────────────────────────────────────


class TestExtractVersion:
    def test_default_when_no_header(self):
        scope = {"type": "http", "query_string": b"", "headers": []}
        assert _extract_version(scope) == CURRENT_API_VERSION

    def test_from_header(self):
        scope = {
            "type": "http",
            "query_string": b"",
            "headers": [(b"x-api-version", b"v2")],
        }
        assert _extract_version(scope) == "v2"

    def test_from_query_param(self):
        scope = {
            "type": "http",
            "query_string": b"api_version=v3",
            "headers": [],
        }
        assert _extract_version(scope) == "v3"

    def test_query_param_wins_over_header(self):
        scope = {
            "type": "http",
            "query_string": b"api_version=v3",
            "headers": [(b"x-api-version", b"v1")],
        }
        assert _extract_version(scope) == "v3"

    def test_invalid_header_falls_back_to_default(self):
        scope = {
            "type": "http",
            "query_string": b"",
            "headers": [(b"x-api-version", b"invalid")],
        }
        assert _extract_version(scope) == CURRENT_API_VERSION


# ── Deprecation ───────────────────────────────────────────────────────────────


class TestDeprecation:
    def test_current_version_not_deprecated(self):
        assert not is_deprecated(CURRENT_API_VERSION)

    def test_unknown_version_not_deprecated(self):
        assert not is_deprecated("v99")

    def test_deprecation_headers_empty_for_current(self):
        headers = get_deprecation_headers(CURRENT_API_VERSION)
        assert headers == []

    def test_deprecation_headers_for_deprecated_version(self, monkeypatch):
        import shared.versioning.api_version as mod
        monkeypatch.setattr(mod, "DEPRECATED_VERSIONS", frozenset({"v1"}))
        monkeypatch.setattr(mod, "SUNSET_DATES", {"v1": "2026-12-31"})
        headers = get_deprecation_headers("v1")
        names = [h[0] for h in headers]
        assert b"deprecation" in names
        assert b"sunset" in names


# ── VersionedResponseSchema ───────────────────────────────────────────────────


class TestVersionedResponseSchema:
    def test_register_and_get(self):
        VersionedResponseSchema.register("v2", "/users", {"fields": {"id", "name"}})
        schema = VersionedResponseSchema.get("v2", "/users")
        assert schema is not None
        assert "fields" in schema

    def test_get_missing_returns_none(self):
        assert VersionedResponseSchema.get("v99", "/nope") is None

    def test_adapt_response_filters_fields(self):
        VersionedResponseSchema.register("v1", "/adapt", {"fields": {"id", "name"}})
        data = {"id": "1", "name": "Alice", "secret": "hidden"}
        result = VersionedResponseSchema.adapt_response("v1", "/adapt", data)
        assert "secret" not in result
        assert result["id"] == "1"

    def test_adapt_response_no_schema_passthrough(self):
        data = {"id": "1", "name": "Alice"}
        result = VersionedResponseSchema.adapt_response("v99", "/none", data)
        assert result == data


# ── Context var ───────────────────────────────────────────────────────────────


class TestContextVar:
    def test_default_value(self):
        assert get_active_api_version() == CURRENT_API_VERSION

    def test_set_and_get(self):
        token = api_version_ctx.set("v2")
        try:
            assert get_active_api_version() == "v2"
        finally:
            api_version_ctx.reset(token)


# ── ASGI middleware integration ───────────────────────────────────────────────


class TestASGIMiddleware:
    @pytest.mark.asyncio
    async def test_middleware_adds_version_header(self):
        captured_headers = {}

        async def mock_app(scope, receive, send):
            for name, value in scope.get("headers", []):
                pass
            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            })
            await send({"type": "http.response.body", "body": b"{}"})

        middleware = APIVersioningMiddleware(mock_app)

        sent_messages = []

        async def mock_send(message):
            sent_messages.append(message)

        async def mock_receive():
            return {"type": "http.request"}

        scope = {
            "type": "http",
            "query_string": b"",
            "headers": [(b"x-api-version", b"v2")],
            "state": {},
        }

        await middleware(scope, mock_receive, mock_send)

        start_msg = sent_messages[0]
        header_dict = {n: v for n, v in start_msg["headers"]}
        assert header_dict[b"x-api-version"] == b"v2"
        assert b"x-supported-versions" in header_dict

    @pytest.mark.asyncio
    async def test_middleware_skips_non_http(self):
        called = False

        async def mock_app(scope, receive, send):
            nonlocal called
            called = True

        middleware = APIVersioningMiddleware(mock_app)
        scope = {"type": "websocket"}
        await middleware(scope, lambda: None, lambda m: None)
        assert called
