"""Job Service — Job posting management and candidate-job matching."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class JobCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Job title", examples=["Senior Backend Engineer"])
    description: str = Field(..., min_length=1, description="Full job description")
    department: str = Field(..., description="Department name", examples=["Engineering"])
    location: str = Field(..., description="Office location or 'Remote'", examples=["San Francisco, CA"])
    remote_policy: str = Field(default="onsite", description="onsite | hybrid | remote")
    required_skills: list[str] = Field(default_factory=list, description="Required technical skills")

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
    status: str | None = Field(None, description="draft | open | closed")
    required_skills: list[str] | None = None


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "job"


class JobSummary(BaseModel):
    id: str
    title: str
    department: str
    location: str
    status: str
    applicants_count: int


class JobListResponse(BaseModel):
    data: list[JobSummary]
    total: int


class JobDetailResponse(BaseModel):
    id: str
    title: str
    description: str
    department: str
    location: str
    remote_policy: str
    status: str
    required_skills: list[str]
    applicants_count: int


class JobCreateResponse(BaseModel):
    id: str
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
    skill_match: float
    experience_match: float


class MatchedCandidatesResponse(BaseModel):
    job_id: str
    matched_candidates: list[MatchedCandidate]


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Jobs"], summary="Job service health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=JobListResponse, tags=["Jobs"], summary="List jobs",
            description="Retrieve a paginated list of job postings with optional filters.")
async def list_jobs():
    return JobListResponse(data=[
        JobSummary(id="j1", title="Senior Backend Engineer", department="Engineering",
                   location="San Francisco, CA", status="open", applicants_count=24),
        JobSummary(id="j2", title="Staff Frontend Engineer", department="Engineering",
                   location="Remote", status="open", applicants_count=18),
        JobSummary(id="j3", title="ML Engineer", department="AI Platform",
                   location="New York, NY", status="open", applicants_count=31),
        JobSummary(id="j4", title="DevOps Engineer", department="Infrastructure",
                   location="Austin, TX", status="draft", applicants_count=0),
        JobSummary(id="j5", title="Product Manager", department="Product",
                   location="San Francisco, CA", status="closed", applicants_count=42),
    ], total=5)


@router.get("/{job_id}", response_model=JobDetailResponse, tags=["Jobs"], summary="Get job details")
async def get_job(job_id: str):
    return JobDetailResponse(
        id=job_id, title="Senior Backend Engineer",
        description="We are looking for a senior backend engineer to join our platform team and build scalable distributed systems.",
        department="Engineering", location="San Francisco, CA", remote_policy="hybrid", status="open",
        required_skills=["Python", "PostgreSQL", "Kubernetes"], applicants_count=24,
    )


@router.post("/", response_model=JobCreateResponse, tags=["Jobs"], summary="Create job posting")
async def create_job(data: JobCreateRequest):
    return JobCreateResponse(id="j_new")


@router.put("/{job_id}", response_model=JobUpdateResponse, tags=["Jobs"], summary="Update job posting")
async def update_job(job_id: str):
    return JobUpdateResponse(id=job_id)


@router.delete("/{job_id}", response_model=JobDeleteResponse, tags=["Jobs"], summary="Delete job posting")
async def delete_job(job_id: str):
    return JobDeleteResponse(id=job_id)


@router.get("/{job_id}/candidates", response_model=MatchedCandidatesResponse, tags=["Jobs"],
            summary="Get matched candidates for job",
            description="Retrieve AI-ranked candidates matched to this job posting.")
async def get_matched_candidates(job_id: str):
    return MatchedCandidatesResponse(
        job_id=job_id,
        matched_candidates=[
            MatchedCandidate(candidate_id="c2", name="Sarah Chen", match_score=0.92, skill_match=0.95, experience_match=0.88),
            MatchedCandidate(candidate_id="c1", name="John Smith", match_score=0.87, skill_match=0.90, experience_match=0.85),
        ],
    )
