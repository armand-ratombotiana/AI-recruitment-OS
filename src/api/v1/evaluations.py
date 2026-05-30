"""Evaluation API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.session import get_db_dependency
from src.domain.evaluation.models import EvaluationCreate, EvaluationRead

router = APIRouter(prefix="/evaluations")


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_evaluation(data: EvaluationCreate, db: AsyncSession = Depends(get_db_dependency)):
    """Start an AI-powered evaluation."""
    pass


@router.get("/{evaluation_id}", response_model=EvaluationRead)
async def get_evaluation(evaluation_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get evaluation result."""
    pass


@router.get("/{evaluation_id}/explain")
async def explain_evaluation(evaluation_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get detailed explanation of evaluation reasoning."""
    pass


@router.get("/candidates/{candidate_id}/evaluations")
async def get_candidate_evaluations(
    candidate_id: str,
    evaluation_type: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
):
    """Get all evaluations for a candidate."""
    pass


@router.post("/compare")
async def compare_candidates(
    candidate_ids: list[str],
    job_id: str | None = None,
    db: AsyncSession = Depends(get_db_dependency),
):
    """Compare multiple candidates for a role."""
    pass
