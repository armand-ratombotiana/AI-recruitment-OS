"""Analytics Service — Recruitment metrics, reporting, dashboards.

Endpoints (all tenant-scoped via ``require_tenant_id``):

* ``GET /api/v1/analytics/overview``            — KPIs: candidates, jobs, interviews, hires
* ``GET /api/v1/analytics/hiring-funnel``       — applied → screened → interviewed → offered → hired
* ``GET /api/v1/analytics/time-to-hire``        — average days from job creation to hire
* ``GET /api/v1/analytics/source-effectiveness``— candidates grouped by acquisition source
* ``GET /api/v1/analytics/diversity``           — diversity breakdown (location-proxy + status)
* ``GET /api/v1/analytics/recruiter-performance``— interviews scheduled per interviewer / recruiter
* ``GET /api/v1/analytics/health``              — service liveness
* ``GET /api/v1/analytics/dashboard``           — legacy dashboard widget
* ``GET /api/v1/analytics/pipeline``            — legacy pipeline
* ``GET /api/v1/analytics/ai-performance``      — legacy AI performance
* ``GET /api/v1/analytics/recruiter-productivity``— legacy recruiter list
* ``GET /api/v1/analytics/time-to-hire-legacy`` — legacy per-stage timing
* ``POST /api/v1/analytics/reports``            — generate a new report
* ``GET /api/v1/analytics/reports/{report_id}`` — fetch a report
"""
from __future__ import annotations

import logging
import random
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.analytics.ml_insights import (
    detect_hiring_bias,
    forecast_hiring_needs,
    predict_candidate_success,
    predict_time_to_hire,
    recommend_sourcing_channels,
)
from shared.auth.dependencies import require_member, require_tenant_id
from shared.core.database import get_db_dependency
from shared.core.models.candidate import Candidate, CandidateStatus
from shared.core.models.interview import Interview, InterviewStatus
from shared.core.models.recruitment import (
    Application,
    ApplicationStatus,
    Job,
    JobStatus,
)

logger = logging.getLogger("analytics_service")
router = APIRouter()


# ── Response Schemas ──────────────────────────────────────────────────────────


class OverviewMetrics(BaseModel):
    total_candidates: int
    total_jobs: int
    open_jobs: int
    total_interviews: int
    completed_interviews: int
    total_hires: int
    pending_offers: int
    active_applications: int
    generated_at: str


class FunnelStage(BaseModel):
    stage: str
    count: int
    conversion_from_previous: float


class HiringFunnelResponse(BaseModel):
    stages: list[FunnelStage]
    total_entered: int
    total_hired: int
    overall_conversion: float
    generated_at: str


class TimeToHireResponse(BaseModel):
    average_days: float
    median_days: float
    sample_size: int
    by_stage: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: str


class SourceEffectivenessItem(BaseModel):
    source: str
    candidates: int
    hired: int
    conversion_rate: float


class SourceEffectivenessResponse(BaseModel):
    sources: list[SourceEffectivenessItem]
    total: int
    generated_at: str


class DiversityBucket(BaseModel):
    label: str
    count: int
    percentage: float


class DiversityResponse(BaseModel):
    by_location: list[DiversityBucket]
    by_seniority: list[DiversityBucket]
    by_status: list[DiversityBucket]
    total: int
    generated_at: str


class RecruiterPerformanceItem(BaseModel):
    recruiter_id: Optional[str] = None
    recruiter_name: Optional[str] = None
    candidates_processed: int
    interviews_scheduled: int
    interviews_completed: int
    hires: int


class RecruiterPerformanceResponse(BaseModel):
    recruiters: list[RecruiterPerformanceItem]
    total: int
    generated_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _stage_counts_to_funnel(counts: dict[str, int]) -> list[FunnelStage]:
    """Convert raw stage counts to a funnel with conversion ratios.

    The expected order is applied → screened → interviewed → offered → hired.
    Each step's conversion is the ratio of the current count to the previous
    one; the first stage is the funnel entry (conversion = 1.0).
    """
    stage_order = ["applied", "screened", "interviewed", "offered", "hired"]
    stages: list[FunnelStage] = []
    previous = 0
    for idx, name in enumerate(stage_order):
        count = counts.get(name, 0)
        if idx == 0:
            conversion = 1.0 if count else 0.0
        else:
            conversion = round(count / previous, 3) if previous else 0.0
        stages.append(
            FunnelStage(
                stage=name,
                count=count,
                conversion_from_previous=conversion,
            )
        )
        previous = count
    return stages


# ── Overview ──────────────────────────────────────────────────────────────────


