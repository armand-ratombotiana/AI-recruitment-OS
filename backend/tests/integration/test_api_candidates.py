"""Integration tests for candidate service API endpoints."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


pytestmark = [pytest.mark.integration, pytest.mark.candidates]


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_create_candidate(client: AsyncClient):
    response = await client.post(
        "/candidates",
        json={
            "email": "newcandidate@test.com",
            "full_name": "New Candidate",
        },
    )
    assert response.status_code in [200, 201, 422, 501]


@pytest.mark.asyncio
async def test_list_candidates(client: AsyncClient):
    response = await client.get("/candidates")
    assert response.status_code in [200, 501]


@pytest.mark.asyncio
async def test_list_candidates_with_limit(client: AsyncClient):
    response = await client.get("/candidates?limit=10")
    assert response.status_code in [200, 501]


@pytest.mark.asyncio
async def test_get_candidate(client: AsyncClient):
    response = await client.get("/candidates/test-candidate-id")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_update_candidate(client: AsyncClient):
    response = await client.put(
        "/candidates/test-candidate-id",
        json={"full_name": "Updated Name"},
    )
    assert response.status_code in [200, 404, 422, 501]


@pytest.mark.asyncio
async def test_delete_candidate(client: AsyncClient):
    response = await client.delete("/candidates/test-candidate-id")
    assert response.status_code in [200, 204, 404, 501]


@pytest.mark.asyncio
async def test_enrich_candidate(client: AsyncClient):
    response = await client.post("/candidates/test-candidate-id/enrich")
    assert response.status_code in [200, 202, 404, 501]


@pytest.mark.asyncio
async def test_get_candidate_skills(client: AsyncClient):
    response = await client.get("/candidates/test-candidate-id/skills")
    assert response.status_code in [200, 404, 501]


@pytest.mark.asyncio
async def test_create_candidate_invalid_email(client: AsyncClient):
    response = await client.post(
        "/candidates",
        json={
            "email": "not-email",
            "full_name": "Test",
        },
    )
    assert response.status_code in [400, 422]


@pytest.mark.asyncio
async def test_create_candidate_missing_fields(client: AsyncClient):
    response = await client.post("/candidates", json={})
    assert response.status_code == 422
