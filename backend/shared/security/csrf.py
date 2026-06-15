"""CSRF protection middleware using double-submit cookie pattern."""
import secrets
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF protection using double-submit cookie pattern.

    - Sets CSRF token in cookie on GET requests
    - Validates CSRF token from header on state-changing requests (POST/PUT/DELETE)
    - Exempts API endpoints that use JWT auth (Bearer token)
    """

    COOKIE_NAME = "csrf_token"
    HEADER_NAME = "x-csrf-token"

    def __init__(self, app, exempt_paths=None):
        super().__init__(app)
        self.exempt_paths = exempt_paths or [
            "/api/v1/auth/",
            "/api/v1/sso/",
            "/graphql",
            "/health",
            "/metrics",
        ]

    async def dispatch(self, request: Request, call_next):
        if any(request.url.path.startswith(path) for path in self.exempt_paths):
            return await call_next(request)

        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        if request.method == "GET":
            response = await call_next(request)
            csrf_token = secrets.token_urlsafe(32)
            response.set_cookie(
                key=self.COOKIE_NAME,
                value=csrf_token,
                httponly=False,
                samesite="lax",
                secure=request.url.scheme == "https",
                max_age=3600,
            )
            return response

        if request.method in ("POST", "PUT", "DELETE", "PATCH"):
            cookie_token = request.cookies.get(self.COOKIE_NAME)
            header_token = request.headers.get(self.HEADER_NAME)

            if not cookie_token or not header_token:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF token missing"},
                )

            if cookie_token != header_token:
                return JSONResponse(
                    status_code=403,
                    content={"detail": "CSRF token mismatch"},
                )

        return await call_next(request)
