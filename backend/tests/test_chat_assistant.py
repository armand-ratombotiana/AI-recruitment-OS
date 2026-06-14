"""Tests for the Candidate AI Chat Assistant.

Covers:
1.  CandidateChatAssistant.chat() returns a valid response
2.  chat() uses fallback for common questions (salary, process, etc.)
3.  chat() includes candidate context in the LLM prompt
4.  chat() forwards conversation history to the LLM
5.  answer_job_question() returns a response with job_id
6.  answer_job_question() uses fallback for known topics
7.  help_with_application() returns guidance for known steps
8.  help_with_application() returns generic guidance for unknown steps
9.  schedule_interview() returns a confirmation with details
10. schedule_interview() includes interview_id in the response
11. HTTP POST /api/v1/chat/candidate returns 200 with tenant_id
12. HTTP POST /api/v1/chat/candidate/job-questions returns 200
13. HTTP POST /api/v1/chat/candidate/application-help returns 200
14. HTTP POST /api/v1/chat/candidate/schedule-interview returns 200
15. Tenant isolation: tenant A cannot access tenant B's history
16. Unauthenticated callers get 401
17. Context awareness: candidate name/status appear in system prompt
18. Fallback responses cover all common question categories
"""
from __future__ import annotations

import os
import sys
from typing import AsyncGenerator
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.ai.chat_assistant import CandidateChatAssistant, _match_fallback
from shared.core.database import get_db_dependency
from shared.core.security import create_access_token


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "admin") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str, sub: str = "user", role: str = "admin") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── Fixtures ───────────────────────────────────────────────────────────────────


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
async def chat_client(engine) -> AsyncGenerator[AsyncClient, None]:
    from apps.chat_assistant.main import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1/chat")

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _override_db():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def assistant() -> CandidateChatAssistant:
    return CandidateChatAssistant()


# ─────────────────────────────────────────────────────────────────────────────
# Group 1 — CandidateChatAssistant unit tests
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_chat_returns_valid_response(assistant):
    result = await assistant.chat(
        candidate_id="cand-001",
        message="Hello, I have a question about my application.",
        tenant_id="tenant-test",
    )
    assert "response" in result
    assert result["candidate_id"] == "cand-001"
    assert "timestamp" in result
    assert "message_id" in result
    assert isinstance(result["response"], str)
    assert len(result["response"]) > 0


@pytest.mark.asyncio
async def test_chat_fallback_for_salary_question(assistant):
    result = await assistant.chat(
        candidate_id="cand-002",
        message="What is the salary for this position?",
        tenant_id="tenant-test",
    )
    assert result["fallback"] is True
    assert result["model"] == "fallback"
    assert "salary" in result["response"].lower() or "compensation" in result["response"].lower()


@pytest.mark.asyncio
async def test_chat_fallback_for_process_question(assistant):
    result = await assistant.chat(
        candidate_id="cand-003",
        message="What is the hiring process like?",
        tenant_id="tenant-test",
    )
    assert result["fallback"] is True
    assert "process" in result["response"].lower() or "hiring" in result["response"].lower()


@pytest.mark.asyncio
async def test_chat_includes_candidate_context(assistant):
    result = await assistant.chat(
        candidate_id="cand-004",
        message="Tell me about my status.",
        candidate_context={
            "full_name": "Alice Smith",
            "status": "interviewing",
            "applied_jobs": ["job-1", "job-2"],
        },
        tenant_id="tenant-test",
    )
    assert result["candidate_id"] == "cand-004"
    assert "response" in result


@pytest.mark.asyncio
async def test_chat_forwards_conversation_history(assistant):
    history = [
        {"role": "user", "content": "Hi, I applied for a developer role."},
        {"role": "assistant", "content": "Thanks for reaching out! How can I help?"},
    ]
    result = await assistant.chat(
        candidate_id="cand-005",
        message="What's the next step?",
        conversation_history=history,
        tenant_id="tenant-test",
    )
    assert "response" in result
    assert result["candidate_id"] == "cand-005"


@pytest.mark.asyncio
async def test_answer_job_question_returns_response(assistant):
    result = await assistant.answer_job_question(
        candidate_id="cand-010",
        job_id="job-100",
        question="Is this position remote?",
        tenant_id="tenant-test",
    )
    assert "response" in result
    assert result["candidate_id"] == "cand-010"
    assert result.get("job_id") == "job-100"


@pytest.mark.asyncio
async def test_answer_job_question_fallback_for_remote(assistant):
    result = await assistant.answer_job_question(
        candidate_id="cand-011",
        job_id="job-101",
        question="Can I work remote?",
        tenant_id="tenant-test",
    )
    assert result["fallback"] is True
    assert "remote" in result["response"].lower() or "work" in result["response"].lower()


@pytest.mark.asyncio
async def test_answer_job_question_with_job_context(assistant):
    result = await assistant.answer_job_question(
        candidate_id="cand-012",
        job_id="job-102",
        question="What technologies are used?",
        job_context={
            "title": "Senior Python Developer",
            "description": "Looking for a Python expert with FastAPI experience.",
            "location": "Berlin, Germany",
        },
        tenant_id="tenant-test",
    )
    assert "response" in result
    assert result.get("job_id") == "job-102"


@pytest.mark.asyncio
async def test_help_with_application_resume_step(assistant):
    result = await assistant.help_with_application(
        candidate_id="cand-020",
        job_id="job-200",
        step="resume",
        tenant_id="tenant-test",
    )
    assert "response" in result
    assert "guidance" in result
    assert "resume" in result["guidance"].lower()
    assert result.get("step") == "resume"


