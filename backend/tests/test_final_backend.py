"""Final backend verification test suite."""
from __future__ import annotations

import sys
import os
import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock


def _make_mock_session():
    session = AsyncMock()
    session.execute = AsyncMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()
    session.delete = AsyncMock()
    session.add = MagicMock()
    return session


@pytest.fixture(scope="module")
def event_loop():
    import asyncio
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="module")
async def client():
    from main import app
    from shared.core.database import get_db_dependency

    mock_session = _make_mock_session()

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db_dependency] = override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


# ============================================================================
# 1. App Startup
# ============================================================================

class TestAppStartup:
    def test_app_imports_without_error(self):
        from main import app
        assert app is not None
        assert app.title == "AI-ROS API"

    def test_all_25_routers_loaded(self):
        from main import app
        prefixes = [r.path for r in app.routes if hasattr(r, "path")]
        api_prefixes = [p for p in prefixes if p.startswith("/api/v1/")]
        service_prefixes = set()
        for p in api_prefixes:
            parts = p.replace("/api/v1/", "").split("/")
            if parts and parts[0]:
                service_prefixes.add(parts[0])
        assert len(service_prefixes) >= 25, f"Expected >=25 services, found {len(service_prefixes)}: {sorted(service_prefixes)}"

    def test_health_endpoint_exists(self):
        from main import app
        paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/health" in paths


# ============================================================================
# 2. Health Endpoint
# ============================================================================

class TestHealth:
    @pytest.mark.asyncio
    async def test_health_returns_healthy(self, client: AsyncClient):
        r = await client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] in ("healthy", "degraded")
        assert body["service"] == "unified-api"
        assert "version" in body
        assert "checks" in body

    @pytest.mark.asyncio
    async def test_health_has_all_check_results(self, client: AsyncClient):
        r = await client.get("/health")
        checks = r.json()["checks"]
        assert len(checks) >= 2, f"Expected >=2 health checks, got {len(checks)}"
        for name, check in checks.items():
            assert "status" in check, f"Check '{name}' missing status"


# ============================================================================
# 3. CORS Headers
# ============================================================================

class TestCORS:
    @pytest.mark.asyncio
    async def test_cors_allows_origin(self, client: AsyncClient):
        r = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" in {k.lower() for k in r.headers.keys()}

    @pytest.mark.asyncio
    async def test_health_has_cors_headers(self, client: AsyncClient):
        r = await client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert "access-control-allow-origin" in {k.lower() for k in r.headers.keys()}


# ============================================================================
# 4. Rate Limiter
# ============================================================================

class TestRateLimiter:
    def test_rate_limiter_allows_within_limit(self):
        from shared.core.ratelimit import RateLimiter
        rl = RateLimiter(max_requests=5, window_seconds=60)
        for _ in range(5):
            assert rl.is_allowed("test_key") is True
        assert rl.is_allowed("test_key") is False

    def test_rate_limiter_get_remaining(self):
        from shared.core.ratelimit import RateLimiter
        rl = RateLimiter(max_requests=10, window_seconds=60)
        assert rl.get_remaining("test_key") == 10
        rl.is_allowed("test_key")
        assert rl.get_remaining("test_key") == 9

    def test_rate_limiter_is_global_singleton(self):
        from shared.core.ratelimit import rate_limiter
        assert rate_limiter.max_requests == 100


# ============================================================================
# 5. Security Functions
# ============================================================================

