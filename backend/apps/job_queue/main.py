"""Job Queue Service — Background job management with Celery integration.

Provides REST API endpoints for:
- Enqueueing background jobs
- Tracking job status
- Cancelling pending jobs
- Queue statistics
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, Field as SQLField

from shared.auth import require_tenant_id, require_admin
from shared.core.database import get_db_dependency

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobPriority(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class BackgroundJob(SQLModel, table=True):
    __tablename__ = "background_jobs"

    id: str = SQLField(default_factory=lambda: str(uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    task_name: str = SQLField(index=True)
    status: JobStatus = SQLField(default=JobStatus.PENDING, index=True)
    priority: JobPriority = SQLField(default=JobPriority.MEDIUM, index=True)
    payload: str = SQLField(default="{}")
    result: str | None = None
    error: str | None = None
    celery_task_id: str | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    created_by: str | None = None


class JobCreateRequest(BaseModel):
    task_name: str = Field(..., description="Celery task name to execute")
    payload: dict[str, Any] = Field(default_factory=dict, description="Task arguments")
    priority: JobPriority = Field(default=JobPriority.MEDIUM, description="Job priority level")
    scheduled_at: datetime | None = Field(default=None, description="Schedule job for future execution")


class JobResponse(BaseModel):
    id: str
    tenant_id: str
    task_name: str
    status: JobStatus
    priority: JobPriority
    payload: dict[str, Any]
    result: dict[str, Any] | None = None
    error: str | None = None
    celery_task_id: str | None = None
    scheduled_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class JobListResponse(BaseModel):
    data: list[JobResponse]
    total: int
    page: int
    page_size: int


class QueueStatsResponse(BaseModel):
    total_jobs: int
    pending: int
    running: int
    completed: int
    failed: int
    cancelled: int
    by_priority: dict[str, int]
    oldest_pending_seconds: float | None = None


router = APIRouter()


def _parse_json_field(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _job_to_response(job: BackgroundJob) -> JobResponse:
    return JobResponse(
        id=job.id,
        tenant_id=job.tenant_id,
        task_name=job.task_name,
        status=job.status,
        priority=job.priority,
        payload=_parse_json_field(job.payload) or {},
        result=_parse_json_field(job.result),
        error=job.error,
        celery_task_id=job.celery_task_id,
        scheduled_at=job.scheduled_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


async def _dispatch_to_celery(job: BackgroundJob) -> str | None:
    try:
        from shared.jobs.celery_app import celery_app

        payload = _parse_json_field(job.payload) or {}
        payload["tenant_id"] = job.tenant_id

        eta = None
        if job.scheduled_at:
            eta = job.scheduled_at

        task_kwargs = {
            "queue": job.priority.value,
        }
        if eta:
            task_kwargs["eta"] = eta

        async_result = celery_app.send_task(
            job.task_name,
            kwargs=payload,
            **task_kwargs,
        )
        return async_result.id
    except Exception as exc:
        logger.warning("Failed to dispatch job %s to Celery: %s", job.id, exc)
        return None


@router.get(
    "/health",
    tags=["Job Queue"],
    summary="Job queue health check",
)
async def health():
    return {"status": "healthy", "service": "job-queue"}


@router.get(
    "/queue/stats",
    response_model=QueueStatsResponse,
    tags=["Job Queue"],
    summary="Queue statistics",
    description="Aggregate statistics about the job queue for the current tenant.",
)
async def get_queue_stats(
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_admin),
) -> QueueStatsResponse:
    base_query = select(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id)

    total_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id))
    total = total_result.scalar_one()

    pending_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.status == JobStatus.PENDING))
    pending = pending_result.scalar_one()

    running_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.status == JobStatus.RUNNING))
    running = running_result.scalar_one()

    completed_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.status == JobStatus.COMPLETED))
    completed = completed_result.scalar_one()

    failed_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.status == JobStatus.FAILED))
    failed = failed_result.scalar_one()

    cancelled_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.status == JobStatus.CANCELLED))
    cancelled = cancelled_result.scalar_one()

    high_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.priority == JobPriority.HIGH))
    high = high_result.scalar_one()

    medium_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.priority == JobPriority.MEDIUM))
    medium = medium_result.scalar_one()

    low_result = await db.execute(select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.priority == JobPriority.LOW))
    low = low_result.scalar_one()

    oldest_pending_result = await db.execute(
        select(BackgroundJob.created_at)
        .where(BackgroundJob.tenant_id == tenant_id, BackgroundJob.status == JobStatus.PENDING)
        .order_by(BackgroundJob.created_at.asc())
        .limit(1)
    )
    oldest_pending = oldest_pending_result.scalar_one_or_none()

    oldest_seconds = None
    if oldest_pending:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        oldest_seconds = (now - oldest_pending).total_seconds()

    return QueueStatsResponse(
        total_jobs=total,
        pending=pending,
        running=running,
        completed=completed,
        failed=failed,
        cancelled=cancelled,
        by_priority={"high": high, "medium": medium, "low": low},
        oldest_pending_seconds=oldest_seconds,
    )


@router.get(
    "/queue",
    response_model=JobListResponse,
    tags=["Job Queue"],
    summary="List queued jobs",
    description="Retrieve a paginated list of background jobs for the current tenant.",
)
async def list_jobs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: str | None = Query(None, alias="status", description="Filter by status"),
    priority_filter: str | None = Query(None, alias="priority", description="Filter by priority"),
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_admin),
) -> JobListResponse:
    query = select(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id)
    count_query = select(func.count()).select_from(BackgroundJob).where(BackgroundJob.tenant_id == tenant_id)

    if status_filter:
        query = query.where(BackgroundJob.status == status_filter)
        count_query = count_query.where(BackgroundJob.status == status_filter)

    if priority_filter:
        query = query.where(BackgroundJob.priority == priority_filter)
        count_query = count_query.where(BackgroundJob.priority == priority_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(BackgroundJob.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return JobListResponse(
        data=[_job_to_response(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/queue/{job_id}",
    response_model=JobResponse,
    tags=["Job Queue"],
    summary="Get job status",
    description="Retrieve the current status and details of a specific background job.",
)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_admin),
) -> JobResponse:
    result = await db.execute(
        select(BackgroundJob).where(BackgroundJob.id == job_id, BackgroundJob.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    return _job_to_response(job)


@router.post(
    "/queue",
    response_model=JobResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Job Queue"],
    summary="Enqueue job",
    description="Enqueue a new background job for asynchronous processing.",
)
async def enqueue_job(
    data: JobCreateRequest,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_admin),
) -> JobResponse:
    VALID_TASKS = [
        "shared.jobs.tasks.send_bulk_email",
        "shared.jobs.tasks.generate_report",
        "shared.jobs.tasks.sync_integration",
        "shared.jobs.tasks.process_ai_batch",
        "shared.jobs.tasks.cleanup_old_data",
    ]

    if data.task_name not in VALID_TASKS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown task '{data.task_name}'. Valid tasks: {', '.join(VALID_TASKS)}",
        )

    job = BackgroundJob(
        tenant_id=tenant_id,
        task_name=data.task_name,
        status=JobStatus.PENDING,
        priority=data.priority,
        payload=json.dumps(data.payload),
        scheduled_at=data.scheduled_at,
        created_by=user.get("id"),
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)

    celery_task_id = await _dispatch_to_celery(job)
    if celery_task_id:
        job.celery_task_id = celery_task_id
        db.add(job)
        await db.flush()
        await db.refresh(job)

    return _job_to_response(job)


@router.delete(
    "/queue/{job_id}",
    response_model=JobResponse,
    tags=["Job Queue"],
    summary="Cancel job",
    description="Cancel a pending or running background job.",
)
async def cancel_job(
    job_id: str,
    db: AsyncSession = Depends(get_db_dependency),
    tenant_id: str = Depends(require_tenant_id),
    _user: dict = Depends(require_admin),
) -> JobResponse:
    result = await db.execute(
        select(BackgroundJob).where(BackgroundJob.id == job_id, BackgroundJob.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel job in '{job.status.value}' status. Only pending or running jobs can be cancelled.",
        )

    if job.celery_task_id:
        try:
            from shared.jobs.celery_app import celery_app
            celery_app.control.revoke(job.celery_task_id, terminate=True)
        except Exception as exc:
            logger.warning("Failed to revoke Celery task %s: %s", job.celery_task_id, exc)

    job.status = JobStatus.CANCELLED
    job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    job.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(job)
    await db.flush()
    await db.refresh(job)

    return _job_to_response(job)
