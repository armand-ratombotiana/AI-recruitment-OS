"""Jobs Status Service — background job status, active list, history, cancel.

Wraps a tiny in-memory registry that mimics Celery's task state machine.
Other services can call `enqueue(...)` to publish a job; consumers query
the endpoints below.
"""
from __future__ import annotations

import random
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field


# ── In-Memory Store ────────────────────────────────────────────────────────────


_jobs: dict[str, dict[str, Any]] = {}


JobStatus = Literal["pending", "queued", "running", "succeeded", "failed", "cancelled", "retrying"]


# ── Models ─────────────────────────────────────────────────────────────────────


class JobInfo(BaseModel):
    id: str
    name: str
    status: str
    progress: float = 0.0
    queue: str = "default"
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    duration_ms: Optional[int] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    args: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    retry_count: int = 0


class JobListResponse(BaseModel):
    data: list[JobInfo]
    total: int


class EnqueueRequest(BaseModel):
    name: str = Field(..., min_length=1)
    queue: str = "default"
    args: Optional[dict[str, Any]] = None
    metadata: Optional[dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "jobs"
    backend: str = "in-memory"


# ── Helpers ────────────────────────────────────────────────────────────────────


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_job_id() -> str:
    return f"job_{uuid.uuid4().hex[:14]}"


def _seed_initial() -> None:
    if _jobs:
        return
    now = _now()
    samples = [
        ("resume.parse", "succeeded", 100.0, 1500, {"resume_id": "r_001"}),
        ("candidate.enrich", "succeeded", 100.0, 3200, {"candidate_id": "c_001"}),
        ("interview.transcribe", "running", 65.0, None, {"interview_id": "i_001"}),
        ("ppe.evaluate", "queued", 0.0, None, {"session_id": "s_001"}),
        ("export.candidates", "succeeded", 100.0, 800, {"format": "csv"}),
        ("workflow.run", "failed", 35.0, 2100, {"workflow_id": "w_001"}),
    ]
    for i, (name, status, progress, duration_ms, args) in enumerate(samples):
        job_id = _new_job_id()
        created = now.timestamp() - (i * 600)
        record = {
            "id": job_id,
            "name": name,
            "status": status,
            "progress": progress,
            "queue": "default",
            "created_at": datetime.fromtimestamp(created, tz=timezone.utc).isoformat(),
            "started_at": datetime.fromtimestamp(created + 1, tz=timezone.utc).isoformat() if status != "queued" else None,
            "finished_at": datetime.fromtimestamp(created + (duration_ms or 0) / 1000 + 1, tz=timezone.utc).isoformat() if status in ("succeeded", "failed", "cancelled") else None,
            "duration_ms": duration_ms,
            "result": {"ok": True} if status == "succeeded" else None,
            "error": "Workflow step timed out" if status == "failed" else None,
            "args": args,
            "metadata": {},
            "retry_count": 1 if status == "failed" else 0,
        }
        _jobs[job_id] = record


def enqueue(
    name: str,
    *,
    queue: str = "default",
    args: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Public helper other services can call to register a background job."""
    job_id = _new_job_id()
    now = _now().isoformat()
    record = {
        "id": job_id,
        "name": name,
        "status": "queued",
        "progress": 0.0,
        "queue": queue,
        "created_at": now,
        "started_at": None,
        "finished_at": None,
        "duration_ms": None,
        "result": None,
        "error": None,
        "args": args or {},
        "metadata": metadata or {},
        "retry_count": 0,
    }
    _jobs[job_id] = record
    return record


# ── Router ─────────────────────────────────────────────────────────────────────


router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Background Jobs"])
async def health() -> HealthResponse:
    return HealthResponse()


@router.post("/", response_model=JobInfo, tags=["Background Jobs"], summary="Enqueue a background job")
async def enqueue_job(data: EnqueueRequest):
    record = enqueue(data.name, queue=data.queue, args=data.args, metadata=data.metadata)
    return JobInfo(**record)


@router.get("/active", response_model=JobListResponse, tags=["Background Jobs"], summary="List active jobs")
async def list_active(limit: int = Query(50, ge=1, le=200)):
    _seed_initial()
    active = [j for j in _jobs.values() if j["status"] in ("running", "queued", "retrying", "pending")]
    active.sort(key=lambda j: j["created_at"], reverse=True)
    return JobListResponse(
        data=[JobInfo(**j) for j in active[:limit]],
        total=len(active),
    )


@router.get("/history", response_model=JobListResponse, tags=["Background Jobs"], summary="List completed jobs")
async def list_history(
    status_filter: Optional[JobStatus] = Query(None, alias="status"),
    name: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    _seed_initial()
    items = list(_jobs.values())
    if status_filter:
        items = [j for j in items if j["status"] == status_filter]
    if name:
        items = [j for j in items if j["name"] == name]
    items.sort(key=lambda j: j["created_at"], reverse=True)
    return JobListResponse(
        data=[JobInfo(**j) for j in items[offset : offset + limit]],
        total=len(items),
    )


@router.get("/stats", tags=["Background Jobs"], summary="Aggregate job stats")
async def get_stats():
    _seed_initial()
    by_status: dict[str, int] = {}
    by_queue: dict[str, int] = {}
    by_name: dict[str, int] = {}
    durations: list[int] = []
    for j in _jobs.values():
        by_status[j["status"]] = by_status.get(j["status"], 0) + 1
        by_queue[j["queue"]] = by_queue.get(j["queue"], 0) + 1
        by_name[j["name"]] = by_name.get(j["name"], 0) + 1
        if j["duration_ms"] is not None:
            durations.append(j["duration_ms"])
    avg = round(sum(durations) / len(durations), 1) if durations else 0
    return {
        "total": len(_jobs),
        "by_status": by_status,
        "by_queue": by_queue,
        "by_name": by_name,
        "avg_duration_ms": avg,
    }


@router.get("/{job_id}", response_model=JobInfo, tags=["Background Jobs"], summary="Get background job status")
async def get_job(job_id: str):
    _seed_initial()
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobInfo(**_jobs[job_id])


@router.get("/{job_id}/status", tags=["Background Jobs"], summary="Get just status + progress")
async def get_job_status(job_id: str):
    _seed_initial()
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    j = _jobs[job_id]
    return {
        "id": j["id"],
        "status": j["status"],
        "progress": j["progress"],
        "finished": j["status"] in ("succeeded", "failed", "cancelled"),
    }


@router.post("/{job_id}/cancel", response_model=JobInfo, tags=["Background Jobs"])
async def cancel_job(job_id: str):
    _seed_initial()
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    j = _jobs[job_id]
    if j["status"] in ("succeeded", "failed", "cancelled"):
        raise HTTPException(status_code=409, detail=f"Cannot cancel job in '{j['status']}' state")
    j["status"] = "cancelled"
    j["finished_at"] = _now().isoformat()
    return JobInfo(**j)


@router.post("/{job_id}/retry", response_model=JobInfo, tags=["Background Jobs"])
async def retry_job(job_id: str):
    _seed_initial()
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    j = _jobs[job_id]
    if j["status"] not in ("failed", "cancelled"):
        raise HTTPException(status_code=409, detail="Only failed or cancelled jobs can be retried")
    j["status"] = "queued"
    j["progress"] = 0.0
    j["error"] = None
    j["started_at"] = None
    j["finished_at"] = None
    j["retry_count"] += 1
    return JobInfo(**j)


@router.delete("/{job_id}", tags=["Background Jobs"])
async def delete_job(job_id: str):
    _seed_initial()
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    _jobs.pop(job_id)
    return {"id": job_id, "deleted": True}
