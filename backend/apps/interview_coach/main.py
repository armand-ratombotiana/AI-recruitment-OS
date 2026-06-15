"""Interview Coach service — AI-powered practice questions, evaluation, and prep guides."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.auth import require_tenant_id
from shared.interview_coach.engine import InterviewCoach

router = APIRouter()

_coach = InterviewCoach()


class PracticeQuestionsRequest(BaseModel):
    job_title: str = Field(default="Software Engineer")
    job_description: str = Field(default="")
    interview_type: str = Field(default="technical")
    count: int = Field(default=5, ge=1, le=20)


class EvaluateAnswerRequest(BaseModel):
    question: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)
    job_context: str = Field(default="")


class PrepGuideRequest(BaseModel):
    job_title: str = Field(default="Software Engineer")
    company_info: str = Field(default="")
    interview_type: str = Field(default="technical")


@router.post("/practice-questions")
async def get_practice_questions(
    data: PracticeQuestionsRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    questions = await _coach.generate_practice_questions(
        job_title=data.job_title,
        job_description=data.job_description,
        interview_type=data.interview_type,
        count=data.count,
    )
    return {
        "job_title": data.job_title,
        "interview_type": data.interview_type,
        "questions": questions,
    }


@router.post("/evaluate-answer")
async def evaluate_answer(
    data: EvaluateAnswerRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    evaluation = await _coach.evaluate_answer(
        question=data.question,
        candidate_answer=data.answer,
        job_context=data.job_context,
    )
    return evaluation


@router.post("/prep-guide")
async def get_prep_guide(
    data: PrepGuideRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    prep = await _coach.generate_interview_prep(
        job_title=data.job_title,
        company_info=data.company_info,
        interview_type=data.interview_type,
    )
    return {
        "job_title": data.job_title,
        "interview_type": data.interview_type,
        "prep_guide": prep,
    }
