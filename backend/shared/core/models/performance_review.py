"""Performance Review domain models."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Column, Text
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class ReviewStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    COMPLETED = "completed"


class ReviewQuestionType(str, Enum):
    RATING = "rating"
    TEXT = "text"
    BOTH = "both"


class ReviewCycleStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"


class PerformanceReview(SQLModel, table=True):
    __tablename__ = "performance_reviews"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    reviewee_id: str = SQLField(index=True, nullable=False)
    reviewer_id: str = SQLField(index=True, nullable=False)
    review_cycle: str | None = SQLField(default=None, max_length=255)
    status: str = SQLField(
        default=ReviewStatus.DRAFT.value,
        index=True,
        nullable=False,
        max_length=32,
    )
    overall_score: float | None = None
    strengths: str | None = SQLField(default=None, sa_column=Column(Text))
    improvements: str | None = SQLField(default=None, sa_column=Column(Text))
    goals: str | None = SQLField(default=None, sa_column=Column(Text))
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
    submitted_at: datetime | None = None
    completed_at: datetime | None = None


class ReviewQuestion(SQLModel, table=True):
    __tablename__ = "review_questions"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    category: str = SQLField(default="general", max_length=255, nullable=False)
    question_text: str = SQLField(sa_column=Column(Text, nullable=False))
    question_type: str = SQLField(
        default=ReviewQuestionType.RATING.value,
        nullable=False,
        max_length=32,
    )
    weight: float = SQLField(default=1.0, nullable=False)
    required: bool = SQLField(default=True, nullable=False)
    order: int = SQLField(default=0, nullable=False, index=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class ReviewAnswer(SQLModel, table=True):
    __tablename__ = "review_answers"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    review_id: str = SQLField(index=True, nullable=False)
    question_id: str = SQLField(index=True, nullable=False)
    rating: int | None = SQLField(default=None)
    text_response: str | None = SQLField(default=None, sa_column=Column(Text))
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class ReviewCycle(SQLModel, table=True):
    __tablename__ = "review_cycles"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str = SQLField(max_length=255, nullable=False)
    start_date: datetime = SQLField(nullable=False)
    end_date: datetime = SQLField(nullable=False)
    status: str = SQLField(
        default=ReviewCycleStatus.ACTIVE.value,
        index=True,
        nullable=False,
        max_length=32,
    )
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class PerformanceReviewCreate(BaseModel):
    reviewee_id: str = Field(..., min_length=1)
    reviewer_id: str = Field(..., min_length=1)
    review_cycle: str | None = Field(default=None, max_length=255)
    strengths: str | None = None
    improvements: str | None = None
    goals: str | None = None


class PerformanceReviewUpdate(BaseModel):
    overall_score: float | None = Field(default=None, ge=0, le=5)
    strengths: str | None = None
    improvements: str | None = None
    goals: str | None = None


class PerformanceReviewRead(BaseModel):
    id: str
    tenant_id: str
    reviewee_id: str
    reviewer_id: str
    review_cycle: str | None = None
    status: str
    overall_score: float | None = None
    strengths: str | None = None
    improvements: str | None = None
    goals: str | None = None
    created_at: datetime
    submitted_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class PerformanceReviewListResponse(BaseModel):
    data: list[PerformanceReviewRead]
    total: int


class ReviewAnswerCreate(BaseModel):
    question_id: str = Field(..., min_length=1)
    rating: int | None = Field(default=None, ge=1, le=5)
    text_response: str | None = None


class ReviewAnswerRead(BaseModel):
    id: str
    review_id: str
    question_id: str
    rating: int | None = None
    text_response: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewQuestionCreate(BaseModel):
    category: str = Field(default="general", max_length=255)
    question_text: str = Field(..., min_length=1)
    question_type: str = Field(default="rating", max_length=32)
    weight: float = Field(default=1.0, ge=0)
    required: bool = True
    order: int = Field(default=0, ge=0)


class ReviewQuestionRead(BaseModel):
    id: str
    tenant_id: str
    category: str
    question_text: str
    question_type: str
    weight: float
    required: bool
    order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewQuestionListResponse(BaseModel):
    data: list[ReviewQuestionRead]
    total: int


class ReviewCycleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    start_date: datetime
    end_date: datetime
    status: str = Field(default="active", max_length=32)


class ReviewCycleRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    start_date: datetime
    end_date: datetime
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ReviewCycleListResponse(BaseModel):
    data: list[ReviewCycleRead]
    total: int


__all__ = [
    "PerformanceReview",
    "ReviewQuestion",
    "ReviewAnswer",
    "ReviewCycle",
    "ReviewStatus",
    "ReviewQuestionType",
    "ReviewCycleStatus",
    "PerformanceReviewCreate",
    "PerformanceReviewUpdate",
    "PerformanceReviewRead",
    "PerformanceReviewListResponse",
    "ReviewAnswerCreate",
    "ReviewAnswerRead",
    "ReviewQuestionCreate",
    "ReviewQuestionRead",
    "ReviewQuestionListResponse",
    "ReviewCycleCreate",
    "ReviewCycleRead",
    "ReviewCycleListResponse",
]
