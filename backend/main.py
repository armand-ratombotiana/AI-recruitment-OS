"""AI-ROS — Unified API Gateway."""
import sys
import os

# Ensure the backend directory is in the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.openapi.utils import get_openapi

from shared.core.config import get_settings
from shared.core.middleware import RequestIDMiddleware, TenantContextMiddleware, ObservabilityMiddleware
from shared.core.exceptions import AIROSException
from shared.core.caching import cache_manager
from shared.core.ratelimit import rate_limiter
from shared.core.health import health_checker
from shared.core.validation import ValidationMiddleware

settings = get_settings()
logger = logging.getLogger("airos.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    print(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    # Seed the demo account (idempotent, non-fatal on failure).
    try:
        from apps.auth_service.main import seed_demo_on_startup
        await seed_demo_on_startup()
    except Exception as exc:
        logger.warning("Demo seed on startup failed: %s", exc)
    yield
    print("Shutting down...")


app = FastAPI(
    title="AI-ROS API",
    description=(
        "AI-Native Recruitment Operating System — Enterprise API Gateway\n\n"
        "## Overview\n"
        "A multi-tenant, AI-powered recruitment platform providing:\n"
        "- **Candidate Management** — CRUD, AI enrichment, skill extraction\n"
        "- **Job Matching** — Semantic matching, candidate-job scoring\n"
        "- **Interview Scheduling** — Automated scheduling, AI interviews\n"
        "- **Pair Programming Evaluation (PPE)** — Live coding, AI hints, evaluation\n"
        "- **AI Orchestration** — Multi-agent task routing, LLM management\n"
        "- **Analytics** — Pipeline metrics, AI performance, custom reports\n"
        "- **Workflow Automation** — Event-driven workflows, triggers, actions\n"
        "- **Notifications** — Multi-channel (email, push, in-app)\n"
        "- **Compliance** — GDPR, SOC2, audit logging\n"
        "- **Billing** — Subscription management, usage tracking\n"
        "- **Semantic Search** — Vector embeddings, similarity search\n"
        "- **WebSocket** — Real-time collaboration, live coding, chat\n\n"
        "## Authentication\n"
        "All endpoints require `Authorization: Bearer <token>` header.\n\n"
        "## Multi-Tenancy\n"
        "Requests are scoped to a tenant via `X-Tenant-ID` header.\n"
    ),
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    openapi_tags=[
        {"name": "Auth", "description": "Authentication, registration, MFA, and token management"},
        {"name": "Tenants", "description": "Multi-tenant organization management and settings"},
        {"name": "Users", "description": "User account management and activity tracking"},
        {"name": "Candidates", "description": "Candidate CRUD, AI enrichment, skill extraction, and job matching"},
        {"name": "Resumes", "description": "Resume upload, parsing, and re-parsing"},
        {"name": "Jobs", "description": "Job posting management and candidate-job matching"},
        {"name": "Interviews", "description": "Interview scheduling, status management, and feedback"},
        {"name": "PPE", "description": "Pair Programming Evaluation — live coding sessions, hints, and scoring"},
        {"name": "AI", "description": "AI agent orchestration, task routing, and LLM management"},
        {"name": "Analytics", "description": "Recruitment pipeline analytics, AI performance metrics, and reports"},
        {"name": "Workflows", "description": "Event-driven workflow automation and triggers"},
        {"name": "Notifications", "description": "Multi-channel notifications (email, push, in-app)"},
        {"name": "Compliance", "description": "GDPR/SOC2 compliance, consent management, and audit logging"},
        {"name": "Billing", "description": "Subscription plans, invoices, and usage tracking"},
        {"name": "Search", "description": "Semantic vector search for candidates and jobs"},
        {"name": "WebSocket", "description": "Real-time collaboration via WebSocket connections"},
        {"name": "Mailing", "description": "Transactional email delivery (SMTP/mock) for account validation, password resets, and notifications"},
        {"name": "Health", "description": "Service health checks and readiness probes"},
    ],
    lifespan=lifespan,
)

# Middleware
app.add_middleware(ValidationMiddleware)
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


# Exception handler
@app.exception_handler(AIROSException)
async def airos_exception_handler(request: Request, exc: AIROSException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.error_code, "message": exc.message}},
    )


# Health check
@app.get("/health")
async def health_check():
    checks = await health_checker.check_all()
    overall_status = "healthy" if all(c["status"] == "healthy" for c in checks.values()) else "degraded"
    return {
        "status": overall_status,
        "version": settings.APP_VERSION,
        "service": "unified-api",
        "checks": checks,
    }


