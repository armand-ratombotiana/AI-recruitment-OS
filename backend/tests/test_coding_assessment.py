"""Tests for the live coding assessment system."""
from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-at-least-32-chars-long!!")
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-that-is-at-least-32-chars!!")

from shared.coding.sandbox import CodeSandbox
from shared.core.models.coding_assessment import CodingProblem, CodingSubmission
from shared.core.security import create_access_token


def _auth_headers(tenant_id: str = "test-tenant") -> dict[str, str]:
    token = create_access_token({
        "sub": "test-user",
        "email": "test@test.com",
        "role": "recruiter",
        "tenant_id": tenant_id,
    })
    return {"Authorization": f"Bearer {token}"}


# ── Sandbox unit tests ────────────────────────────────────────────────────────


class TestCodeSandbox:
    def test_execute_python_code(self):
        sandbox = CodeSandbox()
        code = "print(2 + 3)"
        test_cases = [{"input": "", "expected": "5"}]

        result = sandbox.execute(code, "python", test_cases)
        assert result["status"] in ["passed", "failed"]
        assert "test_results" in result
        assert result["total_tests"] == 1

    def test_execute_with_error(self):
        sandbox = CodeSandbox()
        code = "print(undefined_variable)"
        test_cases = [{"input": "", "expected": ""}]

        result = sandbox.execute(code, "python", test_cases)
        assert result["test_results"][0]["passed"] is False

    def test_unsupported_language(self):
        sandbox = CodeSandbox()
        result = sandbox.execute("code", "ruby", [])
        assert result["status"] == "error"
        assert "not supported" in result["error"]

    def test_empty_test_cases(self):
        sandbox = CodeSandbox()
        result = sandbox.execute("print('hello')", "python", [])
        assert result["status"] == "passed"
        assert result["total_tests"] == 0
        assert result["passed_tests"] == 0

    def test_multiple_test_cases(self):
        sandbox = CodeSandbox()
        code = "x = int(input())\nprint(x * 2)"
        test_cases = [
            {"input": "5", "expected": "10"},
            {"input": "3", "expected": "6"},
        ]

        result = sandbox.execute(code, "python", test_cases)
        assert result["total_tests"] == 2
        assert "test_results" in result
        assert len(result["test_results"]) == 2

    def test_timeout_handling(self):
        sandbox = CodeSandbox()
        code = "import time\ntime.sleep(100)"
        test_cases = [{"input": "", "expected": ""}]

        result = sandbox.execute(code, "python", test_cases, timeout=2)
        assert result["status"] == "failed"
        assert result["test_results"][0]["passed"] is False


# ── API integration tests ─────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def coding_client():
    from fastapi import FastAPI
    from apps.coding_assessment.main import router

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/coding")
    app.dependency_overrides[
        __import__("shared.core.database", fromlist=["get_db_dependency"]).get_db_dependency
    ] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=_auth_headers()) as ac:
        yield ac

    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_problems_empty(coding_client: AsyncClient):
    response = await coding_client.get("/api/v1/coding/problems")
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_create_problem(coding_client: AsyncClient):
    response = await coding_client.post(
        "/api/v1/coding/problems",
        json={
            "title": "Two Sum",
            "description": "Find two numbers that add up to target",
            "difficulty": "easy",
            "test_cases": [{"input": "2,3", "expected": "5"}],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert data["title"] == "Two Sum"


@pytest.mark.asyncio
async def test_create_then_list_problems(coding_client: AsyncClient):
    await coding_client.post(
        "/api/v1/coding/problems",
        json={"title": "Problem A", "description": "Desc A"},
    )
    await coding_client.post(
        "/api/v1/coding/problems",
        json={"title": "Problem B", "description": "Desc B", "difficulty": "hard"},
    )

    response = await coding_client.get("/api/v1/coding/problems")
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_create_then_get_problem(coding_client: AsyncClient):
    create_resp = await coding_client.post(
        "/api/v1/coding/problems",
        json={
            "title": "Reverse String",
            "description": "Reverse a given string",
            "starter_code": {"python": "def reverse(s):\n    pass"},
        },
    )
    problem_id = create_resp.json()["id"]

    response = await coding_client.get(f"/api/v1/coding/problems/{problem_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Reverse String"
    assert "python" in data["starter_code"]


@pytest.mark.asyncio
async def test_get_nonexistent_problem(coding_client: AsyncClient):
    response = await coding_client.get(f"/api/v1/coding/problems/{uuid4()}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_submit_solution(coding_client: AsyncClient):
    create_resp = await coding_client.post(
        "/api/v1/coding/problems",
        json={
            "title": "Add Numbers",
            "description": "Add two numbers",
            "test_cases": [{"input": "", "expected": "5"}],
        },
    )
    problem_id = create_resp.json()["id"]

    response = await coding_client.post(
        "/api/v1/coding/submit",
        json={
            "problem_id": problem_id,
            "candidate_id": str(uuid4()),
            "code": "print(2 + 3)",
            "language": "python",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "submission_id" in data
    assert "summary" in data


@pytest.mark.asyncio
async def test_submit_to_nonexistent_problem(coding_client: AsyncClient):
    response = await coding_client.post(
        "/api/v1/coding/submit",
        json={
            "problem_id": str(uuid4()),
            "candidate_id": str(uuid4()),
            "code": "print(1)",
        },
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_submission(coding_client: AsyncClient):
    create_resp = await coding_client.post(
        "/api/v1/coding/problems",
        json={
            "title": "Test Problem",
            "description": "Test",
            "test_cases": [{"input": "", "expected": "1"}],
        },
    )
    problem_id = create_resp.json()["id"]

    submit_resp = await coding_client.post(
        "/api/v1/coding/submit",
        json={
            "problem_id": problem_id,
            "candidate_id": str(uuid4()),
            "code": "print(1)",
            "language": "python",
        },
    )
    submission_id = submit_resp.json()["submission_id"]

    response = await coding_client.get(f"/api/v1/coding/submissions/{submission_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == submission_id
    assert data["language"] == "python"


@pytest.mark.asyncio
async def test_get_nonexistent_submission(coding_client: AsyncClient):
    response = await coding_client.get(f"/api/v1/coding/submissions/{uuid4()}")
    assert response.status_code == 404
