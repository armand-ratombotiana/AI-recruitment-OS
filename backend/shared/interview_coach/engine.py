"""AI-powered interview coaching engine."""
from __future__ import annotations

import json
import logging
from typing import Any

from shared.ai.llm_router import LLMRouter

logger = logging.getLogger("interview_coach.engine")


class InterviewCoach:
    """Provides AI-powered interview preparation and evaluation."""

    def __init__(self) -> None:
        self.llm = LLMRouter()

    async def generate_practice_questions(
        self,
        job_title: str,
        job_description: str,
        interview_type: str = "technical",
        count: int = 5,
    ) -> list[dict[str, Any]]:
        prompt = (
            f"Generate {count} {interview_type} interview questions for a {job_title} position.\n\n"
            f"Job Description:\n{job_description}\n\n"
            "For each question, provide:\n"
            "1. The question text\n"
            "2. What the interviewer is looking for\n"
            "3. A sample good answer\n"
            "4. Red flags to avoid\n\n"
            "Return as JSON array:\n"
            '[{"question":"...","looking_for":"...","sample_answer":"...","red_flags":["...","..."]}]'
        )
        try:
            resp = await self.llm.complete(
                [{"role": "user", "content": prompt}],
                temperature=0.7,
            )
            return json.loads(resp.content)
        except Exception as exc:
            logger.warning("LLM generate_practice_questions failed: %s", exc)
            return self._fallback_questions(interview_type, count)

    async def evaluate_answer(
        self,
        question: str,
        candidate_answer: str,
        job_context: str,
    ) -> dict[str, Any]:
        prompt = (
            f"Evaluate this interview answer.\n\n"
            f"Question: {question}\n\n"
            f"Candidate's Answer: {candidate_answer}\n\n"
            f"Job Context: {job_context}\n\n"
            'Provide feedback in JSON format:\n'
            '{"score":1-10,"strengths":["..."],"weaknesses":["..."],"improvements":["..."],"overall_feedback":"..."}'
        )
        try:
            resp = await self.llm.complete(
                [{"role": "user", "content": prompt}],
                temperature=0.3,
            )
            return json.loads(resp.content)
        except Exception as exc:
            logger.warning("LLM evaluate_answer failed: %s", exc)
            return self._fallback_evaluation()

    async def generate_interview_prep(
        self,
        job_title: str,
        company_info: str,
        interview_type: str,
    ) -> dict[str, Any]:
        prompt = (
            f"Create an interview preparation guide for a {job_title} position.\n\n"
            f"Company Info: {company_info}\n"
            f"Interview Type: {interview_type}\n\n"
            "Provide in JSON format:\n"
            '{"key_topics":["..."],"common_questions":["..."],"company_research_points":["..."],"questions_to_ask":["..."],"tips":["..."]}'
        )
        try:
            resp = await self.llm.complete(
                [{"role": "user", "content": prompt}],
                temperature=0.5,
            )
            return json.loads(resp.content)
        except Exception as exc:
            logger.warning("LLM generate_interview_prep failed: %s", exc)
            return self._fallback_prep()

    def _fallback_questions(self, interview_type: str, count: int) -> list[dict[str, Any]]:
        base: dict[str, list[dict[str, Any]]] = {
            "technical": [
                {
                    "question": "Tell me about a challenging technical problem you solved.",
                    "looking_for": "Problem-solving approach, technical depth",
                    "sample_answer": "I encountered a performance issue...",
                    "red_flags": ["Vague description", "No metrics"],
                }
            ],
            "behavioral": [
                {
                    "question": "Describe a time you had a conflict with a teammate.",
                    "looking_for": "Communication skills, resolution approach",
                    "sample_answer": "During a project, my teammate and I disagreed...",
                    "red_flags": ["Blaming others", "No resolution"],
                }
            ],
            "hr": [
                {
                    "question": "Why are you interested in this position?",
                    "looking_for": "Motivation, company research",
                    "sample_answer": "I'm excited about this role because...",
                    "red_flags": ["Generic answer", "No company research"],
                }
            ],
        }
        questions = base.get(interview_type, base["technical"])
        return (questions * count)[:count] if count else questions

    def _fallback_evaluation(self) -> dict[str, Any]:
        return {
            "score": 5,
            "strengths": ["Clear communication"],
            "weaknesses": ["Could use more specific examples"],
            "improvements": ["Add quantifiable results", "Include more context"],
            "overall_feedback": "Good answer but could be strengthened with specific examples and metrics.",
        }

    def _fallback_prep(self) -> dict[str, Any]:
        return {
            "key_topics": ["Core technologies", "Company products", "Industry trends"],
            "common_questions": ["Tell me about yourself", "Why this company?", "Technical challenges"],
            "company_research_points": ["Recent news", "Products/services", "Company culture"],
            "questions_to_ask": ["Team structure?", "Tech stack?", "Growth opportunities?"],
            "tips": ["Research the company", "Prepare examples", "Ask thoughtful questions"],
        }
