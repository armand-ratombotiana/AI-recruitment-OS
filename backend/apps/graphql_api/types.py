"""GraphQL type definitions for AI-ROS."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

import strawberry


@strawberry.type
class CandidateType:
    id: str
    tenant_id: str
    email: str
    full_name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    status: str = "new"
    source: Optional[str] = None
    tags: str = "[]"
    notes: Optional[str] = None
    resume_file_id: Optional[str] = None
    resume_file_name: Optional[str] = None
    resume_content_type: Optional[str] = None
    resume_file_size: Optional[int] = None
    created_at: datetime = strawberry.field(default_factory=datetime.utcnow)
    updated_at: datetime = strawberry.field(default_factory=datetime.utcnow)


@strawberry.type
class JobType:
    id: str
    tenant_id: str
    title: str
    description: str
    department: Optional[str] = None
    location: Optional[str] = None
    remote_policy: Optional[str] = None
    job_type: str = "full_time"
    seniority_required: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: str = "USD"
    required_skills: str = "[]"
    preferred_skills: str = "[]"
    status: str = "draft"
    hiring_manager_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    embedding_id: Optional[str] = None
    applicants_count: int = 0
    is_template: bool = False
    template_name: Optional[str] = None
    template_description: Optional[str] = None
    cloned_from_id: Optional[str] = None
    created_at: datetime = strawberry.field(default_factory=datetime.utcnow)
    updated_at: datetime = strawberry.field(default_factory=datetime.utcnow)


@strawberry.type
class ApplicationType:
    id: str
    tenant_id: str
    candidate_id: str
    job_id: str
    pipeline_id: Optional[str] = None
    current_stage: str = "applied"
    status: str = "applied"
    match_score: Optional[float] = None
    resume_id: Optional[str] = None
    applied_at: datetime = strawberry.field(default_factory=datetime.utcnow)
    updated_at: datetime = strawberry.field(default_factory=datetime.utcnow)


@strawberry.type
class InterviewType:
    id: str
    tenant_id: str
    application_id: str
    candidate_id: str
    job_id: str
    interview_type: str
    status: str = "scheduled"
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_minutes: int = 60
    interviewer_id: Optional[str] = None
    is_ai_interview: bool = False
    room_id: Optional[str] = None
    created_at: datetime = strawberry.field(default_factory=datetime.utcnow)
    updated_at: datetime = strawberry.field(default_factory=datetime.utcnow)


@strawberry.type
class UserType:
    id: str
    tenant_id: str
    email: str
    full_name: str
    role: str = "candidate"
    status: str = "active"
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    mfa_enabled: bool = False
    email_verified: bool = False
    is_demo: bool = False
    last_login_at: Optional[datetime] = None
    created_at: datetime = strawberry.field(default_factory=datetime.utcnow)
    updated_at: datetime = strawberry.field(default_factory=datetime.utcnow)


@strawberry.type
class TenantType:
    id: str
    name: str
    created_at: Optional[datetime] = None


@strawberry.input
class CandidateCreateInput:
    email: str
    full_name: str
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None


@strawberry.input
class CandidateUpdateInput:
    id: str
    full_name: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@strawberry.input
class JobCreateInput:
    title: str
    description: str
    department: Optional[str] = None
    location: Optional[str] = None
    remote_policy: Optional[str] = None
    job_type: Optional[str] = None
    seniority_required: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    required_skills: Optional[str] = None
    preferred_skills: Optional[str] = None


@strawberry.input
class JobUpdateInput:
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    remote_policy: Optional[str] = None
    status: Optional[str] = None
    required_skills: Optional[str] = None
    preferred_skills: Optional[str] = None


@strawberry.input
class ScheduleInterviewInput:
    application_id: str
    candidate_id: str
    job_id: str
    interview_type: str
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    interviewer_id: Optional[str] = None
    is_ai_interview: Optional[bool] = None


@strawberry.input
class UpdateInterviewStatusInput:
    id: str
    status: str


@strawberry.input
class CreateApplicationInput:
    candidate_id: str
    job_id: str
    resume_id: Optional[str] = None


@strawberry.input
class UpdateApplicationStatusInput:
    id: str
    status: str
    current_stage: Optional[str] = None
