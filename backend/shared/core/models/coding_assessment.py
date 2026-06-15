"""Coding assessment domain — live coding problems, submissions, and sandbox execution.

Provides two SQLModel tables:

* :class:`CodingProblem` — tenant-scoped coding challenges with starter code,
  test cases, and reference solutions.
* :class:`CodingSubmission` — candidate submissions with execution results.

Endpoints live in :mod:`apps.coding_assessment.main`.  Code execution is
delegated to :class:`shared.coding.sandbox.CodeSandbox`.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class CodingProblem(SQLModel, table=True):
    """A tenant-scoped coding challenge."""

    __tablename__ = "coding_problems"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)

    title: str = SQLField(max_length=255, nullable=False)
    description: str = SQLField(nullable=False)
    difficulty: str = SQLField(default="medium", max_length=32, nullable=False)

    starter_code: str = SQLField(default="")
    test_cases: str = SQLField(default="[]")
    solution: str = SQLField(default="")
    tags: str = SQLField(default="[]")

    time_limit_minutes: int = SQLField(default=30, nullable=False)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)


class CodingSubmission(SQLModel, table=True):
    """A candidate's submission for a coding problem."""

    __tablename__ = "coding_submissions"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    problem_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)

    code: str = SQLField(nullable=False)
    language: str = SQLField(max_length=32, nullable=False)

    status: str = SQLField(default="pending", max_length=32, nullable=False)
    output: Optional[str] = SQLField(default=None)
    error: Optional[str] = SQLField(default=None)

    test_results: str = SQLField(default="[]")
    execution_time_ms: Optional[int] = SQLField(default=None)

    submitted_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
    completed_at: Optional[datetime] = SQLField(default=None)


__all__ = [
    "CodingProblem",
    "CodingSubmission",
]
