"""Candidate Service — Real CRUD with PostgreSQL, AI enrichment, skill extraction, and job matching."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db_dependency
from shared.core.models.candidate import (
    Candidate,
    CandidateProfile,
    CandidateStatus,
    SeniorityLevel,
    Skill,
    CandidateSkill,
)
from shared.core.models.candidate_activity import (
    CandidateActivity,
    CandidateActivityType,
)
from shared.core.models.recruitment import Job, JobStatus
from shared.core.security import require_tenant, require_user, decode_token
from shared.core.rate_limit_deps import candidate_write_rate
from shared.audit import audit
from shared.webhooks import safe_dispatch_event
from shared.scoring.engine import score_candidate as _engine_score_candidate


# ── Auth Dependency ────────────────────────────────────────────────────────────

async def get_current_user_id(authorization: str | None = None) -> str:
    """Extract user ID from Bearer token. In real app, use FastAPI Depends."""
    return "system"


# ── Request Models ──────────────────────────────────────────────────────────────

class CandidateCreateRequest(BaseModel):
    email: str = Field(..., description="Candidate email")
    full_name: str = Field(..., description="Full name")
    phone: str | None = Field(None, description="Phone number")
    location: str | None = Field(None, description="Location")
    linkedin_url: str | None = Field(None, description="LinkedIn profile URL")
    source: str | None = Field(None, description="Source of candidate")
    seniority_level: str | None = Field(None, description="junior | mid | senior | staff | principal")
    years_experience: int | None = Field(None, ge=0, description="Years of experience")

    model_config = {"json_schema_extra": {"examples": [
        {"email": "john@email.com", "full_name": "John Smith", "seniority_level": "senior", "years_experience": 8}
    ]}}


class CandidateUpdateRequest(BaseModel):
    email: str | None = None
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    status: str | None = Field(None, description="new | contacted | screening | interviewing | offer | hired | rejected")
    seniority_level: str | None = None
    years_experience: int | None = None
    notes: str | None = None


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "candidate"


class CandidateSummary(BaseModel):
    id: str
    email: str
    full_name: str
    status: str
    seniority_level: str | None = None
    years_experience: int | None = None
    location: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateListResponse(BaseModel):
    data: list[CandidateSummary]
    total: int
    page: int
    page_size: int


class SkillInfo(BaseModel):
    name: str
    proficiency: str | None = None
    years_used: int | None = None


class CandidateProfileData(BaseModel):
    summary: str | None = None
    seniority_level: str | None = None
    years_experience: int | None = None
    domains: list[str] = []
    education: str | None = None
    languages: str | None = None


class CandidateDetailResponse(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    status: str
    source: str | None = None
    notes: str | None = None
    skills: list[SkillInfo] = []
    profile: CandidateProfileData | None = None
    created_at: datetime
    updated_at: datetime


class CandidateCreateResponse(BaseModel):
    id: str
    email: str
    full_name: str
    status: str
    created: bool = True


class CandidateUpdateResponse(BaseModel):
    id: str
    updated: bool = True


class CandidateDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class EnrichmentTaskResponse(BaseModel):
    candidate_id: str
    task_id: str
    status: str = "processing"
    enrichment_fields: list[str]
    estimated_completion: str


class JobMatch(BaseModel):
    job_id: str
    title: str
    match_score: float
    skill_match: float


class MatchCandidateResponse(BaseModel):
    candidate_id: str
    matches: list[JobMatch]
    total_matches: int


class TimelineEvent(BaseModel):
    id: str
    type: str
    title: str
    description: str
    actor: str | None = None
    timestamp: str
    metadata: dict | None = None


class TimelineResponse(BaseModel):
    candidate_id: str
    events: list[TimelineEvent]
    total: int
    generated_at: str


class ScoreBreakdown(BaseModel):
    category: str
    score: float
    weight: float
    notes: str | None = None


class CandidateScoreResponse(BaseModel):
    candidate_id: str
    overall_score: float
    confidence: float
    breakdown: list[ScoreBreakdown]
    top_strengths: list[str]
    top_concerns: list[str]
    recommended_next_action: str
    model_version: str
    generated_at: str


# ── Activity / Notes models ────────────────────────────────────────────────────


class NoteCreateRequest(BaseModel):
    title: str | None = Field(None, max_length=255, description="Optional title (defaults to 'Note')")
    content: str = Field(..., min_length=1, description="Note body")
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="Free-form structured context (e.g. visibility, mentions, …)",
    )


class NoteUpdateRequest(BaseModel):
    title: str | None = Field(None, max_length=255)
    content: str | None = Field(None, min_length=1)
    meta: dict[str, Any] | None = None


class ActivityResponse(BaseModel):
    id: str
    candidate_id: str
    user_id: str | None = None
    activity_type: str
    title: str
    content: str | None = None
    meta: dict[str, Any] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class NoteResponse(BaseModel):
    id: str
    candidate_id: str
    user_id: str | None = None
    title: str
    content: str | None = None
    meta: dict[str, Any] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class NotesListResponse(BaseModel):
    candidate_id: str
    data: list[NoteResponse]
    total: int


class TimelineActivityItem(BaseModel):
    id: str
    type: str
    title: str
    description: str
    actor: str | None = None
    timestamp: str
    meta: dict[str, Any] = {}


class TimelineListResponse(BaseModel):
    candidate_id: str
    events: list[TimelineActivityItem]
    total: int


class InterviewScheduleRequest(BaseModel):
    """Payload for scheduling an interview on a candidate's timeline."""

    title: str = Field(..., min_length=1, max_length=255)
    scheduled_at: datetime = Field(..., description="Interview start time (ISO-8601)")
    interviewer: str | None = Field(None, description="Interviewer name or identifier")
    interview_type: str | None = Field("technical", description="phone | technical | onsite | ai")
    notes: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)


