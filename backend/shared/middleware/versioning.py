"""API versioning middleware.

Every response carries ``X-API-Version`` so clients can detect the
deployed version.  Clients can opt into a newer behavior by passing
``?api_version=2`` (or ``X-API-Version: 2``).  The active version is
exposed to handlers via ``request.state.api_version``.
"""
from __future__ import annotations

import logging
from contextvars import ContextVar

logger = logging.getLogger("versioning")


CURRENT_API_VERSION = "1"
SUPPORTED_API_VERSIONS: tuple[str, ...] = ("1", "2")


api_version_ctx: ContextVar[str] = ContextVar("api_version", default=CURRENT_API_VERSION)


def get_active_api_version() -> str:
    """Return the active API version for the current request (handler scope)."""
    return api_version_ctx.get() or CURRENT_API_VERSION


def _parse_requested_version(scope) -> str:
    """Determine which API version the client wants."""
    # Query parameter wins because it's easy to test/cache-bust.
    raw_qs = scope.get("query_string", b"").decode("latin-1", errors="replace")
    if raw_qs:
        for kv in raw_qs.split("&"):
            if not kv or "=" not in kv:
                continue
            k, v = kv.split("=", 1)
            if k == "api_version" and v in SUPPORTED_API_VERSIONS:
                return v

    for n, v in scope.get("headers", []):
        if n == b"x-api-version":
            try:
                hv = v.decode("latin-1")
            except Exception:
                continue
            if hv in SUPPORTED_API_VERSIONS:
                return hv
    return CURRENT_API_VERSION


class APIVersioningMiddleware:
    """Pure ASGI middleware attaching ``X-API-Version`` to every response."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        version = _parse_requested_version(scope)
        scope.setdefault("state", {})
        try:
            scope["state"]["api_version"] = version
        except Exception:
            pass
        api_version_ctx.set(version)

        async def _wrap_send(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                # Replace any prior X-API-Version header (defensive).
                headers = [(n, v) for n, v in headers if n != b"x-api-version" and n != b"x-supported-versions"]
                headers.append((b"x-api-version", version.encode("latin-1")))
                headers.append(
                    (b"x-supported-versions", ",".join(SUPPORTED_API_VERSIONS).encode("latin-1"))
                )
                message["headers"] = headers
            await send(message)

        return await self.app(scope, receive, _wrap_send)