@router.get(
    "/overview",
    response_model=OverviewMetrics,
    tags=["Analytics"],
    summary="Tenant overview KPIs",
)
async def get_overview(
    tenant_id: str = Depends(require_tenant_id),
    session: AsyncSession = Depends(get_db_dependency),
) -> OverviewMetrics:
    """Aggregate high-level counts for the current tenant."""
    # Candidates
    candidates_total = await session.scalar(
        select(func.count(Candidate.id)).where(Candidate.tenant_id == tenant_id)
    )

    # Jobs
    jobs_total = await session.scalar(
        select(func.count(Job.id)).where(Job.tenant_id == tenant_id)
    )
    jobs_open = await session.scalar(
        select(func.count(Job.id)).where(
            and_(Job.tenant_id == tenant_id, Job.status == JobStatus.OPEN)
        )
    )

    # Applications funnel-wide counts
    apps_total = await session.scalar(
        select(func.count(Application.id)).where(Application.tenant_id == tenant_id)
    )
    apps_hired = await session.scalar(
        select(func.count(Application.id)).where(
            and_(
                Application.tenant_id == tenant_id,
                Application.status == ApplicationStatus.HIRED,
            )
        )
    )
    apps_offered = await session.scalar(
        select(func.count(Application.id)).where(
            and_(
                Application.tenant_id == tenant_id,
                Application.status.in_(
                    [
                        ApplicationStatus.OFFERED,
                        ApplicationStatus.OFFER_PENDING,
                    ]
                ),
            )
        )
    )
    # "Active" = anything not in a terminal state (hired, rejected, withdrawn)
    apps_active = await session.scalar(
        select(func.count(Application.id)).where(
            and_(
                Application.tenant_id == tenant_id,
                Application.status.notin_(
                    [
                        ApplicationStatus.HIRED,
                        ApplicationStatus.REJECTED,
                        ApplicationStatus.WITHDRAWN,
                    ]
                ),
            )
        )
    )

    # Interviews
    interviews_total = await session.scalar(
        select(func.count(Interview.id)).where(Interview.tenant_id == tenant_id)
    )
    interviews_completed = await session.scalar(
        select(func.count(Interview.id)).where(
            and_(
                Interview.tenant_id == tenant_id,
                Interview.status == InterviewStatus.COMPLETED,
            )
        )
    )

    return OverviewMetrics(
        total_candidates=int(candidates_total or 0),
        total_jobs=int(jobs_total or 0),
        open_jobs=int(jobs_open or 0),
        total_interviews=int(interviews_total or 0),
        completed_interviews=int(interviews_completed or 0),
        total_hires=int(apps_hired or 0),
        pending_offers=int(apps_offered or 0),
        active_applications=int(apps_active or 0),
        generated_at=_now().isoformat(),
    )


# ── Hiring Funnel ─────────────────────────────────────────────────────────────


