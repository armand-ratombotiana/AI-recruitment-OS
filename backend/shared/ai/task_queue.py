"""AI agent task queue — persistent queue with status tracking.

Tasks are persisted to the database via :class:`AgentTask` (SQLModel).
The orchestrator's HTTP API is a thin wrapper around the helpers exposed
here, and the background :mod:`shared.ai.worker` polls the queue and
runs pending tasks.

Status state machine::

    pending ──► running ──► completed
                   │   ╲
                   │    ╲──► failed ──► (retry) ──► pending
                   └──► cancelled

Cancellation is only valid from ``pending`` or ``running``; retry is
only valid from ``failed`` or ``cancelled`` states.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Literal, Optional

from sqlalchemy import Column, JSON
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Field as SQLField, SQLModel, select


# ── Status enum ────────────────────────────────────────────────────────────────


AgentTaskStatus = Literal["pending", "running", "completed", "failed", "cancelled"]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Model ──────────────────────────────────────────────────────────────────────


class AgentTask(SQLModel, table=True):
    """One row per AI agent invocation request.

    The ``input`` and ``output`` columns store arbitrary JSON.  ``error``
    is a free-form string used when ``status == "failed"``.  ``progress``
    is a 0.0–1.0 float so callers can show a progress bar while the
    worker is processing the task.
    """

    __tablename__ = "ai_agent_tasks"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    agent_type: str = SQLField(index=True, nullable=False)
    status: str = SQLField(default="pending", index=True, nullable=False)
    progress: float = SQLField(default=0.0, nullable=False)
    error: Optional[str] = SQLField(default=None)
    retry_count: int = SQLField(default=0, nullable=False)
    input: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column("input", JSON, nullable=False, default=dict),
    )
    output: Optional[dict[str, Any]] = SQLField(
        default=None,
        sa_column=Column("output", JSON, nullable=True),
    )
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
    started_at: Optional[datetime] = SQLField(default=None, index=True)
    completed_at: Optional[datetime] = SQLField(default=None)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _new_task_id() -> str:
    return f"task_{uuid.uuid4().hex[:14]}"


def _coerce_progress(value: float | int | None) -> float:
    if value is None:
        return 0.0
    try:
        n = float(value)
    except (TypeError, ValueError):
        return 0.0
    if n != n:  # NaN
        return 0.0
    return max(0.0, min(1.0, n))


# ── Public API ─────────────────────────────────────────────────────────────────


async def enqueue_task(
    db: AsyncSession,
    tenant_id: str,
    agent_type: str,
    input: dict[str, Any] | None = None,
    *,
    task_id: str | None = None,
) -> AgentTask:
    """Persist a new pending task and return it.

    A new task ID is generated if ``task_id`` is not provided.
    """
    if not tenant_id:
        raise ValueError("tenant_id is required")
    if not agent_type:
        raise ValueError("agent_type is required")

    task = AgentTask(
        id=task_id or _new_task_id(),
        tenant_id=tenant_id,
        agent_type=agent_type,
        input=input or {},
        status="pending",
        progress=0.0,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def get_task(
    db: AsyncSession,
    task_id: str,
    *,
    tenant_id: str | None = None,
) -> AgentTask | None:
    """Fetch a single task by id, optionally constrained to a tenant."""
    stmt = select(AgentTask).where(AgentTask.id == task_id)
    if tenant_id is not None:
        stmt = stmt.where(AgentTask.tenant_id == tenant_id)
    row = (await db.execute(stmt)).scalar_one_or_none()
    return row


async def update_task_status(
    db: AsyncSession,
    task_id: str,
    status: AgentTaskStatus,
    *,
    output: dict[str, Any] | None = None,
    error: str | None = None,
    progress: float | int | None = None,
    tenant_id: str | None = None,
) -> AgentTask | None:
    """Update status / output / error / progress of a task.

    ``started_at`` is stamped automatically the first time the status
    becomes ``running``; ``completed_at`` is stamped when the task
    reaches a terminal state (``completed`` / ``failed`` / ``cancelled``).
    Returns the updated task, or ``None`` if no matching row exists.
    """
    if status not in ("pending", "running", "completed", "failed", "cancelled"):
        raise ValueError(f"invalid status: {status!r}")

    task = await get_task(db, task_id, tenant_id=tenant_id)
    if not task:
        return None

    task.status = status
    if progress is not None:
        task.progress = _coerce_progress(progress)
    if output is not None:
        task.output = output
    if error is not None:
        task.error = error
    if status == "running" and task.started_at is None:
        task.started_at = _utcnow()
        if progress is None:
            task.progress = max(task.progress, 0.0)
    if status in ("completed", "failed", "cancelled"):
        task.completed_at = _utcnow()
        if status == "completed":
            if progress is None:
                task.progress = 1.0
            task.error = None
        if status == "failed" and error is None:
            task.error = task.error or "task failed"

    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def list_tasks(
    db: AsyncSession,
    tenant_id: str,
    *,
    status: AgentTaskStatus | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[AgentTask]:
    """List tasks for a tenant, newest first.

    ``status`` is optional — when set, results are filtered to that state.
    """
    stmt = (
        select(AgentTask)
        .where(AgentTask.tenant_id == tenant_id)
        .order_by(AgentTask.created_at.desc())
    )
    if status is not None:
        stmt = stmt.where(AgentTask.status == status)
    stmt = stmt.limit(max(1, int(limit))).offset(max(0, int(offset)))
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


# ── Serialisation helpers ──────────────────────────────────────────────────────


def task_to_dict(task: AgentTask) -> dict[str, Any]:
    """Render an :class:`AgentTask` as a JSON-safe dict."""
    return {
        "id": task.id,
        "tenant_id": task.tenant_id,
        "agent_type": task.agent_type,
        "status": task.status,
        "progress": task.progress,
        "error": task.error,
        "retry_count": task.retry_count,
        "input": task.input or {},
        "output": task.output,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
    }


def dumps(value: Any) -> str:
    """Best-effort JSON dump used by the worker to log payloads."""
    try:
        return json.dumps(value, default=str)
    except Exception:
        return repr(value)


async def fetch_pending_tasks(
    db: AsyncSession,
    *,
    limit: int = 25,
    tenant_ids: Iterable[str] | None = None,
) -> list[AgentTask]:
    """Async helper: pull the next batch of pending tasks.

    Used by the background worker.  Most call-sites should prefer the
    async :func:`list_tasks` instead.
    """
    stmt = (
        select(AgentTask)
        .where(AgentTask.status == "pending")
        .order_by(AgentTask.created_at.asc())
        .limit(max(1, int(limit)))
    )
    if tenant_ids is not None:
        stmt = stmt.where(AgentTask.tenant_id.in_(list(tenant_ids)))
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)