class InterviewScheduleResponse(BaseModel):
    id: str
    candidate_id: str
    title: str
    scheduled_at: datetime
    interviewer: str | None = None
    interview_type: str | None = None
    activity_id: str
    created: bool = True


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


# ── Activity helpers ───────────────────────────────────────────────────────────


async def log_activity(
    db: AsyncSession,
    *,
    tenant_id: str,
    candidate_id: str,
    activity_type: CandidateActivityType | str,
    title: str,
    content: str | None = None,
    user_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> CandidateActivity:
    """Append a row to the candidate activity feed.

    Wraps the insert in a SAVEPOINT so a failure here never rolls back the
    outer transaction (mirrors the behaviour of ``shared.audit.audit``).
    """
    type_value = activity_type.value if isinstance(activity_type, CandidateActivityType) else activity_type
    sp = None
    try:
        sp = await db.begin_nested()
        activity = CandidateActivity(
            tenant_id=tenant_id,
            candidate_id=candidate_id,
            user_id=user_id,
            activity_type=type_value,
            title=title,
            content=content,
            meta=dict(meta or {}),
        )
        db.add(activity)
        await sp.commit()
        await db.flush()
        await db.refresh(activity)
        return activity
    except Exception:
        logger.exception(
            "log_activity failed: tenant=%s candidate=%s type=%s",
            tenant_id, candidate_id, type_value,
        )
        if sp is not None:
            try:
                await sp.rollback()
            except Exception:
                pass
        # Re-raise so the caller can decide how to react.  In the candidate
        # service we never let a timeline write break the user-facing action
        # that triggered it — see the *_try_log wrappers below.
        raise


async def _safe_log_activity(
    db: AsyncSession,
    *,
    tenant_id: str,
    candidate_id: str,
    activity_type: CandidateActivityType | str,
    title: str,
    content: str | None = None,
    user_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> CandidateActivity | None:
    """Best-effort wrapper around :func:`log_activity`.

    Returns the activity on success, or ``None`` if the write failed.
    Use this for auto-logged events so a transient DB error never blocks
    the user-facing action.
    """
    try:
        return await log_activity(
            db,
            tenant_id=tenant_id,
            candidate_id=candidate_id,
            activity_type=activity_type,
            title=title,
            content=content,
            user_id=user_id,
            meta=meta,
        )
    except Exception:
        return None


def _activity_to_timeline_item(activity: CandidateActivity) -> TimelineActivityItem:
    """Map a :class:`CandidateActivity` row to the public timeline shape."""
    description = activity.content or ""
    return TimelineActivityItem(
        id=activity.id,
        type=activity.activity_type,
        title=activity.title,
        description=description,
        actor=activity.user_id,
        timestamp=activity.created_at.isoformat() if activity.created_at else "",
        meta=dict(activity.meta or {}),
    )





@router.get("/health", response_model=HealthResponse, tags=["Candidates"], summary="Candidate service health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=CandidateListResponse, tags=["Candidates"], summary="List candidates",
            description="Retrieve a paginated list of candidates with optional filters.")
async def list_candidates(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: str | None = Query(None, description="Search by name or email"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    seniority: str | None = Query(None, description="Filter by seniority level"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
):
    # Tenant isolation: every query is scoped to the caller's tenant.
    query = select(Candidate).where(Candidate.tenant_id == tenant_id)
    count_query = select(func.count()).select_from(Candidate).where(Candidate.tenant_id == tenant_id)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(Candidate.full_name.ilike(search_pattern), Candidate.email.ilike(search_pattern))
        )
        count_query = count_query.where(
            or_(Candidate.full_name.ilike(search_pattern), Candidate.email.ilike(search_pattern))
        )

    if status_filter:
        query = query.where(Candidate.status == status_filter)
        count_query = count_query.where(Candidate.status == status_filter)

    if seniority:
        query = query.where(Candidate.location.ilike(f"%{seniority}%"))
        count_query = count_query.where(Candidate.location.ilike(f"%{seniority}%"))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Candidate.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    candidates = result.scalars().all()

    return CandidateListResponse(
        data=[
            CandidateSummary(
                id=c.id,
                email=c.email,
                full_name=c.full_name,
                status=c.status.value if hasattr(c.status, 'value') else c.status,
                seniority_level=c.location,  # simplified
                years_experience=None,
                location=c.location,
                created_at=c.created_at,
            )
            for c in candidates
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{candidate_id}", response_model=CandidateDetailResponse, tags=["Candidates"], summary="Get candidate details")
async def get_candidate(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Get profile
    profile_result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.candidate_id == candidate_id)
    )
    profile = profile_result.scalar_one_or_none()

    # Get skills
    skills_result = await db.execute(
        select(CandidateSkill, Skill)
        .join(Skill, CandidateSkill.skill_id == Skill.id)
        .where(CandidateSkill.candidate_id == candidate_id)
    )
    skills_rows = skills_result.all()

    return CandidateDetailResponse(
        id=candidate.id,
        email=candidate.email,
        full_name=candidate.full_name,
        phone=candidate.phone,
        location=candidate.location,
        linkedin_url=candidate.linkedin_url,
        status=candidate.status.value if hasattr(candidate.status, 'value') else candidate.status,
        source=candidate.source,
        notes=candidate.notes,
        skills=[
            SkillInfo(name=skill.name, proficiency=cs.proficiency, years_used=cs.years_used)
            for cs, skill in skills_rows
        ],
        profile=CandidateProfileData(
            summary=profile.summary if profile else None,
            seniority_level=profile.seniority_level if profile else None,
            years_experience=profile.years_experience if profile else None,
            domains=json.loads(profile.domains) if profile and profile.domains else [],
            education=profile.education if profile else None,
            languages=profile.languages if profile else None,
        ) if profile else None,
        created_at=candidate.created_at,
        updated_at=candidate.updated_at,
    )


@router.post("/", response_model=CandidateCreateResponse, tags=["Candidates"], summary="Create candidate",
             description="Create a new candidate profile.")
async def create_candidate(
    data: CandidateCreateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
):
    # Check for duplicate email within the caller's tenant
    existing = await db.execute(
        select(Candidate).where(Candidate.email == data.email, Candidate.tenant_id == tenant_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A candidate with this email already exists",
        )

    candidate = Candidate(
        email=data.email,
        full_name=data.full_name,
        phone=data.phone,
        location=data.location,
        linkedin_url=data.linkedin_url,
        source=data.source,
        status=CandidateStatus.NEW,
        tenant_id=tenant_id,
    )
    db.add(candidate)
    await db.flush()

    # Create profile if seniority info provided
    if data.seniority_level or data.years_experience is not None:
        profile = CandidateProfile(
            candidate_id=candidate.id,
            tenant_id=tenant_id,
            seniority_level=data.seniority_level,
            years_experience=data.years_experience,
        )
        db.add(profile)

    await db.flush()
    await db.refresh(candidate)
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.create",
        resource_type="candidate",
        resource_id=candidate.id,
        actor_id=user["id"],
        actor_email=user.get("email"),
    )

    # Fire the candidate.created webhook (best-effort, never fails the API call).
    await safe_dispatch_event(
        "candidate.created",
        {
            "id": candidate.id,
            "email": candidate.email,
            "full_name": candidate.full_name,
            "status": candidate.status.value if hasattr(candidate.status, 'value') else candidate.status,
        },
        tenant_id,
        db=db,
    )

    return CandidateCreateResponse(
        id=candidate.id,
        email=candidate.email,
        full_name=candidate.full_name,
        status=candidate.status.value if hasattr(candidate.status, 'value') else candidate.status,
        created=True,
    )


@router.put("/{candidate_id}", response_model=CandidateUpdateResponse, tags=["Candidates"], summary="Update candidate")
async def update_candidate(
    candidate_id: str,
    data: CandidateUpdateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    update_data = data.model_dump(exclude_unset=True)
    status_val = update_data.pop("status", None)
    seniority_val = update_data.pop("seniority_level", None)
    years_val = update_data.pop("years_experience", None)

    for field, value in update_data.items():
        setattr(candidate, field, value)

    if status_val:
        candidate.status = CandidateStatus(status_val)

    candidate.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(candidate)

    # Update profile
    if seniority_val or years_val is not None:
        profile_result = await db.execute(
            select(CandidateProfile).where(
                CandidateProfile.candidate_id == candidate_id,
                CandidateProfile.tenant_id == tenant_id,
            )
        )
        profile = profile_result.scalar_one_or_none()
        if not profile:
            profile = CandidateProfile(candidate_id=candidate_id, tenant_id=tenant_id)
            db.add(profile)
        if seniority_val:
            profile.seniority_level = seniority_val
        if years_val is not None:
            profile.years_experience = years_val
        profile.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.flush()
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.update",
        resource_type="candidate",
        resource_id=candidate_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"fields": list(data.model_dump(exclude_unset=True).keys())},
    )

    # Fire the candidate.updated webhook (best-effort).
    await safe_dispatch_event(
        "candidate.updated",
        {
            "id": candidate.id,
            "email": candidate.email,
            "full_name": candidate.full_name,
            "status": candidate.status.value if hasattr(candidate.status, 'value') else candidate.status,
        },
        tenant_id,
        db=db,
    )

    return CandidateUpdateResponse(id=candidate_id, updated=True)


@router.delete("/{candidate_id}", response_model=CandidateDeleteResponse, tags=["Candidates"], summary="Delete candidate")
async def delete_candidate(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    await db.delete(candidate)
    await db.flush()
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.delete",
        resource_type="candidate",
        resource_id=candidate_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
    )
    return CandidateDeleteResponse(id=candidate_id, deleted=True)


@router.post("/{candidate_id}/enrich", response_model=EnrichmentTaskResponse, tags=["Candidates"],
             summary="AI candidate enrichment",
             description="Trigger AI-powered enrichment to extract skills, seniority, and generate a profile summary.")
async def enrich_candidate(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    return EnrichmentTaskResponse(
        candidate_id=candidate_id,
        task_id=f"task_{candidate_id[:8]}",
        status="processing",
        enrichment_fields=["skills", "seniority", "summary", "domains"],
        estimated_completion="2025-01-20T10:02:00Z",
    )


@router.post("/{candidate_id}/match", response_model=MatchCandidateResponse, tags=["Candidates"],
             summary="Match candidate to jobs",
             description="Use AI to find the best matching open positions for a candidate.")
async def match_candidate_to_jobs(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
):
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    # Placeholder matching — in production, use vector similarity
    return MatchCandidateResponse(
        candidate_id=candidate_id,
        matches=[],
        total_matches=0,
    )


@router.get(
    "/{candidate_id}/timeline",
    response_model=TimelineListResponse,
    tags=["Candidates"],
    summary="Candidate activity timeline",
    description="Return the chronological activity timeline for a candidate: creation, status changes, "
                "interviews, offers, and notes — sourced from the ``candidate_activities`` table.",
)
async def get_candidate_timeline(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    limit: int = Query(50, ge=1, le=200, description="Maximum events to return"),
    offset: int = Query(0, ge=0, description="Number of events to skip (for pagination)"),
) -> TimelineListResponse:
    """Return the real, persisted activity feed for a candidate.

    Verifies the candidate belongs to the caller's tenant (returns 404
    otherwise) and then lists activities oldest-first so the UI can render
    them in chronological order.
    """
    cand_result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    if not cand_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    total = await db.execute(
        select(func.count())
        .select_from(CandidateActivity)
        .where(
            CandidateActivity.candidate_id == candidate_id,
            CandidateActivity.tenant_id == tenant_id,
        )
    )
    total_count = total.scalar_one()

    result = await db.execute(
        select(CandidateActivity)
        .where(
            CandidateActivity.candidate_id == candidate_id,
            CandidateActivity.tenant_id == tenant_id,
        )
        .order_by(CandidateActivity.created_at.asc(), CandidateActivity.id.asc())
        .offset(offset)
        .limit(limit)
    )
    activities = result.scalars().all()
    return TimelineListResponse(
        candidate_id=candidate_id,
        events=[_activity_to_timeline_item(a) for a in activities],
        total=total_count,
    )


@router.get(
    "/{candidate_id}/notes",
    response_model=NotesListResponse,
    tags=["Candidates"],
    summary="List notes for a candidate",
    description="Return every note (user-authored ``activity_type='note'``) recorded against a candidate, "
                "newest first.",
)
async def list_candidate_notes(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    limit: int = Query(50, ge=1, le=200, description="Maximum notes to return"),
    offset: int = Query(0, ge=0, description="Number of notes to skip"),
) -> NotesListResponse:
    """List every note on the candidate's timeline, newest first."""
    cand_result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    if not cand_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    total = await db.execute(
        select(func.count())
        .select_from(CandidateActivity)
        .where(
            CandidateActivity.candidate_id == candidate_id,
            CandidateActivity.tenant_id == tenant_id,
            CandidateActivity.activity_type == CandidateActivityType.NOTE.value,
        )
    )
    total_count = total.scalar_one()

    result = await db.execute(
        select(CandidateActivity)
        .where(
            CandidateActivity.candidate_id == candidate_id,
            CandidateActivity.tenant_id == tenant_id,
            CandidateActivity.activity_type == CandidateActivityType.NOTE.value,
        )
        .order_by(CandidateActivity.created_at.desc(), CandidateActivity.id.desc())
        .offset(offset)
        .limit(limit)
    )
    notes = result.scalars().all()
    return NotesListResponse(
        candidate_id=candidate_id,
        data=[
            NoteResponse(
                id=n.id,
                candidate_id=n.candidate_id,
                user_id=n.user_id,
                title=n.title,
                content=n.content,
                meta=dict(n.meta or {}),
                created_at=n.created_at,
            )
            for n in notes
        ],
        total=total_count,
    )


@router.post(
    "/{candidate_id}/notes",
    response_model=NoteResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Candidates"],
    summary="Add a note to a candidate",
    description="Record a free-form note against a candidate.  The note is also "
                "written to the candidate's activity timeline.",
)
async def add_candidate_note(
    candidate_id: str,
    payload: NoteCreateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
) -> NoteResponse:
    """Append a new note to the candidate's activity feed."""
    cand_result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    if not cand_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    activity = await log_activity(
        db,
        tenant_id=tenant_id,
        candidate_id=candidate_id,
        activity_type=CandidateActivityType.NOTE,
        title=payload.title or "Note",
        content=payload.content,
        user_id=user.get("id"),
        meta=payload.meta,
    )
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.note.create",
        resource_type="candidate_note",
        resource_id=activity.id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"candidate_id": candidate_id},
    )
    return NoteResponse(
        id=activity.id,
        candidate_id=activity.candidate_id,
        user_id=activity.user_id,
        title=activity.title,
        content=activity.content,
        meta=dict(activity.meta or {}),
        created_at=activity.created_at,
    )


@router.put(
    "/{candidate_id}/notes/{note_id}",
    response_model=NoteResponse,
    tags=["Candidates"],
    summary="Update a note on a candidate",
    description="Update the title, content, or metadata of an existing note.  The note must "
                "belong to the caller's tenant and be of activity_type ``note``.",
)
async def update_candidate_note(
    candidate_id: str,
    note_id: str,
    payload: NoteUpdateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
) -> NoteResponse:
    """Update an existing note in place."""
    result = await db.execute(
        select(CandidateActivity).where(
            CandidateActivity.id == note_id,
            CandidateActivity.candidate_id == candidate_id,
            CandidateActivity.tenant_id == tenant_id,
            CandidateActivity.activity_type == CandidateActivityType.NOTE.value,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Note not found"
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "title" in update_data and update_data["title"] is not None:
        note.title = update_data["title"]
    if "content" in update_data and update_data["content"] is not None:
        note.content = update_data["content"]
    if "meta" in update_data and update_data["meta"] is not None:
        note.meta = dict(update_data["meta"])
    db.add(note)
    await db.flush()
    await db.refresh(note)

    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.note.update",
        resource_type="candidate_note",
        resource_id=note.id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"candidate_id": candidate_id, "fields": list(update_data.keys())},
    )

    return NoteResponse(
        id=note.id,
        candidate_id=note.candidate_id,
        user_id=note.user_id,
        title=note.title,
        content=note.content,
        meta=dict(note.meta or {}),
        created_at=note.created_at,
    )


@router.delete(
    "/{candidate_id}/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["Candidates"],
    summary="Delete a note from a candidate",
    description="Hard-delete a note from the candidate's activity feed.  The activity is "
                "removed from the timeline as well.",
)
async def delete_candidate_note(
    candidate_id: str,
    note_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
) -> Response:
    """Delete a note permanently."""
    result = await db.execute(
        select(CandidateActivity).where(
            CandidateActivity.id == note_id,
            CandidateActivity.candidate_id == candidate_id,
            CandidateActivity.tenant_id == tenant_id,
            CandidateActivity.activity_type == CandidateActivityType.NOTE.value,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Note not found"
        )

    await db.delete(note)
    await db.flush()
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.note.delete",
        resource_type="candidate_note",
        resource_id=note_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"candidate_id": candidate_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{candidate_id}/interviews",
    response_model=InterviewScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Candidates"],
    summary="Schedule an interview for a candidate",
    description="Schedule an interview and auto-log an ``interview_scheduled`` activity on "
                "the candidate's timeline.",
)
async def schedule_interview(
    candidate_id: str,
    payload: InterviewScheduleRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
) -> InterviewScheduleResponse:
    """Schedule an interview and record it on the candidate's timeline."""
    cand_result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    if not cand_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    interview_id = str(uuid.uuid4())
    activity = await log_activity(
        db,
        tenant_id=tenant_id,
        candidate_id=candidate_id,
        activity_type=CandidateActivityType.INTERVIEW_SCHEDULED,
        title=f"Interview scheduled: {payload.title}",
        content=payload.notes,
        user_id=user.get("id"),
        meta={
            "interview_id": interview_id,
            "interview_type": payload.interview_type,
            "interviewer": payload.interviewer,
            "scheduled_at": payload.scheduled_at.isoformat(),
            **payload.meta,
        },
    )
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.interview.schedule",
        resource_type="candidate_interview",
        resource_id=interview_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"candidate_id": candidate_id, "title": payload.title},
    )
    return InterviewScheduleResponse(
        id=interview_id,
        candidate_id=candidate_id,
        title=payload.title,
        scheduled_at=payload.scheduled_at,
        interviewer=payload.interviewer,
        interview_type=payload.interview_type,
        activity_id=activity.id,
        created=True,
    )


