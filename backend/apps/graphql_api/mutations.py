"""GraphQL mutation resolvers for AI-ROS."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import strawberry
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from apps.graphql_api.types import (
    CandidateType,
    CandidateCreateInput,
    CandidateUpdateInput,
    JobType,
    JobCreateInput,
    JobUpdateInput,
    InterviewType,
    ScheduleInterviewInput,
    UpdateInterviewStatusInput,
    ApplicationType,
    CreateApplicationInput,
    UpdateApplicationStatusInput,
)
from shared.core.models.candidate import Candidate
from shared.core.models.recruitment import Job, Application
from shared.core.models.interview import Interview, InterviewStatus


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


@strawberry.type
class Mutation:

    @strawberry.mutation
    async def create_candidate(
        self,
        info: strawberry.types.Info,
        input: CandidateCreateInput,
    ) -> CandidateType:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        candidate = Candidate(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            email=input.email,
            full_name=input.full_name,
            phone=input.phone,
            location=input.location,
            linkedin_url=input.linkedin_url,
            source=input.source,
            status=input.status or "new",
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(candidate)
        await db.flush()
        await db.refresh(candidate)
        await db.commit()
        return _candidate_to_type(candidate)

    @strawberry.mutation
    async def update_candidate(
        self,
        info: strawberry.types.Info,
        input: CandidateUpdateInput,
    ) -> Optional[CandidateType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Candidate).where(
            Candidate.id == input.id,
            Candidate.tenant_id == tenant_id,
        )
        result = await db.execute(stmt)
        candidate = result.scalar_one_or_none()
        if not candidate:
            return None

        if input.full_name is not None:
            candidate.full_name = input.full_name
        if input.phone is not None:
            candidate.phone = input.phone
        if input.location is not None:
            candidate.location = input.location
        if input.linkedin_url is not None:
            candidate.linkedin_url = input.linkedin_url
        if input.status is not None:
            candidate.status = input.status
        if input.notes is not None:
            candidate.notes = input.notes
        candidate.updated_at = _now()

        await db.flush()
        await db.refresh(candidate)
        await db.commit()
        return _candidate_to_type(candidate)

    @strawberry.mutation
    async def create_job(
        self,
        info: strawberry.types.Info,
        input: JobCreateInput,
    ) -> JobType:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        job = Job(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            title=input.title,
            description=input.description,
            department=input.department,
            location=input.location,
            remote_policy=input.remote_policy,
            job_type=input.job_type or "full_time",
            seniority_required=input.seniority_required,
            salary_min=input.salary_min,
            salary_max=input.salary_max,
            required_skills=input.required_skills or "[]",
            preferred_skills=input.preferred_skills or "[]",
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(job)
        await db.flush()
        await db.refresh(job)
        await db.commit()
        return _job_to_type(job)

    @strawberry.mutation
    async def update_job(
        self,
        info: strawberry.types.Info,
        input: JobUpdateInput,
    ) -> Optional[JobType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Job).where(
            Job.id == input.id,
            Job.tenant_id == tenant_id,
        )
        result = await db.execute(stmt)
        job = result.scalar_one_or_none()
        if not job:
            return None

        if input.title is not None:
            job.title = input.title
        if input.description is not None:
            job.description = input.description
        if input.department is not None:
            job.department = input.department
        if input.location is not None:
            job.location = input.location
        if input.remote_policy is not None:
            job.remote_policy = input.remote_policy
        if input.status is not None:
            job.status = input.status
        if input.required_skills is not None:
            job.required_skills = input.required_skills
        if input.preferred_skills is not None:
            job.preferred_skills = input.preferred_skills
        job.updated_at = _now()

        await db.flush()
        await db.refresh(job)
        await db.commit()
        return _job_to_type(job)

    @strawberry.mutation
    async def schedule_interview(
        self,
        info: strawberry.types.Info,
        input: ScheduleInterviewInput,
    ) -> InterviewType:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        interview = Interview(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            application_id=input.application_id,
            candidate_id=input.candidate_id,
            job_id=input.job_id,
            interview_type=input.interview_type,
            status=InterviewStatus.SCHEDULED,
            scheduled_at=input.scheduled_at,
            duration_minutes=input.duration_minutes or 60,
            interviewer_id=input.interviewer_id,
            is_ai_interview=input.is_ai_interview or False,
            created_at=_now(),
            updated_at=_now(),
        )
        db.add(interview)
        await db.flush()
        await db.refresh(interview)
        await db.commit()
        return _interview_to_type(interview)

    @strawberry.mutation
    async def update_interview_status(
        self,
        info: strawberry.types.Info,
        input: UpdateInterviewStatusInput,
    ) -> Optional[InterviewType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Interview).where(
            Interview.id == input.id,
            Interview.tenant_id == tenant_id,
        )
        result = await db.execute(stmt)
        interview = result.scalar_one_or_none()
        if not interview:
            return None

        interview.status = input.status
        interview.updated_at = _now()

        await db.flush()
        await db.refresh(interview)
        await db.commit()
        return _interview_to_type(interview)

    @strawberry.mutation
    async def create_application(
        self,
        info: strawberry.types.Info,
        input: CreateApplicationInput,
    ) -> ApplicationType:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        application = Application(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            candidate_id=input.candidate_id,
            job_id=input.job_id,
            resume_id=input.resume_id,
            applied_at=_now(),
            updated_at=_now(),
        )
        db.add(application)
        await db.flush()
        await db.refresh(application)
        await db.commit()
        return _application_to_type(application)

    @strawberry.mutation
    async def update_application_status(
        self,
        info: strawberry.types.Info,
        input: UpdateApplicationStatusInput,
    ) -> Optional[ApplicationType]:
        ctx = info.context
        db: AsyncSession = ctx["db"]
        tenant_id: str = ctx["tenant_id"]

        stmt = select(Application).where(
            Application.id == input.id,
            Application.tenant_id == tenant_id,
        )
        result = await db.execute(stmt)
        application = result.scalar_one_or_none()
        if not application:
            return None

        application.status = input.status
        if input.current_stage is not None:
            application.current_stage = input.current_stage
        application.updated_at = _now()

        await db.flush()
        await db.refresh(application)
        await db.commit()
        return _application_to_type(application)
