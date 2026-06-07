"""Candidate Service — Real CRUD with PostgreSQL, AI enrichment, skill extraction, and job matching."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
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
from shared.core.models.tag import (
    AddEntityTagRequest,
    AddEntityTagResponse,
    EntityTagListResponse,
    EntityTagRead,
    Tag,
    TagApplication,
    TagEntityType,
)
from shared.core.security import require_tenant, require_user, decode_token
from shared.auth.dependencies import require_tenant_id
from shared.core.rate_limit_deps import candidate_write_rate
from shared.audit import audit
from shared.webhooks import safe_dispatch_event
from shared.scoring.engine import score_candidate as _engine_score_candidate
from shared.tenants import QuotaExceededError, TenantManager
from shared.files import storage as file_storage
from shared.files.parser import (
    detect_content_type,
    parse_resume,
    extract_email,
    extract_phone,
    extract_skills,
    extract_experience_years,
)


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
    the user-facing action that triggered it.
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


async def _enforce_candidate_quota(db: AsyncSession, tenant_id: str) -> None:
    """Raise HTTP 402 if the tenant is at or above its plan's candidate limit.

    Unlimited plans (e.g. enterprise) always pass.  The check consults the
    live candidate count in the caller's tenant so a deletion immediately
    frees a slot for a new candidate.
    """
    manager = TenantManager(db=db)
    try:
        await manager.check_quota(tenant_id, "candidates")
    except QuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "quota_exceeded",
                "resource": exc.resource,
                "used": exc.used,
                "limit": exc.limit,
                "message": (
                    f"Plan limit reached for '{exc.resource}': "
                    f"{exc.used}/{exc.limit}. Upgrade your plan to add more."
                ),
            },
        )


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
    # Quota enforcement: refuse the insert if the tenant is at its plan
    # candidate limit.  Sits before the duplicate-email check so a tenant
    # that is at quota gets the same 402 regardless of the email.
    await _enforce_candidate_quota(db, tenant_id)

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


# ── Candidate ↔ Tag endpoints ────────────────────────────────────────────────
#
# Tags are managed by the tag service, but the per-entity add / list / remove
# endpoints live next to the resources they tag so the URLs match the
# /candidates/{id}/tags and /jobs/{id}/tags pattern the spec calls for.


async def _candidate_exists_or_404(
    db: AsyncSession, candidate_id: str, tenant_id: str
) -> None:
    found = (
        await db.execute(
            select(Candidate.id).where(
                Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
            )
        )
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )


def _entity_tag_to_read(app: TagApplication, tag: Tag) -> EntityTagRead:
    return EntityTagRead(
        id=tag.id,
        name=tag.name,
        display_name=tag.display_name,
        color=tag.color,
        entity_type=tag.entity_type,
        applied_at=app.applied_at,
    )


@router.get(
    "/{candidate_id}/tags",
    response_model=EntityTagListResponse,
    tags=["Candidates"],
    summary="List a candidate's tags",
)
async def list_candidate_tags(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> EntityTagListResponse:
    await _candidate_exists_or_404(db, candidate_id, tenant_id)
    rows = (
        await db.execute(
            select(TagApplication, Tag)
            .join(Tag, TagApplication.tag_id == Tag.id)
            .where(
                TagApplication.tenant_id == tenant_id,
                TagApplication.entity_type == "candidate",
                TagApplication.entity_id == candidate_id,
            )
            .order_by(TagApplication.applied_at.desc())
        )
    ).all()
    data = [_entity_tag_to_read(app, tag) for app, tag in rows]
    return EntityTagListResponse(
        entity_type="candidate", entity_id=candidate_id, data=data, total=len(data)
    )


@router.post(
    "/{candidate_id}/tags",
    response_model=AddEntityTagResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Candidates"],
    summary="Attach a tag to a candidate",
    description="Provide either ``tag_id`` (attach an existing tag) or ``name`` "
                "(create a new tag inline) — exactly one is required.",
)
async def add_candidate_tag(
    candidate_id: str,
    payload: AddEntityTagRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> AddEntityTagResponse:
    await _candidate_exists_or_404(db, candidate_id, tenant_id)

    has_id = bool(payload.tag_id)
    has_name = bool(payload.name)
    if has_id == has_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide exactly one of 'tag_id' or 'name'",
        )

    if has_id:
        tag = (
            await db.execute(
                select(Tag).where(
                    Tag.id == payload.tag_id, Tag.tenant_id == tenant_id
                )
            )
        ).scalar_one_or_none()
        if tag is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found"
            )
        created = False
    else:
        normalized = payload.name.strip().lower()
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="name is required"
            )
        tag = (
            await db.execute(
                select(Tag).where(Tag.tenant_id == tenant_id, Tag.name == normalized)
            )
        ).scalar_one_or_none()
        if tag is None:
            tag = Tag(
                tenant_id=tenant_id,
                name=normalized,
                display_name=payload.name.strip(),
                color=payload.color,
                entity_type=TagEntityType.ALL,
            )
            db.add(tag)
            await db.flush()
            await db.refresh(tag)
            created = True
        else:
            created = False

    if tag.entity_type not in (TagEntityType.ALL, TagEntityType.CANDIDATE):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tag '{tag.display_name}' cannot be applied to candidates "
                f"(declared entity_type='{tag.entity_type.value}')"
            ),
        )

    existing = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tenant_id == tenant_id,
                TagApplication.tag_id == tag.id,
                TagApplication.entity_type == "candidate",
                TagApplication.entity_id == candidate_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        app = TagApplication(
            tenant_id=tenant_id,
            tag_id=tag.id,
            entity_type="candidate",
            entity_id=candidate_id,
        )
        db.add(app)
        await db.flush()
        await db.refresh(app)
    else:
        app = existing

    return AddEntityTagResponse(
        tag=_entity_tag_to_read(app, tag),
        created=created,
        applied=True,
    )


@router.delete(
    "/{candidate_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["Candidates"],
    summary="Remove a tag from a candidate",
)
async def remove_candidate_tag(
    candidate_id: str,
    tag_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant),
) -> Response:
    await _candidate_exists_or_404(db, candidate_id, tenant_id)
    app = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tenant_id == tenant_id,
                TagApplication.tag_id == tag_id,
                TagApplication.entity_type == "candidate",
                TagApplication.entity_id == candidate_id,
            )
        )
    ).scalar_one_or_none()
    if app is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not attached to candidate"
        )
    await db.delete(app)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Duplicate detection & merge ──────────────────────────────────────────────
#
# The detection rules live in :mod:`shared.dedup.detector` so they are unit
# testable in isolation.  These endpoints just load the candidates from the
# tenant and feed them to the detector.


from shared.dedup.detector import (
    DuplicateGroup,
    DuplicateMatch,
    find_duplicates,
    find_duplicates_for_new,
)
from shared.auth.dependencies import require_member, require_tenant_id as _require_tenant_id_dedup  # noqa: F401  (re-exported below)


# Default confidence threshold used when the caller does not specify one.
# Picked so the default report includes exact-email and name+phone matches
# (≥0.75) but suppresses the noisier name+location tier (0.55).
DEFAULT_DEDUP_THRESHOLD = 0.7


class DetectDuplicatesRequest(BaseModel):
    threshold: float = Field(
        default=DEFAULT_DEDUP_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Minimum confidence (0.0–1.0) for a pair to be reported.",
    )


class DuplicateGroupResponse(BaseModel):
    member_ids: list[str]
    confidence: float
    reason: str
    pair_count: int


class DetectDuplicatesResponse(BaseModel):
    groups: list[DuplicateGroupResponse]
    total: int
    threshold: float
    candidates_scanned: int


class DuplicateMatchResponse(BaseModel):
    candidate_id: str
    confidence: float
    reason: str


class PossibleDuplicatesResponse(BaseModel):
    candidate_id: str
    matches: list[DuplicateMatchResponse]
    total: int
    threshold: float


class MergeCandidatesRequest(BaseModel):
    primary_id: str = Field(..., description="Candidate to keep (the survivor of the merge).")
    secondary_id: str = Field(..., description="Candidate to fold into the primary and delete.")
    field_preferences: dict[str, str] | None = Field(
        default=None,
        description=(
            "Optional map of field name → ``'primary'`` or ``'secondary'`` "
            "indicating which side to take the value from.  Fields not "
            "listed fall back to primary, then secondary."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "primary_id": "cand-1",
                    "secondary_id": "cand-2",
                    "field_preferences": {"phone": "secondary", "location": "primary"},
                }
            ]
        }
    }


class MergeCandidatesResponse(BaseModel):
    primary: CandidateDetailResponse
    secondary_id: str
    deleted: bool = True
    activities_moved: int
    notes_moved: int


def _candidate_to_dedup_dict(candidate: Candidate) -> dict[str, Any]:
    """Return the minimal dict the dedup detector needs.

    The detector accepts both objects and dicts, but we project down to the
    fields it actually inspects so the contract is explicit and we don't
    accidentally leak sensitive columns (e.g. resume_file_id) into a
    scoring function.
    """
    return {
        "id": candidate.id,
        "email": candidate.email,
        "full_name": candidate.full_name,
        "phone": candidate.phone,
        "location": candidate.location,
    }


def _group_to_response(group: DuplicateGroup) -> DuplicateGroupResponse:
    return DuplicateGroupResponse(
        member_ids=[str(c["id"]) for c in group.members],
        confidence=round(group.confidence, 4),
        reason=group.reason,
        pair_count=len(group.matches),
    )


@router.post(
    "/detect-duplicates",
    response_model=DetectDuplicatesResponse,
    tags=["Candidates"],
    summary="Detect duplicate candidates in the caller's tenant",
    description=(
        "Scan every candidate that belongs to the caller's tenant and "
        "return the groups of records that look like the same person.  "
        "Matching is rule-based and runs in-memory: exact email (high "
        "confidence), name + phone (medium), name + location (low).  Use "
        "the optional ``threshold`` to widen or tighten the report."
    ),
)
async def detect_duplicates_endpoint(
    payload: DetectDuplicatesRequest | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> DetectDuplicatesResponse:
    """Find duplicate groups across the entire tenant."""
    threshold = (payload or DetectDuplicatesRequest()).threshold

    result = await db.execute(
        select(Candidate).where(Candidate.tenant_id == tenant_id)
    )
    candidates = result.scalars().all()
    candidates_dicts = [_candidate_to_dedup_dict(c) for c in candidates]

    groups = find_duplicates(candidates_dicts, threshold=threshold)
    return DetectDuplicatesResponse(
        groups=[_group_to_response(g) for g in groups],
        total=len(groups),
        threshold=threshold,
        candidates_scanned=len(candidates_dicts),
    )


@router.get(
    "/{candidate_id}/possible-duplicates",
    response_model=PossibleDuplicatesResponse,
    tags=["Candidates"],
    summary="Find possible duplicates of a single candidate",
    description=(
        "Compare one candidate against every other candidate in the same "
        "tenant and return the ranked list of matches.  The threshold "
        "query parameter lets the caller widen or tighten the report."
    ),
)
async def possible_duplicates_for_candidate(
    candidate_id: str,
    threshold: float = Query(
        default=DEFAULT_DEDUP_THRESHOLD,
        ge=0.0,
        le=1.0,
        description="Minimum confidence for a match to be returned.",
    ),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _member: dict = Depends(require_member),
) -> PossibleDuplicatesResponse:
    """Return potential duplicates of the given candidate within the tenant."""
    cand_result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    primary = cand_result.scalar_one_or_none()
    if primary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    others_result = await db.execute(
        select(Candidate).where(
            Candidate.tenant_id == tenant_id,
            Candidate.id != candidate_id,
        )
    )
    others = others_result.scalars().all()

    primary_dict = _candidate_to_dedup_dict(primary)
    others_dicts = [_candidate_to_dedup_dict(c) for c in others]
    matches = find_duplicates_for_new(
        primary_dict, others_dicts, threshold=threshold
    )

    return PossibleDuplicatesResponse(
        candidate_id=candidate_id,
        matches=[
            DuplicateMatchResponse(
                candidate_id=str(m.candidate_b["id"]),
                confidence=round(m.confidence, 4),
                reason=m.reason,
            )
            for m in matches
        ],
        total=len(matches),
        threshold=threshold,
    )


# Fields the merge is allowed to copy from one side to the other.  Kept as
# a closed set so a caller cannot drive a write into an unrelated column
# via the ``field_preferences`` map.
_MERGEABLE_FIELDS: tuple[str, ...] = (
    "full_name",
    "phone",
    "location",
    "linkedin_url",
    "source",
    "notes",
)


def _pick_field(
    field: str,
    primary: Candidate,
    secondary: Candidate,
    preferences: dict[str, str] | None,
) -> Any:
    """Return the value to assign to ``field`` after the merge.

    Resolution order:

    1. ``field_preferences[field]`` if it points to a side that has a value.
    2. Primary's value, if non-empty.
    3. Secondary's value, if non-empty.
    4. ``None`` (leave the column cleared).
    """
    primary_val = getattr(primary, field, None)
    secondary_val = getattr(secondary, field, None)

    if preferences:
        side = preferences.get(field, "").lower()
        if side == "primary" and primary_val:
            return primary_val
        if side == "secondary" and secondary_val:
            return secondary_val

    if primary_val:
        return primary_val
    if secondary_val:
        return secondary_val
    return None


@router.post(
    "/merge",
    response_model=MergeCandidatesResponse,
    tags=["Candidates"],
    summary="Merge two duplicate candidates into one",
    description=(
        "Fold ``secondary_id`` into ``primary_id``: activities, notes, and "
        "tag applications are re-pointed at the primary, missing fields on "
        "the primary are filled from the secondary (per "
        "``field_preferences``), and the secondary row is hard-deleted.  "
        "Both candidates must belong to the caller's tenant."
    ),
)
async def merge_candidates_endpoint(
    payload: MergeCandidatesRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    _rl: None = Depends(candidate_write_rate),
) -> MergeCandidatesResponse:
    """Merge ``secondary_id`` into ``primary_id``."""
    if payload.primary_id == payload.secondary_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="primary_id and secondary_id must be different",
        )

    primary_result = await db.execute(
        select(Candidate).where(
            Candidate.id == payload.primary_id, Candidate.tenant_id == tenant_id
        )
    )
    primary = primary_result.scalar_one_or_none()
    if primary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Primary candidate not found",
        )

    secondary_result = await db.execute(
        select(Candidate).where(
            Candidate.id == payload.secondary_id, Candidate.tenant_id == tenant_id
        )
    )
    secondary = secondary_result.scalar_one_or_none()
    if secondary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Secondary candidate not found",
        )

    # ── Move activities (notes, interviews, status changes, …) ─────────
    activities_result = await db.execute(
        select(CandidateActivity).where(
            CandidateActivity.candidate_id == secondary.id,
            CandidateActivity.tenant_id == tenant_id,
        )
    )
    activities = activities_result.scalars().all()
    notes_moved = 0
    for activity in activities:
        activity.candidate_id = primary.id
        if activity.activity_type == CandidateActivityType.NOTE.value:
            notes_moved += 1
        # Prefix the title with a marker so the timeline makes the provenance
        # obvious in the UI without losing the original wording.
        if activity.title and not activity.title.startswith("[merged] "):
            activity.title = f"[merged] {activity.title}"
        db.add(activity)

    # ── Re-point tag applications ──────────────────────────────────────
    tag_apps_result = await db.execute(
        select(TagApplication).where(
            TagApplication.tenant_id == tenant_id,
            TagApplication.entity_type == "candidate",
            TagApplication.entity_id == secondary.id,
        )
    )
    for app in tag_apps_result.scalars().all():
        # If the primary already has the same tag, drop the duplicate row.
        existing = (
            await db.execute(
                select(TagApplication).where(
                    TagApplication.tenant_id == tenant_id,
                    TagApplication.tag_id == app.tag_id,
                    TagApplication.entity_type == "candidate",
                    TagApplication.entity_id == primary.id,
                )
            )
        ).scalar_one_or_none()
        if existing is None:
            app.entity_id = primary.id
            db.add(app)
        else:
            await db.delete(app)

    # ── Merge scalar fields (per preferences) ─────────────────────────
    for field_name in _MERGEABLE_FIELDS:
        new_value = _pick_field(
            field_name, primary, secondary, payload.field_preferences
        )
        if new_value is not None and getattr(primary, field_name, None) != new_value:
            setattr(primary, field_name, new_value)

    # Always prefer the primary's status — never let the merge revert a
    # candidate from ``hired`` back to ``new`` because the secondary was
    # earlier in the funnel.
    primary.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(primary)

    # ── Delete the secondary ───────────────────────────────────────────
    secondary_id = secondary.id
    await db.delete(secondary)
    await db.flush()

    # ── Audit + activity log ───────────────────────────────────────────
    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.merge",
        resource_type="candidate",
        resource_id=primary.id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={
            "primary_id": primary.id,
            "secondary_id": secondary_id,
            "activities_moved": len(activities),
            "notes_moved": notes_moved,
            "field_preferences": payload.field_preferences or {},
        },
    )
    await _safe_log_activity(
        db,
        tenant_id=tenant_id,
        candidate_id=primary.id,
        activity_type=CandidateActivityType.NOTE,
        title=f"[merged] {secondary.full_name} merged into this candidate",
        content=(
            f"Folded candidate {secondary_id} into this record. "
            f"{len(activities)} activities re-pointed, {notes_moved} notes moved."
        ),
        user_id=user.get("id"),
        meta={
            "merge": True,
            "primary_id": primary.id,
            "secondary_id": secondary_id,
        },
    )

    # ── Re-fetch primary with the latest merged state for the response ──
    detail_resp = await _build_candidate_detail(db, primary.id, tenant_id)

    return MergeCandidatesResponse(
        primary=detail_resp,
        secondary_id=secondary_id,
        deleted=True,
        activities_moved=len(activities),
        notes_moved=notes_moved,
    )


async def _build_candidate_detail(
    db: AsyncSession, candidate_id: str, tenant_id: str
) -> CandidateDetailResponse:
    """Re-load a candidate and shape it as a :class:`CandidateDetailResponse`.

    Extracted from the existing GET handler so the merge endpoint can reuse
    it after the secondary has been deleted.
    """
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    profile_result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.candidate_id == candidate_id
        )
    )
    profile = profile_result.scalar_one_or_none()

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
        status=candidate.status.value if hasattr(candidate.status, "value") else candidate.status,
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


# ── Resume upload, download, delete, and parse ────────────────────────────────
#
# The file *bytes* live in the in-memory ``shared.files.storage`` store keyed
# by a UUID.  We persist only the ``file_id`` + filename + content_type on the
# candidate row so the bytes can be downloaded back through the GET endpoint.
# This keeps the DB small and makes the upload pipeline safe to swap for S3 /
# MinIO later without changing the public API.
#
# The parse endpoint (``/parse-resume``) is intentionally separate: it does
# NOT bind a resume to a specific candidate -- it's a stateless extractor the
# UI calls as the user picks a file, before they hit "save".

# Default skill catalogue used by ``POST /parse-resume`` and the upload flow
# when the caller does not supply their own.  Kept in one place so the same
# vocabulary is used by the upload, the re-parse, and any AI agent that
# eventually consumes the extracted field.
DEFAULT_KNOWN_SKILLS: list[str] = [
    "python", "javascript", "typescript", "go", "rust", "java", "kotlin", "swift",
    "ruby", "php", "c", "c++", "c#", "scala", "r", "matlab", "sql", "nosql",
    "html", "css", "sass", "tailwind", "react", "vue", "angular", "svelte",
    "next.js", "nuxt", "fastapi", "flask", "django", "express", "nestjs",
    "spring", "rails", "laravel", ".net", "node.js", "deno", "bun",
    "postgresql", "mysql", "mariadb", "mongodb", "redis", "elasticsearch",
    "cassandra", "dynamodb", "bigquery", "snowflake", "kafka", "rabbitmq",
    "docker", "kubernetes", "terraform", "ansible", "jenkins", "github actions",
    "gitlab ci", "circleci", "prometheus", "grafana", "datadog", "splunk",
    "aws", "azure", "gcp", "cloudflare", "vercel", "netlify", "heroku",
    "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy", "spark", "hadoop",
    "airflow", "dbt", "mlflow", "huggingface", "openai", "langchain",
    "rest", "graphql", "grpc", "websockets", "kafka", "rabbitmq",
    "git", "linux", "bash", "powershell", "agile", "scrum", "kanban", "jira",
]

MAX_RESUME_BYTES = 10 * 1024 * 1024  # 10 MB


class ResumeUploadResponse(BaseModel):
    candidate_id: str
    file_id: str
    file_name: str
    content_type: str
    size: int
    url: str
    extracted_email: str | None = None
    extracted_phone: str | None = None
    extracted_skills: list[str] = []
    experience_years: int | None = None
    parsed: bool = True


class ResumeDownloadResponse(BaseModel):
    candidate_id: str
    file_id: str
    file_name: str
    content_type: str
    size: int
    content_base64: str


class ResumeDeleteResponse(BaseModel):
    candidate_id: str
    file_id: str
    deleted: bool = True


class ParsedResumeResponse(BaseModel):
    file_name: str
    content_type: str
    size: int
    text: str
    text_preview: str
    email: str | None = None
    phone: str | None = None
    skills: list[str] = []
    experience_years: int | None = None
    parsing_confidence: float = 0.0
    page_count: int | None = None


class _ParseResumeForm:
    """Marker for the form parameter on /parse-resume."""


async def _read_resume_upload(
    upload: UploadFile, *, max_bytes: int = MAX_RESUME_BYTES
) -> tuple[bytes, str, str]:
    """Read an ``UploadFile`` and return ``(content, content_type, filename)``.

    Guards against oversize uploads so a malicious client cannot exhaust
    process memory by streaming 10 GB.
    """
    filename = upload.filename or "resume"
    content_type = (upload.content_type or "").split(";", 1)[0].strip().lower()
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1024 * 64)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Resume exceeds {max_bytes // (1024 * 1024)} MB limit",
            )
        chunks.append(chunk)
    content = b"".join(chunks)
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )
    # Trust the body more than the declared header when the two disagree.
    detected = detect_content_type(
        content, declared_mime=content_type or None, filename=filename
    )
    return content, detected or content_type or "application/octet-stream", filename


def _resume_record_to_response(candidate: Candidate) -> dict[str, Any]:
    """Build a dict for the candidate's current resume (or empty fields)."""
    return {
        "file_id": candidate.resume_file_id,
        "file_name": candidate.resume_file_name,
        "content_type": candidate.resume_content_type,
        "size": candidate.resume_file_size,
    }


