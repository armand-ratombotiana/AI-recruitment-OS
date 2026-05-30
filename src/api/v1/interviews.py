"""Interview API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.session import get_db_dependency
from src.domain.interview.models import InterviewCreate, InterviewRead, InterviewFeedbackCreate

router = APIRouter(prefix="/interviews")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_interview(data: InterviewCreate, db: AsyncSession = Depends(get_db_dependency)):
    """Schedule a new interview."""
    pass


@router.get("/")
async def list_interviews(
    candidate_id: str | None = None,
    job_id: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    interview_type: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
):
    """List interviews with filtering."""
    pass


@router.get("/{interview_id}", response_model=InterviewRead)
async def get_interview(interview_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get interview details."""
    pass


@router.post("/{interview_id}/start")
async def start_interview(interview_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Start an interview session — initializes AI agent if AI interview."""
    pass


@router.post("/{interview_id}/complete")
async def complete_interview(interview_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Complete an interview and trigger evaluation."""
    pass


@router.post("/{interview_id}/feedback")
async def submit_feedback(
    interview_id: str,
    data: InterviewFeedbackCreate,
    db: AsyncSession = Depends(get_db_dependency),
):
    """Submit interview feedback (human or AI-generated)."""
    pass


@router.get("/{interview_id}/transcript")
async def get_transcript(interview_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get interview transcript (for AI interviews)."""
    pass
