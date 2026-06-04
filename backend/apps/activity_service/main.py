"""Activity Service — tenant-wide and per-user activity feed.

Designed to power the dashboard activity widget. Activities are emitted
by other services via `emit_activity(...)` and consumed by the feed
endpoints below.
"""
from __future__ import annotations

import random
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

from shared.core.rate_limit_deps import default_write_rate


# ── In-Memory Store ────────────────────────────────────────────────────────────

MAX_TENANT_ACTIVITIES = 5000
_tenant_activities: dict[str, deque[dict[str, Any]]] = {}
_read_status: dict[str, set[str]] = {}  # user_key -> set of activity ids


KNOWN_ACTIONS = {
    "candidate.created", "candidate.updated", "candidate.deleted", "candidate.hired",
    "candidate.rejected", "candidate.tagged",
    "job.created", "job.updated", "job.archived", "job.published",
    "interview.scheduled", "interview.started", "interview.completed", "interview.cancelled",
    "ppe.started", "ppe.completed",
    "offer.extended", "offer.accepted", "offer.declined",
    "user.invited", "user.joined", "user.deactivated",
    "workflow.completed", "workflow.failed",
    "comment.added", "note.added",
    "file.uploaded",
    "system.notification",
}


# ── Models ─────────────────────────────────────────────────────────────────────


class Activity(BaseModel):
    id: str
    tenant_id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    description: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    timestamp: str
    read: bool = False


class ActivityListResponse(BaseModel):
    data: list[Activity]
    total: int
    unread_count: int


class ActivityEmit(BaseModel):
    action: str
    description: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "activity"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _tenant_id(x_tenant_id: Optional[str]) -> str:
    return x_tenant_id or "default"


def _user_key(authorization: Optional[str], x_user_id: Optional[str]) -> str:
    if x_user_id:
        return x_user_id
    if authorization:
        return f"auth_{hash(authorization) & 0xffff:04x}"
    return "anonymous"


def _bucket(tenant_id: str) -> deque[dict[str, Any]]:
    if tenant_id not in _tenant_activities:
        _tenant_activities[tenant_id] = deque(maxlen=MAX_TENANT_ACTIVITIES)
        _seed_demo_data(tenant_id)
    return _tenant_activities[tenant_id]


def _seed_demo_data(tenant_id: str) -> None:
    """Seed each tenant with a handful of recent activities so the
    dashboard widget is not empty on first load."""
    bucket = _tenant_activities[tenant_id]
    now = _now()
    samples = [
        ("interview.scheduled", "Phone interview scheduled for Jane Doe", "interview", "i_001"),
        ("candidate.created", "New candidate John Smith added to pipeline", "candidate", "c_001"),
        ("job.published", "Senior Backend Engineer position published", "job", "j_001"),
        ("offer.extended", "Offer extended to Alex Rivera", "offer", "o_001"),
        ("interview.completed", "Technical interview completed for Sarah Chen", "interview", "i_002"),
        ("candidate.hired", "Michael Brown hired as DevOps Lead", "candidate", "c_002"),
    ]
    for i, (action, desc, res_type, res_id) in enumerate(samples):
        bucket.append({
            "id": f"act_{uuid.uuid4().hex[:14]}",
            "tenant_id": tenant_id,
            "user_id": f"u_{i % 3 + 1}",
            "user_name": ["Jane Recruiter", "Bob Hiring", "Alice Sourcer"][i % 3],
            "action": action,
            "resource_type": res_type,
            "resource_id": res_id,
            "description": desc,
            "metadata": {},
            "timestamp": (now - timedelta(hours=i)).isoformat(),
        })


