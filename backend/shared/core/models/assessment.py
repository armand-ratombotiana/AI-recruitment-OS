"""Assessment domain — AI-generated quizzes, coding challenges, and auto-grading.

A :class:`Assessment` is a tenant-scoped test container that is generated for a
specific candidate / job pair.  The body of the assessment is a list of
:class:`Question` rows, each carrying:

* a ``type`` (multiple choice, short answer, free-text, or coding);
* the human-facing ``prompt``;
* for MCQs, a JSON ``options`` list and the ``correct_answer``;
* a ``points`` value that contributes to the assessment's max score.

When a candidate completes the test, their submission is stored as a set of
:class:`Answer` rows linked back to the assessment and the originating
question.  The assessment itself tracks the auto-graded ``score`` and
``max_score`` so the front-end can render a results screen in one round-trip.

The full set of endpoints that operate on these tables lives in
:mod:`apps.assessment_service.main`.  Question generation is delegated to
:mod:`shared.assessments.generator`, which is the only module that talks to
the LLM router.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlalchemy import Column, JSON, Text
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


# ── Enumerations ──────────────────────────────────────────────────────────────


class AssessmentStatus(str, Enum):
    """Lifecycle states for an assessment.

    * ``draft``     — created but no questions generated yet
    * ``ready``     — questions generated, not yet sent to the candidate
    * ``in_progress`` — the candidate is mid-submission
    * ``submitted``  — answers stored, awaiting grading
    * ``completed``  — auto-graded, results available
    * ``expired``    — past the soft expiry, no longer accepted for grading
    """

    DRAFT = "draft"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    COMPLETED = "completed"
    EXPIRED = "expired"


class QuestionType(str, Enum):
    """What kind of answer the question expects.

    * ``mcq``          — single-choice multiple choice
    * ``short_answer`` — a short free-form response (one or two sentences)
    * ``text``         — a longer free-form response (essay-style)
    * ``coding``       — source code (graded via the LLM)
    """

    MCQ = "mcq"
    SHORT_ANSWER = "short_answer"
    TEXT = "text"
    CODING = "coding"


# ── Tables ────────────────────────────────────────────────────────────────────


class Assessment(SQLModel, table=True):
    """Top-level assessment container.

    ``score`` and ``max_score`` are populated when the assessment is
    auto-graded.  ``status`` mirrors :class:`AssessmentStatus`; the value
    is stored as a plain string for forward compatibility with new states
    added in the future.
    """

    __tablename__ = "assessments"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)
    job_id: Optional[str] = SQLField(default=None, index=True)
    title: str = SQLField(max_length=255, nullable=False)
    description: Optional[str] = SQLField(default=None, sa_column=Column(Text))
    status: str = SQLField(
        default=AssessmentStatus.DRAFT.value,
        index=True,
        nullable=False,
        max_length=32,
    )
    score: float = SQLField(default=0.0, nullable=False)
    max_score: float = SQLField(default=0.0, nullable=False)
    topic: Optional[str] = SQLField(default=None, max_length=255)
    difficulty: Optional[str] = SQLField(default=None, max_length=32)
    question_count: int = SQLField(default=0, nullable=False)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    completed_at: Optional[datetime] = SQLField(default=None)
    expires_at: Optional[datetime] = SQLField(default=None)
    metadata_: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column("metadata", JSON, nullable=False, default=dict),
        description="Free-form metadata: model used, generation latency, …",
    )


class Question(SQLModel, table=True):
    """A single question within an :class:`Assessment`.

    ``options`` is a JSON list of strings (only meaningful for ``mcq``
    questions) and ``correct_answer`` is stored as a string.  For MCQs
    the answer is the option text; for short answers it's the canonical
    response; for coding questions it's a reference solution.  Coding
    answers are graded with the LLM and the reference is only used as a
    hint — the model is allowed to accept equivalent implementations.
    """

    __tablename__ = "assessment_questions"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    assessment_id: str = SQLField(index=True, nullable=False)
    type: str = SQLField(
        default=QuestionType.MCQ.value,
        nullable=False,
        max_length=32,
        description="mcq | short_answer | text | coding",
    )
    prompt: str = SQLField(sa_column=Column(Text, nullable=False))
    options: list[Any] = SQLField(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
        description="JSON list of option strings (mcq only)",
    )
    correct_answer: Optional[str] = SQLField(
        default=None,
        sa_column=Column(Text),
        description="Reference / canonical answer",
    )
    points: float = SQLField(default=1.0, nullable=False)
    order: int = SQLField(default=0, nullable=False, index=True)
    explanation: Optional[str] = SQLField(default=None, sa_column=Column(Text))
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class Answer(SQLModel, table=True):
    """A candidate's response to a single :class:`Question`.

    ``response`` is the raw text/option submitted by the candidate and
    ``score`` is the auto-graded score for this answer (in points, not
    a 0..1 ratio).  ``feedback`` is human-readable commentary produced by
    the auto-grader — for MCQs this is just ``"correct"`` /
    ``"incorrect"``; for free-form and coding answers it includes the
    LLM's reasoning.
    """

    __tablename__ = "assessment_answers"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    assessment_id: str = SQLField(index=True, nullable=False)
    question_id: str = SQLField(index=True, nullable=False)
    response: str = SQLField(sa_column=Column(Text, nullable=False))
    score: float = SQLField(default=0.0, nullable=False)
    feedback: Optional[str] = SQLField(default=None, sa_column=Column(Text))
    submitted_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)


# ── API schemas ───────────────────────────────────────────────────────────────


class AssessmentCreate(BaseModel):
    """Payload for creating a new assessment.

    ``question_count``, ``difficulty``, and ``question_type`` are optional;
    when omitted the service picks reasonable defaults (5 questions,
    ``medium`` difficulty, mixed types).
    """

    candidate_id: str = Field(..., min_length=1, description="Candidate the assessment is for")
    job_id: Optional[str] = Field(default=None, description="Optional job the assessment targets")
    title: str = Field(..., min_length=1, max_length=255, description="Display title for the assessment")
    description: Optional[str] = Field(default=None, max_length=2000)
    topic: Optional[str] = Field(default=None, max_length=255, description="Subject area for question generation")
    difficulty: Optional[str] = Field(default=None, max_length=32, description="easy | medium | hard")
    question_count: int = Field(default=5, ge=1, le=50, description="How many questions to generate (1..50)")
    question_type: Optional[str] = Field(
        default=None,
        max_length=32,
        description="mcq | short_answer | text | coding | mixed",
    )
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=365)


class QuestionRead(BaseModel):
    id: str
    type: str
    prompt: str
    options: list[Any] = Field(default_factory=list)
    points: float
    order: int

    model_config = {"from_attributes": True}


class AssessmentRead(BaseModel):
    id: str
    tenant_id: str
    candidate_id: str
    job_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    status: str
    score: float
    max_score: float
    topic: Optional[str] = None
    difficulty: Optional[str] = None
    question_count: int
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AssessmentDetail(AssessmentRead):
    questions: list[QuestionRead] = Field(default_factory=list)


class AssessmentListResponse(BaseModel):
    data: list[AssessmentRead]
    total: int


class AssessmentCreateResponse(BaseModel):
    assessment: AssessmentRead
    questions: list[QuestionRead] = Field(default_factory=list)
    generated: int = Field(..., description="How many questions were generated")
    source: str = Field(..., description="llm | fallback")


class AnswerSubmit(BaseModel):
    """One answer in a submission.  ``response`` holds whatever the candidate typed."""

    question_id: str = Field(..., min_length=1)
    response: str = Field(..., min_length=1)


class SubmitAnswersRequest(BaseModel):
    answers: list[AnswerSubmit] = Field(default_factory=list)


class AnswerRead(BaseModel):
    id: str
    assessment_id: str
    question_id: str
    response: str
    score: float
    feedback: Optional[str] = None
    submitted_at: datetime

    model_config = {"from_attributes": True}


class SubmitAnswersResponse(BaseModel):
    assessment_id: str
    status: str
    score: float
    max_score: float
    answers: list[AnswerRead] = Field(default_factory=list)
    graded: int = Field(..., description="How many answers were auto-graded")


class AssessmentResultsResponse(BaseModel):
    assessment: AssessmentRead
    answers: list[AnswerRead] = Field(default_factory=list)
    questions: list[QuestionRead] = Field(default_factory=list)
    percentage: float = Field(..., description="score / max_score * 100, 0 if max_score is 0")


__all__ = [
    "Answer",
    "AnswerRead",
    "AnswerSubmit",
    "Assessment",
    "AssessmentCreate",
    "AssessmentCreateResponse",
    "AssessmentDetail",
    "AssessmentListResponse",
    "AssessmentRead",
    "AssessmentResultsResponse",
    "AssessmentStatus",
    "Question",
    "QuestionRead",
    "QuestionType",
    "SubmitAnswersRequest",
    "SubmitAnswersResponse",
]
