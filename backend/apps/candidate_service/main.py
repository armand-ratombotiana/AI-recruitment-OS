"""Candidate Service — CRUD, AI enrichment, skill extraction, and job matching."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class CandidateCreateRequest(BaseModel):
    email: str = Field(..., description="Candidate email")
    full_name: str = Field(..., description="Full name")
    phone: str | None = Field(None, description="Phone number")
    seniority_level: str | None = Field(None, description="junior | mid | senior | staff | principal")
    years_experience: int | None = Field(None, ge=0, description="Years of experience")

    model_config = {"json_schema_extra": {"examples": [
        {"email": "john@email.com", "full_name": "John Smith", "seniority_level": "senior", "years_experience": 8}
    ]}}


class CandidateUpdateRequest(BaseModel):
    email: str | None = None
    full_name: str | None = None
    phone: str | None = None
    seniority_level: str | None = None
    years_experience: int | None = None


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "candidate"


class CandidateSummary(BaseModel):
    id: str
    email: str
    full_name: str
    status: str
    seniority_level: str
    years_experience: int
    match_score: float = Field(..., description="AI-generated match score (0-1)")


class CandidateListResponse(BaseModel):
    data: list[CandidateSummary]
    total: int


class SkillInfo(BaseModel):
    name: str
    proficiency: str
    years: int | None = None


class CandidateProfile(BaseModel):
    summary: str
    skills: list[SkillInfo]
    domains: list[str]


class CandidateDetailResponse(BaseModel):
    id: str
    email: str
    full_name: str
    status: str
    seniority_level: str
    years_experience: int
    profile: CandidateProfile


class CandidateCreateResponse(BaseModel):
    id: str
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


class EnrichmentStatusResponse(BaseModel):
    candidate_id: str
    status: str
    enriched_at: str
    enrichment_result: dict


class JobMatch(BaseModel):
    job_id: str
    title: str
    match_score: float
    skill_match: float


class MatchCandidateResponse(BaseModel):
    candidate_id: str
    matches: list[JobMatch]
    total_matches: int


class CandidateSkillsResponse(BaseModel):
    candidate_id: str
    skills: list[SkillInfo]


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Candidates"], summary="Candidate service health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=CandidateListResponse, tags=["Candidates"], summary="List candidates",
            description="Retrieve a paginated list of candidates with optional filters.")
async def list_candidates():
    return CandidateListResponse(data=[
        CandidateSummary(id="c1", email="john@email.com", full_name="John Smith", status="screening",
                         seniority_level="senior", years_experience=8, match_score=0.87),
        CandidateSummary(id="c2", email="sarah@email.com", full_name="Sarah Chen", status="interviewing",
                         seniority_level="staff", years_experience=12, match_score=0.92),
        CandidateSummary(id="c3", email="mike@email.com", full_name="Mike Johnson", status="new",
                         seniority_level="mid", years_experience=4, match_score=0.75),
        CandidateSummary(id="c4", email="emily@email.com", full_name="Emily Davis", status="screening",
                         seniority_level="senior", years_experience=7, match_score=0.83),
        CandidateSummary(id="c5", email="alex@email.com", full_name="Alex Kim", status="hired",
                         seniority_level="mid", years_experience=5, match_score=0.79),
    ], total=5)


@router.get("/{candidate_id}", response_model=CandidateDetailResponse, tags=["Candidates"], summary="Get candidate details")
async def get_candidate(candidate_id: str):
    return CandidateDetailResponse(
        id=candidate_id, email="john@email.com", full_name="John Smith", status="screening",
        seniority_level="senior", years_experience=8,
        profile=CandidateProfile(
            summary="Senior backend engineer with 8 years experience",
            skills=[SkillInfo(name="Python", proficiency="expert"), SkillInfo(name="PostgreSQL", proficiency="advanced"),
                    SkillInfo(name="Kubernetes", proficiency="advanced")],
            domains=["Backend", "Infrastructure"],
        ),
    )


@router.post("/", response_model=CandidateCreateResponse, tags=["Candidates"], summary="Create candidate",
             description="Create a new candidate profile.")
async def create_candidate(data: CandidateCreateRequest):
    return CandidateCreateResponse(id="c_new")


@router.put("/{candidate_id}", response_model=CandidateUpdateResponse, tags=["Candidates"], summary="Update candidate")
async def update_candidate(candidate_id: str):
    return CandidateUpdateResponse(id=candidate_id)


@router.delete("/{candidate_id}", response_model=CandidateDeleteResponse, tags=["Candidates"], summary="Delete candidate")
async def delete_candidate(candidate_id: str):
    return CandidateDeleteResponse(id=candidate_id)


@router.post("/{candidate_id}/enrich", response_model=EnrichmentTaskResponse, tags=["Candidates"],
             summary="AI candidate enrichment",
             description="Trigger AI-powered enrichment to extract skills, seniority, and generate a profile summary.")
async def enrich_candidate(candidate_id: str):
    return EnrichmentTaskResponse(
        candidate_id=candidate_id, task_id="task_456",
        enrichment_fields=["skills", "seniority", "summary", "domains"],
        estimated_completion="2025-01-20T10:02:00Z",
    )


@router.get("/{candidate_id}/enrichment-status", response_model=EnrichmentStatusResponse, tags=["Candidates"],
            summary="Get enrichment task status")
async def get_enrichment_status(candidate_id: str):
    return EnrichmentStatusResponse(
        candidate_id=candidate_id, status="completed", enriched_at="2025-01-20T10:01:30Z",
        enrichment_result={"skills_extracted": 12, "seniority_estimated": "senior", "confidence": 0.89,
                           "summary": "Senior backend engineer with expertise in Python and distributed systems."},
    )


@router.post("/{candidate_id}/match", response_model=MatchCandidateResponse, tags=["Candidates"],
             summary="Match candidate to jobs",
             description="Use AI to find the best matching open positions for a candidate.")
async def match_candidate_to_jobs(candidate_id: str):
    return MatchCandidateResponse(
        candidate_id=candidate_id,
        matches=[JobMatch(job_id="j1", title="Senior Backend Engineer", match_score=0.92, skill_match=0.95),
                 JobMatch(job_id="j3", title="ML Engineer", match_score=0.78, skill_match=0.72)],
        total_matches=2,
    )


@router.get("/{candidate_id}/skills", response_model=CandidateSkillsResponse, tags=["Candidates"],
            summary="Get candidate skills")
async def get_candidate_skills(candidate_id: str):
    return CandidateSkillsResponse(candidate_id=candidate_id, skills=[
        SkillInfo(name="Python", proficiency="expert", years=7),
        SkillInfo(name="PostgreSQL", proficiency="advanced", years=6),
        SkillInfo(name="Kubernetes", proficiency="advanced", years=4),
    ])