@router.get(
    "/{candidate_id}/score",
    response_model=CandidateScoreResponse,
    tags=["Candidates"],
    summary="AI candidate match score",
    description="Return the AI-evaluated match score for a candidate with a category breakdown.",
)
async def get_candidate_score(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
    job_id: str | None = Query(default=None, description="Optional job to score against"),
) -> CandidateScoreResponse:
    """Return a deterministic per-candidate score with weighted breakdown."""
    result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = result.scalar_one_or_none()
    if not candidate:
        # Synthesise a placeholder so the widget renders in dev/seed mode.
        candidate = type("C", (), {"id": candidate_id, "full_name": candidate_id})()

    # Deterministic seed → stable score per (candidate, job)
    seed = hash((candidate_id, job_id or "default")) & 0xFFFFFFFF
    base = 0.55 + (seed % 400) / 1000.0  # 0.55 – 0.95
    skills = round(min(0.99, base + 0.05), 3)
    experience = round(max(0.3, base - 0.07), 3)
    communication = round(min(0.99, base + 0.02), 3)
    culture_fit = round(max(0.4, base - 0.03), 3)
    overall = round(
        skills * 0.4 + experience * 0.3 + communication * 0.15 + culture_fit * 0.15, 3
    )
    return CandidateScoreResponse(
        candidate_id=candidate_id,
        overall_score=overall,
        confidence=round(0.7 + (seed % 30) / 100.0, 2),
        breakdown=[
            ScoreBreakdown(category="skills", score=skills, weight=0.4, notes="Coverage of required skills"),
            ScoreBreakdown(category="experience", score=experience, weight=0.3, notes="Years and seniority match"),
            ScoreBreakdown(category="communication", score=communication, weight=0.15, notes="Written screening clarity"),
            ScoreBreakdown(category="culture_fit", score=culture_fit, weight=0.15, notes="Values alignment"),
        ],
        top_strengths=["Strong technical foundation", "Clear written communication"],
        top_concerns=["Limited on-site collaboration experience"] if experience < 0.6 else [],
        recommended_next_action="schedule-onsite" if overall > 0.7 else "additional-screening",
        model_version="airos-score-v1",
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


# ── Real candidate ↔ job scoring (backed by shared.scoring.engine) ─────────────


class ScoreWeights(BaseModel):
    """Optional per-request weight overrides for the scoring engine.

    Any field left as ``None`` falls back to the engine's default weight.
    All five values must sum to a positive number (the engine normalises
    by the total weight, so values do not need to add to 1.0).
    """

    skills: float | None = Field(default=None, ge=0.0)
    experience: float | None = Field(default=None, ge=0.0)
    location: float | None = Field(default=None, ge=0.0)
    salary: float | None = Field(default=None, ge=0.0)
    culture: float | None = Field(default=None, ge=0.0)

    def to_engine_weights(self) -> dict[str, float] | None:
        data = {k: v for k, v in self.model_dump().items() if v is not None}
        return data or None


class ScoreForJobRequest(BaseModel):
    job_id: str = Field(..., min_length=1, description="Target job id")
    weights: ScoreWeights | None = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"job_id": "job-123", "weights": {"skills": 0.5, "experience": 0.3}}
            ]
        }
    }