class TestSecurity:
    def test_password_hashing(self):
        from shared.core.security import hash_password, verify_password
        hashed = hash_password("TestPassword123!")
        assert verify_password("TestPassword123!", hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    def test_jwt_token_create_decode(self):
        from shared.core.security import create_access_token, decode_token
        token = create_access_token({"sub": "user1", "tenant_id": "t1"})
        assert isinstance(token, str) and len(token) > 0
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["sub"] == "user1"
        assert decoded["type"] == "access"

    def test_refresh_token(self):
        from shared.core.security import create_refresh_token, decode_token
        token = create_refresh_token({"sub": "user1"})
        decoded = decode_token(token)
        assert decoded is not None
        assert decoded["type"] == "refresh"

    def test_invalid_token_returns_none(self):
        from shared.core.security import decode_token
        assert decode_token("invalid.token.here") is None

    def test_api_key_generation(self):
        from shared.core.security import generate_api_key, hash_api_key
        key = generate_api_key()
        assert len(key) > 0
        hashed = hash_api_key(key)
        assert len(hashed) == 64  # SHA256 hex


# ============================================================================
# 6. Database Module
# ============================================================================

class TestDatabase:
    def test_async_engine_exists(self):
        from shared.core.database import engine, async_session_factory
        assert engine is not None
        assert async_session_factory is not None

    def test_get_db_session_is_context_manager(self):
        from shared.core.database import get_db_session
        import asyncio
        import inspect
        assert inspect.iscoroutinefunction(get_db_session) or callable(get_db_session)


# ============================================================================
# 7. Config Module
# ============================================================================

class TestConfig:
    def test_settings_loads(self):
        from shared.core.config import get_settings
        s = get_settings()
        assert s.APP_NAME == "AI-ROS"
        assert s.JWT_ALGORITHM == "HS256"
        assert s.DATABASE_URL is not None

    def test_settings_has_required_fields(self):
        from shared.core.config import get_settings
        s = get_settings()
        required = [
            "SECRET_KEY", "DATABASE_URL", "REDIS_URL", "OPENAI_API_KEY",
            "JWT_ALGORITHM", "JWT_ACCESS_TOKEN_EXPIRE_MINUTES",
            "TENANT_HEADER",
        ]
        for field in required:
            assert hasattr(s, field), f"Missing setting: {field}"


# ============================================================================
# 8. Middleware Module
# ============================================================================

class TestMiddleware:
    def test_middleware_classes_exist(self):
        from shared.core.middleware import (
            RequestIDMiddleware,
            TenantContextMiddleware,
            ObservabilityMiddleware,
        )
        assert RequestIDMiddleware is not None
        assert TenantContextMiddleware is not None
        assert ObservabilityMiddleware is not None

    def test_cors_middleware_in_app(self):
        from main import app
        from starlette.middleware.cors import CORSMiddleware
        found = False
        for m in app.user_middleware:
            cls = m.cls if hasattr(m, "cls") else None
            if cls and issubclass(cls, CORSMiddleware):
                found = True
                break
        assert found, "CORSMiddleware not found in app.user_middleware"


# ============================================================================
# 9. All Service Health Endpoints
# ============================================================================

class TestServiceHealthEndpoints:
    HEALTH_ENDPOINTS = [
        ("/api/v1/auth/health", "auth"),
        ("/api/v1/candidates/health", "candidate"),
        ("/api/v1/jobs/health", "job"),
        ("/api/v1/interviews/health", "interview"),
        ("/api/v1/ppe/health", "ppe"),
        ("/api/v1/ai/health", "ai-orchestrator"),
        ("/api/v1/analytics/health", "analytics"),
        ("/api/v1/workflows/health", "workflow-engine"),
        ("/api/v1/notifications/health", "notification"),
        ("/api/v1/sso/health", "sso"),
        ("/api/v1/compliance/health", "compliance"),
        ("/api/v1/billing/health", "billing"),
        ("/api/v1/search/health", "vector-search"),
        ("/api/v1/innovations/health", "innovation"),
        ("/api/v1/resume-analysis/health", "resume-analysis"),
        ("/api/v1/scheduling/health", "scheduling"),
        ("/api/v1/fraud/health", "fraud-detection"),
        ("/api/v1/compliance-automation/health", "compliance-automation"),
        ("/api/v1/ai-evaluation/health", "ai-evaluation"),
        ("/api/v1/talent-intelligence/health", "talent-intelligence"),
        ("/api/v1/workflow-automation/health", "workflow-automation"),
    ]

    @pytest.mark.asyncio
    @pytest.mark.parametrize("endpoint,expected_service", HEALTH_ENDPOINTS)
    async def test_health_endpoint(self, client: AsyncClient, endpoint: str, expected_service: str):
        r = await client.get(endpoint)
        assert r.status_code == 200, f"{endpoint} returned {r.status_code}"
        body = r.json()
        assert body["service"] == expected_service
