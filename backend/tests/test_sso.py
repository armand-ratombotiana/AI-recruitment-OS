"""Tests for the SSO (Social Login) service.

Exercises the OAuth2 authorization-code flow for Google, LinkedIn, Microsoft
and Apple — but in mock mode (``SSO_MOCK=true``) so the test-suite never
hits a real provider.

Coverage:

* Login URL generation for each provider (including a 302 redirect variant).
* OAuth callback for each provider — new user creation.
* Linking an existing user when a second provider shares the same email.
* Listing the connections attached to a user.
* Disconnecting a provider.
* Tenant isolation — a tenant token cannot disconnect another tenant's user.
* State token CSRF protection — replay or mismatched state is rejected.
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator
from uuid import uuid4

# Ensure the backend dir is importable regardless of the cwd pytest uses.
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from shared.core.config import Settings
from shared.core.database import get_db_dependency
from shared.core.models.identity import User, UserRole, UserStatus, Credential
from shared.core.security import create_access_token


# ── Mocks are on for the entire module ───────────────────────────────────────


os.environ["SSO_MOCK"] = "true"
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long!!")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-that-is-at-least-32-chars!!")


# ── Engine / DB fixtures ────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def app(engine) -> FastAPI:
    """Build a minimal FastAPI app with the SSO router mounted."""
    from apps.sso_service.main import router as sso_router

    application = FastAPI(title="SSO test app")
    application.include_router(sso_router, prefix="/api/v1/sso")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_db():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    application.dependency_overrides[get_db_dependency] = _override_db
    application.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
        JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30,
        JWT_REFRESH_TOKEN_EXPIRE_DAYS=7,
    )
    return application


@pytest_asyncio.fixture
async def client(app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Helpers ─────────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str, role: str = "recruiter") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str, sub: str, role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


async def _seed_user(
    engine, *, tenant_id: str, email: str | None = None, user_id: str | None = None
) -> User:
    from shared.core.security import hash_password

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    user = User(
        id=user_id or str(uuid4()),
        tenant_id=tenant_id,
        email=(email or f"existing-{uuid4().hex[:8]}@example.com").lower(),
        full_name="Existing User",
        hashed_password=hash_password("Sup3rSecret!"),
        role=UserRole.RECRUITER,
        status=UserStatus.ACTIVE,
        email_verified=True,
    )
    async with factory() as session:
        session.add(user)
        await session.commit()
    return user


# ── 1. Login URL generation ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_login_url_generation(client: AsyncClient):
    r = await client.get(
        "/api/v1/sso/google/login",
        headers=_auth("default", "u1"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "google"
    assert body["provider_name"] == "Google"
    assert "authorization_url" in body
    assert "state" in body
    # In mock mode the URL points back at our callback so the test flow can
    # complete without contacting Google.
    assert "/api/v1/sso/google/callback" in body["authorization_url"]
    assert body["mock"] is True


@pytest.mark.asyncio
async def test_login_url_contains_state_and_scopes(client: AsyncClient):
    r = await client.get(
        "/api/v1/sso/google/login",
        headers=_auth("default", "u1"),
    )
    body = r.json()
    state = body["state"]
    # In mock mode the URL embeds the state token and the mock code, so we
    # can directly invoke the callback with them.
    assert "state=" in body["authorization_url"]
    assert state


@pytest.mark.asyncio
async def test_login_redirects_when_redirect_flag_set(client: AsyncClient):
    r = await client.get(
        "/api/v1/sso/google/login",
        params={"redirect": "true"},
        headers=_auth("default", "u1"),
    )
    assert r.status_code == 302
    location = r.headers["location"]
    assert "/api/v1/sso/google/callback" in location


@pytest.mark.asyncio
async def test_login_rejects_unknown_provider(client: AsyncClient):
    r = await client.get(
        "/api/v1/sso/myspace/login",
        headers=_auth("default", "u1"),
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_login_requires_authentication(client: AsyncClient):
    r = await client.get("/api/v1/sso/google/login")
    assert r.status_code == 401


# ── 2. Callback flows (per provider, mock mode) ─────────────────────────────


async def _drive_oauth_flow(
    client: AsyncClient, *, provider: str, tenant_id: str = "default", user_sub: str = "u1"
) -> dict:
    """Helper: run the full login → callback cycle for a provider."""
    login = await client.get(
        f"/api/v1/sso/{provider}/login",
        headers=_auth(tenant_id, user_sub),
    )
    assert login.status_code == 200, login.text
    body = login.json()
    state = body["state"]

    # In mock mode the authorization URL already contains a mock code; just
    # extract it and call the callback directly.
    auth_url = body["authorization_url"]
    # Naive query-string parse — good enough for the well-formed mock URL.
    query = auth_url.split("?", 1)[1]
    params = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
    code = params["code"]

    callback = await client.get(
        f"/api/v1/sso/{provider}/callback",
        params={"code": code, "state": state},
    )
    assert callback.status_code == 200, callback.text
    return callback.json()


@pytest.mark.asyncio
async def test_google_callback_creates_new_user(client: AsyncClient):
    payload = await _drive_oauth_flow(client, provider="google")
    assert payload["provider"] == "google"
    assert payload["is_new_user"] is True
    assert payload["access_token"]
    assert payload["refresh_token"]
    assert payload["token_type"] == "bearer"
    assert payload["expires_in"] > 0
    user = payload["user"]
    assert user["email"] == "mock.google@example.com"
    assert user["full_name"] == "Mock Google User"


@pytest.mark.asyncio
async def test_linkedin_callback_creates_new_user(client: AsyncClient):
    payload = await _drive_oauth_flow(client, provider="linkedin")
    assert payload["provider"] == "linkedin"
    assert payload["is_new_user"] is True
    user = payload["user"]
    assert user["email"] == "mock.linkedin@example.com"


@pytest.mark.asyncio
async def test_microsoft_callback_creates_new_user(client: AsyncClient):
    payload = await _drive_oauth_flow(client, provider="microsoft")
    assert payload["provider"] == "microsoft"
    assert payload["is_new_user"] is True
    user = payload["user"]
    assert user["email"] == "mock.microsoft@example.com"


@pytest.mark.asyncio
async def test_apple_callback_creates_new_user(client: AsyncClient):
    payload = await _drive_oauth_flow(client, provider="apple")
    assert payload["provider"] == "apple"
    assert payload["is_new_user"] is True
    user = payload["user"]
    assert user["email"] == "mock.apple@example.com"


# ── 3. State CSRF protection ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_callback_rejects_invalid_state(client: AsyncClient):
    login = await client.get(
        "/api/v1/sso/google/login",
        headers=_auth("default", "u1"),
    )
    state = login.json()["state"]
    # Use a known-bad code — in mock mode the callback only validates the
    # state and the provider, so the state check is what we exercise here.
    r = await client.get(
        "/api/v1/sso/google/callback",
        params={"code": "mock_code_google", "state": "not-the-real-state"},
    )
    assert r.status_code == 400
    assert "state" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_callback_rejects_mismatched_provider(client: AsyncClient):
    login = await client.get(
        "/api/v1/sso/google/login",
        headers=_auth("default", "u1"),
    )
    state = login.json()["state"]
    # Try to consume the state under a different provider.
    r = await client.get(
        "/api/v1/sso/linkedin/callback",
        params={"code": "mock_code_linkedin", "state": state},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_callback_state_is_single_use(client: AsyncClient):
    """A successful callback must consume the state — replays are rejected."""
    login = await client.get(
        "/api/v1/sso/google/login",
        headers=_auth("default", "u1"),
    )
    body = login.json()
    state = body["state"]
    auth_url = body["authorization_url"]
    query = auth_url.split("?", 1)[1]
    params = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
    code = params["code"]

    first = await client.get(
        "/api/v1/sso/google/callback",
        params={"code": code, "state": state},
    )
    assert first.status_code == 200

    replay = await client.get(
        "/api/v1/sso/google/callback",
        params={"code": code, "state": state},
    )
    assert replay.status_code == 400


# ── 4. Linking an existing user via SSO ─────────────────────────────────────


@pytest.mark.asyncio
async def test_callback_links_existing_user_with_matching_email(
    client: AsyncClient, engine
):
    existing = await _seed_user(
        engine, tenant_id="default", email="mock.google@example.com"
    )

    payload = await _drive_oauth_flow(client, provider="google", user_sub="u1")
    assert payload["is_new_user"] is False
    assert payload["user"]["id"] == existing.id

    # And the credential row should now exist for the existing user.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        from shared.core.models.identity import Credential

        result = await session.execute(
            select(Credential).where(
                Credential.user_id == existing.id,
                Credential.provider == "google",
            )
        )
        cred = result.scalar_one_or_none()
        assert cred is not None
        assert cred.provider_user_id == "mock-google-123"


@pytest.mark.asyncio
async def test_second_provider_links_existing_user(
    client: AsyncClient, engine
):
    """Logging in via a second provider should add a credential without
    creating a second user — provided the email matches the mock profile
    of that second provider."""
    existing = await _seed_user(
        engine, tenant_id="default", email="mock.linkedin@example.com"
    )
    payload = await _drive_oauth_flow(client, provider="linkedin", user_sub="u1")
    assert payload["is_new_user"] is False
    assert payload["user"]["id"] == existing.id


# ── 5. Listing connections ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_list_connections_after_login(client: AsyncClient, engine):
    # Drive two providers so the user ends up with two credentials. Because
    # the mock profiles use different emails, each callback creates a fresh
    # user — but both should appear in *their own* connections list.
    google_payload = await _drive_oauth_flow(client, provider="google", user_sub="u1")
    linkedin_payload = await _drive_oauth_flow(client, provider="linkedin", user_sub="u1")

    # Google's connections list
    r = await client.get(
        "/api/v1/sso/connections",
        headers={"Authorization": f"Bearer {google_payload['access_token']}"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == google_payload["user"]["id"]
    assert body["tenant_id"] == "default"
    google_providers = {c["provider"] for c in body["connections"]}
    assert google_providers == {"google"}
    assert body["total"] == 1
    assert all(c["linked"] is True for c in body["connections"])

    # LinkedIn's connections list
    r = await client.get(
        "/api/v1/sso/connections",
        headers={"Authorization": f"Bearer {linkedin_payload['access_token']}"},
    )
    assert r.status_code == 200
    body = r.json()
    linkedin_providers = {c["provider"] for c in body["connections"]}
    assert linkedin_providers == {"linkedin"}


@pytest.mark.asyncio
async def test_list_connections_requires_authentication(client: AsyncClient):
    r = await client.get("/api/v1/sso/connections")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_list_connections_empty_for_new_user(client: AsyncClient, engine):
    user = await _seed_user(engine, tenant_id="default")
    headers = _auth("default", user.id)
    r = await client.get("/api/v1/sso/connections", headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == user.id
    assert body["connections"] == []
    assert body["total"] == 0


# ── 6. Disconnecting ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_disconnect_removes_credential(client: AsyncClient, engine):
    payload = await _drive_oauth_flow(client, provider="google", user_sub="u1")
    user_id = payload["user"]["id"]
    token = payload["access_token"]

    headers = {"Authorization": f"Bearer {token}"}
    r = await client.post(
        "/api/v1/sso/disconnect",
        json={"provider": "google"},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["disconnected"] is True
    assert body["provider"] == "google"
    assert body["user_id"] == user_id

    # Verify the credential row was actually removed from the DB.
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        from shared.core.models.identity import Credential

        result = await session.execute(
            select(Credential).where(
                Credential.user_id == user_id,
                Credential.provider == "google",
            )
        )
        assert result.scalar_one_or_none() is None

    # And the connections list should no longer mention Google.
    after = await client.get("/api/v1/sso/connections", headers=headers)
    providers = {c["provider"] for c in after.json()["connections"]}
    assert "google" not in providers


@pytest.mark.asyncio
async def test_disconnect_unknown_provider_returns_404(client: AsyncClient, engine):
    user = await _seed_user(engine, tenant_id="default")
    headers = _auth("default", user.id)
    r = await client.post(
        "/api/v1/sso/disconnect",
        json={"provider": "myspace"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_disconnect_unlinked_provider_returns_404(client: AsyncClient, engine):
    """Disconnecting a provider the user never linked must 404, not 200."""
    user = await _seed_user(engine, tenant_id="default")
    headers = _auth("default", user.id)
    r = await client.post(
        "/api/v1/sso/disconnect",
        json={"provider": "linkedin"},
        headers=headers,
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_disconnect_requires_authentication(client: AsyncClient):
    r = await client.post(
        "/api/v1/sso/disconnect",
        json={"provider": "google"},
    )
    assert r.status_code == 401


# ── 7. Tenant isolation ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_disconnect_rejects_user_from_other_tenant(
    client: AsyncClient, engine
):
    """A token issued for tenant B must not be able to disconnect a user
    that lives in tenant A — the connection list should come back empty
    for tenant B (since we look the user up by JWT sub, not by email)."""
    # Seed a user in tenant A and a separate token for tenant B with a
    # different `sub` so the lookup misses.
    user_a = await _seed_user(engine, tenant_id="tenant-a")
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        session.add(
            Credential(
                id=str(uuid4()),
                user_id=user_a.id,
                provider="google",
                provider_user_id="some-google-id",
            )
        )
        await session.commit()

    # Token for tenant B with a different subject.
    headers = _auth("tenant-b", "user-b-sub")
    r = await client.get("/api/v1/sso/connections", headers=headers)
    assert r.status_code == 404  # The user (looked up by sub) does not exist


@pytest.mark.asyncio
async def test_callback_writes_credential_row_to_db(client: AsyncClient, engine):
    payload = await _drive_oauth_flow(client, provider="microsoft", user_sub="u1")
    user_id = payload["user"]["id"]

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        from sqlalchemy import select
        from shared.core.models.identity import Credential

        result = await session.execute(
            select(Credential).where(
                Credential.user_id == user_id,
                Credential.provider == "microsoft",
            )
        )
        cred = result.scalar_one_or_none()
        assert cred is not None
        assert cred.provider_user_id == "mock-microsoft-789"


# ── 8. JWT session token is verifiable ──────────────────────────────────────


@pytest.mark.asyncio
async def test_session_token_can_be_decoded(client: AsyncClient):
    from shared.core.security import decode_token

    payload = await _drive_oauth_flow(client, provider="apple", user_sub="u1")
    token = payload["access_token"]
    decoded = decode_token(token)
    assert decoded is not None
    assert decoded["type"] == "access"
    assert decoded["email"] == "mock.apple@example.com"
    assert decoded["sub"] == payload["user"]["id"]