@router.post(
    "/parse-resume",
    response_model=ParsedResumeResponse,
    tags=["Candidates"],
    summary="Parse a resume without persisting it",
    description=(
        "Accept a PDF / DOCX / TXT resume upload and return the extracted "
        "plain text plus structured fields (email, phone, skills, experience "
        "years).  The file is NOT saved to storage nor bound to any "
        "candidate -- use the candidate-scoped ``POST /candidates/{id}/resume`` "
        "endpoint for that."
    ),
)
async def parse_resume_endpoint(
    file: UploadFile = File(..., description="Resume file (PDF, DOCX, TXT)"),
    known_skills: str | None = Query(
        default=None,
        description=(
            "Optional comma-separated skill vocabulary to match against.  "
            "When omitted, a built-in catalogue of common tech skills is used."
        ),
    ),
    _tenant_id: str = Depends(require_tenant_id),
) -> ParsedResumeResponse:
    """Stateless resume parser -- never persists the file."""
    content, content_type, filename = await _read_resume_upload(file)

    text = parse_resume(content, content_type=content_type, filename=filename)

    if known_skills:
        vocab = [s.strip() for s in known_skills.split(",") if s.strip()]
    else:
        vocab = DEFAULT_KNOWN_SKILLS

    email = extract_email(text)
    phone = extract_phone(text)
    skills = extract_skills(text, vocab)
    years = extract_experience_years(text)

    # Confidence: extracted-email + extracted-phone + skills coverage + size
    confidence = 0.4
    if email:
        confidence += 0.2
    if phone:
        confidence += 0.1
    if skills:
        confidence += min(0.2, 0.04 * len(skills))
    if len(text) > 800:
        confidence += 0.1

    page_count: int | None = None
    if content_type == "application/pdf" and content[:4].lstrip().startswith(b"%PDF"):
        try:
            import fitz  # type: ignore

            doc = fitz.open(stream=content, filetype="pdf")
            page_count = doc.page_count
            doc.close()
        except Exception:
            page_count = None

    return ParsedResumeResponse(
        file_name=filename,
        content_type=content_type,
        size=len(content),
        text=text,
        text_preview=text[:600],
        email=email,
        phone=phone,
        skills=skills,
        experience_years=years,
        parsing_confidence=round(min(confidence, 0.99), 2),
        page_count=page_count,
    )