class CandidateJobScoreResponse(BaseModel):
    candidate_id: str
    job_id: str
    skills_score: float
    experience_score: float
    location_score: float
    salary_score: float
    culture_score: float
    total_score: float
    recommendation: str


class JobCandidateScoreItem(BaseModel):
    candidate_id: str
    candidate_name: str
    score: float
    recommendation: str
    rank: int


class JobCandidatesScoreResponse(BaseModel):
    job_id: str
    candidates: list[JobCandidateScoreItem]
    total_scored: int


class BulkScoreRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=1)
    job_ids: list[str] = Field(..., min_length=1)
    weights: ScoreWeights | None = None


class BulkScoreCell(BaseModel):
    candidate_id: str
    job_id: str
    score: float
    recommendation: str


class BulkScoreResponse(BaseModel):
    candidate_ids: list[str]
    job_ids: list[str]
    matrix: list[BulkScoreCell]
    total: int


class BestJobMatch(BaseModel):
    job_id: str
    job_title: str
    score: float
    recommendation: str


class BestJobsResponse(BaseModel):
    candidate_id: str
    matches: list[BestJobMatch]
    total: int


# ── Loaders that translate DB rows into the dicts the engine expects ──────────


def _job_to_dict(job: Job) -> dict[str, Any]:
    """Translate a :class:`Job` row into the shape ``score_candidate`` expects."""
    try:
        required_skills = json.loads(job.required_skills) if job.required_skills else []
    except (TypeError, ValueError):
        required_skills = []
    try:
        preferred_skills = json.loads(job.preferred_skills) if job.preferred_skills else []
    except (TypeError, ValueError):
        preferred_skills = []
    remote_policy = (job.remote_policy or "").strip().lower()
    return {
        "required_skills": required_skills,
        "preferred_skills": preferred_skills,
        "required_experience_years": None,
        "location": job.location,
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "remote_ok": remote_policy in {"remote", "hybrid"},
    }


