"""Quick import validation for all backend modules."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

errors = []
ok = 0

def test(label, import_fn):
    global ok
    try:
        import_fn()
        print(f"  OK: {label}")
        ok += 1
    except Exception as e:
        errors.append(f"{label}: {e}")
        print(f"  FAIL: {label} -> {e}")

print("=== Shared Core ===")
test("config.get_settings", lambda: __import__('shared.core.config', fromlist=['get_settings']).get_settings())
test("exceptions.AIROSException", lambda: __import__('shared.core.exceptions', fromlist=['AIROSException']).AIROSException)
test("exceptions.AuthenticationError", lambda: __import__('shared.core.exceptions', fromlist=['AuthenticationError']).AuthenticationError)
test("exceptions.AuthorizationError", lambda: __import__('shared.core.exceptions', fromlist=['AuthorizationError']).AuthorizationError)
test("exceptions.NotFoundError", lambda: __import__('shared.core.exceptions', fromlist=['NotFoundError']).NotFoundError)
test("exceptions.ValidationError", lambda: __import__('shared.core.exceptions', fromlist=['ValidationError']).ValidationError)
test("exceptions.RateLimitError", lambda: __import__('shared.core.exceptions', fromlist=['RateLimitError']).RateLimitError)
test("middleware.RequestIDMiddleware", lambda: __import__('shared.core.middleware', fromlist=['RequestIDMiddleware']).RequestIDMiddleware)
test("middleware.TenantContextMiddleware", lambda: __import__('shared.core.middleware', fromlist=['TenantContextMiddleware']).TenantContextMiddleware)
test("middleware.ObservabilityMiddleware", lambda: __import__('shared.core.middleware', fromlist=['ObservabilityMiddleware']).ObservabilityMiddleware)
test("database.get_db_session", lambda: __import__('shared.core.database', fromlist=['get_db_session']).get_db_session)
test("database.get_db_dependency", lambda: __import__('shared.core.database', fromlist=['get_db_dependency']).get_db_dependency)
test("security.hash_password", lambda: __import__('shared.core.security', fromlist=['hash_password']).hash_password)
test("security.verify_password", lambda: __import__('shared.core.security', fromlist=['verify_password']).verify_password)
test("security.create_access_token", lambda: __import__('shared.core.security', fromlist=['create_access_token']).create_access_token)
test("security.decode_token", lambda: __import__('shared.core.security', fromlist=['decode_token']).decode_token)
test("security.generate_api_key", lambda: __import__('shared.core.security', fromlist=['generate_api_key']).generate_api_key)
test("security.hash_api_key", lambda: __import__('shared.core.security', fromlist=['hash_api_key']).hash_api_key)
test("repository.BaseRepository", lambda: __import__('shared.core.repository', fromlist=['BaseRepository']).BaseRepository)

print("\n=== Shared AI ===")
test("llm_router.LLMRouter", lambda: __import__('shared.ai.llm_router', fromlist=['LLMRouter']).LLMRouter)
test("base_agent.BaseAgent", lambda: __import__('shared.ai.base_agent', fromlist=['BaseAgent']).BaseAgent)
test("orchestrator.Orchestrator", lambda: __import__('shared.ai.orchestrator', fromlist=['Orchestrator']).Orchestrator)
test("prompts.PromptManager", lambda: __import__('shared.ai.prompts', fromlist=['PromptManager']).PromptManager)
test("rag.RAGPipeline", lambda: __import__('shared.ai.rag', fromlist=['RAGPipeline']).RAGPipeline)
test("memory.MemoryStore", lambda: __import__('shared.ai.memory', fromlist=['MemoryStore']).MemoryStore)

print("\n=== Shared Events ===")
test("schemas.EventEnvelope", lambda: __import__('shared.events.schemas', fromlist=['EventEnvelope']).EventEnvelope)
test("handlers.EventDispatcher", lambda: __import__('shared.events.handlers', fromlist=['EventDispatcher']).EventDispatcher)
test("celery_app.celery_app", lambda: __import__('shared.events.celery_app', fromlist=['celery_app']).celery_app)

print("\n=== Shared Utils ===")
test("websocket.manager.ConnectionManager", lambda: __import__('shared.websocket.manager', fromlist=['ConnectionManager']).ConnectionManager)
test("utils.pagination.paginate", lambda: __import__('shared.utils.pagination', fromlist=['paginate']).paginate)
test("utils.validation.validate_email", lambda: __import__('shared.utils.validation', fromlist=['validate_email']).validate_email)
test("utils.crypto.hash_string", lambda: __import__('shared.utils.crypto', fromlist=['hash_string']).hash_string)

print("\n=== Service Routers ===")
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
for svc in services:
    test(svc, lambda s=svc: getattr(__import__(s, fromlist=['router']), 'router'))

print("\n=== Main App ===")
test("main.app", lambda: __import__('main', fromlist=['app']).app)

print(f"\n{'='*50}")
print(f"RESULT: {ok} passed, {len(errors)} failed")
if errors:
    print("\nFAILURES:")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print("ALL IMPORTS OK!")
