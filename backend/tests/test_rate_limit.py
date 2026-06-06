"""Tests for the multi-window rate limiter middleware.

Covers:

* Per-minute / per-hour / per-day enforcement
* Per-user vs per-tenant vs per-IP scoping
* ``super_admin`` bypass (token-based)
* The ``GET /api/v1/rate-limit/status`` introspection endpoint
* The ``Retry-After`` and ``X-RateLimit-*`` response headers on 429
* The in-memory fallback when Redis is unavailable
* Middleware classification (auth/AI handled by dependencies, public vs
  default for the rest)
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient

# Ensure ``backend`` is on the import path so ``shared.*`` resolves the same
# way it does in production.
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Force the in-memory backend for every test by clearing REDIS_URL.
os.environ.pop("REDIS_URL", None)

from shared.core.security import create_access_token, hash_password  # noqa: E402
from shared.middleware.rate_limit import (  # noqa: E402
    ALL_LIMITERS,
    RateLimiter,
    RateLimitMiddleware,
    RateLimitResult,
    ai_user_limiter,
    auth_ip_limiter,
    default_user_limiter,
    init_rate_limiters,
    public_tenant_limiter,
    rate_limit_ai,
    rate_limit_auth,
    rate_limit_router,
)


# ── Test app ──────────────────────────────────────────────────────────────────


def _build_test_app() -> FastAPI:
    """Build a minimal FastAPI app that exercises every code path."""
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    app.include_router(rate_limit_router, prefix="/api/v1")

    test_router = APIRouter()

    @test_router.post("/auth/login", dependencies=[Depends(rate_limit_auth())])
    async def auth_login() -> dict:
        return {"ok": True}

    @test_router.post("/ai/orchestrate", dependencies=[Depends(rate_limit_ai())])
    async def ai_orchestrate() -> dict:
        return {"ok": True}

    @test_router.get("/public/list")
    async def public_list() -> dict:
        return {"ok": True}

    @test_router.get("/private/list")
    async def private_list() -> dict:
        return {"ok": True}

    @test_router.get("/super/list")
    async def super_list() -> dict:
        return {"ok": True}

    app.include_router(test_router, prefix="/test")
    return app


@pytest_asyncio.fixture
async def app() -> AsyncGenerator[FastAPI, None]:
    """Fresh test app with cleared limiter state for every test."""
    # Reset every in-memory bucket so tests are independent.
    for lim in ALL_LIMITERS:
        # Replace the in-memory backend with a brand-new one.
        lim._backend = _fresh_memory_backend()  # type: ignore[attr-defined]
        lim._using_redis = False  # type: ignore[attr-defined]
    # Extend the public-prefix list so the test ``/test/public/list`` path
    # is classified as a per-tenant public route.  The defaults remain
    # intact (we restore the original tuple in the teardown step).
    original_prefixes = RateLimitMiddleware.public_prefixes
    RateLimitMiddleware.public_prefixes = original_prefixes + ("/test/public",)
    try:
        yield _build_test_app()
    finally:
        RateLimitMiddleware.public_prefixes = original_prefixes


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _fresh_memory_backend():
    from shared.middleware.rate_limit import _InMemoryBackend

    return _InMemoryBackend()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _bearer(role: str, sub: str = "user-1", tenant: str = "tenant-a") -> dict:
    return {"Authorization": f"Bearer {create_access_token({'sub': sub, 'role': role, 'tenant_id': tenant})}"}


def _super_admin_headers(sub: str = "admin-1", tenant: str = "tenant-a") -> dict:
    return _bearer("super_admin", sub=sub, tenant=tenant)


def _user_headers(sub: str = "user-1", tenant: str = "tenant-a") -> dict:
    return _bearer("recruiter", sub=sub, tenant=tenant)


# ── Pure RateLimiter unit tests ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ratelimiter_basic_minute_window():
    rl = RateLimiter("t.basic", per_minute=3)
    for i in range(3):
        result = await rl.check("k1")
        assert result.allowed, f"call {i} should be allowed"
        assert result.limit == 3
        assert result.remaining == 3 - (i + 1)
        assert result.window == "minute"

    denied = await rl.check("k1")
    assert not denied.allowed
    assert denied.remaining == 0
    assert denied.reset_seconds > 0


@pytest.mark.asyncio
async def test_ratelimiter_hour_and_day_windows():
    rl = RateLimiter("t.hd", per_minute=100, per_hour=2, per_day=10)
    await rl.check("k")
    r = await rl.check("k")
    assert r.allowed
    denied = await rl.check("k")
    # Hour window runs out first (2 used, 3rd attempt denied by hour).
    assert not denied.allowed
    assert denied.window == "hour"
    assert denied.limit == 2


@pytest.mark.asyncio
async def test_ratelimiter_separate_keys_are_independent():
    rl = RateLimiter("t.iso", per_minute=2)
    r1 = await rl.check("alice")
    r2 = await rl.check("bob")
    assert r1.allowed and r2.allowed
    # alice's bucket is exhausted on the 3rd call; bob is on the 2nd.
    assert (await rl.check("alice")).allowed  # alice: 2/2
    assert not (await rl.check("alice")).allowed  # alice: 3/2 denied
    assert (await rl.check("bob")).allowed  # bob: 2/2 still allowed
    assert not (await rl.check("bob")).allowed  # bob: 3/2 denied


@pytest.mark.asyncio
async def test_ratelimiter_status_does_not_consume():
    rl = RateLimiter("t.status", per_minute=5)
    await rl.check("k")
    s = await rl.status("k")
    assert s["name"] == "t.status"
    assert s["backend"] == "memory"
    assert s["windows"][0]["used"] == 1
    assert s["windows"][0]["remaining"] == 4
    # Status must not have consumed an extra slot.
    s2 = await rl.status("k")
    assert s2["windows"][0]["used"] == 1


@pytest.mark.asyncio
async def test_ratelimiter_requires_at_least_one_window():
    with pytest.raises(ValueError):
        RateLimiter("t.empty")


@pytest.mark.asyncio
async def test_init_rate_limiters_works_without_redis(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    # Each limiter must end up on the in-memory backend.
    await init_rate_limiters()
    for lim in ALL_LIMITERS:
        assert lim.backend == "memory"


# ── Dependency tests (auth + AI) ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_auth_endpoint_under_limit_succeeds(client: AsyncClient):
    # 5/min — make 4 calls, all should succeed.
    for _ in range(4):
        r = await client.post("/test/auth/login", json={})
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_auth_endpoint_over_limit_returns_429(client: AsyncClient):
    for _ in range(5):
        r = await client.post("/test/auth/login", json={})
        assert r.status_code == 200
    r = await client.post("/test/auth/login", json={})
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    assert int(r.headers["Retry-After"]) >= 1
    assert r.headers["X-RateLimit-Limit"] == "5"
    assert r.headers["X-RateLimit-Remaining"] == "0"


@pytest.mark.asyncio
async def test_auth_endpoint_is_per_ip_not_per_user(client: AsyncClient):
    # Hammer the endpoint from a single IP — the bucket is shared across
    # the 5-call allowance regardless of "user" header.
    headers_user = _user_headers("alice")
    for _ in range(5):
        r = await client.post("/test/auth/login", json={}, headers=headers_user)
        assert r.status_code == 200
    r = await client.post("/test/auth/login", json={}, headers=headers_user)
    assert r.status_code == 429

    # A different user (still same IP) is also blocked because the limiter
    # is keyed on IP for auth endpoints.
    headers_user2 = _user_headers("bob")
    r = await client.post("/test/auth/login", json={}, headers=headers_user2)
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_super_admin_bypasses_auth_limit(client: AsyncClient):
    headers = _super_admin_headers()
    for _ in range(20):
        r = await client.post("/test/auth/login", json={}, headers=headers)
        assert r.status_code == 200
        assert r.headers.get("X-RateLimit-Bypass") == "super_admin"


@pytest.mark.asyncio
async def test_ai_endpoint_is_per_user(client: AsyncClient):
    headers_alice = _user_headers("alice")
    headers_bob = _user_headers("bob")
    # 10/min per user — alice exhausts her bucket.
    for _ in range(10):
        r = await client.post("/test/ai/orchestrate", json={}, headers=headers_alice)
        assert r.status_code == 200
    r = await client.post("/test/ai/orchestrate", json={}, headers=headers_alice)
    assert r.status_code == 429
    # Bob has a fresh bucket.
    r = await client.post("/test/ai/orchestrate", json={}, headers=headers_bob)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_super_admin_bypasses_ai_limit(client: AsyncClient):
    headers = _super_admin_headers()
    for _ in range(30):
        r = await client.post("/test/ai/orchestrate", json={}, headers=headers)
        assert r.status_code == 200


# ── Middleware tests (default + public) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_middleware_default_per_user_limit(client: AsyncClient):
    headers = _user_headers("alice")
    # 60/min default — exhaust it.
    for _ in range(60):
        r = await client.get("/test/private/list", headers=headers)
        assert r.status_code == 200
    r = await client.get("/test/private/list", headers=headers)
    assert r.status_code == 429
    assert "Retry-After" in r.headers
    assert r.headers["X-RateLimit-Scope"] == "user"


@pytest.mark.asyncio
async def test_middleware_per_user_keys_are_isolated(client: AsyncClient):
    headers_alice = _user_headers("alice")
    headers_bob = _user_headers("bob")
    # Burn alice's bucket.
    for _ in range(60):
        await client.get("/test/private/list", headers=headers_alice)
    r = await client.get("/test/private/list", headers=headers_alice)
    assert r.status_code == 429
    # Bob is unaffected.
    r = await client.get("/test/private/list", headers=headers_bob)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_middleware_anon_falls_back_to_per_ip(client: AsyncClient):
    # No Authorization header — middleware must use per-IP keying.
    for _ in range(60):
        r = await client.get("/test/private/list")
        assert r.status_code == 200
    r = await client.get("/test/private/list")
    assert r.status_code == 429
    assert r.headers["X-RateLimit-Scope"] == "ip"


@pytest.mark.asyncio
async def test_middleware_public_route_is_per_tenant(client: AsyncClient):
    headers_t1 = _user_headers("alice", tenant="tenant-a")
    headers_t2 = _user_headers("bob", tenant="tenant-b")
    # 100/min per tenant.
    for _ in range(100):
        r = await client.get("/test/public/list", headers=headers_t1)
        assert r.status_code == 200
    r = await client.get("/test/public/list", headers=headers_t1)
    assert r.status_code == 429
    assert r.headers["X-RateLimit-Scope"] == "tenant"
    # Different tenant — fresh bucket.
    r = await client.get("/test/public/list", headers=headers_t2)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_middleware_super_admin_bypasses_default(client: AsyncClient):
    headers = _super_admin_headers()
    for _ in range(120):
        r = await client.get("/test/private/list", headers=headers)
        assert r.status_code == 200
        assert r.headers.get("X-RateLimit-Bypass") == "super_admin"


@pytest.mark.asyncio
async def test_middleware_attaches_ratelimit_headers(client: AsyncClient):
    r = await client.get("/test/private/list", headers=_user_headers("alice"))
    assert r.status_code == 200
    assert "X-RateLimit-Limit" in r.headers
    assert "X-RateLimit-Remaining" in r.headers
    assert "X-RateLimit-Reset" in r.headers
    assert "X-RateLimit-Scope" in r.headers
    assert int(r.headers["X-RateLimit-Limit"]) == 60


# ── Status endpoint ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rate_limit_status_endpoint_returns_all_limiters(client: AsyncClient):
    # Burn a couple of slots so the status is meaningful.
    headers = _user_headers("alice", tenant="tenant-a")
    for _ in range(3):
        await client.get("/test/private/list", headers=headers)

    r = await client.get("/api/v1/rate-limit/status", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["scope"]["user_id"] == "alice"
    assert body["scope"]["tenant_id"] == "tenant-a"
    assert body["scope"]["is_super_admin"] is False
    names = {lim["name"] for lim in body["limiters"]}
    assert names == {"default.user", "ai.user", "auth.ip", "public.tenant"}
    # The default limiter should show 3 used slots.
    default = next(lim for lim in body["limiters"] if lim["name"] == "default.user")
    minute = next(w for w in default["windows"] if w["window"] == "minute")
    assert minute["used"] >= 3


@pytest.mark.asyncio
async def test_rate_limit_status_works_anonymously(client: AsyncClient):
    r = await client.get("/api/v1/rate-limit/status")
    assert r.status_code == 200
    body = r.json()
    assert body["scope"]["is_super_admin"] is False
    assert body["scope"]["user_id"].startswith("ip:")


@pytest.mark.asyncio
async def test_rate_limit_status_reports_super_admin(client: AsyncClient):
    r = await client.get("/api/v1/rate-limit/status", headers=_super_admin_headers())
    assert r.status_code == 200
    assert r.json()["scope"]["is_super_admin"] is True
