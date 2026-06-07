"""Recruitment domain — Job, Pipeline, Application, MatchResult models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class JobStatus(str, Enum):
    DRAFT = "draft"
    OPEN = "open"
    PAUSED = "paused"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"


class ApplicationStatus(str, Enum):
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    INTERVIEWING = "interviewing"
    EVALUATION = "evaluation"
    SHORTLISTED = "shortlisted"
    OFFER_PENDING = "offer_pending"
    OFFERED = "offered"
    HIRED = "hired"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    title: str
    description: str
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    job_type: JobType = JobType.FULL_TIME
    seniority_required: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    currency: str = "USD"
    required_skills: str = "[]"
    preferred_skills: str = "[]"
    status: JobStatus = JobStatus.DRAFT
    hiring_manager_id: str | None = None
    pipeline_id: str | None = None
    embedding_id: str | None = None
    applicants_count: int = 0
    is_template: bool = False
    template_name: str | None = None
    template_description: str | None = None
    cloned_from_id: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None).replace(tzinfo=None))


class Pipeline(SQLModel, table=True):
    __tablename__ = "pipelines"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    description: str | None = None
    stages: str = "[]"
    is_default: bool = False
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Application(SQLModel, table=True):
    __tablename__ = "applications"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)
    pipeline_id: str | None = None
    current_stage: str = "applied"
    status: ApplicationStatus = ApplicationStatus.APPLIED
    match_score: float | None = None
    resume_id: str | None = None
    applied_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# --- API Schemas ---


class JobCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1)
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    job_type: JobType = JobType.FULL_TIME
    seniority_required: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    required_skills: list[str] = []
    preferred_skills: list[str] = []


class JobRead(BaseModel):
    id: str
    tenant_id: str
    title: str
    department: str | None = None
    location: str | None = None
    status: JobStatus
    job_type: JobType
    applicants_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class JobUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    status: JobStatus | None = None
    required_skills: list[str] | None = None
    preferred_skills: list[str] | None = None


class ApplicationCreate(BaseModel):
    candidate_id: str
    job_id: str
    resume_id: str | None = None


class ApplicationRead(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    status: ApplicationStatus
    current_stage: str
    match_score: float | None = None
    applied_at: datetime

    model_config = {"from_attributes": True}


class MatchResult(BaseModel):
    candidate_id: str
    job_id: str
    overall_score: float = Field(ge=0.0, le=1.0)
    skill_match_score: float = Field(ge=0.0, le=1.0)
    experience_match_score: float = Field(ge=0.0, le=1.0)
    semantic_similarity: float = Field(ge=0.0, le=1.0)
    explanation: str
