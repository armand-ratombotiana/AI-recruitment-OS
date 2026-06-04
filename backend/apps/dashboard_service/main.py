"""Dashboard Service — fast pre-aggregated widgets for the home page.

Designed to power the dashboard SPA in <50ms by composing
existing data from the candidate/job/interview/activity services
and exposing them under a small, stable surface:

- ``GET /api/v1/dashboard/stats``          — KPIs (candidates, jobs, interviews, hires)
- ``GET /api/v1/dashboard/recent-activity``— last N activities for the caller's tenant
- ``GET /api/v1/dashboard/upcoming``       — upcoming interviews in the next 14 days
- ``GET /api/v1/dashboard/funnel``         — recruitment funnel breakdown
- ``GET /api/v1/dashboard/widgets``        — single-shot payload for the entire home screen
"""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("dashboard_service")
router = APIRouter()


# ── Models ─────────────────────────────────────────────────────────────────────


class DashboardStats(BaseModel):
    total_candidates: int
    new_candidates_this_week: int
    open_jobs: int
    active_interviews: int
    hires_this_month: int
    pending_offers: int
    avg_time_to_hire_days: float
    candidate_satisfaction: float
    conversion_rate: float
    ai_accuracy: float
    trends: dict[str, float] = Field(default_factory=dict)
    generated_at: str


class RecentActivity(BaseModel):
    id: str
    action: str
    description: str
    user_name: Optional[str] = None
    timestamp: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None


class UpcomingItem(BaseModel):
    id: str
    type: str  # interview | follow_up | offer_expiry | ppe
    title: str
    candidate_name: Optional[str] = None
    job_title: Optional[str] = None
    scheduled_at: str
    duration_minutes: Optional[int] = None
    status: str


class FunnelStage(BaseModel):
    stage: str
    count: int
    conversion_from_previous: float


class FunnelResponse(BaseModel):
    stages: list[FunnelStage]
    total_entered: int
    total_hired: int
    overall_conversion: float
    generated_at: str


class WidgetsResponse(BaseModel):
    stats: DashboardStats
    recent_activity: list[RecentActivity]
    upcoming: list[UpcomingItem]
    funnel: FunnelResponse
    generated_at: str


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _deterministic_count(seed: str, lo: int, hi: int) -> int:
    rng = random.Random(hash(seed) & 0xFFFFFFFF)
    return rng.randint(lo, hi)


# ── Endpoints ──────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=DashboardStats, tags=["Dashboard"], summary="Quick KPI stats")
async def get_stats(
    tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
    time_range: str = Query(default="30d", description="7d | 30d | 90d"),
) -> DashboardStats:
    """Aggregate KPIs for the dashboard widget strip.

    In production this would call the analytics service.  The mock
    implementation here is deterministic per (tenant, time_range) so
    widgets remain stable across refreshes.
    """
    seed = f"{tenant_id}:{time_range}"
    return DashboardStats(
        total_candidates=_deterministic_count(seed + ":c", 800, 1500),
        new_candidates_this_week=_deterministic_count(seed + ":new", 20, 80),
        open_jobs=_deterministic_count(seed + ":jobs", 12, 40),
        active_interviews=_deterministic_count(seed + ":intv", 15, 50),
        hires_this_month=_deterministic_count(seed + ":hires", 3, 12),
        pending_offers=_deterministic_count(seed + ":offers", 1, 6),
        avg_time_to_hire_days=round(_deterministic_count(seed + ":tth", 120, 180) / 10.0, 1),
        candidate_satisfaction=round(_deterministic_count(seed + ":sat", 40, 48) / 10.0, 1),
        conversion_rate=round(_deterministic_count(seed + ":conv", 80, 180) / 1000.0, 3),
        ai_accuracy=round(_deterministic_count(seed + ":ai", 880, 950) / 10.0, 1),
        trends={
            "candidates_delta": round(_deterministic_count(seed + ":dt-c", -50, 200) / 1000.0, 3),
            "jobs_delta": round(_deterministic_count(seed + ":dt-j", -20, 50) / 1000.0, 3),
            "interviews_delta": round(_deterministic_count(seed + ":dt-i", -20, 80) / 1000.0, 3),
            "hires_delta": round(_deterministic_count(seed + ":dt-h", -10, 60) / 1000.0, 3),
        },
        generated_at="deterministic",  # Stable for cache purposes
    )


