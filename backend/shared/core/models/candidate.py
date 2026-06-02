"""Candidate domain — Candidate, Profile, Skill, Experience models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class SeniorityLevel(str, Enum):
    INTERN = "intern"
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    STAFF = "staff"
    PRINCIPAL = "principal"
    DIRECTOR = "director"
    VP = "vp"


class CandidateStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    SCREENING = "screening"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Candidate(SQLModel, table=True):
    __tablename__ = "candidates"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    email: str = SQLField(index=True)
    full_name: str
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None
    status: CandidateStatus = CandidateStatus.NEW
    source: str | None = None
    tags: str = "[]"
    notes: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None).replace(tzinfo=None))


class CandidateProfile(SQLModel, table=True):
    __tablename__ = "candidate_profiles"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    candidate_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    summary: str | None = None
    seniority_level: str | None = None
    years_experience: int | None = None
    education: str | None = None
    certifications: str | None = None
    languages: str | None = None
    domains: str | None = None
    raw_profile: str | None = None
    embedding_id: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class Skill(SQLModel, table=True):
    __tablename__ = "skills"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str = SQLField(index=True)
    category: str | None = None
    normalized_name: str = SQLField(index=True)


class CandidateSkill(SQLModel, table=True):
    __tablename__ = "candidate_skills"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    candidate_id: str = SQLField(index=True)
    skill_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    proficiency: str | None = None
    years_used: int | None = None
    source: str | None = None


class ExperienceEntry(SQLModel, table=True):
    __tablename__ = "experience_entries"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    candidate_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    company: str
    title: str
    description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False
    location: str | None = None
    skills_used: str = "[]"
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


# --- API Schemas ---


class CandidateCreate(BaseModel):
    email: str
    full_name: str = Field(min_length=1, max_length=200)
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    source: str | None = None


class CandidateRead(BaseModel):
    id: str
    tenant_id: str
    email: str
    full_name: str
    status: CandidateStatus
    seniority_level: str | None = None
    years_experience: int | None = None
    match_score: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    status: CandidateStatus | None = None
    tags: list[str] | None = None
    notes: str | None = None


class CandidateProfileRead(BaseModel):
    id: str
    candidate_id: str
    summary: str | None = None
    seniority_level: str | None = None
    years_experience: int | None = None
    education: list[dict] | None = None
    domains: list[str] | None = None

    model_config = {"from_attributes": True}


class SkillRead(BaseModel):
    id: str
    name: str
    category: str | None = None
    proficiency: str | None = None
    years_used: int | None = None

    model_config = {"from_attributes": True}


class CandidateEnrichmentResult(BaseModel):
    candidate_id: str
    seniority_level: SeniorityLevel
    years_experience: int
    skills: list[str]
    summary: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    domains: list[str] = []