@router.get(
    "/hiring-funnel",
    response_model=HiringFunnelResponse,
    tags=["Analytics"],
    summary="Hiring funnel breakdown",
)
async def get_hiring_funnel(
    tenant_id: str = Depends(require_tenant_id),
    session: AsyncSession = Depends(get_db_dependency),
) -> HiringFunnelResponse:
    """Stage-by-stage funnel: applied → screened → interviewed → offered → hired.

    Each stage is derived from the ``Application.status`` field — we count
    every application that has *reached* the stage or beyond.
    """
    # Build a single CASE expression that classifies each application into
    # the deepest funnel stage it has reached.
    reached_stage = case(
        (
            Application.status.in_(
                [
                    ApplicationStatus.APPLIED,
                    ApplicationStatus.SCREENING,
                    ApplicationStatus.INTERVIEW_SCHEDULED,
                    ApplicationStatus.INTERVIEWING,
                    ApplicationStatus.EVALUATION,
                    ApplicationStatus.SHORTLISTED,
                    ApplicationStatus.OFFER_PENDING,
                    ApplicationStatus.OFFERED,
                    ApplicationStatus.HIRED,
                ]
            ),
            "applied",
        ),
        else_=None,
    )

    # Count the number of applications that reached each stage.  "Reached"
    # means the application's current status is that stage OR any later one
    # in the funnel.
    order = [
        ApplicationStatus.APPLIED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEW_SCHEDULED,
        ApplicationStatus.INTERVIEWING,
        ApplicationStatus.EVALUATION,
        ApplicationStatus.SHORTLISTED,
        ApplicationStatus.OFFER_PENDING,
        ApplicationStatus.OFFERED,
        ApplicationStatus.HIRED,
    ]
    stage_groups = {
        "applied": [
            ApplicationStatus.APPLIED,
            ApplicationStatus.SCREENING,
            ApplicationStatus.INTERVIEW_SCHEDULED,
            ApplicationStatus.INTERVIEWING,
            ApplicationStatus.EVALUATION,
            ApplicationStatus.SHORTLISTED,
            ApplicationStatus.OFFER_PENDING,
            ApplicationStatus.OFFERED,
            ApplicationStatus.HIRED,
        ],
        "screened": [
            ApplicationStatus.SCREENING,
            ApplicationStatus.INTERVIEW_SCHEDULED,
            ApplicationStatus.INTERVIEWING,
            ApplicationStatus.EVALUATION,
            ApplicationStatus.SHORTLISTED,
            ApplicationStatus.OFFER_PENDING,
            ApplicationStatus.OFFERED,
            ApplicationStatus.HIRED,
        ],
        "interviewed": [
            ApplicationStatus.INTERVIEW_SCHEDULED,
            ApplicationStatus.INTERVIEWING,
            ApplicationStatus.EVALUATION,
            ApplicationStatus.SHORTLISTED,
            ApplicationStatus.OFFER_PENDING,
            ApplicationStatus.OFFERED,
            ApplicationStatus.HIRED,
        ],
        "offered": [
            ApplicationStatus.OFFERED,
            ApplicationStatus.OFFER_PENDING,
            ApplicationStatus.HIRED,
        ],
        "hired": [ApplicationStatus.HIRED],
    }

    counts: dict[str, int] = {}
    for stage_name, statuses in stage_groups.items():
        result = await session.scalar(
            select(func.count(Application.id)).where(
                and_(
                    Application.tenant_id == tenant_id,
                    Application.status.in_(statuses),
                )
            )
        )
        counts[stage_name] = int(result or 0)

    # Avoid an unused variable lint warning while keeping the literal order
    # in the source for readability.
    _ = order  # noqa: F841
    _ = reached_stage  # noqa: F841

    stages = _stage_counts_to_funnel(counts)
    total_entered = counts.get("applied", 0)
    total_hired = counts.get("hired", 0)
    return HiringFunnelResponse(
        stages=stages,
        total_entered=total_entered,
        total_hired=total_hired,
        overall_conversion=round(total_hired / total_entered, 4) if total_entered else 0.0,
        generated_at=_now().isoformat(),
    )


# ── Time-to-hire ─────────────────────────────────────────────────────────────


