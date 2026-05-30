"""Interview domain — Interview, Session, Feedback, Question models."""

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
    interview_type: str
    status: InterviewStatus = InterviewStatus.SCHEDULED
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int = 60
    interviewer_id: str | None = None
    is_ai_interview: bool = False
    room_id: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class InterviewSession(SQLModel, table=True):
    __tablename__ = "interview_sessions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    interview_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    transcript: str | None = None  # JSON
    recording_url: str | None = None
    ai_agent_id: str | None = None
    agent_model: str | None = None
    total_tokens_used: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class InterviewQuestion(SQLModel, table=True):
    __tablename__ = "interview_questions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    question_text: str
    question_type: str  # "technical", "behavioral", "follow_up"
    candidate_answer: str | None = None
    ai_evaluation: str | None = None  # JSON
    score: float | None = None
    order_index: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class InterviewFeedback(SQLModel, table=True):
    __tablename__ = "interview_feedback"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    interview_id: str = SQLField(index=True)
    session_id: str | None = None
    tenant_id: str = SQLField(index=True)
    reviewer_id: str | None = None
    is_ai_generated: bool = False
    overall_score: float | None = None
    technical_score: float | None = None
    communication_score: float | None = None
    cultural_fit_score: float | None = None
    strengths: str | None = None  # JSON
    weaknesses: str | None = None  # JSON
    recommendation: str | None = None
    notes: str | None = None
    reasoning_trace: str | None = None  # JSON
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


# --- API Schemas ---

class InterviewCreate(BaseModel):
    application_id: str
    interview_type: InterviewType
    scheduled_at: datetime | None = None
    duration_minutes: int = Field(default=60, ge=15, le=480)
    interviewer_id: str | None = None
    is_ai_interview: bool = False


class InterviewRead(BaseModel):
    id: str
    tenant_id: str
    application_id: str
    candidate_id: str
    job_id: str
    interview_type: str
    status: InterviewStatus
    scheduled_at: datetime | None = None
    is_ai_interview: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class InterviewFeedbackCreate(BaseModel):
    overall_score: float | None = Field(default=None, ge=0.0, le=10.0)
    technical_score: float | None = Field(default=None, ge=0.0, le=10.0)
    communication_score: float | None = Field(default=None, ge=0.0, le=10.0)
    cultural_fit_score: float | None = Field(default=None, ge=0.0, le=10.0)
    strengths: list[str] = []
    weaknesses: list[str] = []
    recommendation: str | None = None
    notes: str | None = None


class InterviewFeedbackRead(BaseModel):
    id: str
    interview_id: str
    is_ai_generated: bool
    overall_score: float | None = None
    recommendation: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
