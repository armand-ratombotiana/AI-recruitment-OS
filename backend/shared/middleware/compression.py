"""Gzip compression middleware for ``text/*`` and ``application/json`` responses.

Skips:
- Responses smaller than ``MIN_BYTES`` (1 KB by default).
- Responses that are already encoded (``Content-Encoding`` header present).
- Streaming responses.
- Binary content types such as ``image/*``, ``application/pdf``,
  ``application/octet-stream``, ``application/zip`` etc.
"""
from __future__ import annotations

import gzip
import logging

logger = logging.getLogger("compression")


MIN_BYTES = 1024
COMPRESSIBLE_TYPES_PREFIXES = (
    "application/json",
    "text/",
    "application/javascript",
    "application/xml",
    "application/x-yaml",
    "application/ld+json",
    "application/graphql",
    "image/svg+xml",
)
NON_COMPRESSIBLE_TYPES = (
    "image/",
    "video/",
    "audio/",
    "application/pdf",
    "application/zip",
    "application/x-tar",
    "application/x-gzip",
    "application/octet-stream",
    "application/wasm",
    "font/",
)


def _wants_gzip(accept_encoding: bytes | None) -> bool:
    if not accept_encoding:
        return False
    for token in accept_encoding.decode("latin-1", errors="replace").lower().split(","):
        token = token.strip()
        if token == "gzip" or token.startswith("gzip;"):
            return True
    return False


def _is_compressible(content_type: bytes | None) -> bool:
    if not content_type:
        return False
    ctype = content_type.decode("latin-1", errors="replace").lower().split(";", 1)[0].strip()
    if not ctype:
        return False
    for prefix in NON_COMPRESSIBLE_TYPES:
        if ctype.startswith(prefix):
            return False
    for prefix in COMPRESSIBLE_TYPES_PREFIXES:
        if ctype.startswith(prefix):
            return True
    return False


class CompressionMiddleware:
    """Compress cacheable text/JSON responses with gzip when the client supports it.

    Implemented as a pure ASGI middleware (not BaseHTTPMiddleware) so we
    can buffer the response body, gzip it, and re-emit it.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        accept_encoding = None
        for n, v in scope.get("headers", []):
            if n == b"accept-encoding":
                accept_encoding = v
                break

        if not _wants_gzip(accept_encoding):
            return await self.app(scope, receive, send)

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
        ctype = next((v for n, v in response_headers if n == b"content-type"), None)
        already_encoded = any(n == b"content-encoding" for n, _ in response_headers)

        if already_encoded or not _is_compressible(ctype) or len(full_body) < MIN_BYTES:
            # Replay unchanged.
            await send({"type": "http.response.start", "status": status_code, "headers": response_headers})
            for chunk in body_chunks:
                await send({"type": "http.response.body", "body": chunk, "more_body": True})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        try:
            compressed = gzip.compress(full_body, compresslevel=6)
        except Exception as exc:  # pragma: no cover
            logger.warning("gzip compression failed: %s", exc)
            await send({"type": "http.response.start", "status": status_code, "headers": response_headers})
            for chunk in body_chunks:
                await send({"type": "http.response.body", "body": chunk, "more_body": True})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        if len(compressed) >= len(full_body):
            await send({"type": "http.response.start", "status": status_code, "headers": response_headers})
            for chunk in body_chunks:
                await send({"type": "http.response.body", "body": chunk, "more_body": True})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        new_headers: list[tuple[bytes, bytes]] = []
        for n, v in response_headers:
            if n in (b"content-length", b"content-encoding"):
                continue
            new_headers.append((n, v))
        new_headers.append((b"content-encoding", b"gzip"))
        new_headers.append((b"content-length", str(len(compressed)).encode("latin-1")))
        new_headers.append((b"vary", b"Accept-Encoding"))

        await send({"type": "http.response.start", "status": status_code, "headers": new_headers})
        await send({"type": "http.response.body", "body": compressed, "more_body": False})