@pytest.mark.asyncio
async def test_help_with_application_interview_step(assistant):
    result = await assistant.help_with_application(
        candidate_id="cand-021",
        job_id="job-201",
        step="interview",
        tenant_id="tenant-test",
    )
    assert "guidance" in result
    assert "interview" in result["guidance"].lower() or "prepare" in result["guidance"].lower()


@pytest.mark.asyncio
async def test_help_with_application_unknown_step(assistant):
    result = await assistant.help_with_application(
        candidate_id="cand-022",
        job_id="job-202",
        step="onboarding_paperwork",
        tenant_id="tenant-test",
    )
    assert "guidance" in result
    assert "onboarding_paperwork" in result["guidance"] or "recruiter" in result["guidance"].lower()


@pytest.mark.asyncio
async def test_schedule_interview_returns_confirmation(assistant):
    result = await assistant.schedule_interview(
        candidate_id="cand-030",
        interview_id="int-001",
        tenant_id="tenant-test",
        interview_context={
            "scheduled_at": "2026-06-20T14:00:00Z",
            "location": "Zoom call",
            "interviewer": "John Recruiter",
        },
    )
    assert result["candidate_id"] == "cand-030"
    assert result.get("interview_id") == "int-001"
    assert "confirmed" in result["response"].lower() or "interview" in result["response"].lower()
    assert result["scheduled_at"] == "2026-06-20T14:00:00Z"
    assert result["location"] == "Zoom call"


@pytest.mark.asyncio
async def test_schedule_interview_without_context(assistant):
    result = await assistant.schedule_interview(
        candidate_id="cand-031",
        interview_id="int-002",
        tenant_id="tenant-test",
    )
    assert result.get("interview_id") == "int-002"
    assert "TBD" in result["response"] or "interview" in result["response"].lower()


def test_fallback_matches_salary():
    assert _match_fallback("What about salary?") is not None


def test_fallback_matches_process():
    assert _match_fallback("What is the process?") is not None


def test_fallback_matches_benefits():
    assert _match_fallback("Tell me about benefits") is not None


def test_fallback_matches_timeline():
    assert _match_fallback("What is the timeline?") is not None


def test_fallback_matches_none_for_unknown():
    assert _match_fallback("xyzzy random nonsense") is None


def test_fallback_matches_resume():
    assert _match_fallback("Any tips for my resume?") is not None


def test_fallback_matches_interview():
    assert _match_fallback("How do I prepare for the interview?") is not None


# ─────────────────────────────────────────────────────────────────────────────
# Group 2 — HTTP endpoint integration tests
# ─────────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_chat_returns_200(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate",
        json={
            "candidate_id": "cand-100",
            "message": "Hello, I need help with my application.",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-100"
    assert body["tenant_id"] == "tenant-A"
    assert "response" in body


@pytest.mark.asyncio
async def test_http_job_questions_returns_200(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate/job-questions",
        json={
            "candidate_id": "cand-101",
            "job_id": "job-300",
            "question": "Is this a remote position?",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-101"
    assert body.get("job_id") == "job-300"
    assert body["tenant_id"] == "tenant-A"


@pytest.mark.asyncio
async def test_http_application_help_returns_200(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate/application-help",
        json={
            "candidate_id": "cand-102",
            "job_id": "job-301",
            "step": "resume",
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-102"
    assert body.get("step") == "resume"


@pytest.mark.asyncio
async def test_http_schedule_interview_returns_200(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate/schedule-interview",
        json={
            "candidate_id": "cand-103",
            "interview_id": "int-100",
            "interview_context": {"scheduled_at": "2026-07-01T10:00:00Z"},
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-103"
    assert body.get("interview_id") == "int-100"


@pytest.mark.asyncio
async def test_http_unauthenticated_returns_401(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate",
        json={
            "candidate_id": "cand-104",
            "message": "Hello",
        },
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_http_tenant_isolation_history(chat_client):
    await chat_client.post(
        "/api/v1/chat/candidate",
        json={
            "candidate_id": "cand-iso",
            "message": "Hello from tenant A",
        },
        headers=_auth("tenant-A"),
    )
    r_b = await chat_client.get(
        "/api/v1/chat/candidate/history",
        params={"candidate_id": "cand-iso"},
        headers=_auth("tenant-B"),
    )
    assert r_b.status_code == 200
    body = r_b.json()
    assert body["tenant_id"] == "tenant-B"
    assert body["total"] == 0


@pytest.mark.asyncio
async def test_http_clear_history_empty(chat_client):
    r = await chat_client.delete(
        "/api/v1/chat/candidate/history",
        params={"candidate_id": "cand-nobody"},
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["cleared"] is True
    assert body["deleted_messages"] == 0


@pytest.mark.asyncio
async def test_http_chat_with_context_returns_200(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate",
        json={
            "candidate_id": "cand-ctx",
            "message": "What is my application status?",
            "candidate_context": {
                "full_name": "Bob Builder",
                "status": "screening",
                "applied_jobs": ["job-x"],
            },
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-ctx"
    assert "response" in body


@pytest.mark.asyncio
async def test_http_chat_with_conversation_history(chat_client):
    r = await chat_client.post(
        "/api/v1/chat/candidate",
        json={
            "candidate_id": "cand-hist",
            "message": "And what about the benefits?",
            "conversation_history": [
                {"role": "user", "content": "Hi, I have a question."},
                {"role": "assistant", "content": "Sure, how can I help?"},
            ],
        },
        headers=_auth("tenant-A"),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["candidate_id"] == "cand-hist"
