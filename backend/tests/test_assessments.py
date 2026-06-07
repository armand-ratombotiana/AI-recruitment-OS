"""Tests for the AI-powered assessment service.

Covers:

* CRUD over assessments (create / list / get / delete).
* AI question generation (LLM happy path + deterministic fallback).
* Auto-grading for MCQ, short answer, and free-form (text) responses.
* Submission lifecycle (status transitions, expiry, double-submit guard).
* Per-tenant isolation across create / list / get / submit / results.
* The :mod:`shared.assessments.generator` helpers in isolation so we can
  assert on the fallback bank and the keyword-overlap grader without a
  network round-trip.

Tests run against an in-process FastAPI app that mounts only the
assessment router, an in-memory SQLite database, and per-test JWTs.
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncGenerator
from unittest.mock import patch
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

from shared.assessments import generator as gen_mod  # noqa: E402
from shared.core.config import Settings  # noqa: E402
from shared.core.database import get_db_dependency  # noqa: E402
from shared.core.models.assessment import (  # noqa: E402
    Assessment,
    AssessmentStatus,
    Question,
    QuestionType,
    Answer,
)
from shared.core.models.candidate import Candidate, CandidateStatus  # noqa: E402
from shared.core.security import create_access_token  # noqa: E402


TENANT_A = "tenant-A"
TENANT_B = "tenant-B"


# ── Auth helpers ──────────────────────────────────────────────────────────────


def _make_token(tenant_id: str, sub: str = "user", role: str = "recruiter") -> str:
    return create_access_token(
        {
            "sub": sub,
            "email": f"{sub}@{tenant_id}.test",
            "role": role,
            "tenant_id": tenant_id,
        }
    )


def _auth(tenant_id: str = TENANT_A, sub: str = "user", role: str = "recruiter") -> dict[str, str]:
    return {"Authorization": f"Bearer {_make_token(tenant_id, sub, role)}"}


# ── DB / App fixtures ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def engine():
    """In-memory SQLite engine with the assessment tables pre-created."""
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    target_tables = [
        Assessment.__table__,
        Question.__table__,
        Answer.__table__,
        Candidate.__table__,
    ]
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all, tables=target_tables)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all, tables=target_tables)
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    """Expose the same session factory the app uses for direct DB writes."""
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture
async def app_client(engine, session_factory) -> AsyncGenerator[AsyncClient, None]:
    from apps.assessment_service import main as assessment_svc

    app = FastAPI()
    app.include_router(assessment_svc.router, prefix="/api/v1/assessments")

    # Pin settings so JWT decoding uses a deterministic secret.
    app.dependency_overrides[Settings] = lambda: Settings(
        SECRET_KEY="test-secret-key-that-is-at-least-32-chars-long!!",
        ENCRYPTION_KEY="test-encryption-key-that-is-at-least-32-chars!!",
        DATABASE_URL="sqlite+aiosqlite:///:memory:",
        DEBUG=False,
    )

    factory = session_factory

    async def _db_override():
        async with factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    app.dependency_overrides[get_db_dependency] = _db_override

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Domain fixtures ───────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def candidate_in_a(engine) -> Candidate:
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        cand = Candidate(
            id=str(uuid4()),
            tenant_id=TENANT_A,
            email="alice@example.com",
            full_name="Alice Anderson",
            status=CandidateStatus.NEW,
        )
        s.add(cand)
        await s.commit()
        await s.refresh(cand)
        return cand


# ── Force-fallback patch ──────────────────────────────────────────────────────


@pytest.fixture
def force_fallback():
    """Patch the LLM router to raise so the service falls back to the bank."""
    async def _raise(*args, **kwargs):
        raise RuntimeError("simulated LLM outage")

    with patch.object(gen_mod, "_generate_via_llm", side_effect=_raise):
        yield


# ── Health ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_assessment_service_health(app_client: AsyncClient):
    resp = await app_client.get("/api/v1/assessments/health", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"
    assert body["service"] == "assessments"


# ── Create / list / get / delete ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_assessment_with_fallback_bank(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    resp = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Python basics",
            "topic": "Python",
            "difficulty": "easy",
            "question_count": 4,
            "question_type": "mcq",
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["source"] == "fallback"
    assert body["generated"] == 4
    assert body["assessment"]["status"] == "ready"
    assert body["assessment"]["question_count"] == 4
    assert body["assessment"]["candidate_id"] == candidate_in_a.id
    # MCQ fallback has 4 options per question.
    for q in body["questions"]:
        assert q["type"] == "mcq"
        assert len(q["options"]) == 4
    assert body["assessment"]["max_score"] == 4.0


@pytest.mark.asyncio
async def test_create_assessment_with_mixed_questions(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    resp = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Mixed quiz",
            "topic": "Python",
            "question_count": 6,
            "question_type": "mixed",
        },
        headers=_auth(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    types = {q["type"] for q in body["questions"]}
    # Round-robin should include at least two different types.
    assert len(types) >= 2


@pytest.mark.asyncio
async def test_create_assessment_rejects_empty_title(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    resp = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "   ",
            "question_count": 1,
        },
        headers=_auth(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_assessment_rejects_invalid_question_type(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    resp = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Bad type",
            "question_type": "essay-like-thing",
            "question_count": 1,
        },
        headers=_auth(),
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_list_assessments_returns_tenant_scoped_rows(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    for n in range(3):
        resp = await app_client.post(
            "/api/v1/assessments/",
            json={
                "candidate_id": candidate_in_a.id,
                "title": f"Quiz {n}",
                "question_count": 2,
            },
            headers=_auth(),
        )
        assert resp.status_code == 201, resp.text

    listing = await app_client.get("/api/v1/assessments/", headers=_auth())
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 3
    assert len(body["data"]) == 3
    # Newest first
    titles = [row["title"] for row in body["data"]]
    assert titles[0] == "Quiz 2"


@pytest.mark.asyncio
async def test_get_assessment_includes_questions(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Details test",
            "question_count": 3,
            "question_type": "mcq",
        },
        headers=_auth(),
    )
    aid = create.json()["assessment"]["id"]

    resp = await app_client.get(f"/api/v1/assessments/{aid}", headers=_auth())
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == aid
    assert len(body["questions"]) == 3
    # Ordered by `order` ascending
    orders = [q["order"] for q in body["questions"]]
    assert orders == sorted(orders)


@pytest.mark.asyncio
async def test_get_assessment_not_found(app_client: AsyncClient):
    resp = await app_client.get(
        f"/api/v1/assessments/{uuid4()}", headers=_auth()
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_assessment_cascades(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Delete me",
            "question_count": 2,
        },
        headers=_auth(),
    )
    aid = create.json()["assessment"]["id"]

    delete = await app_client.delete(
        f"/api/v1/assessments/{aid}", headers=_auth()
    )
    assert delete.status_code == 200
    assert delete.json()["deleted"] is True

    # Re-fetching should 404.
    after = await app_client.get(f"/api/v1/assessments/{aid}", headers=_auth())
    assert after.status_code == 404


# ── Submission + auto-grading ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_submit_mcq_answers_auto_grades(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "MCQ test",
            "question_count": 2,
            "question_type": "mcq",
        },
        headers=_auth(),
    )
    body = create.json()
    aid = body["assessment"]["id"]
    questions = body["questions"]
    # The fallback MCQ bank stores the correct answer as the *second*
    # option in every prompt, so submitting the option at index 1 yields
    # a full-credit submission without leaking the reference answer.
    answers = [
        {"question_id": q["id"], "response": q["options"][1]}
        for q in questions
    ]
    submit = await app_client.post(
        f"/api/v1/assessments/{aid}/submit",
        json={"answers": answers},
        headers=_auth(),
    )
    assert submit.status_code == 200, submit.text
    payload = submit.json()
    assert payload["graded"] == 2
    assert payload["score"] == 2.0  # each question is worth 1 point
    assert payload["max_score"] == 2.0
    assert payload["status"] == "completed"
    for a in payload["answers"]:
        assert a["score"] == 1.0
        assert a["feedback"] == "Correct."

    # Re-submission should be blocked.
    again = await app_client.post(
        f"/api/v1/assessments/{aid}/submit",
        json={"answers": answers},
        headers=_auth(),
    )
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_submit_ignores_unknown_question_ids(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Skip unknown",
            "question_count": 1,
            "question_type": "mcq",
        },
        headers=_auth(),
    )
    aid = create.json()["assessment"]["id"]
    q = create.json()["questions"][0]

    submit = await app_client.post(
        f"/api/v1/assessments/{aid}/submit",
        json={
            "answers": [
                {"question_id": q["id"], "response": q["options"][1]},
                {"question_id": str(uuid4()), "response": "ignored"},
            ]
        },
        headers=_auth(),
    )
    assert submit.status_code == 200, submit.text
    payload = submit.json()
    assert payload["graded"] == 1


@pytest.mark.asyncio
async def test_submit_expired_assessment_returns_410(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback, session_factory
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Expired",
            "question_count": 1,
            "question_type": "mcq",
        },
        headers=_auth(),
    )
    aid = create.json()["assessment"]["id"]

    # Backdate the expiry so the service treats it as expired.
    async with session_factory() as s:
        from sqlalchemy import update
        await s.execute(
            update(Assessment)
            .where(Assessment.id == aid)
            .values(
                expires_at=(datetime.now(timezone.utc) - timedelta(days=1)).replace(tzinfo=None)
            )
        )
        await s.commit()

    q = create.json()["questions"][0]
    submit = await app_client.post(
        f"/api/v1/assessments/{aid}/submit",
        json={"answers": [{"question_id": q["id"], "response": q["options"][1]}]},
        headers=_auth(),
    )
    assert submit.status_code == 410


@pytest.mark.asyncio
async def test_get_results_returns_score_and_percentage(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Results test",
            "question_count": 2,
            "question_type": "mcq",
        },
        headers=_auth(),
    )
    aid = create.json()["assessment"]["id"]
    q = create.json()["questions"]
    submit = await app_client.post(
        f"/api/v1/assessments/{aid}/submit",
        json={"answers": [
            {"question_id": q[0]["id"], "response": q[0]["options"][1]},
            {"question_id": q[1]["id"], "response": q[1]["options"][0]},  # wrong
        ]},
        headers=_auth(),
    )
    assert submit.status_code == 200

    results = await app_client.get(
        f"/api/v1/assessments/{aid}/results", headers=_auth()
    )
    assert results.status_code == 200
    body = results.json()
    assert body["assessment"]["status"] == "completed"
    assert body["percentage"] == 50.0
    assert len(body["answers"]) == 2
    assert len(body["questions"]) == 2
    scores = sorted(a["score"] for a in body["answers"])
    assert scores == [0.0, 1.0]


# ── Tenant isolation ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_tenant_isolation_create_list_get(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create_a = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Tenant A only",
            "question_count": 2,
        },
        headers=_auth(TENANT_A),
    )
    assert create_a.status_code == 201
    aid = create_a.json()["assessment"]["id"]

    # Tenant B cannot see it via the list endpoint.
    listing_b = await app_client.get(
        "/api/v1/assessments/", headers=_auth(TENANT_B)
    )
    assert listing_b.status_code == 200
    assert listing_b.json()["total"] == 0

    # Tenant B cannot fetch it directly.
    detail_b = await app_client.get(
        f"/api/v1/assessments/{aid}", headers=_auth(TENANT_B)
    )
    assert detail_b.status_code == 404


@pytest.mark.asyncio
async def test_tenant_isolation_submit_and_results(
    app_client: AsyncClient, candidate_in_a: Candidate, force_fallback
):
    create = await app_client.post(
        "/api/v1/assessments/",
        json={
            "candidate_id": candidate_in_a.id,
            "title": "Cross-tenant submit",
            "question_count": 1,
            "question_type": "mcq",
        },
        headers=_auth(TENANT_A),
    )
    aid = create.json()["assessment"]["id"]
    q = create.json()["questions"][0]

    # Tenant B cannot submit on Tenant A's assessment.
    submit_b = await app_client.post(
        f"/api/v1/assessments/{aid}/submit",
        json={"answers": [{"question_id": q["id"], "response": q["options"][1]}]},
        headers=_auth(TENANT_B),
    )
    assert submit_b.status_code == 404

    # Tenant B cannot read Tenant A's results.
    results_b = await app_client.get(
        f"/api/v1/assessments/{aid}/results", headers=_auth(TENANT_B)
    )
    assert results_b.status_code == 404

    # Tenant B cannot delete Tenant A's assessment.
    delete_b = await app_client.delete(
        f"/api/v1/assessments/{aid}", headers=_auth(TENANT_B)
    )
    assert delete_b.status_code == 404


# ── Generator unit tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_questions_falls_back_when_llm_unavailable():
    with patch.object(gen_mod, "_generate_via_llm", side_effect=RuntimeError("offline")):
        questions, source = await gen_mod.generate_questions(
            topic="Python",
            count=3,
            difficulty="easy",
            type="mcq",
        )
    assert source == "fallback"
    assert len(questions) == 3
    assert all(q["type"] == "mcq" for q in questions)
    assert all(len(q["options"]) >= 2 for q in questions)


@pytest.mark.asyncio
async def test_generate_questions_uses_llm_when_available():
    payload_questions = [
        {
            "type": "mcq",
            "prompt": f"What is 2+2? #{i}",
            "options": ["3", "4", "5", "6"],
            "correct_answer": "4",
            "points": 1.0,
            "explanation": "Basic addition.",
        }
        for i in range(2)
    ]

    async def _fake_generate(**kwargs):
        return payload_questions

    with patch.object(gen_mod, "_generate_via_llm", side_effect=_fake_generate):
        questions, source = await gen_mod.generate_questions(
            topic="Math", count=2, difficulty="easy", type="mcq"
        )
    assert source == "llm"
    assert len(questions) == 2
    assert all(q["correct_answer"] == "4" for q in questions)


@pytest.mark.asyncio
async def test_generate_questions_normalises_unknown_types():
    with patch.object(gen_mod, "_generate_via_llm", side_effect=RuntimeError("offline")):
        questions, _ = await gen_mod.generate_questions(
            topic="Anything", count=2, difficulty="medium", type="weird_type"
        )
    assert all(q["type"] == "mcq" for q in questions)


@pytest.mark.asyncio
async def test_generate_questions_caps_count_to_max():
    with patch.object(gen_mod, "_generate_via_llm", side_effect=RuntimeError("offline")):
        questions, _ = await gen_mod.generate_questions(
            topic="X", count=1000, difficulty="easy", type="mcq"
        )
    # The fallback bank only has 7 MCQs — we never overflow it.
    assert len(questions) <= 7
    assert len(questions) >= 1


@pytest.mark.asyncio
async def test_grade_mcq_exact_match_scores_full_points():
    score, feedback = await gen_mod.grade_answer(
        question={
            "type": "mcq",
            "options": ["a", "b", "c"],
            "correct_answer": "b",
        },
        response="b",
        points=3.0,
    )
    assert score == 3.0
    assert feedback == "Correct."


@pytest.mark.asyncio
async def test_grade_mcq_index_based_answer_scores_full_points():
    score, feedback = await gen_mod.grade_answer(
        question={
            "type": "mcq",
            "options": ["a", "b", "c"],
            "correct_answer": "b",
        },
        response="2",
        points=3.0,
    )
    assert score == 3.0
    assert feedback == "Correct."


@pytest.mark.asyncio
async def test_grade_mcq_wrong_answer_scores_zero():
    score, feedback = await gen_mod.grade_answer(
        question={
            "type": "mcq",
            "options": ["a", "b", "c"],
            "correct_answer": "b",
        },
        response="c",
        points=3.0,
    )
    assert score == 0.0
    assert feedback == "Incorrect."


@pytest.mark.asyncio
async def test_grade_short_answer_with_keywords_scores_full_points():
    with patch.object(gen_mod, "_generate_via_llm", side_effect=RuntimeError("offline")):
        score, feedback = await gen_mod.grade_answer(
            question={
                "type": "short_answer",
                "prompt": "What is Python?",
                "correct_answer": "Python is a programming language used for building software and web applications.",
            },
            response="Python is a programming language used for building software and web applications.",
            points=4.0,
        )
    assert score == 4.0
    assert "Correct" in feedback or "expected" in feedback.lower()


@pytest.mark.asyncio
async def test_grade_short_answer_uses_llm_fallback_when_keywords_miss():
    with patch.object(gen_mod, "_generate_via_llm", side_effect=RuntimeError("offline")):
        score, _ = await gen_mod.grade_answer(
            question={
                "type": "short_answer",
                "prompt": "Explain X",
                "correct_answer": "X is a very specific technical term that appears nowhere else in this context.",
            },
            response="I think X is just a letter of the alphabet.",
            points=4.0,
        )
    # Keyword overlap is low, so score should be below full points.
    assert 0.0 <= score < 4.0


@pytest.mark.asyncio
async def test_grade_freeform_text_uses_llm_when_available():
    async def _fake_grade(question, response, points, *, tenant_id=None):
        return points * 0.8, "Strong answer with a clear structure."

    with patch.object(gen_mod, "_llm_grade", side_effect=_fake_grade):
        score, feedback = await gen_mod.grade_answer(
            question={
                "type": "text",
                "prompt": "Describe your favourite project.",
                "correct_answer": "A web app I built last year.",
            },
            response="I built a web app last year that solved a real problem.",
            points=5.0,
        )
    assert score == 4.0
    assert "Strong" in feedback


@pytest.mark.asyncio
async def test_grade_freeform_falls_back_to_lexical_score():
    with patch.object(gen_mod, "_llm_grade", side_effect=RuntimeError("offline")):
        score, feedback = await gen_mod.grade_answer(
            question={
                "type": "text",
                "prompt": "Describe your favourite project.",
                "correct_answer": "web application built with Flask",
            },
            response="A " + " ".join(["word"] * 100),  # long answer → high lexical score
            points=5.0,
        )
    # Lexical fallback caps at points.
    assert 0.0 < score <= 5.0
    assert "overlap" in feedback.lower() or "auto" in feedback.lower()


@pytest.mark.asyncio
async def test_grade_empty_response_scores_zero():
    score, feedback = await gen_mod.grade_answer(
        question={"type": "mcq", "options": ["a"], "correct_answer": "a"},
        response="   ",
        points=2.0,
    )
    assert score == 0.0
    assert "No answer" in feedback


def test_fallback_bank_topics_are_isolated():
    """Two different topics should produce different fallback questions."""
    a = gen_mod.fallback_questions(topic="Python", count=3, difficulty="easy", qtype="mcq")
    b = gen_mod.fallback_questions(topic="Rust", count=3, difficulty="easy", qtype="mcq")
    # Same generic prompts because the bank is parameterised only by the
    # topic name, but the IDs are unique per call.
    assert len(a) == len(b) == 3
    assert {q["id"] for q in a}.isdisjoint({q["id"] for q in b})


def test_extract_first_json_object_handles_code_fences():
    text = "```json\n{\"questions\": []}\n```"
    assert gen_mod._extract_first_json_object(text) == '{"questions": []}'


def test_extract_first_json_object_handles_nested_braces():
    text = 'noise {"a": {"b": 1}, "c": [1, 2, 3]} trailing'
    assert gen_mod._extract_first_json_object(text) == '{"a": {"b": 1}, "c": [1, 2, 3]}'


def test_keyword_overlap_zero_for_disjoint_sets():
    assert gen_mod._keyword_overlap("the quick brown fox", {"python", "flask"}) == 0.0


def test_keyword_overlap_full_for_identical_sets():
    assert gen_mod._keyword_overlap(
        "python flask django rest",
        {"python", "flask", "django", "rest"},
    ) == 1.0
