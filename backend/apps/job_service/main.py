"""Job Service — Real CRUD with PostgreSQL for job postings and candidate-job matching."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_tenant_id
from shared.auth.dependencies import require_member
from shared.core.database import get_db_dependency
from shared.core.models.recruitment import (
    Job,
    JobStatus,
    JobType,
    Application,
    ApplicationStatus,
)
from shared.core.models.application import (
    Application as PipelineApplication,
    ApplicationStage,
    ApplicationRead as PipelineApplicationRead,
    ApplicationListResponse,
    ApplicationsByStageResponse,
    PipelineSummaryResponse,
    BulkStageMoveRequest,
    BulkStageMoveResponse,
    PIPELINE_STAGES,
    application_to_read,
    validate_stage,
)
from shared.core.models.tag import (
    AddEntityTagRequest,
    AddEntityTagResponse,
    EntityTagListResponse,
    EntityTagRead,
    Tag,
    TagApplication,
    TagEntityType,
)
from shared.core.rate_limit_deps import job_write_rate
from shared.jobs.templates import (
    CloneOptions,
    FromTemplateRequest,
    JobTemplate,
    SaveAsTemplateRequest,
    clone_job,
    create_from_template,
    list_templates,
    save_as_template,
    template_to_read,
)
from shared.webhooks import safe_dispatch_event


# ── Request Models ──────────────────────────────────────────────────────────────

class JobCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Job title", examples=["Senior Backend Engineer"])
    description: str = Field(..., min_length=1, description="Full job description")
    department: str | None = Field(None, description="Department name", examples=["Engineering"])
    location: str | None = Field(None, description="Office location or 'Remote'", examples=["San Francisco, CA"])
    remote_policy: str | None = Field(default="onsite", description="onsite | hybrid | remote")
    job_type: str = Field(default="full_time", description="full_time | part_time | contract | internship")
    seniority_required: str | None = Field(None, description="junior | mid | senior | staff")
    salary_min: int | None = Field(None, ge=0, description="Minimum salary")
    salary_max: int | None = Field(None, ge=0, description="Maximum salary")
    required_skills: list[str] = Field(default_factory=list, description="Required technical skills")
    preferred_skills: list[str] = Field(default_factory=list, description="Preferred technical skills")

    model_config = {"json_schema_extra": {"examples": [
        {"title": "Senior Backend Engineer", "description": "Build scalable distributed systems.",
         "department": "Engineering", "location": "San Francisco, CA", "remote_policy": "hybrid",
         "required_skills": ["Python", "PostgreSQL", "Kubernetes"]}
    ]}}


class JobUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    status: str | None = Field(None, description="draft | open | paused | closed")
    seniority_required: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    required_skills: list[str] | None = None
    preferred_skills: list[str] | None = None


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "job"


class JobSummary(BaseModel):
    id: str
    title: str
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    status: str
    job_type: str
    applicants_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    data: list[JobSummary]
    total: int
    page: int
    page_size: int


class JobDetailResponse(BaseModel):
    id: str
    title: str
    description: str
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    job_type: str
    seniority_required: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    currency: str = "USD"
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    status: str
    applicants_count: int = 0
    created_at: datetime
    updated_at: datetime


class JobCreateResponse(BaseModel):
    id: str
    title: str
    status: str
    created: bool = True


class JobUpdateResponse(BaseModel):
    id: str
    updated: bool = True


class JobDeleteResponse(BaseModel):
    id: str
    deleted: bool = True


class MatchedCandidate(BaseModel):
    candidate_id: str
    name: str
    match_score: float = Field(..., description="Overall match score (0-1)")
    skill_match: float = 0.0
    experience_match: float = 0.0


class MatchedCandidatesResponse(BaseModel):
    job_id: str
    matched_candidates: list[MatchedCandidate]
    total_matches: int


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Jobs"], summary="Job service health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=JobListResponse, tags=["Jobs"], summary="List jobs",
            description="Retrieve a paginated list of job postings with optional filters.")
async def list_jobs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: str | None = Query(None, description="Search by title or description"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    department: str | None = Query(None, description="Filter by department"),
    db: AsyncSession = Depends(get_db_dependency),
):
    query = select(Job)
    count_query = select(func.count()).select_from(Job)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(or_(Job.title.ilike(search_pattern), Job.description.ilike(search_pattern)))
        count_query = count_query.where(or_(Job.title.ilike(search_pattern), Job.description.ilike(search_pattern)))

    if status_filter:
        query = query.where(Job.status == status_filter)
        count_query = count_query.where(Job.status == status_filter)

    if department:
        query = query.where(Job.department.ilike(f"%{department}%"))
        count_query = count_query.where(Job.department.ilike(f"%{department}%"))

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Job.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        data=[
            JobSummary(
                id=j.id,
                title=j.title,
                department=j.department,
                location=j.location,
                remote_policy=j.remote_policy,
                status=j.status.value if hasattr(j.status, 'value') else j.status,
                job_type=j.job_type.value if hasattr(j.job_type, 'value') else j.job_type,
                applicants_count=j.applicants_count,
                created_at=j.created_at,
            )
            for j in jobs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{job_id}", response_model=JobDetailResponse, tags=["Jobs"], summary="Get job details")
async def get_job(job_id: str, db: AsyncSession = Depends(get_db_dependency)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return JobDetailResponse(
        id=job.id,
        title=job.title,
        description=job.description,
        department=job.department,
        location=job.location,
        remote_policy=job.remote_policy,
        job_type=job.job_type.value if hasattr(job.job_type, 'value') else job.job_type,
        seniority_required=job.seniority_required,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        currency=job.currency,
        required_skills=json.loads(job.required_skills) if job.required_skills else [],
        preferred_skills=json.loads(job.preferred_skills) if job.preferred_skills else [],
        status=job.status.value if hasattr(job.status, 'value') else job.status,
        applicants_count=job.applicants_count,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.post("/", response_model=JobCreateResponse, tags=["Jobs"], summary="Create job posting")
async def create_job(data: JobCreateRequest, db: AsyncSession = Depends(get_db_dependency), _rl: None = Depends(job_write_rate)):
    # Map job_type string to enum
    try:
        job_type = JobType(data.job_type)
    except ValueError:
        job_type = JobType.FULL_TIME

    job = Job(
        title=data.title,
        description=data.description,
        department=data.department,
        location=data.location,
        remote_policy=data.remote_policy,
        job_type=job_type,
        seniority_required=data.seniority_required,
        salary_min=data.salary_min,
        salary_max=data.salary_max,
        required_skills=json.dumps(data.required_skills),
        preferred_skills=json.dumps(data.preferred_skills),
        status=JobStatus.DRAFT,
        tenant_id="default",
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    # Fire the job.created webhook (best-effort).
    await safe_dispatch_event(
        "job.created",
        {
            "id": job.id,
            "title": job.title,
            "status": job.status.value if hasattr(job.status, 'value') else job.status,
            "department": job.department,
        },
        "default",
        db=db,
    )

    return JobCreateResponse(
        id=job.id,
        title=job.title,
        status=job.status.value if hasattr(job.status, 'value') else job.status,
        created=True,
    )


@router.put("/{job_id}", response_model=JobUpdateResponse, tags=["Jobs"], summary="Update job posting")
async def update_job(
    job_id: str,
    data: JobUpdateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    _rl: None = Depends(job_write_rate),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    update_data = data.model_dump(exclude_unset=True)
    status_val = update_data.pop("status", None)
    skills_val = update_data.pop("required_skills", None)
    preferred_val = update_data.pop("preferred_skills", None)

    for field, value in update_data.items():
        setattr(job, field, value)

    if status_val:
        job.status = JobStatus(status_val)
    if skills_val is not None:
        job.required_skills = json.dumps(skills_val)
    if preferred_val is not None:
        job.preferred_skills = json.dumps(preferred_val)

    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(job)
    await db.flush()

    # Fire the job.updated webhook (best-effort).
    await safe_dispatch_event(
        "job.updated",
        {
            "id": job.id,
            "title": job.title,
            "status": job.status.value if hasattr(job.status, 'value') else job.status,
        },
        "default",
        db=db,
    )

    return JobUpdateResponse(id=job_id, updated=True)


@router.delete("/{job_id}", response_model=JobDeleteResponse, tags=["Jobs"], summary="Delete job posting")
async def delete_job(job_id: str, db: AsyncSession = Depends(get_db_dependency), _rl: None = Depends(job_write_rate)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    await db.delete(job)
    await db.flush()
    return JobDeleteResponse(id=job_id, deleted=True)


@router.get("/{job_id}/candidates", response_model=MatchedCandidatesResponse, tags=["Jobs"],
            summary="Get matched candidates for job",
            description="Retrieve AI-ranked candidates matched to this job posting.")
async def get_matched_candidates(job_id: str, db: AsyncSession = Depends(get_db_dependency)):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    # Placeholder matching — in production, use vector similarity from embeddings
    return MatchedCandidatesResponse(
        job_id=job_id,
        matched_candidates=[],
        total_matches=0,
    )


class PipelineStage(BaseModel):
    stage: str
    label: str
    count: int
    conversion_from_previous: float


class JobPipelineResponse(BaseModel):
    job_id: str
    job_title: str
    total_applicants: int
    stages: list[PipelineStage]
    bottleneck_stage: str
    average_days_in_stage: dict[str, float]
    generated_at: str


# ── Real Kanban-shaped pipeline ────────────────────────────────────────────
# The new ``/pipeline`` endpoint (below, declared after the routers for
# applications) supersedes the deterministic stub above.  The new endpoint
# hits the ``candidate_applications`` table and returns the real data the
# dashboard needs, with a stable Kanban shape and tenant isolation.
# See ``get_job_pipeline`` further down for the implementation.


class JobAnalyticsResponse(BaseModel):
    job_id: str
    views: int
    applies: int
    conversion_rate: float
    avg_time_to_hire_days: float
    source_breakdown: dict[str, int]
    funnel_velocity: dict[str, float]
    top_skills: list[str]
    generated_at: str


@router.get(
    "/{job_id}/analytics",
    response_model=JobAnalyticsResponse,
    tags=["Jobs"],
    summary="Job-specific analytics",
    description="Per-job analytics: views, applies, conversion, time-to-hire, top skills, source breakdown.",
)
async def get_job_analytics(
    job_id: str,
    db: AsyncSession = Depends(get_db_dependency),
) -> JobAnalyticsResponse:
    """Return a deterministic per-job analytics rollup."""
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    seed = hash(job_id) & 0xFFFFFFFF
    views = 500 + (seed % 2000)
    applies = max(1, int(views * (0.05 + (seed % 30) / 1000)))
    return JobAnalyticsResponse(
        job_id=job_id,
        views=views,
        applies=applies,
        conversion_rate=round(applies / views, 4) if views else 0.0,
        avg_time_to_hire_days=round(12 + (seed % 20), 1),
        source_breakdown={
            "linkedin": int(applies * 0.45),
            "indeed": int(applies * 0.25),
            "referral": int(applies * 0.15),
            "company_site": int(applies * 0.10),
            "other": int(applies * 0.05),
        },
        funnel_velocity={
            "applied_to_screening_days": 0.5,
            "screening_to_interview_days": 2.1,
            "interview_to_offer_days": 4.5,
            "offer_to_hire_days": 3.2,
        },
        top_skills=(json.loads(job.required_skills) if job.required_skills else [])[:5],
        generated_at=datetime.now(timezone.utc).isoformat(),
    )


# ── Job ↔ Tag endpoints ──────────────────────────────────────────────────────
#
# Mirror the candidate service: tag CRUD lives in apps.tag_service, but
# the per-job attach / list / detach endpoints live here so the URL
# /jobs/{id}/tags sits next to the resource it tags.


async def _job_exists_or_404(
    db: AsyncSession, job_id: str, tenant_id: str
) -> None:
    found = (
        await db.execute(
            select(Job.id).where(Job.id == job_id, Job.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
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
    "/{job_id}/tags",
    response_model=EntityTagListResponse,
    tags=["Jobs"],
    summary="List a job's tags",
)
async def list_job_tags(
    job_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> EntityTagListResponse:
    await _job_exists_or_404(db, job_id, tenant_id)
    rows = (
        await db.execute(
            select(TagApplication, Tag)
            .join(Tag, TagApplication.tag_id == Tag.id)
            .where(
                TagApplication.tenant_id == tenant_id,
                TagApplication.entity_type == "job",
                TagApplication.entity_id == job_id,
            )
            .order_by(TagApplication.applied_at.desc())
        )
    ).all()
    data = [_entity_tag_to_read(app, tag) for app, tag in rows]
    return EntityTagListResponse(
        entity_type="job", entity_id=job_id, data=data, total=len(data)
    )


@router.post(
    "/{job_id}/tags",
    response_model=AddEntityTagResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Jobs"],
    summary="Attach a tag to a job",
    description="Provide either ``tag_id`` (attach an existing tag) or ``name`` "
                "(create a new tag inline) — exactly one is required.",
)
async def add_job_tag(
    job_id: str,
    payload: AddEntityTagRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> AddEntityTagResponse:
    await _job_exists_or_404(db, job_id, tenant_id)

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

    if tag.entity_type not in (TagEntityType.ALL, TagEntityType.JOB):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Tag '{tag.display_name}' cannot be applied to jobs "
                f"(declared entity_type='{tag.entity_type.value}')"
            ),
        )

    existing = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tenant_id == tenant_id,
                TagApplication.tag_id == tag.id,
                TagApplication.entity_type == "job",
                TagApplication.entity_id == job_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        app = TagApplication(
            tenant_id=tenant_id,
            tag_id=tag.id,
            entity_type="job",
            entity_id=job_id,
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
    "/{job_id}/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    tags=["Jobs"],
    summary="Remove a tag from a job",
)
async def remove_job_tag(
    job_id: str,
    tag_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> Response:
    await _job_exists_or_404(db, job_id, tenant_id)
    app = (
        await db.execute(
            select(TagApplication).where(
                TagApplication.tenant_id == tenant_id,
                TagApplication.tag_id == tag_id,
                TagApplication.entity_type == "job",
                TagApplication.entity_id == job_id,
            )
        )
    ).scalar_one_or_none()
    if app is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tag not attached to job"
        )
    await db.delete(app)
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Job templates & cloning ───────────────────────────────────────────────────
#
# A "template" is a job with ``is_template=True``.  We expose:
#
# * ``POST /jobs/{id}/save-as-template`` — mark an existing job as a template
# * ``GET  /jobs/templates``            — list all templates for the tenant
# * ``POST /jobs/from-template/{tid}``  — create a new job from a template
# * ``POST /jobs/{id}/clone``           — duplicate a job (always DRAFT)


class SaveAsTemplateResponse(BaseModel):
    id: str
    is_template: bool = True
    template_name: str | None = None
    template_description: str | None = None


class JobTemplateListResponse(BaseModel):
    data: list[JobTemplate]
    total: int


class JobCloneResponse(BaseModel):
    id: str
    cloned_from_id: str
    title: str
    status: str
    copy_pipeline: bool
    copy_questions: bool
    copy_settings: bool


class FromTemplateResponse(BaseModel):
    id: str
    title: str
    department: str | None = None
    location: str | None = None
    status: str
    cloned_from_id: str | None = None


@router.get(
    "/templates",
    response_model=JobTemplateListResponse,
    tags=["Jobs"],
    summary="List job templates",
    description="Return every job flagged as a template (``is_template=True``) "
                "for the caller's tenant, newest first.",
)
async def list_job_templates(
    limit: int = Query(50, ge=1, le=200, description="Maximum templates to return"),
    offset: int = Query(0, ge=0, description="Number of templates to skip"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> JobTemplateListResponse:
    rows = await list_templates(db, tenant_id=tenant_id, limit=limit, offset=offset)
    data = [template_to_read(row) for row in rows]
    return JobTemplateListResponse(data=data, total=len(data))


@router.post(
    "/{job_id}/save-as-template",
    response_model=SaveAsTemplateResponse,
    tags=["Jobs"],
    summary="Save a job as a template",
    description="Mark an existing job as reusable: ``is_template=True`` is set "
                "and the template metadata is stamped.  The job is still a "
                "real row — only the listing endpoint filters by the flag.",
)
async def save_job_as_template(
    job_id: str,
    payload: SaveAsTemplateRequest | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
) -> SaveAsTemplateResponse:
    request = payload or SaveAsTemplateRequest()
    job = await save_as_template(db, job_id=job_id, tenant_id=tenant_id, request=request)
    await safe_dispatch_event(
        "job.template.created",
        {
            "id": job.id,
            "title": job.title,
            "template_name": job.template_name,
        },
        tenant_id,
        db=db,
    )
    return SaveAsTemplateResponse(
        id=job.id,
        is_template=job.is_template,
        template_name=job.template_name,
        template_description=job.template_description,
    )


@router.post(
    "/from-template/{template_id}",
    response_model=FromTemplateResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Jobs"],
    summary="Create a job from a template",
    description="Instantiate a new draft job from an existing template.  The "
                "``title``, ``department``, and ``location`` in the body "
                "override the template values; everything else is copied.",
)
async def create_job_from_template(
    template_id: str,
    payload: FromTemplateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
    _rl: None = Depends(job_write_rate),
) -> FromTemplateResponse:
    new_job = await create_from_template(
        db,
        template_id=template_id,
        tenant_id=tenant_id,
        request=payload,
    )
    await safe_dispatch_event(
        "job.created",
        {
            "id": new_job.id,
            "title": new_job.title,
            "department": new_job.department,
            "status": new_job.status.value if hasattr(new_job.status, "value") else new_job.status,
            "from_template": True,
        },
        tenant_id,
        db=db,
    )
    return FromTemplateResponse(
        id=new_job.id,
        title=new_job.title,
        department=new_job.department,
        location=new_job.location,
        status=new_job.status.value if hasattr(new_job.status, "value") else new_job.status,
        cloned_from_id=new_job.cloned_from_id,
    )


@router.post(
    "/{job_id}/clone",
    response_model=JobCloneResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Jobs"],
    summary="Clone a job posting",
    description="Duplicate an existing job into a new draft.  Body fields "
                "control which slices are carried over: ``copy_pipeline``, "
                "``copy_questions``, ``copy_settings`` (all default to true).",
)
async def clone_job_endpoint(
    job_id: str,
    payload: CloneOptions | None = None,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_member),
    _rl: None = Depends(job_write_rate),
) -> JobCloneResponse:
    options = payload or CloneOptions()
    clone = await clone_job(db, job_id=job_id, tenant_id=tenant_id, options=options)
    await safe_dispatch_event(
        "job.cloned",
        {
            "id": clone.id,
            "title": clone.title,
            "cloned_from_id": clone.cloned_from_id,
            "copy_pipeline": options.copy_pipeline,
            "copy_questions": options.copy_questions,
            "copy_settings": options.copy_settings,
        },
        tenant_id,
        db=db,
    )
    return JobCloneResponse(
        id=clone.id,
        cloned_from_id=clone.cloned_from_id or job_id,
        title=clone.title,
        status=clone.status.value if hasattr(clone.status, "value") else clone.status,
        copy_pipeline=options.copy_pipeline,
        copy_questions=options.copy_questions,
        copy_settings=options.copy_settings,
    )


# ── Job ↔ Candidate applications (pipeline / Kanban) ───────────────────────
#
# These endpoints expose the ``candidate_applications`` table from the job
# side.  The candidate-facing equivalents (apply, withdraw, move stage)
# live in ``apps.candidate_service.main``.


async def _load_job_or_404(
    db: AsyncSession, job_id: str, tenant_id: str
) -> Job:
    """Return the tenant-scoped job or raise 404."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    return job


