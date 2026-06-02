"""Validation proof tests for SSO authentication."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from httpx import AsyncClient, ASGITransport
from apps.sso_service.main import (
    router, SSO_PROVIDERS, TOKENS_DB, LINKED_ACCOUNTS_DB, USERS_DB, _states
)


@pytest.fixture(autouse=True)
def clear_db():
    TOKENS_DB.clear()
    LINKED_ACCOUNTS_DB.clear()
    USERS_DB.clear()
    _states.clear()
    yield
    TOKENS_DB.clear()
    LINKED_ACCOUNTS_DB.clear()
    USERS_DB.clear()
    _states.clear()


def _app():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    return app


@pytest.mark.asyncio
async def test_all_four_providers_configured():
    """PROOF: All 4 providers are configured in SSO_PROVIDERS."""
    assert len(SSO_PROVIDERS) == 4
    for pid in ["google", "linkedin", "microsoft", "apple"]:
        assert pid in SSO_PROVIDERS, f"Provider '{pid}' missing"
        assert "name" in SSO_PROVIDERS[pid]
        assert "authorization_url" in SSO_PROVIDERS[pid]
        assert "token_url" in SSO_PROVIDERS[pid]
        assert "scopes" in SSO_PROVIDERS[pid]
        assert "icon" in SSO_PROVIDERS[pid]


@pytest.mark.asyncio
async def test_authorization_urls_valid():
    """PROOF: Authorization URLs are valid for each provider."""
    expected_domains = {
        "google": "accounts.google.com",
        "linkedin": "linkedin.com",
        "microsoft": "microsoftonline.com",
        "apple": "appleid.apple.com",
    }
    for pid, domain in expected_domains.items():
        url = SSO_PROVIDERS[pid]["authorization_url"]
        assert domain in url, f"Provider '{pid}' URL missing domain '{domain}': {url}"


@pytest.mark.asyncio
async def test_state_tokens_generated_and_verified():
    """PROOF: State tokens are generated and verified."""
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test") as client:
        resp = await client.get("/sso/providers/google/authorize", params={"redirect_uri": "http://localhost:3000/cb"})
        state = resp.json()["state"]
        assert len(state) > 10, "State token too short"
        assert state in _states, "State not stored in memory"


@pytest.mark.asyncio
async def test_callback_creates_user_and_returns_token():
    """PROOF: Callback creates user and returns token."""
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test") as client:
        auth = await client.get("/sso/providers/microsoft/authorize", params={"redirect_uri": "http://localhost:3000/cb"})
        state = auth.json()["state"]
        resp = await client.post("/sso/providers/microsoft/callback", json={
            "provider": "microsoft",
            "code": "test_code",
            "state": state,
            "redirect_uri": "http://localhost:3000/cb",
        })
    assert resp.status_code == 200
    data = resp.json()
    token = data["access_token"]
    assert token.startswith("sso_"), "Token should start with 'sso_'"
    assert token in TOKENS_DB, "Token should be stored in TOKENS_DB"
    user_id = data["user"]["id"]
    assert user_id in USERS_DB, "User should be stored in USERS_DB"
    link_key = f"{user_id}_microsoft"
    assert link_key in LINKED_ACCOUNTS_DB, "Link should exist in LINKED_ACCOUNTS_DB"


@pytest.mark.asyncio
async def test_token_authentication_works():
    """PROOF: Token-based authentication works."""
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test") as client:
        auth = await client.get("/sso/providers/apple/authorize", params={"redirect_uri": "http://localhost:3000/cb"})
        state = auth.json()["state"]
        cb = await client.post("/sso/providers/apple/callback", json={
            "provider": "apple",
            "code": "code",
            "state": state,
            "redirect_uri": "http://localhost:3000/cb",
        })
        token = cb.json()["access_token"]
        resp = await client.get("/sso/userinfo", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    user = resp.json()["user"]
    assert "email" in user
    assert "id" in user
    assert "full_name" in user
