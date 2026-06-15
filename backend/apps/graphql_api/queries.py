"""GraphQL query resolvers for AI-ROS."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

import strawberry
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from apps.graphql_api.types import (
    CandidateType,
    JobType,
    ApplicationType,
    InterviewType,
    UserType,
    TenantType,
)
from shared.core.models.candidate import Candidate
from shared.core.models.recruitment import Job, Application
from shared.core.models.interview import Interview
from shared.core.models.identity import User


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _candidate_to_type(c: Candidate) -> CandidateType:
    return CandidateType(
        id=c.id,
        tenant_id=c.tenant_id,
        email=c.email,
        full_name=c.full_name,
        phone=c.phone,
        location=c.location,
        linkedin_url=c.linkedin_url,
        portfolio_url=c.portfolio_url,
        status=c.status.value if hasattr(c.status, "value") else str(c.status),
        source=c.source,
        tags=c.tags,
        notes=c.notes,
        resume_file_id=c.resume_file_id,
        resume_file_name=c.resume_file_name,
        resume_content_type=c.resume_content_type,
        resume_file_size=c.resume_file_size,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _job_to_type(j: Job) -> JobType:
    return JobType(
        id=j.id,
        tenant_id=j.tenant_id,
        title=j.title,
        description=j.description,
        department=j.department,
        location=j.location,
        remote_policy=j.remote_policy,
        job_type=j.job_type.value if hasattr(j.job_type, "value") else str(j.job_type),
        seniority_required=j.seniority_required,
        salary_min=j.salary_min,
        salary_max=j.salary_max,
        currency=j.currency,
        required_skills=j.required_skills,
        preferred_skills=j.preferred_skills,
        status=j.status.value if hasattr(j.status, "value") else str(j.status),
        hiring_manager_id=j.hiring_manager_id,
        pipeline_id=j.pipeline_id,
        embedding_id=j.embedding_id,
        applicants_count=j.applicants_count,
        is_template=j.is_template,
        template_name=j.template_name,
        template_description=j.template_description,
        cloned_from_id=j.cloned_from_id,
        created_at=j.created_at,
        updated_at=j.updated_at,
    )


def _application_to_type(a: Application) -> ApplicationType:
    return ApplicationType(
        id=a.id,
        tenant_id=a.tenant_id,
        candidate_id=a.candidate_id,
        job_id=a.job_id,
        pipeline_id=a.pipeline_id,
        current_stage=a.current_stage,
        status=a.status.value if hasattr(a.status, "value") else str(a.status),
        match_score=a.match_score,
        resume_id=a.resume_id,
        applied_at=a.applied_at,
        updated_at=a.updated_at,
    )


def _interview_to_type(i: Interview) -> InterviewType:
    return InterviewType(
        id=i.id,
        tenant_id=i.tenant_id,
        application_id=i.application_id,
        candidate_id=i.candidate_id,
        job_id=i.job_id,
        interview_type=i.interview_type,
        status=i.status.value if hasattr(i.status, "value") else str(i.status),
        scheduled_at=i.scheduled_at,
        started_at=i.started_at,
        ended_at=i.ended_at,
        duration_minutes=i.duration_minutes,
        interviewer_id=i.interviewer_id,
        is_ai_interview=i.is_ai_interview,
        room_id=i.room_id,
        created_at=i.created_at,
        updated_at=i.updated_at,
    )


def _user_to_type(u: User) -> UserType:
    return UserType(
        id=u.id,
        tenant_id=u.tenant_id,
        email=u.email,
        full_name=u.full_name,
        role=u.role.value if hasattr(u.role, "value") else str(u.role),
        status=u.status.value if hasattr(u.status, "value") else str(u.status),
        avatar_url=u.avatar_url,
        phone=u.phone,
        mfa_enabled=u.mfa_enabled,
        email_verified=u.email_verified,
        is_demo=u.is_demo,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


@strawberry.type
class Query:

    @strawberry.field
    async def candidates(
        self,
        info: strawberry.types.Info,
        offset: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        location: Optional[str] = None,
        skills: Optional[str] = None,
    ) -> list[CandidateType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Candidate).where(Candidate.tenant_id == tenant_id)

        if status:
            stmt = stmt.where(Candidate.status == status)
        if location:
            stmt = stmt.where(Candidate.location.ilike(f"%{location}%"))
        if skills:
            skill_list = [s.strip().lower() for s in skills.split(",") if s.strip()]
            for skill in skill_list:
                stmt = stmt.where(Candidate.tags.ilike(f"%{skill}%"))

        stmt = stmt.offset(offset).limit(limit).order_by(Candidate.created_at.desc())
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [_candidate_to_type(c) for c in rows]

    @strawberry.field
    async def candidate(
        self,
        info: strawberry.types.Info,
        id: str,
    ) -> Optional[CandidateType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Candidate).where(
            Candidate.id == id,
            Candidate.tenant_id == tenant_id,
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return _candidate_to_type(row) if row else None

    @strawberry.field
    async def jobs(
        self,
        info: strawberry.types.Info,
        offset: int = 0,
        limit: int = 20,
        status: Optional[str] = None,
        location: Optional[str] = None,
        skills: Optional[str] = None,
    ) -> list[JobType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Job).where(Job.tenant_id == tenant_id)

        if status:
            stmt = stmt.where(Job.status == status)
        if location:
            stmt = stmt.where(Job.location.ilike(f"%{location}%"))
        if skills:
            skill_list = [s.strip().lower() for s in skills.split(",") if s.strip()]
            for skill in skill_list:
                stmt = stmt.where(Job.required_skills.ilike(f"%{skill}%"))

        stmt = stmt.offset(offset).limit(limit).order_by(Job.created_at.desc())
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [_job_to_type(j) for j in rows]

    @strawberry.field
    async def job(
        self,
        info: strawberry.types.Info,
        id: str,
    ) -> Optional[JobType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Job).where(
            Job.id == id,
            Job.tenant_id == tenant_id,
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return _job_to_type(row) if row else None

    @strawberry.field
    async def users(
        self,
        info: strawberry.types.Info,
        offset: int = 0,
        limit: int = 20,
    ) -> list[UserType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = (
            select(User)
            .where(User.tenant_id == tenant_id)
            .offset(offset)
            .limit(limit)
            .order_by(User.created_at.desc())
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()
        return [_user_to_type(u) for u in rows]

    @strawberry.field
    async def me(
        self,
        info: strawberry.types.Info,
    ) -> Optional[UserType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        user_id: str | None = ctx.get("user_id")

        if not user_id:
            return None

        stmt = select(User).where(User.id == user_id)
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return _user_to_type(row) if row else None
