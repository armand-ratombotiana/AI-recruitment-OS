"""End-to-end tests for SSO authentication."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import pytest
from httpx import AsyncClient, ASGITransport
from apps.sso_service.main import router, TOKENS_DB, LINKED_ACCOUNTS_DB, USERS_DB, _states


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


@pytest.mark.asyncio
async def test_list_providers():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sso/providers")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["providers"]) == 4
    ids = {p["id"] for p in data["providers"]}
    assert ids == {"google", "linkedin", "microsoft", "apple"}


@pytest.mark.asyncio
async def test_google_authorize_url():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sso/providers/google/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/google"})
    assert resp.status_code == 200
    data = resp.json()
    assert "authorization_url" in data
    assert "state" in data
    url = data["authorization_url"]
    assert "accounts.google.com" in url
    assert "client_id=" in url
    assert "redirect_uri=" in url
    assert "state=" in url
    assert "scope=" in url


@pytest.mark.asyncio
async def test_linkedin_authorize_url():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sso/providers/linkedin/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/linkedin"})
    assert resp.status_code == 200
    data = resp.json()
    url = data["authorization_url"]
    assert "linkedin.com" in url
    assert "client_id=" in url
    assert "redirect_uri=" in url
    assert "state=" in url


@pytest.mark.asyncio
async def test_microsoft_authorize_url():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sso/providers/microsoft/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/microsoft"})
    assert resp.status_code == 200
    data = resp.json()
    url = data["authorization_url"]
    assert "microsoftonline.com" in url
    assert "client_id=" in url
    assert "redirect_uri=" in url
    assert "state=" in url


@pytest.mark.asyncio
async def test_apple_authorize_url():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/sso/providers/apple/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/apple"})
    assert resp.status_code == 200
    data = resp.json()
    url = data["authorization_url"]
    assert "appleid.apple.com" in url
    assert "client_id=" in url
    assert "redirect_uri=" in url
    assert "state=" in url


@pytest.mark.asyncio
async def test_callback_valid_state():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_resp = await client.get("/sso/providers/google/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/google"})
        state = auth_resp.json()["state"]
        resp = await client.post("/sso/providers/google/callback", json={
            "provider": "google",
            "code": "mock_auth_code",
            "state": state,
            "redirect_uri": "http://localhost:3000/auth/callback/google",
        })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data
    assert data["user"]["provider"] == "google"


@pytest.mark.asyncio
async def test_callback_invalid_state():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/sso/providers/google/callback", json={
            "provider": "google",
            "code": "mock_auth_code",
            "state": "invalid_state_token",
            "redirect_uri": "http://localhost:3000/auth/callback/google",
        })
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_userinfo_with_token():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_resp = await client.get("/sso/providers/google/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/google"})
        state = auth_resp.json()["state"]
        callback_resp = await client.post("/sso/providers/google/callback", json={
            "provider": "google",
            "code": "mock_code",
            "state": state,
            "redirect_uri": "http://localhost:3000/auth/callback/google",
        })
        token = callback_resp.json()["access_token"]
        resp = await client.get("/sso/userinfo", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "user" in data
    assert "email" in data["user"]


@pytest.mark.asyncio
async def test_unlink_provider():
    from fastapi import FastAPI
    app = FastAPI()
    app.include_router(router, prefix="/sso")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        auth_resp = await client.get("/sso/providers/linkedin/authorize", params={"redirect_uri": "http://localhost:3000/auth/callback/linkedin"})
        state = auth_resp.json()["state"]
        callback_resp = await client.post("/sso/providers/linkedin/callback", json={
            "provider": "linkedin",
            "code": "mock_code",
            "state": state,
            "redirect_uri": "http://localhost:3000/auth/callback/linkedin",
        })
        token = callback_resp.json()["access_token"]
        resp = await client.delete("/sso/unlink/linkedin", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
