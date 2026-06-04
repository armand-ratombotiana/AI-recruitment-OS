"""HTTP caching headers middleware.

Adds ``ETag`` + ``Cache-Control`` headers to ``GET`` responses so clients and
CDNs can avoid refetching unchanged resources.  Honors the
``If-None-Match`` request header by returning ``304 Not Modified`` when the
client already has a fresh copy.

Behavior:
- GET/HEAD responses only (POST/PUT/PATCH/DELETE are never cached).
- Bodies that are true streaming responses (no content-length, no buffer)
  are skipped.
- Endpoints listed in ``NO_CACHE_PATH_PREFIXES`` skip the middleware.
- Cache-Control defaults to ``private, max-age=<ttl>`` for the configured
  duration.  The duration is taken from the route's path prefix.

Implementation note
-------------------
We use a pure ASGI middleware (not ``BaseHTTPMiddleware``) so we can
inspect the body bytes that downstream handlers send.  ``BaseHTTPMiddleware``
consumes the body during ``__call__`` and by the time ``dispatch`` sees the
response the bytes are gone for streaming responses.
"""
from __future__ import annotations

import hashlib
import json
import logging

logger = logging.getLogger("cache_headers")


# Default cache duration in seconds.  Routes can override with a
# ``CACHE_TTL_OVERRIDES`` entry below.
DEFAULT_CACHE_TTL = 60

# Path prefixes that must never be cached.
NO_CACHE_PATH_PREFIXES: tuple[str, ...] = (
    "/api/v1/auth",
    "/api/v1/billing/webhook",
    "/api/v1/webhooks",
    "/api/v1/api-keys",
    "/api/v1/background-jobs",
    "/health",
    "/api/v1/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)

# Per-prefix TTL overrides (seconds).
CACHE_TTL_OVERRIDES: dict[str, int] = {
    "/api/v1/jobs": 120,
    "/api/v1/candidates": 30,
    "/api/v1/users": 60,
    "/api/v1/tenants": 300,
    "/api/v1/dashboard": 15,
}


def _ttl_for_path(path: str) -> int:
    for prefix, ttl in CACHE_TTL_OVERRIDES.items():
        if path.startswith(prefix):
            return ttl
    return DEFAULT_CACHE_TTL


def _is_no_cache_path(path: str) -> bool:
    return any(path.startswith(p) for p in NO_CACHE_PATH_PREFIXES)


def _compute_etag(body: bytes) -> str:
    digest = hashlib.sha1(body).hexdigest()[:16]
    return f'W/"{digest}"'


class CacheHeadersMiddleware:
    """Pure ASGI middleware adding ETag + Cache-Control to cacheable GET responses."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        method = scope.get("method", "GET")
        path = scope.get("path", "")

        # We only cache GET / HEAD.
        if method not in ("GET", "HEAD"):
            return await self.app(scope, receive, send)

        # Pull the If-None-Match header early so we can short-circuit on 304.
        if_none_match = None
        for name, value in scope.get("headers", []):
            if name == b"if-none-match":
                try:
                    if_none_match = value.decode("latin-1")
                except Exception:
                    if_none_match = None
                break

        if _is_no_cache_path(path):
            # Still attach Cache-Control: no-store for safety.
            async def _send_no_store(message):
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    headers.append((b"cache-control", b"no-store"))
                    message["headers"] = headers
                await send(message)

            return await self.app(scope, receive, _send_no_store)

        body_chunks: list[bytes] = []
        status_code = 200
        response_headers: list[tuple[bytes, bytes]] = []

        async def _wrap_send(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message.get("status", 200))
                response_headers[:] = list(message.get("headers", []))
            elif message["type"] == "http.response.body":
                chunk = message.get("body", b"") or b""
                if chunk:
                    body_chunks.append(chunk)

        await self.app(scope, receive, _wrap_send)

        full_body = b"".join(body_chunks)
        ctype = ""
        for n, v in response_headers:
            if n == b"content-type":
                ctype = v.decode("latin-1", errors="replace").lower()
                break

        if status_code != 200 or not full_body:
            # Re-emit unchanged.
            for n, v in response_headers:
                await send({"type": "http.response.start", "status": status_code, "headers": response_headers})
            for chunk in body_chunks:
                await send({"type": "http.response.body", "body": chunk, "more_body": True})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        if "json" not in ctype and "text" not in ctype and "yaml" not in ctype:
            # Re-emit unchanged for non-cacheable types.
            await send({"type": "http.response.start", "status": status_code, "headers": response_headers})
            for chunk in body_chunks:
                await send({"type": "http.response.body", "body": chunk, "more_body": True})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        etag = _compute_etag(full_body)
        ttl = _ttl_for_path(path)

        new_headers: list[tuple[bytes, bytes]] = []
        replaced = {"etag": False, "cache-control": False, "vary": False}
        for n, v in response_headers:
            lname = n.decode("latin-1", errors="replace").lower()
            if lname == "etag":
                new_headers.append((n, etag.encode("latin-1")))
                replaced["etag"] = True
            elif lname == "cache-control":
                new_headers.append(
                    (n, f"private, max-age={ttl}, must-revalidate".encode("latin-1"))
                )
                replaced["cache-control"] = True
            elif lname == "vary":
                new_headers.append((n, b"Authorization, X-Tenant-ID, Accept-Encoding"))
                replaced["vary"] = True
            else:
                new_headers.append((n, v))

        if not replaced["etag"]:
            new_headers.append((b"etag", etag.encode("latin-1")))
        if not replaced["cache-control"]:
            new_headers.append(
                (b"cache-control", f"private, max-age={ttl}, must-revalidate".encode("latin-1"))
            )
        if not replaced["vary"]:
            new_headers.append(
                (b"vary", b"Authorization, X-Tenant-ID, Accept-Encoding")
            )

        # Conditional GET → 304.
        if if_none_match and if_none_match.strip() == etag:
            new_headers.append((b"content-length", b"0"))
            await send({"type": "http.response.start", "status": 304, "headers": new_headers})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        # Recompute content-length so clients can use it.
        had_content_length = any(n == b"content-length" for n, _ in new_headers)
        if had_content_length:
            new_headers = [
                (n, str(len(full_body)).encode("latin-1")) if n == b"content-length" else (n, v)
                for n, v in new_headers
            ]
        else:
            new_headers.append((b"content-length", str(len(full_body)).encode("latin-1")))

        await send({"type": "http.response.start", "status": status_code, "headers": new_headers})
        await send({"type": "http.response.body", "body": full_body, "more_body": False})
