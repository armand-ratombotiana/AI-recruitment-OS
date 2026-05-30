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
    dimensions: str | None = None  # JSON
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
    category: str
    weight: float = 1.0
    max_score: float = 10.0
    is_active: bool = True
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class Benchmark(SQLModel, table=True):
    __tablename__ = "benchmarks"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    level: str
    dimension_averages: str  # JSON
    sample_size: int = 0
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class CodingSession(SQLModel, table=True):
    __tablename__ = "coding_sessions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    interview_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    language: str = "python"
    status: str = "created"
    problem_id: str | None = None
    problem_title: str | None = None
    problem_description: str | None = None
    difficulty: str = "medium"
    max_duration_seconds: int = 1800
    started_at: datetime | None = None
    ended_at: datetime | None = None
    room_id: str | None = None
    total_code_executions: int = 0
    total_test_cases_passed: int = 0
    total_test_cases_failed: int = 0
    hints_used: int = 0
    max_hints: int = 3
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class CodeSnapshot(SQLModel, table=True):
    __tablename__ = "code_snapshots"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    code_content: str
    cursor_position: int | None = None
    version: int = 0
    created_by: str = "candidate"
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class ExecutionResult(SQLModel, table=True):
    __tablename__ = "execution_results"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    snapshot_id: str | None = None
    language: str
    code_content: str
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int = 0
    execution_time_ms: int = 0
    memory_used_mb: float = 0.0
    test_results: str | None = None  # JSON
    all_tests_passed: bool = False
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0
    timeout_exceeded: bool = False
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class PPEEvaluation(SQLModel, table=True):
    __tablename__ = "ppe_evaluations"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    # Technical Skills (30%)
    correctness_score: float = 0.0
    efficiency_score: float = 0.0
    algorithm_quality_score: float = 0.0
    edge_case_handling_score: float = 0.0
    # CS Fundamentals (20%)
    big_o_understanding: float = 0.0
    tradeoff_reasoning: float = 0.0
    scalability_awareness: float = 0.0
    data_structures_understanding: float = 0.0
    # Code Quality (15%)
    readability_score: float = 0.0
    maintainability_score: float = 0.0
    modularity_score: float = 0.0
    naming_conventions_score: float = 0.0
    # Problem Solving (20%)
    decomposition_score: float = 0.0
    iterative_reasoning_score: float = 0.0
    debugging_approach_score: float = 0.0
    optimization_strategy_score: float = 0.0
    # Communication (15%)
    explanation_clarity_score: float = 0.0
    collaborative_interaction_score: float = 0.0
    reasoning_transparency_score: float = 0.0
    # Aggregate
    overall_score: float = 0.0
    seniority_estimation: str | None = None
    confidence_level: float = 0.0
    hiring_recommendation: str | None = None
    strengths: str | None = None  # JSON
    weaknesses: str | None = None  # JSON
    reasoning_trace: str | None = None
    benchmark_comparison: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


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