@router.get(
    "/time-to-hire",
    response_model=TimeToHireResponse,
    tags=["Analytics"],
    summary="Average days from job creation to hire",
)
async def get_time_to_hire(
    tenant_id: str = Depends(require_tenant_id),
    session: AsyncSession = Depends(get_db_dependency),
) -> TimeToHireResponse:
    """Average (and median) number of days between a job's ``created_at``
    and the moment the corresponding application entered the ``HIRED``
    state (approximated by the application's ``updated_at`` timestamp).
    """
    rows = (
        await session.execute(
            select(Job.created_at, Application.updated_at, Application.applied_at)
            .join(Application, Application.job_id == Job.id)
            .where(
                and_(
                    Job.tenant_id == tenant_id,
                    Application.tenant_id == tenant_id,
                    Application.status == ApplicationStatus.HIRED,
                )
            )
        )
    ).all()

    durations: list[float] = []
    per_stage: dict[str, list[float]] = defaultdict(list)
    for job_created, app_updated, app_applied in rows:
        if not job_created or not app_updated:
            continue
        # Some DB drivers may return tz-aware datetimes; strip to naive UTC.
        def _naive(dt: Optional[datetime]) -> Optional[datetime]:
            if dt is None:
                return None
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            return dt

        jc = _naive(job_created)
        au = _naive(app_updated)
        ap = _naive(app_applied)
        if jc is None or au is None:
            continue
        days = (au - jc).total_seconds() / 86400.0
        if days < 0:
            # Sanity: ignore obviously bad rows
            continue
        durations.append(days)
        if ap is not None:
            screening_days = max(0.0, (au - ap).total_seconds() / 86400.0)
            per_stage["total_in_process"].append(screening_days)
        per_stage["job_to_hire"].append(days)

    sample = len(durations)
    if sample == 0:
        return TimeToHireResponse(
            average_days=0.0,
            median_days=0.0,
            sample_size=0,
            by_stage=[],
            generated_at=_now().isoformat(),
        )

    durations_sorted = sorted(durations)
    avg = sum(durations_sorted) / sample
    if sample % 2 == 1:
        median = durations_sorted[sample // 2]
    else:
        mid = sample // 2
        median = (durations_sorted[mid - 1] + durations_sorted[mid]) / 2.0

    by_stage = [
        {
            "stage": name,
            "average_days": round(sum(values) / len(values), 2) if values else 0.0,
            "sample_size": len(values),
        }
        for name, values in per_stage.items()
    ]

    return TimeToHireResponse(
        average_days=round(avg, 2),
        median_days=round(median, 2),
        sample_size=sample,
        by_stage=by_stage,
        generated_at=_now().isoformat(),
    )


# ── Source effectiveness ─────────────────────────────────────────────────────


@router.get(
    "/source-effectiveness",
    response_model=SourceEffectivenessResponse,
    tags=["Analytics"],
    summary="Candidates grouped by acquisition source",
)
async def get_source_effectiveness(
    tenant_id: str = Depends(require_tenant_id),
    session: AsyncSession = Depends(get_db_dependency),
) -> SourceEffectivenessResponse:
    """Group candidates by their ``source`` field, then count hires per
    source (a candidate is "hired" if any of their applications is HIRED).
    """
    # Pull candidates with their source.
    candidates = (
        await session.execute(
            select(Candidate.id, Candidate.source).where(Candidate.tenant_id == tenant_id)
        )
    ).all()

    candidate_ids_by_source: dict[str, list[str]] = defaultdict(list)
    for cid, src in candidates:
        candidate_ids_by_source[src or "unknown"].append(cid)

    # Pull which candidates are hired.
    hired_ids: set[str] = set(
        (
            await session.execute(
                select(Application.candidate_id).where(
                    and_(
                        Application.tenant_id == tenant_id,
                        Application.status == ApplicationStatus.HIRED,
                    )
                )
            )
        )
        .scalars()
        .all()
    )

    sources: list[SourceEffectivenessItem] = []
    for source, ids in candidate_ids_by_source.items():
        hired = sum(1 for cid in ids if cid in hired_ids)
        total = len(ids)
        conversion = round(hired / total, 4) if total else 0.0
        sources.append(
            SourceEffectivenessItem(
                source=source,
                candidates=total,
                hired=hired,
                conversion_rate=conversion,
            )
        )

    sources.sort(key=lambda s: s.candidates, reverse=True)

    return SourceEffectivenessResponse(
        sources=sources,
        total=len(candidates),
        generated_at=_now().isoformat(),
    )


# ── Diversity ────────────────────────────────────────────────────────────────


def _bucketize(values: list[Optional[str]], other_threshold: int = 6) -> list[DiversityBucket]:
    """Count values, group any below ``other_threshold`` into ``other``."""
    counter: Counter[str] = Counter()
    for v in values:
        counter[(v or "unknown").strip() or "unknown"] += 1
    total = sum(counter.values()) or 1
    big = [(name, count) for name, count in counter.most_common() if count >= other_threshold]
    small = [(name, count) for name, count in counter.items() if count < other_threshold]
    buckets: list[DiversityBucket] = []
    for name, count in big:
        buckets.append(
            DiversityBucket(label=name, count=count, percentage=round(count / total * 100, 2))
        )
    if small:
        other_total = sum(c for _, c in small)
        buckets.append(
            DiversityBucket(
                label="other", count=other_total, percentage=round(other_total / total * 100, 2)
            )
        )
    return buckets


@router.get(
    "/diversity",
    response_model=DiversityResponse,
    tags=["Analytics"],
    summary="Diversity breakdown (location, status, seniority proxy)",
)
async def get_diversity(
    tenant_id: str = Depends(require_tenant_id),
    session: AsyncSession = Depends(get_db_dependency),
) -> DiversityResponse:
    """Diversity metrics grouped by location, status, and a seniority proxy.

    Note: AI-ROS does not store demographic data (gender, ethnicity) —
    that information is intentionally out of scope for the platform.
    This endpoint instead surfaces *operational* diversity dimensions that
    are useful for hiring analytics while remaining compliant with
    privacy regulations.
    """
    candidates = (
        await session.execute(
            select(Candidate.location, Candidate.status).where(
                Candidate.tenant_id == tenant_id
            )
        )
    ).all()

    locations = [loc for loc, _ in candidates]
    statuses = [st.value if hasattr(st, "value") else str(st) for _, st in candidates]

    # Seniority proxy: not stored on the Candidate table itself (it lives
    # on the CandidateProfile model), so fall back to grouping by status
    # for an operational "stage distribution" view.
    by_status = _bucketize(statuses)
    by_location = _bucketize(locations)

    # We don't have years_experience here without a join, so derive a
    # proxy from candidate.status for a "stage distribution" view.
    by_seniority = by_status  # alias kept for API stability

    return DiversityResponse(
        by_location=by_location,
        by_seniority=by_seniority,
        by_status=by_status,
        total=len(candidates),
        generated_at=_now().isoformat(),
    )


# ── Recruiter performance ────────────────────────────────────────────────────


@router.get(
    "/recruiter-performance",
    response_model=RecruiterPerformanceResponse,
    tags=["Analytics"],
    summary="Performance breakdown per recruiter/interviewer",
)
async def get_recruiter_performance(
    tenant_id: str = Depends(require_tenant_id),
    session: AsyncSession = Depends(get_db_dependency),
) -> RecruiterPerformanceResponse:
    """Per-recruiter stats: candidates touched, interviews scheduled,
    interviews completed, and hires.

    The current schema records ``hiring_manager_id`` on Job and
    ``interviewer_id`` on Interview.  We aggregate interviews by
    ``interviewer_id`` and treat jobs' hiring managers as the recruiters
    owning those pipelines.
    """
    # Build a map of user_id -> full_name for nicer output.
    from shared.core.models.identity import User

    users = (
        await session.execute(
            select(User.id, User.full_name).where(User.tenant_id == tenant_id)
        )
    ).all()
    name_by_id = {uid: name for uid, name in users}

    # Interview counts per interviewer.
    interview_rows = (
        await session.execute(
            select(Interview.interviewer_id, Interview.status).where(
                Interview.tenant_id == tenant_id
            )
        )
    ).all()

    sched_by_user: Counter[str] = Counter()
    completed_by_user: Counter[str] = Counter()
    for interviewer_id, status in interview_rows:
        if not interviewer_id:
            continue
        sched_by_user[interviewer_id] += 1
        if status == InterviewStatus.COMPLETED:
            completed_by_user[interviewer_id] += 1

    # Hires per recruiter — proxied via the hiring_manager_id of the job
    # the candidate's hired application belongs to.
    hire_rows = (
        await session.execute(
            select(Job.hiring_manager_id, Application.candidate_id)
            .join(Application, Application.job_id == Job.id)
            .where(
                and_(
                    Job.tenant_id == tenant_id,
                    Application.tenant_id == tenant_id,
                    Application.status == ApplicationStatus.HIRED,
                )
            )
        )
    ).all()
    hires_by_recruiter: dict[str, set[str]] = defaultdict(set)
    candidates_by_recruiter: dict[str, set[str]] = defaultdict(set)
    for hiring_manager_id, candidate_id in hire_rows:
        if not hiring_manager_id:
            continue
        hires_by_recruiter[hiring_manager_id].add(candidate_id)
        candidates_by_recruiter[hiring_manager_id].add(candidate_id)

    # Candidates processed: union of candidates from interviews and hires.
    recruiter_ids = set(sched_by_user) | set(hires_by_recruiter)
    items: list[RecruiterPerformanceItem] = []
    for rid in recruiter_ids:
        items.append(
            RecruiterPerformanceItem(
                recruiter_id=rid,
                recruiter_name=name_by_id.get(rid),
                candidates_processed=len(candidates_by_recruiter.get(rid, set())),
                interviews_scheduled=sched_by_user.get(rid, 0),
                interviews_completed=completed_by_user.get(rid, 0),
                hires=len(hires_by_recruiter.get(rid, set())),
            )
        )

    # Sort by hires desc, then by interviews desc.
    items.sort(key=lambda i: (i.hires, i.interviews_scheduled), reverse=True)

    return RecruiterPerformanceResponse(
        recruiters=items,
        total=len(items),
        generated_at=_now().isoformat(),
    )


# ── ML-Powered Predictions & Insights ────────────────────────────────────────


@router.get(
    "/predictions/time-to-hire",
    tags=["Analytics", "ML"],
    summary="Predict time-to-hire for open positions",
)
async def get_prediction_time_to_hire(
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    session: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    """Predict time-to-hire using historical data via linear regression."""
    rows = (
        await session.execute(
            select(
                Job.created_at,
                Application.updated_at,
                Job.department,
                Job.seniority_required,
                Job.applicants_count,
            )
            .join(Application, Application.job_id == Job.id)
            .where(
                and_(
                    Job.tenant_id == tenant_id,
                    Application.tenant_id == tenant_id,
                    Application.status == ApplicationStatus.HIRED,
                )
            )
        )
    ).all()

    historical: list[dict[str, Any]] = []
    for job_created, app_updated, dept, seniority, applicants in rows:
        if not job_created or not app_updated:
            continue
        days = (app_updated - job_created).total_seconds() / 86400.0
        if days < 0:
            continue
        historical.append({
            "days_to_hire": days,
            "department": dept,
            "seniority": seniority,
            "applicants": applicants or 0,
        })

    open_jobs = (
        await session.execute(
            select(Job).where(
                and_(Job.tenant_id == tenant_id, Job.status == JobStatus.OPEN)
            )
        )
    ).scalars().all()

    predictions = []
    for job in open_jobs:
        job_dict = {
            "department": job.department,
            "seniority_required": job.seniority_required,
            "applicants_count": job.applicants_count,
        }
        pred = predict_time_to_hire(job_dict, historical)
        predictions.append({
            "job_id": job.id,
            "job_title": job.title,
            **pred,
        })

    return {
        "predictions": predictions,
        "historical_sample_size": len(historical),
        "generated_at": _now().isoformat(),
    }


@router.get(
    "/predictions/candidate-success",
    tags=["Analytics", "ML"],
    summary="Predict candidate success probability",
)
async def get_prediction_candidate_success(
    candidate_id: str,
    job_id: str,
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    session: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    """Predict the probability of a candidate succeeding in a given role."""
    candidate = await session.get(Candidate, candidate_id)
    if not candidate or candidate.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Candidate not found")

    job = await session.get(Job, job_id)
    if not job or job.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Job not found")

    hired_apps = (
        await session.execute(
            select(Application, Job)
            .join(Job, Application.job_id == Job.id)
            .where(
                and_(
                    Application.tenant_id == tenant_id,
                    Application.status == ApplicationStatus.HIRED,
                )
            )
        )
    ).all()

    historical_hires: list[dict[str, Any]] = []
    for app, j in hired_apps:
        cand = await session.get(Candidate, app.candidate_id)
        historical_hires.append({
            "source": cand.source if cand else None,
            "location": cand.location if cand else None,
            "department": j.department,
            "seniority": j.seniority_required,
            "hired": True,
            "performed_well": True,
        })

    from shared.core.models.candidate import CandidateProfile

    profile = (
        await session.execute(
            select(CandidateProfile).where(CandidateProfile.candidate_id == candidate_id)
        )
    ).scalar_one_or_none()

    cand_dict = {
        "source": candidate.source,
        "location": candidate.location,
        "years_experience": profile.years_experience if profile else None,
        "seniority": profile.seniority_level if profile else None,
        "skills": [],
    }
    job_dict = {
        "department": job.department,
        "seniority_required": job.seniority_required,
        "location": job.location,
        "required_skills": [],
    }

    result = predict_candidate_success(cand_dict, job_dict, historical_hires)
    return {
        "candidate_id": candidate_id,
        "job_id": job_id,
        **result,
        "generated_at": _now().isoformat(),
    }


@router.get(
    "/insights/bias-detection",
    tags=["Analytics", "ML"],
    summary="Detect potential hiring bias",
)
async def get_bias_detection(
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    session: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    """Analyze applications and hires for potential bias patterns."""
    applications = (
        await session.execute(
            select(Application, Candidate)
            .join(Candidate, Application.candidate_id == Candidate.id)
            .where(
                and_(
                    Application.tenant_id == tenant_id,
                    Candidate.tenant_id == tenant_id,
                )
            )
        )
    ).all()

    apps_data: list[dict[str, Any]] = []
    hired_ids: set[str] = set()
    for app, cand in applications:
        apps_data.append({
            "candidate_id": app.candidate_id,
            "location": cand.location,
            "source": cand.source,
            "status": app.status.value if hasattr(app.status, "value") else str(app.status),
        })
        if app.status == ApplicationStatus.HIRED:
            hired_ids.add(app.candidate_id)

    hires_data = [
        {"candidate_id": cid}
        for cid in hired_ids
    ]

    result = detect_hiring_bias(apps_data, hires_data)
    return result


@router.get(
    "/insights/sourcing-recommendations",
    tags=["Analytics", "ML"],
    summary="Recommend sourcing channel allocation",
)
async def get_sourcing_recommendations(
    budget: float = 10000.0,
    job_id: str | None = None,
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    session: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    """Recommend optimal sourcing channel allocation based on historical data."""
    source_data = (
        await session.execute(
            select(Candidate.source, Candidate.id)
            .where(Candidate.tenant_id == tenant_id)
        )
    ).all()

    hired_ids: set[str] = set(
        (
            await session.execute(
                select(Application.candidate_id).where(
                    and_(
                        Application.tenant_id == tenant_id,
                        Application.status == ApplicationStatus.HIRED,
                    )
                )
            )
        ).scalars().all()
    )

    channel_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"total": 0, "hired": 0})
    for source, cid in source_data:
        ch = source or "unknown"
        channel_stats[ch]["total"] += 1
        if cid in hired_ids:
            channel_stats[ch]["hired"] += 1

    historical_channels: list[dict[str, Any]] = []
    for ch, stats in channel_stats.items():
        total = stats["total"]
        hired = stats["hired"]
        conv_rate = hired / total if total > 0 else 0.05
        cost_map = {
            "linkedin": 50.0, "indeed": 30.0, "referral": 15.0,
            "careers_site": 5.0, "agency": 200.0, "job_board": 20.0,
        }
        cpc = cost_map.get(ch.lower(), 35.0)
        cph = cpc / conv_rate if conv_rate > 0 else 1000.0
        historical_channels.append({
            "channel": ch,
            "cost_per_candidate": cpc,
            "conversion_rate": conv_rate,
            "avg_cost_per_hire": round(cph, 2),
            "candidates_sourced": total,
        })

    job_dict: dict[str, Any] = {"department": None, "seniority_required": None}
    if job_id:
        job = await session.get(Job, job_id)
        if job and job.tenant_id == tenant_id:
            job_dict = {
                "department": job.department,
                "seniority_required": job.seniority_required,
                "job_type": job.job_type.value if hasattr(job.job_type, "value") else str(job.job_type),
            }

    result = recommend_sourcing_channels(job_dict, budget, historical_channels)
    return result


@router.get(
    "/forecasts/hiring-needs",
    tags=["Analytics", "ML"],
    summary="Forecast hiring needs",
)
async def get_forecast_hiring_needs(
    months: int = 6,
    tenant_id: str = Depends(require_tenant_id),
    user: dict = Depends(require_member),
    session: AsyncSession = Depends(get_db_dependency),
) -> dict[str, Any]:
    """Forecast hiring needs using historical hiring trends."""
    months = max(1, min(months, 24))

    rows = (
        await session.execute(
            select(func.count(Application.id), func.strftime("%Y-%m", Application.updated_at))
            .where(
                and_(
                    Application.tenant_id == tenant_id,
                    Application.status == ApplicationStatus.HIRED,
                )
            )
            .group_by(func.strftime("%Y-%m", Application.updated_at))
            .order_by(func.strftime("%Y-%m", Application.updated_at))
        )
    ).all()

    historical: list[dict[str, Any]] = []
    for count, month_str in rows:
        if month_str:
            historical.append({"month": month_str, "hires_count": int(count)})

    open_count = await session.scalar(
        select(func.count(Job.id)).where(
            and_(Job.tenant_id == tenant_id, Job.status == JobStatus.OPEN)
        )
    )

    total_hires = await session.scalar(
        select(func.count(Application.id)).where(
            and_(
                Application.tenant_id == tenant_id,
                Application.status == ApplicationStatus.HIRED,
            )
        )
    )
    total_apps = await session.scalar(
        select(func.count(Application.id)).where(Application.tenant_id == tenant_id)
    )
    attrition = 0.05
    if total_apps and total_apps > 0 and total_hires:
        hire_rate = int(total_hires or 0) / int(total_apps)
        attrition = max(0.01, min(0.2, 1.0 - hire_rate))

    result = forecast_hiring_needs(
        tenant_id=tenant_id,
        months_ahead=months,
        historical_hiring_data=historical,
        current_open_positions=int(open_count or 0),
        attrition_rate=attrition,
    )
    return result


# ── Legacy endpoints (kept for backwards compatibility) ─────────────────────


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "healthy", "service": "analytics"}


@router.get("/dashboard")
async def get_dashboard(
    time_range: str = "7d",
    department: str = "engineering",
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    seed = hash(time_range + department) % 10000
    random.seed(seed)
    base_candidates = random.randint(800, 1500)
    base_jobs = random.randint(15, 35)
    base_interviews = random.randint(20, 60)
    return {
        "time_range": time_range,
        "department": department,
        "metrics": {
            "total_candidates": base_candidates,
            "open_positions": base_jobs,
            "active_interviews": base_interviews,
            "hires_this_month": random.randint(5, 15),
            "avg_time_to_hire_days": round(random.uniform(12.0, 18.0), 1),
            "ai_evaluation_accuracy": round(random.uniform(88.0, 95.0), 1),
            "conversion_rate": round(random.uniform(0.08, 0.18), 2),
            "candidate_satisfaction": round(random.uniform(4.0, 4.8), 1),
        },
        "trends": {
            "candidates_delta": round(random.uniform(-0.1, 0.2), 2),
            "hires_delta": round(random.uniform(-0.1, 0.3), 2),
            "time_to_hire_delta": round(random.uniform(-2.0, 1.0), 1),
        },
        "generated_at": _now().isoformat(),
    }


@router.get("/pipeline")
async def get_pipeline(
    department: str = "engineering",
    days: int = 30,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    seed = hash(department + str(days)) % 10000
    random.seed(seed)
    applied = random.randint(120, 200)
    screening = int(applied * random.uniform(0.5, 0.7))
    interview = int(screening * random.uniform(0.4, 0.6))
    evaluation = int(interview * random.uniform(0.5, 0.7))
    offer = int(evaluation * random.uniform(0.3, 0.5))
    hired = int(offer * random.uniform(0.6, 0.9))
    stages = [
        {"stage": "Applied", "count": applied,
         "conversion_rate": round(screening / applied, 2) if applied else 0},
        {"stage": "Screening", "count": screening,
         "conversion_rate": round(interview / screening, 2) if screening else 0},
        {"stage": "Interview", "count": interview,
         "conversion_rate": round(evaluation / interview, 2) if interview else 0},
        {"stage": "Evaluation", "count": evaluation,
         "conversion_rate": round(offer / evaluation, 2) if evaluation else 0},
        {"stage": "Offer", "count": offer,
         "conversion_rate": round(hired / offer, 2) if offer else 0},
        {"stage": "Hired", "count": hired, "conversion_rate": 1.0},
    ]
    return {
        "department": department,
        "days": days,
        "pipeline": stages,
        "overall_conversion": round(hired / applied, 3) if applied else 0,
    }


@router.get("/ai-performance")
async def get_ai_performance(
    agent_type: Optional[str] = None,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    metrics_data = [
        {"name": "Resume Parsing Accuracy", "value": round(random.uniform(91.0, 96.0), 1),
         "target": 95.0, "agent": "resume_parsing"},
        {"name": "Skill Extraction F1", "value": round(random.uniform(87.0, 93.0), 1),
         "target": 90.0, "agent": "skill_extraction"},
        {"name": "PPE Evaluation Correlation", "value": round(random.uniform(89.0, 94.0), 1),
         "target": 90.0, "agent": "ppe_evaluation"},
        {"name": "Candidate Matching Accuracy", "value": round(random.uniform(85.0, 92.0), 1),
         "target": 90.0, "agent": "candidate_profiling"},
        {"name": "Interview Score Predictiveness", "value": round(random.uniform(82.0, 90.0), 1),
         "target": 85.0, "agent": "hr_interview"},
        {"name": "Technical Assessment Validity", "value": round(random.uniform(86.0, 94.0), 1),
         "target": 88.0, "agent": "technical_interview"},
    ]
    if agent_type:
        metrics_data = [m for m in metrics_data if m["agent"] == agent_type]
    return {
        "metrics": metrics_data,
        "overall_score": round(sum(m["value"] for m in metrics_data) / len(metrics_data), 1)
        if metrics_data
        else 0,
    }


@router.get("/recruiter-productivity")
async def get_recruiter_productivity(
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    recruiters = [
        {"name": "Jane Smith", "candidates_reviewed": random.randint(30, 60),
         "interviews_conducted": random.randint(8, 18), "hires": random.randint(2, 6),
         "avg_response_time_hours": round(random.uniform(1.0, 4.0), 1)},
        {"name": "Bob Johnson", "candidates_reviewed": random.randint(25, 50),
         "interviews_conducted": random.randint(6, 15), "hires": random.randint(1, 5),
         "avg_response_time_hours": round(random.uniform(1.5, 5.0), 1)},
        {"name": "Alice Williams", "candidates_reviewed": random.randint(35, 65),
         "interviews_conducted": random.randint(10, 20), "hires": random.randint(3, 7),
         "avg_response_time_hours": round(random.uniform(0.8, 3.5), 1)},
    ]
    return {"recruiters": recruiters}


@router.get("/time-to-hire-legacy")
async def get_time_to_hire_legacy(
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    application = 0
    screening = round(random.uniform(0.8, 2.0), 1)
    interview = round(screening + random.uniform(3.0, 6.0), 1)
    evaluation = round(interview + random.uniform(1.5, 3.0), 1)
    offer = round(evaluation + random.uniform(2.0, 4.0), 1)
    hired = round(offer + random.uniform(1.0, 3.0), 1)
    return {
        "average_days": hired,
        "by_stage": [
            {"stage": "Application", "days": application},
            {"stage": "Screening", "days": screening},
            {"stage": "Interview", "days": interview},
            {"stage": "Evaluation", "days": evaluation},
            {"stage": "Offer", "days": offer},
            {"stage": "Hired", "days": hired},
        ],
    }


@router.post("/reports")
async def generate_report(
    report_type: str = "monthly",
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    report_id = f"report_{_now().strftime('%Y%m%d_%H%M%S')}"
    return {
        "report_id": report_id,
        "status": "generating",
        "report_type": report_type,
        "estimated_time": "30 seconds",
    }


@router.get("/reports/{report_id}")
async def get_report(
    report_id: str,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    return {
        "report_id": report_id,
        "status": "completed",
        "data": {
            "summary": "Monthly recruitment report",
            "hires": random.randint(5, 15),
            "time_to_hire": round(random.uniform(12.0, 18.0), 1),
            "top_source": "LinkedIn",
            "ai_accuracy": round(random.uniform(88.0, 95.0), 1),
        },
    }