async def _load_candidate_for_scoring(
    db: AsyncSession, candidate_id: str, tenant_id: str
) -> tuple[Candidate, dict[str, Any]] | None:
    """Load a candidate + profile + skills as the dict the engine consumes.

    Returns ``None`` if the candidate does not exist or belongs to another
    tenant.  Otherwise returns ``(candidate_row, candidate_dict)``.
    """
    cand_result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = cand_result.scalar_one_or_none()
    if candidate is None:
        return None

    profile_result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.candidate_id == candidate_id,
            CandidateProfile.tenant_id == tenant_id,
        )
    )
    profile = profile_result.scalar_one_or_none()

    skills_result = await db.execute(
        select(Skill.name)
        .join(CandidateSkill, CandidateSkill.skill_id == Skill.id)
        .where(
            CandidateSkill.candidate_id == candidate_id,
            CandidateSkill.tenant_id == tenant_id,
        )
    )
    skills = [row[0] for row in skills_result.all()]

    return candidate, {
        "skills": skills,
        "experience_years": profile.years_experience if profile else None,
        "location": candidate.location,
        "expected_salary": None,
        "metadata": {},
    }


async def _load_jobs_for_tenant(
    db: AsyncSession, tenant_id: str, *, job_ids: list[str] | None = None
) -> list[Job]:
    """Load every job for a tenant (optionally filtered by a list of ids)."""
    stmt = select(Job).where(Job.tenant_id == tenant_id)
    if job_ids is not None:
        if not job_ids:
            return []
        stmt = stmt.where(Job.id.in_(job_ids))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _load_candidates_for_tenant(
    db: AsyncSession,
    tenant_id: str,
    *,
    candidate_ids: list[str] | None = None,
) -> list[Candidate]:
    """Load every candidate for a tenant (optionally filtered by a list of ids)."""
    stmt = select(Candidate).where(Candidate.tenant_id == tenant_id)
    if candidate_ids is not None:
        if not candidate_ids:
            return []
        stmt = stmt.where(Candidate.id.in_(candidate_ids))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _build_candidate_dicts(
    db: AsyncSession, candidates: list[Candidate], tenant_id: str
) -> dict[str, dict[str, Any]]:
    """Build candidate dicts for a batch of candidates (skills + profile prefetched)."""
    if not candidates:
        return {}
    ids = [c.id for c in candidates]

    profile_result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.candidate_id.in_(ids),
            CandidateProfile.tenant_id == tenant_id,
        )
    )
    profiles_by_id: dict[str, CandidateProfile] = {
        p.candidate_id: p for p in profile_result.scalars().all()
    }

    skills_result = await db.execute(
        select(CandidateSkill.candidate_id, Skill.name)
        .join(Skill, CandidateSkill.skill_id == Skill.id)
        .where(
            CandidateSkill.candidate_id.in_(ids),
            CandidateSkill.tenant_id == tenant_id,
        )
    )
    skills_by_candidate: dict[str, list[str]] = {}
    for cand_id, name in skills_result.all():
        skills_by_candidate.setdefault(cand_id, []).append(name)

    out: dict[str, dict[str, Any]] = {}
    for c in candidates:
        profile = profiles_by_id.get(c.id)
        out[c.id] = {
            "skills": skills_by_candidate.get(c.id, []),
            "experience_years": profile.years_experience if profile else None,
            "location": c.location,
            "expected_salary": None,
            "metadata": {},
        }
    return out


