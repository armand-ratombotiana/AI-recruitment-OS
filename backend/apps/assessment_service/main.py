"""AI-powered assessment service.

Generates, persists, and auto-grades assessments for candidates.  Question
generation is delegated to :mod:`shared.assessments.generator`, which calls
the LLM router and falls back to a deterministic question bank on failure.

Endpoints (all under ``/api/v1/assessments``):

* ``POST   /``                  create a new assessment (generates questions)
* ``GET    /``                  list assessments for the caller's tenant
* ``GET    /{assessment_id}``   fetch a single assessment (with questions)
* ``DELETE /{assessment_id}``   delete an assessment
* ``POST   /{assessment_id}/submit``  submit answers and auto-grade
* ``GET    /{assessment_id}/results`` view graded results
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.assessments.generator import grade_answer
from shared.auth import require_member, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.assessment import (
    Answer,
    AnswerRead,
    Assessment,
    AssessmentCreate,
    AssessmentCreateResponse,
    AssessmentDetail,
    AssessmentListResponse,
    AssessmentRead,
    AssessmentResultsResponse,
    AssessmentStatus,
    Question,
    QuestionRead,
    QuestionType,
    SubmitAnswersRequest,
    SubmitAnswersResponse,
)

logger = logging.getLogger("ai.assessments.service")


router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _load_assessment(
    db: AsyncSession, assessment_id: str, tenant_id: str
) -> Assessment:
    result = await db.execute(
        select(Assessment).where(
            Assessment.id == assessment_id,
            Assessment.tenant_id == tenant_id,
        )
    )
    assessment = result.scalar_one_or_none()
    if assessment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} not found",
        )
    return assessment


def _to_read(a: Assessment) -> AssessmentRead:
    return AssessmentRead(
        id=a.id,
        tenant_id=a.tenant_id,
        candidate_id=a.candidate_id,
        job_id=a.job_id,
        title=a.title,
        description=a.description,
        status=a.status,
        score=a.score,
        max_score=a.max_score,
        topic=a.topic,
        difficulty=a.difficulty,
        question_count=a.question_count,
        created_at=a.created_at,
        updated_at=a.updated_at,
        completed_at=a.completed_at,
        expires_at=a.expires_at,
    )


def _question_to_read(q: Question) -> QuestionRead:
    return QuestionRead(
        id=q.id,
        type=q.type,
        prompt=q.prompt,
        options=list(q.options or []),
        points=q.points,
        order=q.order,
    )


def _answer_to_read(a: Answer) -> AnswerRead:
    return AnswerRead(
        id=a.id,
        assessment_id=a.assessment_id,
        question_id=a.question_id,
        response=a.response,
        score=a.score,
        feedback=a.feedback,
        submitted_at=a.submitted_at,
    )


async def _build_detail(
    db: AsyncSession, assessment: Assessment
) -> AssessmentDetail:
    rows = (
        await db.execute(
            select(Question)
            .where(Question.assessment_id == assessment.id)
            .order_by(Question.order.asc(), Question.created_at.asc())
        )
    ).scalars().all()
    return AssessmentDetail(
        **_to_read(assessment).model_dump(),
        questions=[_question_to_read(q) for q in rows],
    )


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/health", tags=["Assessments"], summary="Assessment service health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "assessments"}


@router.post(
    "/",
    response_model=AssessmentCreateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Assessments"],
    summary="Create an assessment for a candidate",
    description=(
        "Creates an assessment tied to a candidate and (optionally) a job, "
        "generates the configured number of questions through the LLM "
        "router, persists them, and returns the assessment in ``ready`` "
        "state.  Falls back to a deterministic question bank when the LLM "
        "is unavailable so the endpoint never returns an empty assessment."
    ),
)
async def create_assessment(
    payload: AssessmentCreate,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> AssessmentCreateResponse:
    from shared.assessments.generator import generate_questions

    if not payload.title.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="title is required",
        )

    topic = payload.topic or "general software engineering"
    difficulty = payload.difficulty or "medium"
    qtype = payload.question_type or "mcq"
    if qtype not in ("mcq", "short_answer", "text", "coding", "mixed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="question_type must be one of mcq | short_answer | text | coding | mixed",
        )

    # 1. Create the parent assessment row up-front so the questions have a FK.
    now = _utcnow()
    expires_at: datetime | None = None
    if payload.expires_in_days:
        expires_at = now + timedelta(days=int(payload.expires_in_days))

    assessment = Assessment(
        tenant_id=tenant_id,
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        title=payload.title.strip(),
        description=payload.description,
        topic=topic,
        difficulty=difficulty,
        status=AssessmentStatus.READY.value,
        question_count=payload.question_count,
        expires_at=expires_at,
        metadata_={
            "question_type": qtype,
            "difficulty": difficulty,
        },
    )
    db.add(assessment)
    await db.flush()

    # 2. Generate questions.
    generated, source = await generate_questions(
        topic=topic,
        count=payload.question_count,
        difficulty=difficulty,
        type=qtype,
        tenant_id=tenant_id,
    )

    # 3. Persist question rows.
    question_records: list[Question] = []
    max_score = 0.0
    for idx, q in enumerate(generated):
        record = Question(
            tenant_id=tenant_id,
            assessment_id=assessment.id,
            type=str(q.get("type") or qtype),
            prompt=str(q.get("prompt") or ""),
            options=list(q.get("options") or []),
            correct_answer=q.get("correct_answer"),
            points=float(q.get("points") or 1.0),
            order=idx,
            explanation=q.get("explanation"),
        )
        db.add(record)
        question_records.append(record)
        max_score += record.points

    assessment.question_count = len(question_records)
    assessment.max_score = round(max_score, 4)
    assessment.metadata_ = {
        **(assessment.metadata_ or {}),
        "generation_source": source,
        "generated_count": len(question_records),
    }
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    for q in question_records:
        await db.refresh(q)

    logger.info(
        "assessments.created tenant=%s id=%s questions=%d source=%s",
        tenant_id, assessment.id, len(question_records), source,
    )

    return AssessmentCreateResponse(
        assessment=_to_read(assessment),
        questions=[_question_to_read(q) for q in question_records],
        generated=len(question_records),
        source=source,
    )


@router.get(
    "/",
    response_model=AssessmentListResponse,
    tags=["Assessments"],
    summary="List assessments for the caller's tenant",
)
async def list_assessments(
    status_filter: Optional[str] = Query(default=None, alias="status"),
    candidate_id: Optional[str] = Query(default=None),
    job_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> AssessmentListResponse:
    stmt = select(Assessment).where(Assessment.tenant_id == tenant_id)
    count_stmt = select(Assessment).where(Assessment.tenant_id == tenant_id)
    if status_filter:
        stmt = stmt.where(Assessment.status == status_filter)
        count_stmt = count_stmt.where(Assessment.status == status_filter)
    if candidate_id:
        stmt = stmt.where(Assessment.candidate_id == candidate_id)
        count_stmt = count_stmt.where(Assessment.candidate_id == candidate_id)
    if job_id:
        stmt = stmt.where(Assessment.job_id == job_id)
        count_stmt = count_stmt.where(Assessment.job_id == job_id)
    rows = (
        await db.execute(
            stmt.order_by(Assessment.created_at.desc()).offset(offset).limit(limit)
        )
    ).scalars().all()
    total = len(
        (
            await db.execute(count_stmt)
        ).scalars().all()
    )
    return AssessmentListResponse(
        data=[_to_read(a) for a in rows],
        total=total,
    )


@router.get(
    "/{assessment_id}",
    response_model=AssessmentDetail,
    tags=["Assessments"],
    summary="Get a single assessment, with its questions",
)
async def get_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> AssessmentDetail:
    assessment = await _load_assessment(db, assessment_id, tenant_id)
    return await _build_detail(db, assessment)


@router.delete(
    "/{assessment_id}",
    tags=["Assessments"],
    summary="Delete an assessment and all of its questions / answers",
)
async def delete_assessment(
    assessment_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> dict[str, Any]:
    assessment = await _load_assessment(db, assessment_id, tenant_id)
    # Cascade: drop answers and questions first, then the assessment.
    answers = (
        await db.execute(
            select(Answer).where(Answer.assessment_id == assessment.id)
        )
    ).scalars().all()
    for a in answers:
        await db.delete(a)
    questions = (
        await db.execute(
            select(Question).where(Question.assessment_id == assessment.id)
        )
    ).scalars().all()
    for q in questions:
        await db.delete(q)
    await db.delete(assessment)
    await db.commit()
    return {"id": assessment_id, "deleted": True}


@router.post(
    "/{assessment_id}/submit",
    response_model=SubmitAnswersResponse,
    tags=["Assessments"],
    summary="Submit answers and auto-grade the assessment",
    description=(
        "Accepts a list of answers, persists them, runs the auto-grader on "
        "each, and updates the parent assessment with the total score and "
        "a ``completed`` status.  Unknown ``question_id`` values are "
        "silently skipped so a partial submission is still a valid one."
    ),
)
async def submit_answers(
    assessment_id: str,
    payload: SubmitAnswersRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> SubmitAnswersResponse:
    assessment = await _load_assessment(db, assessment_id, tenant_id)
    if assessment.status in (AssessmentStatus.COMPLETED.value,):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assessment has already been submitted and graded.",
        )
    if assessment.expires_at is not None and _utcnow() > assessment.expires_at:
        assessment.status = AssessmentStatus.EXPIRED.value
        db.add(assessment)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Assessment has expired and no longer accepts submissions.",
        )

    # Pre-load the questions for this assessment so we can grade in-process.
    questions = (
        await db.execute(
            select(Question).where(Question.assessment_id == assessment.id)
        )
    ).scalars().all()
    questions_by_id = {q.id: q for q in questions}
    if not questions_by_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Assessment has no questions; cannot grade.",
        )

    # Replace any prior answers (allows a single re-submission).
    existing_answers = (
        await db.execute(
            select(Answer).where(Answer.assessment_id == assessment.id)
        )
    ).scalars().all()
    for ans in existing_answers:
        await db.delete(ans)

    # First, mark the assessment as in_progress so concurrent reads see it.
    assessment.status = AssessmentStatus.SUBMITTED.value
    assessment.updated_at = _utcnow()
    db.add(assessment)

    answer_records: list[Answer] = []
    total_score = 0.0
    graded = 0
    for entry in payload.answers:
        question = questions_by_id.get(entry.question_id)
        if question is None:
            continue

        score, feedback = await grade_answer(
            question={
                "type": question.type,
                "prompt": question.prompt,
                "options": list(question.options or []),
                "correct_answer": question.correct_answer,
            },
            response=entry.response,
            points=float(question.points or 0.0),
            tenant_id=tenant_id,
        )
        total_score += score
        graded += 1
        record = Answer(
            tenant_id=tenant_id,
            assessment_id=assessment.id,
            question_id=question.id,
            response=entry.response,
            score=round(score, 4),
            feedback=feedback,
        )
        db.add(record)
        answer_records.append(record)

    # Finalise the assessment.
    assessment.score = round(total_score, 4)
    assessment.status = AssessmentStatus.COMPLETED.value
    assessment.completed_at = _utcnow()
    assessment.updated_at = _utcnow()
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    for a in answer_records:
        await db.refresh(a)

    return SubmitAnswersResponse(
        assessment_id=assessment.id,
        status=assessment.status,
        score=assessment.score,
        max_score=assessment.max_score,
        answers=[_answer_to_read(a) for a in answer_records],
        graded=graded,
    )


@router.get(
    "/{assessment_id}/results",
    response_model=AssessmentResultsResponse,
    tags=["Assessments"],
    summary="Get the graded results for a completed assessment",
)
async def get_results(
    assessment_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> AssessmentResultsResponse:
    assessment = await _load_assessment(db, assessment_id, tenant_id)
    answers = (
        await db.execute(
            select(Answer)
            .where(Answer.assessment_id == assessment.id)
            .order_by(Answer.submitted_at.asc())
        )
    ).scalars().all()
    questions = (
        await db.execute(
            select(Question)
            .where(Question.assessment_id == assessment.id)
            .order_by(Question.order.asc())
        )
    ).scalars().all()
    percentage = (
        round(assessment.score / assessment.max_score * 100, 2)
        if assessment.max_score > 0
        else 0.0
    )
    return AssessmentResultsResponse(
        assessment=_to_read(assessment),
        answers=[_answer_to_read(a) for a in answers],
        questions=[_question_to_read(q) for q in questions],
        percentage=percentage,
    )


__all__ = ["router"]
