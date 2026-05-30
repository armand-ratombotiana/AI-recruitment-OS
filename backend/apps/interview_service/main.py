"""Interview Service — Interview scheduling, status management, and feedback."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class InterviewCreateRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    job_id: str = Field(..., description="Job ID")
    interview_type: str = Field(..., description="pair_programming | system_design | hr_screening | technical")
    scheduled_at: str = Field(..., description="ISO 8601 datetime", examples=["2025-01-20T14:00:00Z"])
    is_ai_interview: bool = Field(default=True, description="Whether AI conducts the interview")


class FeedbackRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Overall rating (1-5)")
    notes: str = Field(default="", description="Interviewer notes")
    recommendation: str = Field(default="neutral", description="strong_hire | hire | neutral | no_hire | strong_no_hire")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "interview"


class InterviewSummary(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    interview_type: str
    status: str
    scheduled_at: str | None = None
    is_ai_interview: bool


class InterviewListResponse(BaseModel):
    data: list[InterviewSummary]
    total: int


class InterviewDetailResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    interview_type: str
    status: str
    is_ai_interview: bool
    scheduled_at: str | None = None


class InterviewCreateResponse(BaseModel):
    id: str
    created: bool = True


class InterviewStartResponse(BaseModel):
    id: str
    status: str = "in_progress"
    started_at: str


class InterviewCompleteResponse(BaseModel):
    id: str
    status: str = "completed"
    completed_at: str


class InterviewFeedbackResponse(BaseModel):
    id: str
    feedback_submitted: bool = True


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Interviews"], summary="Interview service health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=InterviewListResponse, tags=["Interviews"], summary="List interviews",
            description="Retrieve a paginated list of interviews with optional filters.")
async def list_interviews():
    return InterviewListResponse(data=[
        InterviewSummary(id="i1", candidate_id="c1", job_id="j1", interview_type="pair_programming",
                         status="scheduled", scheduled_at="2025-01-20T14:00:00Z", is_ai_interview=True),
        InterviewSummary(id="i2", candidate_id="c2", job_id="j2", interview_type="system_design",
                         status="completed", is_ai_interview=True),
        InterviewSummary(id="i3", candidate_id="c3", job_id="j1", interview_type="hr_screening",
                         status="in_progress", is_ai_interview=True),
    ], total=3)


@router.get("/{interview_id}", response_model=InterviewDetailResponse, tags=["Interviews"], summary="Get interview details")
async def get_interview(interview_id: str):
    return InterviewDetailResponse(
        id=interview_id, candidate_id="c1", job_id="j1", interview_type="pair_programming",
        status="scheduled", is_ai_interview=True, scheduled_at="2025-01-20T14:00:00Z",
    )


@router.post("/", response_model=InterviewCreateResponse, tags=["Interviews"], summary="Schedule interview",
             description="Schedule a new interview for a candidate.")
async def create_interview():
    return InterviewCreateResponse(id="i_new")


@router.post("/{interview_id}/start", response_model=InterviewStartResponse, tags=["Interviews"],
             summary="Start interview", description="Transition interview status to in_progress.")
async def start_interview(interview_id: str):
    return InterviewStartResponse(id=interview_id, started_at="2025-01-20T14:00:00Z")


@router.post("/{interview_id}/complete", response_model=InterviewCompleteResponse, tags=["Interviews"],
             summary="Complete interview", description="Mark interview as completed and trigger evaluation.")
async def complete_interview(interview_id: str):
    return InterviewCompleteResponse(id=interview_id, completed_at="2025-01-20T15:00:00Z")


@router.post("/{interview_id}/feedback", response_model=InterviewFeedbackResponse, tags=["Interviews"],
             summary="Submit interview feedback")
async def submit_feedback(interview_id: str):
    return InterviewFeedbackResponse(id=interview_id)