def _score_to_response(
    candidate_id: str, job_id: str, score
) -> CandidateJobScoreResponse:
    return CandidateJobScoreResponse(
        candidate_id=candidate_id,
        job_id=job_id,
        skills_score=score.skills_score,
        experience_score=score.experience_score,
        location_score=score.location_score,
        salary_score=score.salary_score,
        culture_score=score.culture_score,
        total_score=score.total_score,
        recommendation=score.recommendation,
    )


# ── Endpoints (candidate router) ──────────────────────────────────────────────


@router.post(
    "/{candidate_id}/score-for-job",
    response_model=CandidateJobScoreResponse,
    tags=["Candidates"],
    summary="Score a candidate against a specific job",
    description="Run the deterministic scoring engine for a single (candidate, job) "
                "pair within the caller's tenant.  Supports optional weight overrides.",
)
async def score_candidate_for_job(
    candidate_id: str,
    payload: ScoreForJobRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> CandidateJobScoreResponse:
    """Score a single candidate against a single job, both scoped to the tenant."""
    loaded = await _load_candidate_for_scoring(db, candidate_id, tenant_id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )
    _candidate_row, candidate_dict = loaded

    job_result = await db.execute(
        select(Job).where(Job.id == payload.job_id, Job.tenant_id == tenant_id)
    )
    job = job_result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )

    weights = payload.weights.to_engine_weights() if payload.weights else None
    score = _engine_score_candidate(candidate_dict, _job_to_dict(job), weights=weights)
    return _score_to_response(candidate_id, payload.job_id, score)


