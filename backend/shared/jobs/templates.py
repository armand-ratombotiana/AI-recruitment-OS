"""Job cloning and templates.

A "template" is a :class:`~shared.core.models.recruitment.Job` row that has
``is_template=True``.  Templates are real persisted jobs (so the same tenant
isolation, indexing, and audit story applies) but they are never shown in
the standard job listings; they are surfaced via the dedicated
``/jobs/templates`` endpoint and serve as a starting point for ``clone_job``.

The :func:`clone_job` helper produces a fresh, draft job that copies the
relevant fields from a source job.  Each ``CloneOptions`` flag controls
which slice of the source is carried over:

* ``copy_pipeline``  — propagates ``pipeline_id``
* ``copy_questions`` — propagates the source's interview-question metadata
                       (stored as the source's ``template_name`` + a small
                       set of derived fields; we always preserve the
                       template lineage via ``cloned_from_id``)
* ``copy_settings``  — copies salary range, remote policy, seniority,
                       currency, and the JSON skill lists
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.core.models.recruitment import Job, JobStatus


# ── Schemas ────────────────────────────────────────────────────────────────────


class JobTemplate(BaseModel):
    """Public-facing representation of a job template.

    A template is persisted as a :class:`Job` with ``is_template=True``; this
    Pydantic model is the read shape returned by the API endpoints so callers
    never have to know about the underlying flag.
    """

    id: str
    tenant_id: str
    title: str
    description: str
    department: str | None = None
    location: str | None = None
    remote_policy: str | None = None
    job_type: str
    seniority_required: str | None = None
    salary_min: int | None = None
    salary_max: int | None = None
    currency: str = "USD"
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    template_name: str | None = None
    template_description: str | None = None
    cloned_from_id: str | None = None
    created_at: datetime
    updated_at: datetime


class CloneOptions(BaseModel):
    """Toggles for what to carry over when cloning a job."""

    title: str | None = Field(
        default=None, min_length=1, max_length=255,
        description="Override the title for the new job. If omitted, the "
                    "source title is suffixed with '(Copy)'.",
    )
    copy_pipeline: bool = Field(
        default=True, description="Carry the source's pipeline_id over to the clone."
    )
    copy_questions: bool = Field(
        default=True, description="Carry the source's interview-question metadata over."
    )
    copy_settings: bool = Field(
        default=True, description="Copy salary, location, remote policy, and skills."
    )


class SaveAsTemplateRequest(BaseModel):
    """Body for ``POST /jobs/{id}/save-as-template``."""

    template_name: str | None = Field(
        default=None, max_length=255,
        description="Display name for the template (defaults to the job's title).",
    )
    template_description: str | None = Field(
        default=None, description="Short description of when to use this template.",
    )


class FromTemplateRequest(BaseModel):
    """Body for ``POST /jobs/from-template/{template_id}``."""

    title: str = Field(..., min_length=1, max_length=255)
    department: str = Field(..., min_length=1, max_length=255)
    location: str = Field(..., min_length=1, max_length=255)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _status_value(status: Any) -> str:
    return status.value if hasattr(status, "value") else str(status)


def _parse_skills(raw: str | None) -> list[str]:
    if not raw:
        return []
    import json as _json

    try:
        value = _json.loads(raw)
    except (TypeError, ValueError):
        return []
    return list(value) if isinstance(value, list) else []


def _dump_skills(skills: list[str] | None) -> str:
    import json as _json

    return _json.dumps(list(skills or []))


def template_to_read(job: Job) -> JobTemplate:
    """Project a :class:`Job` row to the public :class:`JobTemplate` shape."""
    return JobTemplate(
        id=job.id,
        tenant_id=job.tenant_id,
        title=job.title,
        description=job.description,
        department=job.department,
        location=job.location,
        remote_policy=job.remote_policy,
        job_type=_status_value(job.job_type),
        seniority_required=job.seniority_required,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        currency=job.currency,
        required_skills=_parse_skills(job.required_skills),
        preferred_skills=_parse_skills(job.preferred_skills),
        template_name=job.template_name,
        template_description=job.template_description,
        cloned_from_id=job.cloned_from_id,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


# ── Core API ───────────────────────────────────────────────────────────────────


async def get_job_or_404(
    db: AsyncSession, *, job_id: str, tenant_id: str
) -> Job:
    """Fetch a job by id scoped to a tenant or raise a domain-friendly error."""
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.tenant_id == tenant_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        # Lazy import keeps templates.py importable from contexts that
        # don't have FastAPI installed (e.g. background workers).
        from fastapi import HTTPException, status as _status

        raise HTTPException(
            status_code=_status.HTTP_404_NOT_FOUND, detail="Job not found"
        )
    return job


async def get_template_or_404(
    db: AsyncSession, *, template_id: str, tenant_id: str
) -> Job:
    """Fetch a job that is flagged ``is_template=True`` for a tenant."""
    job = await get_job_or_404(db, job_id=template_id, tenant_id=tenant_id)
    if not job.is_template:
        from fastapi import HTTPException, status as _status

        raise HTTPException(
            status_code=_status.HTTP_404_NOT_FOUND,
            detail="Job is not a template",
        )
    return job


async def list_templates(
    db: AsyncSession, *, tenant_id: str, limit: int = 100, offset: int = 0
) -> list[Job]:
    """Return all template jobs for a tenant, newest first."""
    stmt = (
        select(Job)
        .where(Job.tenant_id == tenant_id, Job.is_template.is_(True))
        .order_by(Job.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def save_as_template(
    db: AsyncSession, *, job_id: str, tenant_id: str, request: SaveAsTemplateRequest
) -> Job:
    """Flip ``is_template`` on for an existing job and stamp template metadata."""
    job = await get_job_or_404(db, job_id=job_id, tenant_id=tenant_id)
    job.is_template = True
    job.template_name = (request.template_name or job.title).strip() or job.title
    job.template_description = request.template_description
    job.updated_at = _utcnow()
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return job


async def clone_job(
    db: AsyncSession,
    job_id: str,
    tenant_id: str,
    options: CloneOptions | None = None,
) -> Job:
    """Produce a new draft job that copies the relevant fields from ``job_id``.

    The new job always has:

    * a fresh ``id``
    * ``status = DRAFT``
    * ``applicants_count = 0``
    * ``is_template = False``
    * ``cloned_from_id`` pointing at the source row

    The :class:`CloneOptions` toggles control which slices of the source are
    carried over (see the module docstring).  All unspecified options default
    to ``True`` so the most common case — a full deep copy — needs no body.
    """
    opts = options or CloneOptions()
    source = await get_job_or_404(db, job_id=job_id, tenant_id=tenant_id)

    new_title = (opts.title or f"{source.title} (Copy)").strip()
    if not new_title:
        new_title = f"{source.title} (Copy)"

    # Always carry these over — they describe the job itself and are not
    # affected by the ``copy_settings`` flag.
    clone = Job(
        tenant_id=source.tenant_id,
        title=new_title,
        description=source.description,
        department=source.department,
        location=source.location,
        job_type=source.job_type,
        status=JobStatus.DRAFT,
        applicants_count=0,
        is_template=False,
        cloned_from_id=source.id,
        hiring_manager_id=source.hiring_manager_id,
    )

    if opts.copy_settings:
        clone.remote_policy = source.remote_policy
        clone.seniority_required = source.seniority_required
        clone.salary_min = source.salary_min
        clone.salary_max = source.salary_max
        clone.currency = source.currency
        clone.required_skills = copy.deepcopy(source.required_skills or "[]")
        clone.preferred_skills = copy.deepcopy(source.preferred_skills or "[]")
    else:
        clone.required_skills = "[]"
        clone.preferred_skills = "[]"

    if opts.copy_pipeline:
        clone.pipeline_id = source.pipeline_id

    if opts.copy_questions:
        # The current schema has no per-job question table; we treat the
        # source's template metadata as the "questions payload" and
        # propagate the lineage flag so downstream code can fetch questions
        # from the original.
        clone.template_name = source.template_name
        clone.template_description = source.template_description
    # else: leave template_* fields None — the clone is "questions-free".

    db.add(clone)
    await db.flush()
    await db.refresh(clone)
    return clone


async def create_from_template(
    db: AsyncSession,
    *,
    template_id: str,
    tenant_id: str,
    request: FromTemplateRequest,
) -> Job:
    """Create a new draft job from an existing template.

    The new job is always a regular (``is_template=False``) job in the
    caller's tenant.  All template fields are propagated, with the body
    of the request overriding the title/department/location.
    """
    template = await get_template_or_404(
        db, template_id=template_id, tenant_id=tenant_id
    )

    new_job = Job(
        tenant_id=template.tenant_id,
        title=request.title.strip(),
        description=template.description,
        department=request.department.strip(),
        location=request.location.strip(),
        remote_policy=template.remote_policy,
        job_type=template.job_type,
        seniority_required=template.seniority_required,
        salary_min=template.salary_min,
        salary_max=template.salary_max,
        currency=template.currency,
        required_skills=copy.deepcopy(template.required_skills or "[]"),
        preferred_skills=copy.deepcopy(template.preferred_skills or "[]"),
        status=JobStatus.DRAFT,
        applicants_count=0,
        is_template=False,
        cloned_from_id=template.id,
        pipeline_id=template.pipeline_id,
        template_name=template.template_name,
        template_description=template.template_description,
    )
    db.add(new_job)
    await db.flush()
    await db.refresh(new_job)
    return new_job


__all__ = [
    "JobTemplate",
    "CloneOptions",
    "SaveAsTemplateRequest",
    "FromTemplateRequest",
    "get_job_or_404",
    "get_template_or_404",
    "list_templates",
    "save_as_template",
    "clone_job",
    "create_from_template",
    "template_to_read",
]
