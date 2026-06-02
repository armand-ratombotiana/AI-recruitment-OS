"""Pair Programming domain models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field as SQLField


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
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class CodeSnapshot(SQLModel, table=True):
    __tablename__ = "code_snapshots"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    code_content: str
    cursor_position: int | None = None
    version: int = 0
    created_by: str = "candidate"
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


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
    test_results: str | None = None
    all_tests_passed: bool = False
    total_tests: int = 0
    passed_tests: int = 0
    failed_tests: int = 0
    timeout_exceeded: bool = False
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class PPEEvaluation(SQLModel, table=True):
    __tablename__ = "ppe_evaluations"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    correctness_score: float = 0.0
    efficiency_score: float = 0.0
    algorithm_quality_score: float = 0.0
    edge_case_handling_score: float = 0.0
    big_o_understanding: float = 0.0
    tradeoff_reasoning: float = 0.0
    scalability_awareness: float = 0.0
    data_structures_understanding: float = 0.0
    readability_score: float = 0.0
    maintainability_score: float = 0.0
    modularity_score: float = 0.0
    naming_conventions_score: float = 0.0
    decomposition_score: float = 0.0
    iterative_reasoning_score: float = 0.0
    debugging_approach_score: float = 0.0
    optimization_strategy_score: float = 0.0
    explanation_clarity_score: float = 0.0
    collaborative_interaction_score: float = 0.0
    reasoning_transparency_score: float = 0.0
    overall_score: float = 0.0
    seniority_estimation: str | None = None
    confidence_level: float = 0.0
    hiring_recommendation: str | None = None
    strengths: str | None = None
    weaknesses: str | None = None
    reasoning_trace: str | None = None
    benchmark_comparison: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
