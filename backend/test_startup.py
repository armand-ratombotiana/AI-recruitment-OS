"""Test that the backend can start correctly."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("Testing backend startup...")
print()

# Test imports
modules = [
    "shared.core.config",
    "shared.core.exceptions",
    "shared.core.middleware",
    "shared.core.database",
    "shared.core.security",
    "shared.core.repository",
    "shared.ai.llm_router",
    "shared.ai.base_agent",
    "shared.events.schemas",
    "shared.events.handlers",
    "shared.websocket.manager",
]

print("Testing shared imports...")
for mod in modules:
    try:
        __import__(mod)
        print(f"  [OK] {mod}")
    except Exception as e:
        print(f"  [FAIL] {mod}: {e}")

# Test service imports
services = [
    "apps.auth_service.main",
    "apps.tenant_service.main",
    "apps.user_service.main",
    "apps.candidate_service.main",
    "apps.resume_service.main",
    "apps.job_service.main",
    "apps.interview_service.main",
    "apps.ppe_service.main",
    "apps.ai_orchestrator.main",
    "apps.analytics_service.main",
    "apps.workflow_engine.main",
    "apps.notification_service.main",
    "apps.compliance_service.main",
    "apps.billing_service.main",
    "apps.vector_search_service.main",
]

print("\nTesting service imports...")
for svc in services:
    try:
        mod = __import__(svc, fromlist=["router"])
        assert hasattr(mod, "router"), f"{svc} missing router"
        print(f"  [OK] {svc}")
    except Exception as e:
        print(f"  [FAIL] {svc}: {e}")

# Test main app
print("\nTesting main app...")
try:
    from main import app
    assert app.title == "AI-ROS API"
    routes = [r.path for r in app.routes]
    print(f"  [OK] App loaded with {len(routes)} routes")
except Exception as e:
    print(f"  [FAIL] {e}")

print("\nStartup test complete!")
