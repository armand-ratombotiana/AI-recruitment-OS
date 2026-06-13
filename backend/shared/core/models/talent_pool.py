"""Talent Pool domain — TalentPool, TalentPoolMember models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField, JSON, Column


class TalentPoolSource(str):
    """Source of a talent pool member."""
    MANUAL = "manual"
    LINKEDIN = "linkedin"
    GITHUB = "github"
    JOB_BOARD = "job_board"
    REFERRAL = "referral"
    IMPORT = "import"


class TalentPool(SQLModel, table=True):
    __tablename__ = "talent_pools"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str = SQLField(index=True)
    description: str | None = None
    criteria: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class TalentPoolMember(SQLModel, table=True):
    __tablename__ = "talent_pool_members"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    pool_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    added_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    source: str = TalentPoolSource.MANUAL
    score: float | None = None
    meta: dict[str, Any] = SQLField(default_factory=dict, sa_column=Column(JSON))


# --- API Schemas ---


class TalentPoolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    criteria: dict[str, Any] = Field(default_factory=dict)


class TalentPoolUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    criteria: dict[str, Any] | None = None


class TalentPoolRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str | None = None
    criteria: dict[str, Any]
    member_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TalentPoolMemberRead(BaseModel):
    id: str
    pool_id: str
    candidate_id: str
    tenant_id: str
    added_at: datetime
    source: str
    score: float | None = None
    metadata: dict[str, Any]
    candidate: dict | None = None

    model_config = {"from_attributes": True}


class TalentPoolWithMembersRead(BaseModel):
    pool: TalentPoolRead
    members: list[TalentPoolMemberRead]
    total: int


class AddCandidatesRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=1)
    source: str = TalentPoolSource.MANUAL
    metadata: dict[str, Any] = Field(default_factory=dict)


class AddCandidatesResponse(BaseModel):
    pool_id: str
    added: int
    skipped: int
    members: list[TalentPoolMemberRead]


class SearchCriteria(BaseModel):
    keywords: list[str] = Field(default_factory=list)
    location: str | None = None
    seniority: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    years_experience_min: int | None = None
    years_experience_max: int | None = None
    sources: list[str] = Field(default_factory=lambda: ["linkedin", "github"])


class ExternalCandidate(BaseModel):
    id: str
    source: str
    full_name: str
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin_url: str | None = None
    github_url: str | None = None
    headline: str | None = None
    skills: list[str] = Field(default_factory=list)
    years_experience: int | None = None
    seniority: str | None = None
    profile_data: dict[str, Any] = Field(default_factory=dict)


class SearchResponse(BaseModel):
    source: str
    candidates: list[ExternalCandidate]
    total: int
    query: SearchCriteria


class ImportRequest(BaseModel):
    source: str
    criteria: SearchCriteria
    pool_id: str | None = None
    candidate_ids: list[str] | None = None


class ImportResponse(BaseModel):
    imported: int
    candidates: list[ExternalCandidate]
    pool_id: str | None = None
    pool_members_added: int = 0

