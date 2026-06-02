"""Evaluation & Pair Programming domain models."""

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


class Evaluation(SQLModel, table=True):
    __tablename__ = "evaluations"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str | None = None
    evaluation_type: str
    status: str = "pending"
    overall_score: float | None = None
    confidence_score: float | None = None
    ai_model_used: str | None = None
    tokens_consumed: int = 0
    reasoning_trace: str | None = None
    explanation: str | None = None
    dimensions: str | None = None
    benchmark_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class EvaluationCriteria(SQLModel, table=True):
    __tablename__ = "evaluation_criteria"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    description: str | None = None
    category: str
    weight: float = 1.0
    max_score: float = 10.0
    is_active: bool = True
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Benchmark(SQLModel, table=True):
    __tablename__ = "benchmarks"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    level: str
    dimension_averages: str
    sample_size: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# Re-export pair programming models for backwards compatibility
from shared.core.models.pair_programming import CodingSession, CodeSnapshot, ExecutionResult, PPEEvaluation  # noqa: F401


# --- API Schemas ---


class EvaluationCreate(BaseModel):
    candidate_id: str
    job_id: str | None = None
    evaluation_type: EvaluationType


class EvaluationRead(BaseModel):
    id: str
    candidate_id: str
    evaluation_type: str
    status: str
    overall_score: float | None = None
    confidence_score: float | None = None
    explanation: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PPESessionCreate(BaseModel):
    interview_id: str
    language: str = "python"
    difficulty: str = "medium"
    problem_id: str | None = None
    max_duration_seconds: int = Field(default=1800, ge=300, le=7200)


class PPESessionRead(BaseModel):
    id: str
    interview_id: str
    language: str
    status: str
    difficulty: str
    problem_title: str | None = None
    started_at: datetime | None = None
    hints_used: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CodeExecutionRequest(BaseModel):
    code: str = Field(min_length=1)
    language: str = "python"


class PPEEvaluationRead(BaseModel):
    id: str
    session_id: str
    overall_score: float
    seniority_estimation: str | None = None
    confidence_level: float
    hiring_recommendation: str | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
