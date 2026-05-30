"""Interview domain — Interview, Session, Feedback aggregates."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class InterviewType(str, Enum):
    HR_SCREENING = "hr_screening"
    TECHNICAL = "technical"
    BEHAVIORAL = "behavioral"
    PAIR_PROGRAMMING = "pair_programming"
    SYSTEM_DESIGN = "system_design"
    DEBUGGING = "debugging"
    CODING = "coding"
    AI_CONVERSATIONAL = "ai_conversational"


class InterviewStatus(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class Interview(SQLModel, table=True):
    __tablename__ = "interviews"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    application_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)
    interview_type: InterviewType
    status: InterviewStatus = InterviewStatus.SCHEDULED
    scheduled_at: datetime | None = None
    duration_minutes: int = 60
    interviewer_id: str | None = None  # Human or AI agent ID
    is_ai_interview: bool = False
    room_id: str | None = None  # WebSocket room for live sessions
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class InterviewSession(SQLModel, table=True):
    __tablename__ = "interview_sessions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    interview_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    transcript: str | None = None  # JSON — full conversation transcript
    recording_url: str | None = None
    ai_agent_id: str | None = None
    agent_model: str | None = None
    total_tokens_used: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class InterviewFeedback(SQLModel, table=True):
    __tablename__ = "interview_feedback"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    interview_id: str = SQLField(index=True)
    session_id: str | None = None
    tenant_id: str = SQLField(index=True)
    reviewer_id: str | None = None  # Human or "ai_agent"
    is_ai_generated: bool = False
    overall_score: float | None = Field(default=None, ge=0.0, le=10.0)
    technical_score: float | None = Field(default=None, ge=0.0, le=10.0)
    communication_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cultural_fit_score: float | None = Field(default=None, ge=0.0, le=10.0)
    strengths: str | None = None  # JSON array
    weaknesses: str | None = None  # JSON array
    recommendation: str | None = None  # "strong_hire", "hire", "neutral", "no_hire", "strong_no_hire"
    notes: str | None = None
    reasoning_trace: str | None = None  # JSON — explainability data
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


# --- API Schemas ---

class InterviewCreate(BaseModel):
    application_id: str
    interview_type: InterviewType
    scheduled_at: datetime | None = None
    duration_minutes: int = Field(default=60, ge=15, le=480)
    is_ai_interview: bool = False


class InterviewRead(BaseModel):
    id: str
    tenant_id: str
    interview_type: InterviewType
    status: InterviewStatus
    scheduled_at: datetime | None
    is_ai_interview: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class InterviewFeedbackCreate(BaseModel):
    overall_score: float | None = Field(default=None, ge=0.0, le=10.0)
    technical_score: float | None = Field(default=None, ge=0.0, le=10.0)
    communication_score: float | None = Field(default=None, ge=0.0, le=10.0)
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendation: str | None = None
    notes: str | None = None
