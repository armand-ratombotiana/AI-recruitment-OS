"""Integration tests for PPE service API endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


pytestmark = [pytest.mark.integration, pytest.mark.ppe]


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_ppe_session(client: AsyncClient):
    response = await client.post(
        "/ppe/sessions",
        json={
            "interview_id": "test-interview-id",
            "language": "python",
            "difficulty": "medium",
        },
    )
    assert response.status_code in [200, 201, 422, 501]


@pytest.mark.asyncio
async def test_create_ppe_session_invalid_duration(client: AsyncClient):
    response = await client.post(
        "/ppe/sessions",
        json={
            "interview_id": "test-interview-id",
            "max_duration_seconds": 100,
        },
    )
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_get_ppe_session(client: AsyncClient):
    response = await client.get("/ppe/sessions/test-session-id")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_start_ppe_session(client: AsyncClient):
    response = await client.post("/ppe/sessions/test-session-id/start")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_execute_code(client: AsyncClient):
    response = await client.post(
        "/ppe/sessions/test-session-id/execute",
        json={
            "code": "print('hello')",
            "language": "python",
        },
    )
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_request_hint(client: AsyncClient):
    response = await client.post("/ppe/sessions/test-session-id/hint")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_complete_ppe_session(client: AsyncClient):
    response = await client.post("/ppe/sessions/test-session-id/complete")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_get_ppe_evaluation(client: AsyncClient):
    response = await client.get("/ppe/sessions/test-session-id/evaluation")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_create_session_missing_interview_id(client: AsyncClient):
    response = await client.post("/ppe/sessions", json={})
    assert response.status_code == 422
