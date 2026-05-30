"""AI-ROS Feature Validation Suite."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

VALIDATION_REPORT = []

def log(feature, status, details=""):
    VALIDATION_REPORT.append({"feature": feature, "status": status, "details": details})
    icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"{icon} {feature}: {details}")

# === BACKEND VALIDATION ===

def validate_backend_config():
    """Validate backend configuration."""
    from shared.core.config import get_settings
    settings = get_settings()
    assert settings.APP_NAME == "AI-ROS"
    assert settings.SECRET_KEY
    assert settings.DATABASE_URL
    log("Backend Config", "PASS", "All settings loaded correctly")

def validate_backend_exceptions():
    """Validate exception hierarchy."""
    from shared.core.exceptions import (
        AIROSException, AuthenticationError, AuthorizationError,
        NotFoundError, ValidationError, RateLimitError
    )
    assert AIROSException().status_code == 500
    assert AuthenticationError().status_code == 401
    assert AuthorizationError().status_code == 403
    assert NotFoundError().status_code == 404
    assert ValidationError().status_code == 422
    assert RateLimitError().status_code == 429
    log("Backend Exceptions", "PASS", "All 6 exception classes defined")

def validate_backend_middleware():
    """Validate middleware stack."""
    from shared.core.middleware import RequestIDMiddleware, TenantContextMiddleware, ObservabilityMiddleware
    from shared.core.caching import CacheManager, cache_manager
    from shared.core.ratelimit import RateLimiter, rate_limiter
    from shared.core.health import HealthChecker, health_checker
    assert RequestIDMiddleware
    assert TenantContextMiddleware
    assert ObservabilityMiddleware
    assert cache_manager
    assert rate_limiter
    assert health_checker
    log("Backend Middleware", "PASS", "All 5 middleware components available")

def validate_backend_security():
    """Validate security utilities."""
    from shared.core.security import (
        hash_password, verify_password, create_access_token,
        create_refresh_token, decode_token, generate_api_key
    )
    # Test password hashing
    h = hash_password("test123")
    assert verify_password("test123", h)
    assert not verify_password("wrong", h)
    # Test JWT
    access = create_access_token({"sub": "user1"})
    refresh = create_refresh_token({"sub": "user1"})
    assert decode_token(access)["sub"] == "user1"
    assert decode_token(refresh)["sub"] == "user1"
    # Test API keys
    key = generate_api_key()
    assert len(key) > 0
    log("Backend Security", "PASS", "Password hashing, JWT, API keys all work")

def validate_ai_modules():
    """Validate AI modules."""
    from shared.ai.llm_router import LLMRouter
    from shared.ai.base_agent import BaseAgent, AgentType, AgentStatus
    from shared.ai.orchestrator import Orchestrator
    from shared.ai.prompts import PromptManager, DEFAULT_PROMPTS
    from shared.ai.rag import RAGPipeline
    from shared.ai.memory import MemoryStore
    assert LLMRouter
    assert BaseAgent
    assert AgentType.PPE_EVALUATION
    assert Orchestrator
    assert DEFAULT_PROMPTS
    assert RAGPipeline
    assert MemoryStore
    log("AI Modules", "PASS", "All 6 AI modules available")

def validate_event_system():
    """Validate event system."""
    from shared.events.schemas import EventEnvelope, build_event
    from shared.events.handlers import EventDispatcher
    event = build_event("test.event", "tenant_123", {"key": "value"})
    assert event.event_type == "test.event"
    assert event.tenant_id == "tenant_123"
    dispatcher = EventDispatcher()
    assert dispatcher._handlers == {}
    log("Event System", "PASS", "EventEnvelope, EventDispatcher working")

def validate_websocket():
    """Validate WebSocket manager."""
    from shared.websocket.manager import ConnectionManager, manager
    assert manager.rooms == {}
    log("WebSocket Manager", "PASS", "ConnectionManager available")

def validate_all_services():
    """Validate all 26 service routers."""
    services = [
        "apps.auth_service.main", "apps.sso_service.main",
        "apps.tenant_service.main", "apps.user_service.main",
        "apps.candidate_service.main", "apps.resume_service.main",
        "apps.job_service.main", "apps.interview_service.main",
        "apps.ppe_service.main", "apps.ai_orchestrator.main",
        "apps.ai_evaluation_service.main", "apps.analytics_service.main",
        "apps.workflow_engine.main", "apps.workflow_automation_service.main",
        "apps.notification_service.main", "apps.compliance_service.main",
        "apps.compliance_automation_service.main", "apps.billing_service.main",
        "apps.vector_search_service.main", "apps.websocket_service.main",
        "apps.resume_analysis_service.main", "apps.scheduling_service.main",
        "apps.fraud_detection_service.main", "apps.talent_intelligence_service.main",
        "apps.innovation_service.main", "apps.api_gateway.main",
    ]
    for svc in services:
        try:
            mod = __import__(svc, fromlist=["router"])
            assert hasattr(mod, "router"), f"{svc} missing router"
        except Exception as e:
            log(f"Service: {svc}", "FAIL", str(e))
            return
    log("All 26 Services", "PASS", "All service routers loaded correctly")

def validate_main_app():
    """Validate main application."""
    from main import app
    assert app.title == "AI-ROS API"
    routes = [r.path for r in app.routes]
    assert "/health" in routes
    assert "/" in routes
    log("Main Application", "PASS", f"App loaded with {len(routes)} routes")

# === FRONTEND VALIDATION ===

def validate_frontend_structure():
    """Validate frontend file structure."""
    frontend_path = os.path.join(os.path.dirname(__file__), '..', 'frontend')
    required_files = [
        "package.json",
        "next.config.js",
        "tsconfig.json",
        "tailwind.config.ts",
        "src/app/layout.tsx",
        "src/app/page.tsx",
        "src/app/globals.css",
        "src/services/api/client.ts",
        "src/stores/index.ts",
        "src/hooks/index.ts",
        "src/lib/utils.ts",
        "src/components/index.ts",
    ]
    for f in required_files:
        path = os.path.join(frontend_path, f)
        if not os.path.exists(path):
            log(f"Frontend: {f}", "FAIL", "File missing")
            return
    log("Frontend Structure", "PASS", f"All {len(required_files)} required files present")

def validate_frontend_pages():
    """Validate frontend pages exist."""
    frontend_path = os.path.join(os.path.dirname(__file__), '..', 'frontend')
    pages = [
        "src/app/page.tsx",
        "src/app/(auth)/login/page.tsx",
        "src/app/(dashboard)/page.tsx",
        "src/app/(dashboard)/candidates/page.tsx",
        "src/app/(dashboard)/candidates/[id]/page.tsx",
        "src/app/(dashboard)/jobs/page.tsx",
        "src/app/(dashboard)/jobs/[id]/page.tsx",
        "src/app/(dashboard)/interviews/page.tsx",
        "src/app/(dashboard)/ppe/page.tsx",
        "src/app/(dashboard)/analytics/page.tsx",
        "src/app/(dashboard)/workflows/page.tsx",
        "src/app/(dashboard)/settings/page.tsx",
        "src/app/(dashboard)/matching/page.tsx",
        "src/app/(dashboard)/schedule/page.tsx",
        "src/app/(interview)/ai-interview/page.tsx",
        "src/app/(interview)/ppe/page.tsx",
    ]
    found = sum(1 for p in pages if os.path.exists(os.path.join(frontend_path, p)))
    log("Frontend Pages", "PASS" if found >= 14 else "FAIL", f"{found}/{len(pages)} pages present")

def validate_frontend_components():
    """Validate frontend components."""
    frontend_path = os.path.join(os.path.dirname(__file__), '..', 'frontend')
    components = [
        "src/components/ui/card.tsx",
        "src/components/ui/button.tsx",
        "src/components/ui/badge.tsx",
        "src/components/ui/loading.tsx",
        "src/components/ui/empty-state.tsx",
        "src/components/ui/data-table.tsx",
        "src/components/ui/progress.tsx",
        "src/components/ui/avatar.tsx",
        "src/components/ui/tabs.tsx",
        "src/components/ui/modal.tsx",
        "src/components/dashboard/stats-card.tsx",
        "src/components/ai-copilot/copilot-panel.tsx",
        "src/components/coding-editor/ppe-editor.tsx",
        "src/components/interview/interview-chat.tsx",
    ]
    found = sum(1 for c in components if os.path.exists(os.path.join(frontend_path, c)))
    log("Frontend Components", "PASS" if found >= 12 else "FAIL", f"{found}/{len(components)} components present")

def validate_docker():
    """Validate Docker configuration."""
    base_path = os.path.join(os.path.dirname(__file__), '..')
    docker_files = [
        "docker-compose.yml",
        "backend/Dockerfile",
        "frontend/Dockerfile",
    ]
    for f in docker_files:
        if not os.path.exists(os.path.join(base_path, f)):
            log(f"Docker: {f}", "FAIL", "File missing")
            return
    log("Docker Configuration", "PASS", "All Docker files present")

def validate_documentation():
    """Validate documentation."""
    base_path = os.path.join(os.path.dirname(__file__), '..')
    docs = [
        "README.md",
        "docs/API.md",
        "docs/FEATURES.md",
        "docs/INNOVATIONS.md",
        "docs/ARCHITECTURE.md",
    ]
    found = sum(1 for d in docs if os.path.exists(os.path.join(base_path, d)))
    log("Documentation", "PASS" if found >= 4 else "FAIL", f"{found}/{len(docs)} docs present")

# === MAIN ===

if __name__ == "__main__":
    print("=" * 60)
    print("AI-ROS Feature Validation Suite")
    print("=" * 60)
    print()

    print("Backend Validation:")
    validate_backend_config()
    validate_backend_exceptions()
    validate_backend_middleware()
    validate_backend_security()
    validate_ai_modules()
    validate_event_system()
    validate_websocket()
    validate_all_services()
    validate_main_app()

    print()
    print("Frontend Validation:")
    validate_frontend_structure()
    validate_frontend_pages()
    validate_frontend_components()

    print()
    print("Infrastructure Validation:")
    validate_docker()
    validate_documentation()

    print()
    print("=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)

    passed = sum(1 for r in VALIDATION_REPORT if r["status"] == "PASS")
    failed = sum(1 for r in VALIDATION_REPORT if r["status"] == "FAIL")
    warnings = sum(1 for r in VALIDATION_REPORT if r["status"] == "WARN")

    print(f"Total Checks: {len(VALIDATION_REPORT)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Warnings: {warnings}")
    print()

    if failed > 0:
        print("FAILED CHECKS:")
        for r in VALIDATION_REPORT:
            if r["status"] == "FAIL":
                print(f"  ❌ {r['feature']}: {r['details']}")

    print()
    print("=" * 60)
    print(f"OVERALL: {'ALL PASS ✅' if failed == 0 else f'{failed} FAILURES ❌'}")
    print("=" * 60)