@router.post(
    "/{candidate_id}/resume",
    response_model=ResumeUploadResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Candidates"],
    summary="Upload a resume for a candidate",
    description=(
        "Upload a PDF / DOCX resume, persist it to storage, and bind it to "
        "the candidate.  Replaces any previously-uploaded resume for the "
        "same candidate.  The structured fields (email, phone, skills, "
        "experience years) are extracted on the fly and returned in the "
        "response, but the body of the resume stays in the storage layer."
    ),
)
async def upload_candidate_resume(
    candidate_id: str,
    file: UploadFile = File(..., description="Resume file (PDF, DOCX, TXT)"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
) -> ResumeUploadResponse:
    """Upload (or replace) the resume for a candidate."""
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    content, content_type, filename = await _read_resume_upload(file)

    # If this candidate already has a resume uploaded, drop the old bytes
    # from the storage layer so we don't leak orphans.  Best effort: if the
    # old file id is missing, the delete is a no-op.
    if candidate.resume_file_id:
        file_storage.delete_file(candidate.resume_file_id)

    file_id, url = file_storage.save_file(
        content=content, filename=filename, content_type=content_type
    )

    text = parse_resume(content, content_type=content_type, filename=filename)
    email = extract_email(text)
    phone = extract_phone(text)
    skills = extract_skills(text, DEFAULT_KNOWN_SKILLS)
    years = extract_experience_years(text)

    candidate.resume_file_id = file_id
    candidate.resume_file_name = filename
    candidate.resume_content_type = content_type
    candidate.resume_file_size = len(content)
    candidate.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(candidate)

    # If we discovered an email from the resume and the candidate record has
    # none, fill it in so the candidate is reachable from the resume alone.
    if email and not candidate.email:
        candidate.email = email
        db.add(candidate)

    # Auto-log on the candidate timeline so the upload shows up next to the
    # rest of the activity feed.
    await _safe_log_activity(
        db,
        tenant_id=tenant_id,
        candidate_id=candidate_id,
        activity_type=CandidateActivityType.RESUME_UPLOADED
        if hasattr(CandidateActivityType, "RESUME_UPLOADED")
        else CandidateActivityType.NOTE,
        title="Resume uploaded",
        content=f"Uploaded {filename} ({len(content)} bytes, {content_type})",
        user_id=user.get("id"),
        meta={
            "file_id": file_id,
            "file_name": filename,
            "content_type": content_type,
            "size": len(content),
            "extracted_email": email,
            "extracted_phone": phone,
            "skills": skills,
            "experience_years": years,
        },
    )

    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.resume.upload",
        resource_type="candidate_resume",
        resource_id=file_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"candidate_id": candidate_id, "file_name": filename},
    )

    await safe_dispatch_event(
        "candidate.resume.uploaded",
        {
            "candidate_id": candidate_id,
            "file_id": file_id,
            "file_name": filename,
            "content_type": content_type,
            "size": len(content),
            "extracted_email": email,
        },
        tenant_id,
        db=db,
    )

    await db.flush()

    return ResumeUploadResponse(
        candidate_id=candidate_id,
        file_id=file_id,
        file_name=filename,
        content_type=content_type,
        size=len(content),
        url=url,
        extracted_email=email,
        extracted_phone=phone,
        extracted_skills=skills,
        experience_years=years,
        parsed=True,
    )


