"""AI-Native Recruitment Operating System — FastAPI Application Entry Point."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import get_settings
from src.core.exceptions import AIROSException
from src.core.middleware import (
    RequestIDMiddleware,
    TenantContextMiddleware,
    ObservabilityMiddleware,
)
from src.api.v1 import auth, tenants, users, candidates, resumes, jobs
from src.api.v1 import pipelines, interviews, evaluations, ppe
from src.api.v1 import workflows, analytics, search, notifications, billing
from src.api.v1 import websockets

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — startup and shutdown hooks."""
    # Startup: initialize database pools, Redis, Kafka producers
    yield
    # Shutdown: close connections, flush buffers


def create_app() -> FastAPI:
    """Construct and configure the FastAPI application."""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description="AI-Native Recruitment Operating System",
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
        lifespan=lifespan,
    )

    # --- Middleware (order matters: last added = first executed) ---
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

    # --- Exception handlers ---
    @app.exception_handler(AIROSException)
    async def airos_exception_handler(request: Request, exc: AIROSException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.error_code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    # --- Router registration ---
    prefix = settings.API_V1_PREFIX
    app.include_router(auth.router, prefix=prefix, tags=["Auth"])
    app.include_router(tenants.router, prefix=prefix, tags=["Tenants"])
    app.include_router(users.router, prefix=prefix, tags=["Users"])
    app.include_router(candidates.router, prefix=prefix, tags=["Candidates"])
    app.include_router(resumes.router, prefix=prefix, tags=["Resumes"])
    app.include_router(jobs.router, prefix=prefix, tags=["Jobs"])
    app.include_router(pipelines.router, prefix=prefix, tags=["Pipelines"])
    app.include_router(interviews.router, prefix=prefix, tags=["Interviews"])
    app.include_router(evaluations.router, prefix=prefix, tags=["Evaluations"])
    app.include_router(ppe.router, prefix=prefix, tags=["PPE"])
    app.include_router(workflows.router, prefix=prefix, tags=["Workflows"])
    app.include_router(analytics.router, prefix=prefix, tags=["Analytics"])
    app.include_router(search.router, prefix=prefix, tags=["Search"])
    app.include_router(notifications.router, prefix=prefix, tags=["Notifications"])
    app.include_router(billing.router, prefix=prefix, tags=["Billing"])
    app.include_router(websockets.router, prefix="/ws", tags=["WebSockets"])

    # --- Health check ---
    @app.get("/health", tags=["Health"])
    async def health_check() -> dict[str, str]:
        return {"status": "healthy", "version": settings.APP_VERSION}

    return app


app = create_app()