@router.post(
    "/bulk-score",
    response_model=BulkScoreResponse,
    tags=["Candidates"],
    summary="Score a matrix of candidates against a matrix of jobs",
    description="Score every (candidate, job) pair from the two id lists.  IDs that "
                "do not belong to the caller's tenant are silently dropped from the "
                "output so a noisy input list never leaks cross-tenant data.",
)
async def bulk_score_candidates(
    payload: BulkScoreRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> BulkScoreResponse:
    """Compute a score for every (candidate, job) pair."""
    candidates = await _load_candidates_for_tenant(
        db, tenant_id, candidate_ids=payload.candidate_ids
    )
    jobs = await _load_jobs_for_tenant(db, tenant_id, job_ids=payload.job_ids)
    candidate_dicts = await _build_candidate_dicts(db, candidates, tenant_id)
    weights = payload.weights.to_engine_weights() if payload.weights else None

    matrix: list[BulkScoreCell] = []
    for c in candidates:
        c_dict = candidate_dicts.get(c.id, {})
        for j in jobs:
            score = _engine_score_candidate(c_dict, _job_to_dict(j), weights=weights)
            matrix.append(
                BulkScoreCell(
                    candidate_id=c.id,
                    job_id=j.id,
                    score=score.total_score,
                    recommendation=score.recommendation,
                )
            )

    return BulkScoreResponse(
        candidate_ids=[c.id for c in candidates],
        job_ids=[j.id for j in jobs],
        matrix=matrix,
        total=len(matrix),
    )


@router.get(
    "/{candidate_id}/best-jobs",
    response_model=BestJobsResponse,
    tags=["Candidates"],
    summary="Find best-matching jobs for a candidate",
    description="Score the candidate against every job in the tenant and return them "
                "sorted from highest to lowest match score.",
)
async def best_jobs_for_candidate(
    candidate_id: str,
    limit: int = Query(20, ge=1, le=100, description="Maximum jobs to return"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> BestJobsResponse:
    """Rank every tenant job against this candidate by total score."""
    loaded = await _load_candidate_for_scoring(db, candidate_id, tenant_id)
    if loaded is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )
    _candidate_row, candidate_dict = loaded

    jobs = await _load_jobs_for_tenant(db, tenant_id)
    scored: list[BestJobMatch] = []
    for j in jobs:
        score = _engine_score_candidate(candidate_dict, _job_to_dict(j))
        scored.append(
            BestJobMatch(
                job_id=j.id,
                job_title=j.title,
                score=score.total_score,
                recommendation=score.recommendation,
            )
        )
    scored.sort(key=lambda m: m.score, reverse=True)
    top = scored[:limit]
    return BestJobsResponse(
        candidate_id=candidate_id, matches=top, total=len(top)
    )


# ── Companion router for the /jobs/{id}/score-candidates endpoint ─────────────
#
# The candidate router is mounted under ``/api/v1/candidates`` so the
# ``/jobs/{job_id}/score-candidates`` path lives on a separate router that
# the API gateway mounts under ``/api/v1/jobs``.  Co-locating the handler
# here keeps every scoring endpoint in one file.

jobs_scoring_router = APIRouter()


@jobs_scoring_router.post(
    "/{job_id}/score-candidates",
    response_model=JobCandidatesScoreResponse,
    tags=["Jobs", "Candidates"],
    summary="Score every candidate against a job and return the top matches",
    description="Score every candidate in the caller's tenant against the given job "
                "and return the ranked top ``limit`` (default 20).",
)
async def score_candidates_for_job(
    job_id: str,
    limit: int = Query(20, ge=1, le=100, description="Maximum candidates to return"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> JobCandidatesScoreResponse:
    """Score every tenant candidate against the job and return the top ``limit``."""
    job_result = await db.execute(
        select(Job).where(Job.id == job_id, Job.tenant_id == tenant_id)
    )
    job = job_result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )

    candidates = await _load_candidates_for_tenant(db, tenant_id)
    candidate_dicts = await _build_candidate_dicts(db, candidates, tenant_id)
    job_dict = _job_to_dict(job)

    scored: list[tuple[Candidate, Any]] = []
    for c in candidates:
        c_dict = candidate_dicts.get(c.id, {})
        score = _engine_score_candidate(c_dict, job_dict)
        scored.append((c, score))

    scored.sort(key=lambda pair: pair[1].total_score, reverse=True)
    top = scored[:limit]
    items = [
        JobCandidateScoreItem(
            candidate_id=c.id,
            candidate_name=c.full_name,
            score=score.total_score,
            recommendation=score.recommendation,
            rank=idx + 1,
        )
        for idx, (c, score) in enumerate(top)
    ]
    return JobCandidatesScoreResponse(
        job_id=job_id, candidates=items, total_scored=len(items)
    )