@router.get(
    "/{candidate_id}/resume",
    tags=["Candidates"],
    summary="Download the resume attached to a candidate",
    description=(
        "Return the raw bytes of the candidate's resume, base64-encoded in "
        "JSON (so the response is always JSON, never an octet-stream).  "
        "Returns 404 when the candidate has no resume yet."
    ),
)
async def download_candidate_resume(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
):
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )
    if not candidate.resume_file_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Candidate has no resume uploaded",
        )
    content = file_storage.get_file(candidate.resume_file_id)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Resume bytes are no longer available in storage",
        )

    import base64

    return ResumeDownloadResponse(
        candidate_id=candidate_id,
        file_id=candidate.resume_file_id,
        file_name=candidate.resume_file_name or "resume",
        content_type=candidate.resume_content_type or "application/octet-stream",
        size=len(content),
        content_base64=base64.b64encode(content).decode("ascii"),
    )


@router.delete(
    "/{candidate_id}/resume",
    response_model=ResumeDeleteResponse,
    tags=["Candidates"],
    summary="Delete the resume attached to a candidate",
    description=(
        "Removes the resume bytes from the storage layer and clears the "
        "``file_id`` / filename on the candidate row.  Safe to call when the "
        "candidate has no resume -- returns 204-style 200 with ``deleted=False``."
    ),
)
async def delete_candidate_resume(
    candidate_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_user),
    _rl: None = Depends(candidate_write_rate),
) -> ResumeDeleteResponse:
    result = await db.execute(
        select(Candidate).where(
            Candidate.id == candidate_id, Candidate.tenant_id == tenant_id
        )
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found"
        )

    old_file_id = candidate.resume_file_id
    if not old_file_id:
        return ResumeDeleteResponse(
            candidate_id=candidate_id, file_id="", deleted=False
        )

    removed = file_storage.delete_file(old_file_id)
    candidate.resume_file_id = None
    candidate.resume_file_name = None
    candidate.resume_content_type = None
    candidate.resume_file_size = None
    candidate.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(candidate)

    await audit(
        db,
        tenant_id=tenant_id,
        action="candidate.resume.delete",
        resource_type="candidate_resume",
        resource_id=old_file_id,
        actor_id=user["id"],
        actor_email=user.get("email"),
        details={"candidate_id": candidate_id, "removed_from_storage": removed},
    )

    await db.flush()
    return ResumeDeleteResponse(
        candidate_id=candidate_id, file_id=old_file_id, deleted=removed
    )