@router.get(
    "/recent-activity",
    response_model=list[RecentActivity],
    tags=["Dashboard"],
    summary="Recent activity for the dashboard feed",
)
async def get_recent_activity(
    limit: int = Query(default=10, ge=1, le=50),
    tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
) -> list[RecentActivity]:
    """Return a curated list of recent tenant activities for the dashboard.

    The activity service is the source of truth — this endpoint synthesises
    a small fixture list deterministically per (tenant, limit) so the
    frontend can render a stable feed during development.
    """
    actions = [
        ("candidate.created", "New candidate Alice Johnson"),
        ("interview.scheduled", "Interview scheduled with Bob Smith"),
        ("job.published", "Job posting published: Senior Backend Engineer"),
        ("candidate.tagged", "Tagged candidate Carol Lee as 'priority'"),
        ("offer.extended", "Offer extended to David Kim"),
        ("ppe.completed", "PPE session completed by Eve Martinez"),
        ("workflow.completed", "Workflow 'send rejection email' completed"),
        ("user.joined", "New team member Frank Wong joined"),
        ("candidate.hired", "Candidate Grace Patel hired"),
        ("interview.completed", "Interview with Henry Adams completed"),
        ("job.archived", "Job 'Mobile Engineer' archived"),
        ("comment.added", "Note added to candidate Ivy Chen"),
    ]
    rng = random.Random(hash(tenant_id) & 0xFFFFFFFF)
    selected = rng.sample(actions, k=min(limit, len(actions)))
    base = datetime(2025, 1, 1, 12, 0, 0)
    return [
        RecentActivity(
            id=f"act_{i:04d}",
            action=action,
            description=desc,
            user_name=rng.choice(["Demo User", "Jane Recruiter", "Alex Manager"]),
            timestamp=(base - timedelta(minutes=i * 12 + rng.randint(0, 6))).isoformat(),
            resource_type=action.split(".")[0],
            resource_id=f"res_{i:04d}",
        )
        for i, (action, desc) in enumerate(selected)
    ]


@router.get(
    "/upcoming",
    response_model=list[UpcomingItem],
    tags=["Dashboard"],
    summary="Upcoming interviews and follow-ups in the next 14 days",
)
async def get_upcoming(
    limit: int = Query(default=10, ge=1, le=50),
    tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
) -> list[UpcomingItem]:
    """Return a deterministic list of upcoming items for the dashboard widget."""
    rng = random.Random(hash(tenant_id + ":upcoming") & 0xFFFFFFFF)
    now = datetime(2025, 1, 2, 9, 0, 0)  # Deterministic baseline for cache stability
    candidates = [
        ("Sarah Lin", "Senior Backend Engineer"),
        ("Tom Brady", "Staff iOS Engineer"),
        ("Maya Angelou", "Engineering Manager"),
        ("Niels Bohr", "Research Scientist"),
        ("Ada Lovelace", "Principal Engineer"),
    ]
    types = ["interview", "follow_up", "offer_expiry", "ppe"]
    statuses = ["scheduled", "confirmed", "pending"]
    return [
        UpcomingItem(
            id=f"up_{i:04d}",
            type=types[rng.randint(0, len(types) - 1)],
            title=f"{candidates[i % len(candidates)][1]} — Round {i % 3 + 1}",
            candidate_name=candidates[i % len(candidates)][0],
            job_title=candidates[i % len(candidates)][1],
            scheduled_at=(datetime(2025, 1, 2, 9, 0, 0) + timedelta(hours=i * 5 + rng.randint(1, 4))).isoformat(),
            duration_minutes=rng.choice([30, 45, 60, 90]),
            status=statuses[rng.randint(0, len(statuses) - 1)],
        )
        for i in range(min(limit, 5))
    ]


@router.get(
    "/funnel",
    response_model=FunnelResponse,
    tags=["Dashboard"],
    summary="Recruitment funnel breakdown",
)
async def get_funnel(
    time_range: str = Query(default="30d"),
    department: str = Query(default="engineering"),
    tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
) -> FunnelResponse:
    """Standard recruitment funnel used in dashboards and reports."""
    seed = f"{tenant_id}:{time_range}:{department}"
    applied = _deterministic_count(seed + ":a", 200, 500)
    screening = int(applied * 0.65)
    interview = int(screening * 0.55)
    evaluation = int(interview * 0.7)
    offer = int(evaluation * 0.45)
    hired = int(offer * 0.8)
    stages = [
        FunnelStage(stage="applied", count=applied, conversion_from_previous=1.0),
        FunnelStage(
            stage="screening",
            count=screening,
            conversion_from_previous=round(screening / applied, 3) if applied else 0.0,
        ),
        FunnelStage(
            stage="interview",
            count=interview,
            conversion_from_previous=round(interview / screening, 3) if screening else 0.0,
        ),
        FunnelStage(
            stage="evaluation",
            count=evaluation,
            conversion_from_previous=round(evaluation / interview, 3) if interview else 0.0,
        ),
        FunnelStage(
            stage="offer",
            count=offer,
            conversion_from_previous=round(offer / evaluation, 3) if evaluation else 0.0,
        ),
        FunnelStage(
            stage="hired",
            count=hired,
            conversion_from_previous=round(hired / offer, 3) if offer else 0.0,
        ),
    ]
    return FunnelResponse(
        stages=stages,
        total_entered=applied,
        total_hired=hired,
        overall_conversion=round(hired / applied, 4) if applied else 0.0,
        generated_at="deterministic",
    )


@router.get(
    "/widgets",
    response_model=WidgetsResponse,
    tags=["Dashboard"],
    summary="Single-shot payload powering the entire dashboard home screen",
)
async def get_widgets(
    tenant_id: str = Header(default="default", alias="X-Tenant-ID"),
) -> WidgetsResponse:
    """Compose the four most common widgets in one round trip."""
    stats = await get_stats(tenant_id=tenant_id)
    recent = await get_recent_activity(limit=8, tenant_id=tenant_id)
    upcoming = await get_upcoming(limit=8, tenant_id=tenant_id)
    funnel = await get_funnel(tenant_id=tenant_id)
    return WidgetsResponse(
        stats=stats,
        recent_activity=recent,
        upcoming=upcoming,
        funnel=funnel,
        generated_at="deterministic",
    )
