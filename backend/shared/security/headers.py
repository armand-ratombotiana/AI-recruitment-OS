from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
}

_CORS_ALLOWED_ORIGINS: list[str] = [
    "https://app.ai-ros.io",
    "https://admin.ai-ros.io",
]

_CORS_ALLOWED_METHODS: list[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]

_CORS_ALLOWED_HEADERS: list[str] = [
    "Authorization",
    "Content-Type",
    "X-Tenant-ID",
    "X-Request-ID",
    "X-API-Key",
    "Accept",
    "Origin",
]

_CORS_EXPOSE_HEADERS: list[str] = [
    "X-Request-ID",
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
]

_COOKIE_SECURE: bool = True
_COOKIE_HTTPONLY: bool = True
_COOKIE_SAMESITE: str = "lax"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, extra_headers: dict[str, str] | None = None) -> None:
        super().__init__(app)
        self._extra_headers = extra_headers or {}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers[header] = value
        for header, value in self._extra_headers.items():
            response.headers[header] = value
        return response


def get_security_headers() -> dict[str, str]:
    return dict(_SECURITY_HEADERS)


def get_cors_config() -> dict:
    return {
        "allow_origins": _CORS_ALLOWED_ORIGINS,
        "allow_credentials": True,
        "allow_methods": _CORS_ALLOWED_METHODS,
        "allow_headers": _CORS_ALLOWED_HEADERS,
        "expose_headers": _CORS_EXPOSE_HEADERS,
        "max_age": 600,
    }


def get_cookie_security() -> dict[str, str | bool]:
    return {
        "secure": _COOKIE_SECURE,
        "httponly": _COOKIE_HTTPONLY,
        "samesite": _COOKIE_SAMESITE,
    }


def set_secure_cookie(
    response: Response,
    key: str,
    value: str,
    max_age: int = 3600,
    path: str = "/",
    domain: str | None = None,
) -> None:
    cookie_parts = [
        f"{key}={value}",
        f"Max-Age={max_age}",
        f"Path={path}",
        f"SameSite={_COOKIE_SAMESITE.capitalize()}",
    ]
    if _COOKIE_SECURE:
        cookie_parts.append("Secure")
    if _COOKIE_HTTPONLY:
        cookie_parts.append("HttpOnly")
    if domain:
        cookie_parts.append(f"Domain={domain}")
    response.headers.append("set-cookie", "; ".join(cookie_parts))
