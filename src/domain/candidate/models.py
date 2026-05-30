"""Candidate domain — Candidate aggregate and skill graph."""

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
    tags: str = SQLField(default="[]")  # JSON array
    notes: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class CandidateProfile(SQLModel, table=True):
    __tablename__ = "candidate_profiles"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    candidate_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    summary: str | None = None
    seniority_level: SeniorityLevel | None = None
    years_experience: int | None = None
    education: str | None = None  # JSON
    certifications: str | None = None  # JSON
    languages: str | None = None  # JSON
    domains: str | None = None  # JSON array of domain expertise
    raw_profile: str | None = None  # JSON — full enriched profile
    embedding_id: str | None = None  # Reference to vector embedding
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class Skill(SQLModel, table=True):
    __tablename__ = "skills"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str = SQLField(index=True)
    category: str | None = None  # e.g., "programming_language", "framework", "soft_skill"
    normalized_name: str = SQLField(index=True)  # lowercased, trimmed


class CandidateSkill(SQLModel, table=True):
    __tablename__ = "candidate_skills"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    candidate_id: str = SQLField(index=True)
    skill_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    proficiency: str | None = None  # "beginner", "intermediate", "advanced", "expert"
    years_used: int | None = None
    source: str | None = None  # "resume_parsed", "interview", "self_reported"


# --- API Schemas ---

class CandidateCreate(BaseModel):
    email: EmailStr
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
    seniority_level: SeniorityLevel | None = None
    years_experience: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CandidateEnrichmentResult(BaseModel):
    candidate_id: str
    seniority_level: SeniorityLevel
    years_experience: int
    skills: list[str]
    summary: str
    confidence_score: float = Field(ge=0.0, le=1.0)
