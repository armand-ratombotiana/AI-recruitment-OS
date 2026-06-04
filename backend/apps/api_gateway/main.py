"""API Gateway — Entry point for all external traffic."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from shared.core.config import get_settings
from shared.core.exceptions import AIROSException
from shared.core.middleware import RequestIDMiddleware, TenantContextMiddleware, ObservabilityMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: connect to Redis-backed rate limiters (no-op if unavailable).
    try:
        from shared.core.ratelimit import init_rate_limiters
        await init_rate_limiters()
    except Exception:
        pass
    yield
    # Shutdown: close connections, flush buffers


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI-ROS API Gateway",
        version=settings.APP_VERSION,
        description="AI-Native Recruitment Operating System — API Gateway",
        docs_url="/docs" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    app.add_middleware(ObservabilityMiddleware)
    app.add_middleware(TenantContextMiddleware)
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AIROSException)
    async def airos_exception_handler(request: Request, exc: AIROSException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.error_code, "message": exc.message, "details": exc.details}},
        )

    @app.get("/health", tags=["Health"])
    async def health_check() -> dict[str, str]:
        return {"status": "healthy", "service": "api-gateway", "version": settings.APP_VERSION}

    @app.get("/", tags=["Root"])
    async def root() -> dict[str, str]:
        return {
            "service": "AI-ROS API Gateway",
            "version": settings.APP_VERSION,
            "docs": "/docs",
        }

    return app


app = create_app()
