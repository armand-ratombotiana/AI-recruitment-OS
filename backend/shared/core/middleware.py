from __future__ import annotations
import time
import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")
tenant_id_ctx: ContextVar[str] = ContextVar("tenant_id", default="")

class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        rid = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request_id_ctx.set(rid)
        request.state.request_id = rid
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response

class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        tenant = request.headers.get("X-Tenant-ID", "default")
        tenant_id_ctx.set(tenant)
        request.state.tenant_id = tenant
        return await call_next(request)

# Paths to skip in monitoring (probes, docs, metrics themselves).
_SKIP_PATHS = {"/health", "/metrics", "/openapi.json", "/docs", "/redoc", "/", "/favicon.ico"}


class ObservabilityMiddleware(BaseHTTPMiddleware):
    """Request-response timing + monitoring record.

    Behaviour:
    - Sets `X-Response-Time` (kept from the original implementation)
    - Records the request into the in-process monitoring store
    - Lazy-imports the store so the middleware is safe even if the
      monitoring module has not been initialised yet.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        error_type: str | None = None
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception as exc:  # pragma: no cover - defensive
            error_type = exc.__class__.__name__
            raise
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            try:
                response.headers["X-Response-Time"] = f"{elapsed_ms:.2f}ms"
            except Exception:
                pass

            # Record into the monitoring store (best-effort, never raises).
            try:
                from shared.monitoring import store as _store
                path = request.url.path
                if path not in _SKIP_PATHS and not path.startswith(("/docs", "/redoc")):
                    endpoint = path
                    method = request.method
                    user_id = None
                    try:
                        auth = request.headers.get("authorization", "")
                        if auth.lower().startswith("bearer "):
                            from shared.core.security import decode_token
                            payload = decode_token(auth[7:]) or {}
                            user_id = payload.get("sub")
                    except Exception:
                        pass
                    _store.record_request(
                        endpoint=endpoint,
                        method=method,
                        status_code=status_code,
                        duration_s=elapsed_ms / 1000.0,
                        user_id=user_id,
                        error_type=error_type,
                    )
            except Exception:
                pass
        return response
