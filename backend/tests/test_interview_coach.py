"""Tests for the Interview Coach feature."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from shared.interview_coach.engine import InterviewCoach


@pytest.fixture
def coach() -> InterviewCoach:
    return InterviewCoach()


class TestFallbackQuestions:
    def test_technical_fallback(self, coach: InterviewCoach) -> None:
        questions = coach._fallback_questions("technical", 3)
        assert len(questions) == 3
        assert "question" in questions[0]
        assert "looking_for" in questions[0]
        assert "sample_answer" in questions[0]
        assert "red_flags" in questions[0]

    def test_behavioral_fallback(self, coach: InterviewCoach) -> None:
        questions = coach._fallback_questions("behavioral", 2)
        assert len(questions) == 2
        assert "conflict" in questions[0]["question"].lower()

    def test_hr_fallback(self, coach: InterviewCoach) -> None:
        questions = coach._fallback_questions("hr", 1)
        assert len(questions) == 1

    def test_unknown_type_defaults_to_technical(self, coach: InterviewCoach) -> None:
        questions = coach._fallback_questions("unknown_type", 2)
        assert len(questions) == 2


class TestFallbackEvaluation:
    def test_fallback_evaluation_structure(self, coach: InterviewCoach) -> None:
        ev = coach._fallback_evaluation()
        assert "score" in ev
        assert "strengths" in ev
        assert "weaknesses" in ev
        assert "improvements" in ev
        assert "overall_feedback" in ev
        assert 1 <= ev["score"] <= 10


class TestFallbackPrep:
    def test_fallback_prep_structure(self, coach: InterviewCoach) -> None:
        prep = coach._fallback_prep()
        assert "key_topics" in prep
        assert "common_questions" in prep
        assert "company_research_points" in prep
        assert "questions_to_ask" in prep
        assert "tips" in prep
        assert len(prep["key_topics"]) >= 1


class TestEngineAsync:
    @pytest.mark.asyncio
    async def test_generate_practice_questions_llm_success(self, coach: InterviewCoach) -> None:
        mock_resp = AsyncMock()
        mock_resp.content = '[{"question":"Q1","looking_for":"L1","sample_answer":"A1","red_flags":["R1"]}]'
        with patch.object(coach.llm, "complete", return_value=mock_resp):
            result = await coach.generate_practice_questions(
                job_title="Engineer",
                job_description="Build stuff",
                interview_type="technical",
                count=1,
            )
        assert len(result) == 1
        assert result[0]["question"] == "Q1"

    @pytest.mark.asyncio
    async def test_generate_practice_questions_llm_failure_fallback(self, coach: InterviewCoach) -> None:
        with patch.object(coach.llm, "complete", side_effect=RuntimeError("boom")):
            result = await coach.generate_practice_questions(
                job_title="Engineer",
                job_description="Build stuff",
                interview_type="technical",
                count=2,
            )
        assert len(result) == 2
        assert "question" in result[0]

    @pytest.mark.asyncio
    async def test_evaluate_answer_llm_success(self, coach: InterviewCoach) -> None:
        mock_resp = AsyncMock()
        mock_resp.content = '{"score":8,"strengths":["Good"],"weaknesses":["Brief"],"improvements":["More detail"],"overall_feedback":"Nice"}'
        with patch.object(coach.llm, "complete", return_value=mock_resp):
            result = await coach.evaluate_answer(
                question="Tell me about yourself",
                candidate_answer="I am a developer.",
                job_context="Senior role",
            )
        assert result["score"] == 8
        assert "strengths" in result

    @pytest.mark.asyncio
    async def test_evaluate_answer_llm_failure_fallback(self, coach: InterviewCoach) -> None:
        with patch.object(coach.llm, "complete", side_effect=RuntimeError("boom")):
            result = await coach.evaluate_answer(
                question="Q",
                candidate_answer="A",
                job_context="ctx",
            )
        assert result["score"] == 5
        assert "overall_feedback" in result

    @pytest.mark.asyncio
    async def test_generate_interview_prep_llm_success(self, coach: InterviewCoach) -> None:
        mock_resp = AsyncMock()
        mock_resp.content = '{"key_topics":["T1"],"common_questions":["Q1"],"company_research_points":["C1"],"questions_to_ask":["A1"],"tips":["Tip1"]}'
        with patch.object(coach.llm, "complete", return_value=mock_resp):
            result = await coach.generate_interview_prep(
                job_title="PM",
                company_info="AI startup",
                interview_type="behavioral",
            )
        assert "key_topics" in result
        assert result["key_topics"] == ["T1"]

    @pytest.mark.asyncio
    async def test_generate_interview_prep_llm_failure_fallback(self, coach: InterviewCoach) -> None:
        with patch.object(coach.llm, "complete", side_effect=RuntimeError("boom")):
            result = await coach.generate_interview_prep(
                job_title="PM",
                company_info="AI startup",
                interview_type="behavioral",
            )
        assert "tips" in result


class TestEndpoints:
    @pytest.mark.asyncio
    async def test_practice_questions_endpoint(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from main import app
        from shared.core.security import create_access_token
        from shared.ai.llm_router import LLMRouter

        token = create_access_token({"sub": "test", "email": "t@t.com", "role": "recruiter", "tenant_id": "test-tenant"})
        headers = {"Authorization": f"Bearer {token}"}

        mock_resp = AsyncMock()
        mock_resp.content = '[{"question":"Q1","looking_for":"L1","sample_answer":"A1","red_flags":["R1"]}]'

        with patch.object(LLMRouter, "complete", return_value=mock_resp):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
                response = await client.post(
                    "/api/v1/interview-coach/practice-questions",
                    json={"job_title": "Engineer", "interview_type": "technical", "count": 1},
                )
        assert response.status_code == 200
        data = response.json()
        assert "questions" in data
        assert data["job_title"] == "Engineer"

    @pytest.mark.asyncio
    async def test_evaluate_answer_endpoint(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from main import app
        from shared.core.security import create_access_token
        from shared.ai.llm_router import LLMRouter

        token = create_access_token({"sub": "test", "email": "t@t.com", "role": "recruiter", "tenant_id": "test-tenant"})
        headers = {"Authorization": f"Bearer {token}"}

        mock_resp = AsyncMock()
        mock_resp.content = '{"score":7,"strengths":["Clear"],"weaknesses":["Brief"],"improvements":["Detail"],"overall_feedback":"OK"}'

        with patch.object(LLMRouter, "complete", return_value=mock_resp):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
                response = await client.post(
                    "/api/v1/interview-coach/evaluate-answer",
                    json={"question": "Q?", "answer": "A.", "job_context": "ctx"},
                )
        assert response.status_code == 200
        data = response.json()
        assert "score" in data

    @pytest.mark.asyncio
    async def test_prep_guide_endpoint(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from main import app
        from shared.core.security import create_access_token
        from shared.ai.llm_router import LLMRouter

        token = create_access_token({"sub": "test", "email": "t@t.com", "role": "recruiter", "tenant_id": "test-tenant"})
        headers = {"Authorization": f"Bearer {token}"}

        mock_resp = AsyncMock()
        mock_resp.content = '{"key_topics":["T"],"common_questions":["Q"],"company_research_points":["C"],"questions_to_ask":["A"],"tips":["Tip"]}'

        with patch.object(LLMRouter, "complete", return_value=mock_resp):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
                response = await client.post(
                    "/api/v1/interview-coach/prep-guide",
                    json={"job_title": "PM", "interview_type": "behavioral"},
                )
        assert response.status_code == 200
        data = response.json()
        assert "prep_guide" in data

    @pytest.mark.asyncio
    async def test_evaluate_answer_missing_fields(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from main import app
        from shared.core.security import create_access_token

        token = create_access_token({"sub": "test", "email": "t@t.com", "role": "recruiter", "tenant_id": "test-tenant"})
        headers = {"Authorization": f"Bearer {token}"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test", headers=headers) as client:
            response = await client.post(
                "/api/v1/interview-coach/evaluate-answer",
                json={"question": ""},
            )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_unauthorized_returns_401(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from main import app

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/v1/interview-coach/practice-questions",
                json={"job_title": "Engineer"},
            )
        assert response.status_code in (401, 403)
