"""Job Service — Real CRUD with PostgreSQL for job postings and candidate-job matching."""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.database import get_db_dependency
from shared.core.models.recruitment import (
    Job,
    JobStatus,
    JobType,
    Application,
    ApplicationStatus,
)


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
async def create_job(data: JobCreateRequest, db: AsyncSession = Depends(get_db_dependency)):
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

    job.updated_at = datetime.now(timezone.utc)
    db.add(job)
    await db.flush()
    return JobUpdateResponse(id=job_id, updated=True)


@router.delete("/{job_id}", response_model=JobDeleteResponse, tags=["Jobs"], summary="Delete job posting")
async def delete_job(job_id: str, db: AsyncSession = Depends(get_db_dependency)):
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