@app.get("/", include_in_schema=False)
async def root():
    return HTMLResponse("""
    <html>
    <head><title>AI-ROS API</title></head>
    <body style="font-family: system-ui; max-width: 600px; margin: 50px auto; text-align: center;">
        <h1>AI-Native Recruitment Operating System</h1>
        <p>API is running successfully.</p>
        <p><a href="/docs">View API Documentation (Swagger UI)</a></p>
        <p><a href="/redoc">View API Documentation (ReDoc)</a></p>
        <p><a href="/openapi.json">Download OpenAPI Schema (JSON)</a></p>
        <hr>
        <p><small>Version: """ + settings.APP_VERSION + """</small></p>
    </body>
    </html>
    """)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
        tags=app.openapi_tags,
    )
    schema["info"]["contact"] = {
        "name": "AI-ROS Engineering",
        "email": "engineering@ai-ros.io",
        "url": "https://github.com/ai-ros/ai-ros",
    }
    schema["info"]["license"] = {
        "name": "Proprietary",
        "url": "https://ai-ros.io/license",
    }
    schema["servers"] = [
        {"url": "http://localhost:8000", "description": "Local development"},
        {"url": "https://api.ai-ros.io", "description": "Production"},
    ]
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT access token obtained from /api/v1/auth/login",
        }
    }
    schema["security"] = [{"BearerAuth": []}]
    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi


# --- Import Routers ---
# We import each router inside a try/except so missing services don't crash the app

def include_router_safe(app: FastAPI, module_path: str, attr: str, prefix: str, tags: list[str]):
    """Safely import and include a router."""
    try:
        import importlib
        module = importlib.import_module(module_path)
        router = getattr(module, attr)
        app.include_router(router, prefix=prefix, tags=tags)
        print(f"  Loaded: {prefix}")
    except Exception as e:
        print(f"  Skipped: {prefix} ({e})")

print("Loading routers...")
include_router_safe(app, "apps.auth_service.main", "router", "/api/v1/auth", ["Auth"])
include_router_safe(app, "apps.mailing_service.main", "router", "/api/v1/mailing", ["Mailing"])
include_router_safe(app, "apps.tenant_service.main", "router", "/api/v1/tenants", ["Tenants"])
include_router_safe(app, "apps.user_service.main", "router", "/api/v1/users", ["Users"])
include_router_safe(app, "apps.candidate_service.main", "router", "/api/v1/candidates", ["Candidates"])
include_router_safe(app, "apps.resume_service.main", "router", "/api/v1/resumes", ["Resumes"])
include_router_safe(app, "apps.job_service.main", "router", "/api/v1/jobs", ["Jobs"])
include_router_safe(app, "apps.interview_service.main", "router", "/api/v1/interviews", ["Interviews"])
include_router_safe(app, "apps.ppe_service.main", "router", "/api/v1/ppe", ["PPE"])
include_router_safe(app, "apps.ai_orchestrator.main", "router", "/api/v1/ai", ["AI"])
include_router_safe(app, "apps.analytics_service.main", "router", "/api/v1/analytics", ["Analytics"])
include_router_safe(app, "apps.workflow_engine.main", "router", "/api/v1/workflows", ["Workflows"])
include_router_safe(app, "apps.notification_service.main", "router", "/api/v1/notifications", ["Notifications"])
include_router_safe(app, "apps.compliance_service.main", "router", "/api/v1/compliance", ["Compliance"])
include_router_safe(app, "apps.billing_service.main", "router", "/api/v1/billing", ["Billing"])
include_router_safe(app, "apps.vector_search_service.main", "router", "/api/v1/search", ["Search"])
include_router_safe(app, "apps.websocket_service.main", "router", "/api/v1/ws", ["WebSocket"])
include_router_safe(app, "apps.resume_analysis_service.main", "router", "/api/v1/resume-analysis", ["Resume Analysis"])
include_router_safe(app, "apps.scheduling_service.main", "router", "/api/v1/scheduling", ["Scheduling"])
include_router_safe(app, "apps.fraud_detection_service.main", "router", "/api/v1/fraud", ["Fraud Detection"])
include_router_safe(app, "apps.compliance_automation_service.main", "router", "/api/v1/compliance-automation", ["Compliance Automation"])
include_router_safe(app, "apps.ai_evaluation_service.main", "router", "/api/v1/ai-evaluation", ["AI Evaluation"])
include_router_safe(app, "apps.talent_intelligence_service.main", "router", "/api/v1/talent-intelligence", ["Talent Intelligence"])
include_router_safe(app, "apps.workflow_automation_service.main", "router", "/api/v1/workflow-automation", ["Workflow Automation"])
include_router_safe(app, "apps.sso_service.main", "router", "/api/v1/sso", ["SSO"])
include_router_safe(app, "apps.innovation_service.main", "router", "/api/v1/innovations", ["Innovation"])

print("All routers loaded!")
