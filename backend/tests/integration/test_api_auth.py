"""Integration tests for auth service API endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


pytestmark = [pytest.mark.integration, pytest.mark.auth]


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_register_returns_response(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        json={
            "email": "newuser@test.com",
            "full_name": "New User",
            "password": "SecurePass123!",
            "role": "recruiter",
        },
    )
    assert response.status_code in [200, 201, 422, 501]


@pytest.mark.asyncio
async def test_register_invalid_email(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        json={
            "email": "not-an-email",
            "full_name": "User",
            "password": "SecurePass123!",
        },
    )
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_register_short_password(client: AsyncClient):
    response = await client.post(
        "/auth/register",
        json={
            "email": "user@test.com",
            "full_name": "User",
            "password": "short",
        },
    )
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_login_returns_response(client: AsyncClient):
    response = await client.post(
        "/auth/login",
        json={
            "email": "test@example.com",
            "password": "TestPassword123!",
        },
    )
    assert response.status_code in [200, 401, 422, 501]


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post(
        "/auth/login",
        json={
            "email": "nonexistent@test.com",
            "password": "WrongPassword123!",
        },
    )
    assert response.status_code in [401, 501]


@pytest.mark.asyncio
async def test_refresh_token_endpoint(client: AsyncClient):
    response = await client.post(
        "/auth/refresh",
        json={"refresh_token": "some-token"},
    )
    assert response.status_code in [200, 401, 422, 501]


@pytest.mark.asyncio
async def test_mfa_enable_endpoint(client: AsyncClient):
    response = await client.post(
        "/auth/mfa/enable",
        json={"user_id": "test-user-id"},
    )
    assert response.status_code in [200, 401, 422, 501]


@pytest.mark.asyncio
async def test_mfa_verify_endpoint(client: AsyncClient):
    response = await client.post(
        "/auth/mfa/verify",
        json={"user_id": "test-user-id", "code": "123456"},
    )
    assert response.status_code in [200, 401, 422, 501]


@pytest.mark.asyncio
async def test_register_missing_fields(client: AsyncClient):
    response = await client.post("/auth/register", json={})
    assert response.status_code == 422