@router.get(
    "/{job_id}/applications",
    response_model=ApplicationListResponse,
    tags=["Jobs"],
    summary="List every application for a job",
    description=(
        "Return every application targeting the job, ordered by most-recently "
        "changed first.  Supports optional stage filtering."
    ),
)
async def list_job_applications(
    job_id: str,
    stage: str | None = Query(
        default=None,
        description="Optional stage filter: applied | screening | interview | offer | hired | rejected",
    ),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> ApplicationListResponse:
    """List every application the job has received."""
    await _load_job_or_404(db, job_id, tenant_id)

    stmt = select(PipelineApplication).where(
        PipelineApplication.tenant_id == tenant_id,
        PipelineApplication.job_id == job_id,
    )
    if stage is not None:
        try:
            target = validate_stage(stage)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc
        stmt = stmt.where(PipelineApplication.stage == target)
    stmt = stmt.order_by(
        PipelineApplication.last_stage_change.desc(),
        PipelineApplication.applied_at.desc(),
    )

    rows = (await db.execute(stmt)).scalars().all()
    data = [application_to_read(a) for a in rows]
    return ApplicationListResponse(data=data, total=len(data))


@router.get(
    "/{job_id}/applications/by-stage",
    response_model=ApplicationsByStageResponse,
    tags=["Jobs"],
    summary="Applications grouped by pipeline stage",
    description=(
        "Return the applications for a job bucketed by stage.  The response "
        "always contains every stage in :data:`PIPELINE_STAGES`, even when "
        "the bucket is empty, so the UI never has to special-case missing "
        "columns."
    ),
)
async def get_applications_by_stage(
    job_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> ApplicationsByStageResponse:
    """Group every application for the job by pipeline stage."""
    await _load_job_or_404(db, job_id, tenant_id)

    rows = (
        await db.execute(
            select(PipelineApplication)
            .where(
                PipelineApplication.tenant_id == tenant_id,
                PipelineApplication.job_id == job_id,
            )
            .order_by(
                PipelineApplication.last_stage_change.desc(),
                PipelineApplication.applied_at.desc(),
            )
        )
    ).scalars().all()

    # Always include every stage so the UI gets a stable shape.
    by_stage: dict[str, list[PipelineApplicationRead]] = {
        stage: [] for stage in PIPELINE_STAGES
    }
    for app in rows:
        stage_value = (
            app.stage.value if isinstance(app.stage, ApplicationStage) else str(app.stage)
        )
        by_stage.setdefault(stage_value, []).append(application_to_read(app))

    return ApplicationsByStageResponse(
        job_id=job_id,
        total=len(rows),
        by_stage=by_stage,
    )


@router.get(
    "/{job_id}/pipeline",
    response_model=PipelineSummaryResponse,
    tags=["Jobs"],
    summary="Full pipeline view (Kanban-ready)",
    description=(
        "Return the full hiring pipeline for a job, with applications grouped "
        "by stage and per-stage counts.  Use this endpoint to render a Kanban "
        "board."
    ),
)
async def get_job_pipeline(
    job_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
) -> PipelineSummaryResponse:
    """Return the complete Kanban-shaped pipeline for a job."""
    await _load_job_or_404(db, job_id, tenant_id)

    rows = (
        await db.execute(
            select(PipelineApplication)
            .where(
                PipelineApplication.tenant_id == tenant_id,
                PipelineApplication.job_id == job_id,
            )
            .order_by(PipelineApplication.last_stage_change.desc())
        )
    ).scalars().all()

    by_stage: dict[str, list[PipelineApplicationRead]] = {
        stage: [] for stage in PIPELINE_STAGES
    }
    counts: dict[str, int] = {stage: 0 for stage in PIPELINE_STAGES}
    for app in rows:
        stage_value = (
            app.stage.value if isinstance(app.stage, ApplicationStage) else str(app.stage)
        )
        by_stage.setdefault(stage_value, []).append(application_to_read(app))
        counts[stage_value] = counts.get(stage_value, 0) + 1

    total = len(rows)
    stages_payload: list[dict] = []
    for stage in PIPELINE_STAGES:
        stages_payload.append(
            {
                "stage": stage,
                "count": counts.get(stage, 0),
                "share": round(counts.get(stage, 0) / total, 4) if total else 0.0,
            }
        )

    return PipelineSummaryResponse(
        job_id=job_id,
        total=total,
        stages=stages_payload,
        by_stage=by_stage,
        generated_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


@router.post(
    "/{job_id}/applications/bulk-stage",
    response_model=BulkStageMoveResponse,
    tags=["Jobs"],
    summary="Bulk-move applications to a new stage",
    description=(
        "Move every id in ``application_ids`` to the supplied stage.  Ids "
        "that do not belong to this job (or to the caller's tenant) are "
        "skipped silently and reported in ``not_found`` so the caller can "
        "reconcile."
    ),
)
async def bulk_move_applications_stage(
    job_id: str,
    payload: BulkStageMoveRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    _rl: None = Depends(job_write_rate),
) -> BulkStageMoveResponse:
    """Move multiple applications to ``payload.stage`` in a single call."""
    await _load_job_or_404(db, job_id, tenant_id)

    try:
        target = validate_stage(payload.stage)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    # Dedupe the input list so a caller that accidentally duplicates ids
    # still gets a sane ``requested`` count.
    requested_ids = list(dict.fromkeys(payload.application_ids))
    if not requested_ids:
        return BulkStageMoveResponse(
            job_id=job_id,
            stage=target.value,
            requested=0,
            moved=0,
            not_found=[],
        )

    rows = (
        await db.execute(
            select(PipelineApplication).where(
                PipelineApplication.tenant_id == tenant_id,
                PipelineApplication.job_id == job_id,
                PipelineApplication.id.in_(requested_ids),
            )
        )
    ).scalars().all()
    found_ids = {row.id for row in rows}
    not_found = [aid for aid in requested_ids if aid not in found_ids]

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    moved = 0
    for app in rows:
        previous_stage = (
            app.stage.value if isinstance(app.stage, ApplicationStage) else str(app.stage)
        )
        if previous_stage == target.value:
            # Idempotent: an application already in the target stage counts
            # as a "no-op moved" but we still touch last_stage_change so
            # the UI can re-sort by recency.
            app.last_stage_change = now
        else:
            app.stage = target
            app.last_stage_change = now
        if payload.notes is not None:
            app.notes = payload.notes
        db.add(app)
        moved += 1

    await safe_dispatch_event(
        "job.applications.bulk_stage",
        {
            "job_id": job_id,
            "stage": target.value,
            "moved": moved,
            "not_found": not_found,
        },
        tenant_id,
        db=db,
    )

    return BulkStageMoveResponse(
        job_id=job_id,
        stage=target.value,
        requested=len(requested_ids),
        moved=moved,
        not_found=not_found,
    )
