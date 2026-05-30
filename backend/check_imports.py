"""Check all imports work correctly."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

errors = []

# Test shared core imports
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
    "shared.observability.tracing",
    "shared.observability.metrics",
    "shared.observability.logging",
    "shared.utils.pagination",
    "shared.utils.validation",
    "shared.utils.crypto",
]

print("Testing shared core imports...")
for mod in modules:
    try:
        __import__(mod)
        print(f"  [OK] {mod}")
    except Exception as e:
        print(f"  [FAIL] {mod}: {e}")
        errors.append(mod)

# Test service router imports
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

print("\nTesting service router imports...")
for svc in services:
    try:
        mod = __import__(svc, fromlist=["router"])
        assert hasattr(mod, "router"), f"{svc} missing 'router' attribute"
        print(f"  [OK] {svc}")
    except Exception as e:
        print(f"  [FAIL] {svc}: {e}")
        errors.append(svc)

# Test main app
print("\nTesting main app...")
try:
    import main
    assert hasattr(main, "app"), "main.py missing 'app' attribute"
    print("  [OK] main.py loads correctly")
except Exception as e:
    print(f"  [FAIL] main.py: {e}")
    errors.append("main.py")

print(f"\n{'='*50}")
if errors:
    print(f"ERRORS FOUND: {len(errors)}")
    for e in errors:
        print(f"  - {e}")
else:
    print("ALL IMPORTS SUCCESSFUL!")
print(f"{'='*50}")
