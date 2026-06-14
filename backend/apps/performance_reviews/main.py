"""Performance Reviews service — CRUD for reviews, questions, and cycles."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_member, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.performance_review import (
    PerformanceReview,
    PerformanceReviewCreate,
    PerformanceReviewListResponse,
    PerformanceReviewRead,
    PerformanceReviewUpdate,
    ReviewAnswer,
    ReviewAnswerRead,
    ReviewCycle,
    ReviewCycleCreate,
    ReviewCycleListResponse,
    ReviewCycleRead,
    ReviewQuestion,
    ReviewQuestionCreate,
    ReviewQuestionListResponse,
    ReviewQuestionRead,
    ReviewStatus,
)

logger = logging.getLogger("ai.performance_reviews.service")

router = APIRouter()


def _utcnow() -> datetime:
    from datetime import timezone
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _load_review(
    db: AsyncSession, review_id: str, tenant_id: str
) -> PerformanceReview:
    result = await db.execute(
        select(PerformanceReview).where(
            PerformanceReview.id == review_id,
            PerformanceReview.tenant_id == tenant_id,
        )
    )
    review = result.scalar_one_or_none()
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"PerformanceReview {review_id} not found",
        )
    return review


def _review_to_read(r: PerformanceReview) -> PerformanceReviewRead:
    return PerformanceReviewRead(
        id=r.id,
        tenant_id=r.tenant_id,
        reviewee_id=r.reviewee_id,
        reviewer_id=r.reviewer_id,
        review_cycle=r.review_cycle,
        status=r.status,
        overall_score=r.overall_score,
        strengths=r.strengths,
        improvements=r.improvements,
        goals=r.goals,
        created_at=r.created_at,
        submitted_at=r.submitted_at,
        completed_at=r.completed_at,
    )


def _question_to_read(q: ReviewQuestion) -> ReviewQuestionRead:
    return ReviewQuestionRead(
        id=q.id,
        tenant_id=q.tenant_id,
        category=q.category,
        question_text=q.question_text,
        question_type=q.question_type,
        weight=q.weight,
        required=q.required,
        order=q.order,
        created_at=q.created_at,
    )


def _answer_to_read(a: ReviewAnswer) -> ReviewAnswerRead:
    return ReviewAnswerRead(
        id=a.id,
        review_id=a.review_id,
        question_id=a.question_id,
        rating=a.rating,
        text_response=a.text_response,
        created_at=a.created_at,
    )


def _cycle_to_read(c: ReviewCycle) -> ReviewCycleRead:
    return ReviewCycleRead(
        id=c.id,
        tenant_id=c.tenant_id,
        name=c.name,
        start_date=c.start_date,
        end_date=c.end_date,
        status=c.status,
        created_at=c.created_at,
    )


@router.get("/health", tags=["PerformanceReviews"], summary="Health check")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "performance_reviews"}


@router.post(
    "/",
    response_model=PerformanceReviewRead,
    status_code=status.HTTP_201_CREATED,
    tags=["PerformanceReviews"],
    summary="Create a performance review",
)
async def create_review(
    payload: PerformanceReviewCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> PerformanceReviewRead:
    review = PerformanceReview(
        tenant_id=tenant_id,
        reviewee_id=payload.reviewee_id,
        reviewer_id=payload.reviewer_id,
        review_cycle=payload.review_cycle,
        strengths=payload.strengths,
        improvements=payload.improvements,
        goals=payload.goals,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    logger.info("performance_reviews.created tenant=%s id=%s", tenant_id, review.id)
    return _review_to_read(review)


@router.get(
    "/",
    response_model=PerformanceReviewListResponse,
    tags=["PerformanceReviews"],
    summary="List performance reviews",
)
async def list_reviews(
    status_filter: str | None = Query(default=None, alias="status"),
    reviewee_id: str | None = Query(default=None),
    reviewer_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> PerformanceReviewListResponse:
    stmt = select(PerformanceReview).where(PerformanceReview.tenant_id == tenant_id)
    count_stmt = select(PerformanceReview).where(PerformanceReview.tenant_id == tenant_id)
    if status_filter:
        stmt = stmt.where(PerformanceReview.status == status_filter)
        count_stmt = count_stmt.where(PerformanceReview.status == status_filter)
    if reviewee_id:
        stmt = stmt.where(PerformanceReview.reviewee_id == reviewee_id)
        count_stmt = count_stmt.where(PerformanceReview.reviewee_id == reviewee_id)
    if reviewer_id:
        stmt = stmt.where(PerformanceReview.reviewer_id == reviewer_id)
        count_stmt = count_stmt.where(PerformanceReview.reviewer_id == reviewer_id)
    rows = (
        await db.execute(
            stmt.order_by(PerformanceReview.created_at.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()
    total = len(
        (await db.execute(count_stmt)).scalars().all()
    )
    return PerformanceReviewListResponse(
        data=[_review_to_read(r) for r in rows],
        total=total,
    )


@router.post(
    "/questions",
    response_model=ReviewQuestionRead,
    status_code=status.HTTP_201_CREATED,
    tags=["PerformanceReviews"],
    summary="Create a review question",
)
async def create_question(
    payload: ReviewQuestionCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ReviewQuestionRead:
    if payload.question_type not in ("rating", "text", "both"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="question_type must be one of rating | text | both",
        )
    question = ReviewQuestion(
        tenant_id=tenant_id,
        category=payload.category,
        question_text=payload.question_text,
        question_type=payload.question_type,
        weight=payload.weight,
        required=payload.required,
        order=payload.order,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return _question_to_read(question)


@router.get(
    "/questions",
    response_model=ReviewQuestionListResponse,
    tags=["PerformanceReviews"],
    summary="List review questions",
)
async def list_questions(
    category: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> ReviewQuestionListResponse:
    stmt = select(ReviewQuestion).where(ReviewQuestion.tenant_id == tenant_id)
    count_stmt = select(ReviewQuestion).where(ReviewQuestion.tenant_id == tenant_id)
    if category:
        stmt = stmt.where(ReviewQuestion.category == category)
        count_stmt = count_stmt.where(ReviewQuestion.category == category)
    rows = (
        await db.execute(
            stmt.order_by(ReviewQuestion.order.asc()).offset(offset).limit(limit)
        )
    ).scalars().all()
    total = len((await db.execute(count_stmt)).scalars().all())
    return ReviewQuestionListResponse(
        data=[_question_to_read(q) for q in rows],
        total=total,
    )


@router.post(
    "/cycles",
    response_model=ReviewCycleRead,
    status_code=status.HTTP_201_CREATED,
    tags=["PerformanceReviews"],
    summary="Create a review cycle",
)
async def create_cycle(
    payload: ReviewCycleCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> ReviewCycleRead:
    if payload.end_date <= payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="end_date must be after start_date",
        )
    cycle = ReviewCycle(
        tenant_id=tenant_id,
        name=payload.name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
    )
    db.add(cycle)
    await db.commit()
    await db.refresh(cycle)
    return _cycle_to_read(cycle)


@router.get(
    "/cycles",
    response_model=ReviewCycleListResponse,
    tags=["PerformanceReviews"],
    summary="List review cycles",
)
async def list_cycles(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> ReviewCycleListResponse:
    stmt = select(ReviewCycle).where(ReviewCycle.tenant_id == tenant_id)
    count_stmt = select(ReviewCycle).where(ReviewCycle.tenant_id == tenant_id)
    if status_filter:
        stmt = stmt.where(ReviewCycle.status == status_filter)
        count_stmt = count_stmt.where(ReviewCycle.status == status_filter)
    rows = (
        await db.execute(
            stmt.order_by(ReviewCycle.created_at.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()
    total = len((await db.execute(count_stmt)).scalars().all())
    return ReviewCycleListResponse(
        data=[_cycle_to_read(c) for c in rows],
        total=total,
    )


@router.get(
    "/{review_id}",
    response_model=PerformanceReviewRead,
    tags=["PerformanceReviews"],
    summary="Get a performance review",
)
async def get_review(
    review_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> PerformanceReviewRead:
    review = await _load_review(db, review_id, tenant_id)
    return _review_to_read(review)


@router.put(
    "/{review_id}",
    response_model=PerformanceReviewRead,
    tags=["PerformanceReviews"],
    summary="Update a performance review",
)
async def update_review(
    review_id: str,
    payload: PerformanceReviewUpdate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> PerformanceReviewRead:
    review = await _load_review(db, review_id, tenant_id)
    if review.status != ReviewStatus.DRAFT.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Can only update reviews in draft status",
        )
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(review, field, value)
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return _review_to_read(review)


@router.post(
    "/{review_id}/submit",
    response_model=PerformanceReviewRead,
    tags=["PerformanceReviews"],
    summary="Submit a performance review",
)
async def submit_review(
    review_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> PerformanceReviewRead:
    review = await _load_review(db, review_id, tenant_id)
    if review.status != ReviewStatus.DRAFT.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Review has already been submitted or completed",
        )
    review.status = ReviewStatus.SUBMITTED.value
    review.submitted_at = _utcnow()
    db.add(review)
    await db.commit()
    await db.refresh(review)
    logger.info("performance_reviews.submitted tenant=%s id=%s", tenant_id, review.id)
    return _review_to_read(review)


__all__ = ["router"]
