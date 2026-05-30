"""Pair Programming Evaluation domain — Coding sessions, snapshots, evaluations."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class CodingLanguage(str, Enum):
    PYTHON = "python"
    JAVA = "java"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    GO = "go"
    CPP = "cpp"


class SessionStatus(str, Enum):
    CREATED = "created"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    TIMED_OUT = "timed_out"
    ERROR = "error"


class DifficultyLevel(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"


class CodingSession(SQLModel, table=True):
    __tablename__ = "coding_sessions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    interview_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    language: CodingLanguage = CodingLanguage.PYTHON
    status: SessionStatus = SessionStatus.CREATED
    problem_id: str | None = None
    problem_title: str | None = None
    problem_description: str | None = None
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    max_duration_seconds: int = 1800  # 30 minutes default
    started_at: datetime | None = None
    ended_at: datetime | None = None
    room_id: str | None = None  # WebSocket room
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
    line_number: int | None = None
    version: int = 0
    created_by: str = "candidate"  # "candidate" or "ai_agent"
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class ExecutionResult(SQLModel, table=True):
    __tablename__ = "execution_results"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    snapshot_id: str | None = None
    language: CodingLanguage
    code_content: str
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int = 0
    execution_time_ms: int = 0
    memory_used_mb: float = 0.0
    test_results: str | None = None  # JSON — per-test-case results
    all_tests_passed: bool = False
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0
    timeout_exceeded: bool = False
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class CollaborationEvent(SQLModel, table=True):
    __tablename__ = "collaboration_events"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    event_type: str  # "code_edit", "hint_requested", "hint_provided", "message", "cursor_move"
    actor: str  # "candidate" or "ai_agent"
    payload: str | None = None  # JSON
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class PPEEvaluation(SQLModel, table=True):
    __tablename__ = "ppe_evaluations"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)

    # Technical Skills (30%)
    correctness_score: float = Field(default=0.0, ge=0.0, le=10.0)
    efficiency_score: float = Field(default=0.0, ge=0.0, le=10.0)
    algorithm_quality_score: float = Field(default=0.0, ge=0.0, le=10.0)
    edge_case_handling_score: float = Field(default=0.0, ge=0.0, le=10.0)

    # Computer Science (20%)
    big_o_understanding: float = Field(default=0.0, ge=0.0, le=10.0)
    tradeoff_reasoning: float = Field(default=0.0, ge=0.0, le=10.0)
    scalability_awareness: float = Field(default=0.0, ge=0.0, le=10.0)
    data_structures_understanding: float = Field(default=0.0, ge=0.0, le=10.0)

    # Code Quality (15%)
    readability_score: float = Field(default=0.0, ge=0.0, le=10.0)
    maintainability_score: float = Field(default=0.0, ge=0.0, le=10.0)
    modularity_score: float = Field(default=0.0, ge=0.0, le=10.0)
    naming_conventions_score: float = Field(default=0.0, ge=0.0, le=10.0)

    # Problem Solving (20%)
    decomposition_score: float = Field(default=0.0, ge=0.0, le=10.0)
    iterative_reasoning_score: float = Field(default=0.0, ge=0.0, le=10.0)
    debugging_approach_score: float = Field(default=0.0, ge=0.0, le=10.0)
    optimization_strategy_score: float = Field(default=0.0, ge=0.0, le=10.0)

    # Communication (15%)
    explanation_clarity_score: float = Field(default=0.0, ge=0.0, le=10.0)
    collaborative_interaction_score: float = Field(default=0.0, ge=0.0, le=10.0)
    reasoning_transparency_score: float = Field(default=0.0, ge=0.0, le=10.0)

    # Aggregate
    overall_score: float = Field(default=0.0, ge=0.0, le=10.0)
    seniority_estimation: str | None = None  # "junior", "mid", "senior", "staff", "principal"
    confidence_level: float = Field(default=0.0, ge=0.0, le=1.0)
    hiring_recommendation: str | None = None  # "strong_hire", "hire", "neutral", "no_hire"
    strengths: str | None = None  # JSON array
    weaknesses: str | None = None  # JSON array
    reasoning_trace: str | None = None  # JSON — full explainability
    benchmark_comparison: str | None = None  # JSON — comparison to level benchmarks
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


# --- API Schemas ---

class PPESessionCreate(BaseModel):
    interview_id: str
    language: CodingLanguage = CodingLanguage.PYTHON
    difficulty: DifficultyLevel = DifficultyLevel.MEDIUM
    problem_id: str | None = None
    max_duration_seconds: int = Field(default=1800, ge=300, le=7200)


class PPESessionRead(BaseModel):
    id: str
    interview_id: str
    language: CodingLanguage
    status: SessionStatus
    difficulty: DifficultyLevel
    problem_title: str | None
    started_at: datetime | None
    hints_used: int
    total_test_cases_passed: int
    total_test_cases_failed: int
    created_at: datetime

    model_config = {"from_attributes": True}


class CodeExecutionRequest(BaseModel):
    code: str = Field(min_length=1)
    language: CodingLanguage


class PPEEvaluationRead(BaseModel):
    id: str
    session_id: str
    overall_score: float
    seniority_estimation: str | None
    confidence_level: float
    hiring_recommendation: str | None
    strengths: list[str] | None
    weaknesses: list[str] | None
    created_at: datetime

    model_config = {"from_attributes": True}