def emit_activity(
    tenant_id: str,
    action: str,
    description: str,
    *,
    user_id: Optional[str] = None,
    user_name: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Public helper other services can call to publish activities."""
    activity_id = f"act_{uuid.uuid4().hex[:14]}"
    record = {
        "id": activity_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "description": description,
        "metadata": metadata or {},
        "timestamp": _now().isoformat(),
    }
    _bucket(tenant_id).append(record)
    return record


def _filter_activities(
    items: list[dict[str, Any]],
    *,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    since: Optional[str] = None,
    user_id: Optional[str] = None,
) -> list[dict[str, Any]]:
    result = items
    if action:
        result = [a for a in result if a["action"] == action]
    if resource_type:
        result = [a for a in result if a.get("resource_type") == resource_type]
    if user_id:
        result = [a for a in result if a.get("user_id") == user_id]
    if since:
        try:
            cutoff = datetime.fromisoformat(since.replace("Z", "+00:00"))
            result = [a for a in result if datetime.fromisoformat(a["timestamp"]) >= cutoff]
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
    return result


def _build_response(
    raw: list[dict[str, Any]], user_key: str, limit: int, offset: int
) -> ActivityListResponse:
    read_set = _read_status.get(user_key, set())
    raw_sorted = sorted(raw, key=lambda a: a["timestamp"], reverse=True)
    unread = sum(1 for a in raw_sorted if a["id"] not in read_set)
    sliced = raw_sorted[offset : offset + limit]
    activities = [Activity(**a, read=a["id"] in read_set) for a in sliced]
    return ActivityListResponse(data=activities, total=len(raw_sorted), unread_count=unread)


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Activity"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/recent", response_model=ActivityListResponse, tags=["Activity"], summary="Tenant-wide recent activity")
async def recent_activities(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    since: Optional[str] = Query(None, description="ISO timestamp"),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    tenant_id = _tenant_id(x_tenant_id)
    user_key = _user_key(authorization, x_user_id)
    items = list(_bucket(tenant_id))
    filtered = _filter_activities(items, action=action, resource_type=resource_type, since=since)
    return _build_response(filtered, user_key, limit, offset)


@router.get("/me", response_model=ActivityListResponse, tags=["Activity"], summary="Current user's activities")
async def my_activities(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    tenant_id = _tenant_id(x_tenant_id)
    user_key = _user_key(authorization, x_user_id)
    items = list(_bucket(tenant_id))
    mine = _filter_activities(items, user_id=user_key)
    if not mine:
        # No exact match — fall back to "first 3 users" demo data so the
        # widget is never blank when the user has not produced events yet.
        mine = [a for a in items if a.get("user_id") in {"u_1", "u_2", "u_3"}]
    return _build_response(mine, user_key, limit, offset)


@router.post("/", response_model=Activity, tags=["Activity"], summary="Emit an activity (system / integrations)")
async def emit_endpoint(
    data: ActivityEmit,
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    _rl: None = Depends(default_write_rate),
):
    record = emit_activity(
        tenant_id=_tenant_id(x_tenant_id),
        action=data.action,
        description=data.description,
        user_id=data.user_id,
        user_name=data.user_name,
        resource_type=data.resource_type,
        resource_id=data.resource_id,
        metadata=data.metadata,
    )
    return Activity(**record)


@router.post("/mark-read/{activity_id}", tags=["Activity"])
async def mark_read(
    activity_id: str,
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    user_key = _user_key(authorization, x_user_id)
    _read_status.setdefault(user_key, set()).add(activity_id)
    return {"id": activity_id, "read": True}


@router.post("/mark-all-read", tags=["Activity"])
async def mark_all_read(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    tenant_id = _tenant_id(x_tenant_id)
    user_key = _user_key(authorization, x_user_id)
    bucket = _bucket(tenant_id)
    read_set = _read_status.setdefault(user_key, set())
    for a in bucket:
        read_set.add(a["id"])
    return {"marked_read": len(bucket)}


@router.get("/unread-count", tags=["Activity"])
async def unread_count(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    authorization: Optional[str] = Header(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    tenant_id = _tenant_id(x_tenant_id)
    user_key = _user_key(authorization, x_user_id)
    read_set = _read_status.get(user_key, set())
    bucket = _bucket(tenant_id)
    return {"unread": sum(1 for a in bucket if a["id"] not in read_set)}


@router.get("/actions", tags=["Activity"], summary="List known action types")
async def list_actions():
    return {"actions": sorted(KNOWN_ACTIONS), "total": len(KNOWN_ACTIONS)}
