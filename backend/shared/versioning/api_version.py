"""API versioning — header-based routing, deprecation warnings, response schemas.

Supports versions ``v1``, ``v2``, ``v3`` via the ``X-API-Version`` header.
Older versions receive a ``Sunset`` + ``Deprecation`` header pair so clients
can detect upcoming removals.
"""
from __future__ import annotations

import logging
import re
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any

from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("versioning")

CURRENT_API_VERSION = "v1"
SUPPORTED_API_VERSIONS: tuple[str, ...] = ("v1", "v2", "v3")
DEPRECATED_VERSIONS: frozenset[str] = frozenset()
SUNSET_DATES: dict[str, str] = {}

_VERSION_HEADER = b"x-api-version"
_SUPPORTED_HEADER = b"x-supported-versions"
_DEPRECATION_HEADER = b"deprecation"
_SUNSET_HEADER = b"sunset"

api_version_ctx: ContextVar[str] = ContextVar("api_version", default=CURRENT_API_VERSION)


def get_active_api_version() -> str:
    return api_version_ctx.get() or CURRENT_API_VERSION


def parse_version_header(raw: str) -> str | None:
    raw = raw.strip().lower()
    if re.fullmatch(r"v[1-9]\d*", raw):
        return raw if raw in SUPPORTED_API_VERSIONS else None
    if re.fullmatch(r"[1-9]\d*", raw):
        v = f"v{raw}"
        return v if v in SUPPORTED_API_VERSIONS else None
    return None


def _extract_version(scope: Scope) -> str:
    qs = scope.get("query_string", b"").decode("latin-1", errors="replace")
    if qs:
        for kv in qs.split("&"):
            if "=" not in kv:
                continue
            k, v = kv.split("=", 1)
            if k == "api_version":
                parsed = parse_version_header(v)
                if parsed:
                    return parsed

    for name, value in scope.get("headers", []):
        if name == _VERSION_HEADER:
            try:
                parsed = parse_version_header(value.decode("latin-1"))
            except Exception:
                continue
            if parsed:
                return parsed
    return CURRENT_API_VERSION


def is_deprecated(version: str) -> bool:
    return version in DEPRECATED_VERSIONS


def get_deprecation_headers(version: str) -> list[tuple[bytes, bytes]]:
    headers: list[tuple[bytes, bytes]] = []
    if is_deprecated(version):
        headers.append((_DEPRECATION_HEADER, b"true"))
        sunset = SUNSET_DATES.get(version)
        if sunset:
            headers.append((_SUNSET_HEADER, sunset.encode("latin-1")))
    return headers


class VersionedResponseSchema:
    _schemas: dict[str, dict[str, Any]] = {}

    @classmethod
    def register(cls, version: str, endpoint: str, schema: dict[str, Any]) -> None:
        cls._schemas.setdefault(version, {})[endpoint] = schema

    @classmethod
    def get(cls, version: str, endpoint: str) -> dict[str, Any] | None:
        return cls._schemas.get(version, {}).get(endpoint)

    @classmethod
    def adapt_response(cls, version: str, endpoint: str, data: dict[str, Any]) -> dict[str, Any]:
        schema = cls.get(version, endpoint)
        if schema is None:
            return data
        if "fields" in schema:
            return {k: v for k, v in data.items() if k in schema["fields"]}
        return data


class APIVersioningMiddleware:
    """Pure ASGI middleware — attaches version + deprecation headers."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        version = _extract_version(scope)
        scope.setdefault("state", {})
        try:
            scope["state"]["api_version"] = version
        except Exception:
            pass
        api_version_ctx.set(version)

        async def _wrap_send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers = [
                    (n, v) for n, v in headers
                    if n not in (_VERSION_HEADER, _SUPPORTED_HEADER, _DEPRECATION_HEADER, _SUNSET_HEADER)
                ]
                headers.append((_VERSION_HEADER, version.encode("latin-1")))
                headers.append(
                    (_SUPPORTED_HEADER, ",".join(SUPPORTED_API_VERSIONS).encode("latin-1"))
                )
                headers.extend(get_deprecation_headers(version))
                message["headers"] = headers
            await send(message)

        return await self.app(scope, receive, _wrap_send)
