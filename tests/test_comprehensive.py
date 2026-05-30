"""Comprehensive test suite for AI-ROS."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def test_config():
    from shared.core.config import get_settings
    settings = get_settings()
    assert settings.APP_NAME == "AI-ROS"
    print("[OK] Config")

def test_exceptions():
    from shared.core.exceptions import AIROSException, NotFoundError, AuthenticationError
    assert AIROSException().status_code == 500
    assert NotFoundError().status_code == 404
    print("[OK] Exceptions")

def test_middleware():
    from shared.core.middleware import RequestIDMiddleware, TenantContextMiddleware, ObservabilityMiddleware
    print("[OK] Middleware")

def test_security():
    from shared.core.security import hash_password, verify_password, create_access_token, decode_token
    h = hash_password("test123")
    assert verify_password("test123", h)
    token = create_access_token({"sub": "user1"})
    assert decode_token(token)["sub"] == "user1"
    print("[OK] Security")

def test_ai_modules():
    from shared.ai.llm_router import LLMRouter
    from shared.ai.base_agent import BaseAgent, AgentType
    from shared.ai.orchestrator import Orchestrator
    from shared.ai.prompts import PromptManager
    from shared.ai.rag import RAGPipeline
    from shared.ai.memory import MemoryStore
    print("[OK] AI Modules")

def test_services():
    services = [
        "apps.auth_service.main", "apps.tenant_service.main", "apps.user_service.main",
        "apps.candidate_service.main", "apps.resume_service.main", "apps.job_service.main",
        "apps.interview_service.main", "apps.ppe_service.main", "apps.ai_orchestrator.main",
        "apps.analytics_service.main", "apps.workflow_engine.main", "apps.notification_service.main",
        "apps.compliance_service.main", "apps.billing_service.main", "apps.vector_search_service.main",
        "apps.websocket_service.main",
    ]
    for svc in services:
        mod = __import__(svc, fromlist=["router"])
        assert hasattr(mod, "router")
    print(f"[OK] All {len(services)} Services")

def test_main_app():
    from main import app
    assert app.title == "AI-ROS API"
    print("[OK] Main App")

if __name__ == "__main__":
    print("=" * 50)
    print("AI-ROS Test Suite")
    print("=" * 50)
    tests = [test_config, test_exceptions, test_middleware, test_security, test_ai_modules, test_services, test_main_app]
    passed = 0
    failed = 0
    for t in tests:
        try: t(); passed += 1
        except Exception as e: print(f"[FAIL] {t.__name__}: {e}"); failed += 1
    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed")
    print(f"{'='*50}")
