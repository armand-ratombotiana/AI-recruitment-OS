"""Evaluation domain — AI evaluation, criteria, results, benchmarks."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class EvaluationType(str, Enum):
    RESUME_SCREENING = "resume_screening"
    SKILL_MATCH = "skill_match"
    SEMANTIC_MATCH = "semantic_match"
    SENIORITY_ESTIMATION = "seniority_estimation"
    INTERVIEW_SCORING = "interview_scoring"
    PPE_SCORING = "ppe_scoring"
    COMPREHENSIVE = "comprehensive"


class EvaluationStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class Evaluation(SQLModel, table=True):
    __tablename__ = "evaluations"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str | None = None
    evaluation_type: EvaluationType
    status: EvaluationStatus = EvaluationStatus.PENDING
    overall_score: float | None = Field(default=None, ge=0.0, le=10.0)
    confidence_score: float | None = Field(default=None, ge=0.0, le=1.0)
    ai_model_used: str | None = None
    tokens_consumed: int = 0
    reasoning_trace: str | None = None  # JSON — full AI reasoning
    explanation: str | None = None  # Human-readable explanation
    dimensions: str | None = None  # JSON — per-dimension scores
    benchmark_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class EvaluationCriteria(SQLModel, table=True):
    __tablename__ = "evaluation_criteria"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    description: str | None = None
    category: str  # "technical", "behavioral", "cultural", "experience"
    weight: float = Field(default=1.0, ge=0.0, le=10.0)
    max_score: float = 10.0
    is_active: bool = True
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class Benchmark(SQLModel, table=True):
    __tablename__ = "benchmarks"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    level: str  # "junior", "mid", "senior", "staff", "principal"
    dimension_averages: str  # JSON — average scores per dimension
    sample_size: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


# --- API Schemas ---

class EvaluationCreate(BaseModel):
    candidate_id: str
    job_id: str | None = None
    evaluation_type: EvaluationType


class EvaluationRead(BaseModel):
    id: str
    candidate_id: str
    evaluation_type: EvaluationType
    status: EvaluationStatus
    overall_score: float | None
    confidence_score: float | None
    explanation: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
