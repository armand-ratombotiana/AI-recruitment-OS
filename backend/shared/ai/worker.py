"""Background worker for the AI agent task queue.

This is a simple in-process async loop that polls the
:class:`shared.ai.task_queue.AgentTask` table for pending rows and runs
them through the registered agents.  It is intentionally small and
side-effect-free so the same logic can be reused by:

* the FastAPI lifespan (start the loop when the app starts, stop it on
  shutdown);
* a standalone worker process (``python -m shared.ai.worker``); and
* tests (call :func:`process_pending_tasks` once to drain a single
  batch).

The worker uses short-lived database sessions per task and is therefore
safe to run from any context that already has a configured async engine
(see :mod:`shared.core.database`).
"""
from __future__ import annotations

import asyncio
import logging
import traceback
from contextlib import asynccontextmanager
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from shared.ai.task_queue import (
    AgentTask,
    enqueue_task,
    get_task,
    list_tasks,
    update_task_status,
)
from shared.core.database import async_session_factory

logger = logging.getLogger("ai.worker")


# ── Optional in-memory registry override for tests ────────────────────────────


try:  # pragma: no cover - import cycle guard
    from apps.ai_orchestrator.agents import AGENT_REGISTRY, build_agent
except Exception:  # pragma: no cover - workers shouldn't depend on the API app
    AGENT_REGISTRY = {}
    build_agent = None  # type: ignore[assignment]


# ── Worker state ───────────────────────────────────────────────────────────────


class WorkerState:
    """Mutable state exposed for observability and tests."""

    def __init__(self) -> None:
        self.running: bool = False
        self.processed: int = 0
        self.succeeded: int = 0
        self.failed: int = 0
        self.last_task_id: Optional[str] = None
        self.last_error: Optional[str] = None


worker_state = WorkerState()


# ── Task execution ─────────────────────────────────────────────────────────────


def _supported_agent_types() -> set[str]:
    return set(AGENT_REGISTRY.keys())


def _resolve_agent(agent_type: str, tenant_id: str) -> Any:
    if build_agent is None:
        raise RuntimeError(
            "agents registry is not importable; cannot run task "
            f"of type {agent_type!r}"
        )
    return build_agent(agent_type, tenant_id=tenant_id)


async def _run_single_task(
    db: AsyncSession,
    task: AgentTask,
    *,
    on_progress: Any | None = None,
) -> AgentTask:
    """Execute one task.  ``on_progress`` is an optional ``async`` hook
    called with ``(task_id, progress)`` so tests / observability code can
    observe progress in real time."""
    if task.status != "pending":
        return task

    agent_type = task.agent_type
    if agent_type not in _supported_agent_types():
        await update_task_status(
            db,
            task.id,
            "failed",
            error=f"unsupported agent_type: {agent_type!r}",
            progress=0.0,
            tenant_id=task.tenant_id,
        )
        worker_state.failed += 1
        worker_state.last_error = f"unsupported agent_type: {agent_type!r}"
        return task

    await update_task_status(
        db,
        task.id,
        "running",
        progress=0.1,
        tenant_id=task.tenant_id,
    )
    if on_progress is not None:
        try:
            await on_progress(task.id, 0.1)
        except Exception:  # pragma: no cover - observer is best-effort
            logger.debug("worker.on_progress.failed task=%s", task.id)

    try:
        agent = _resolve_agent(agent_type, task.tenant_id)
        payload = task.input or {}
        candidate = payload.get("candidate") or {}
        if "candidate" not in payload and "candidate_id" in payload:
            candidate = {"id": payload.get("candidate_id"), **candidate}
        job = payload.get("job") or {}
        if "job" not in payload and "job_id" in payload:
            job = {"id": payload.get("job_id"), **job}
        result = await agent.process_task({"candidate": candidate, "job": job})
    except Exception as exc:
        logger.exception(
            "worker.task_failed task=%s tenant=%s agent=%s",
            task.id, task.tenant_id, agent_type,
        )
        await update_task_status(
            db,
            task.id,
            "failed",
            error=f"{type(exc).__name__}: {exc}\n{traceback.format_exc(limit=3)}",
            progress=0.0,
            tenant_id=task.tenant_id,
        )
        worker_state.failed += 1
        worker_state.last_error = str(exc)
        return task

    await update_task_status(
        db,
        task.id,
        "completed",
        output=result if isinstance(result, dict) else {"result": result},
        progress=1.0,
        tenant_id=task.tenant_id,
    )
    if on_progress is not None:
        try:
            await on_progress(task.id, 1.0)
        except Exception:  # pragma: no cover - observer is best-effort
            logger.debug("worker.on_progress.failed task=%s", task.id)

    worker_state.succeeded += 1
    worker_state.last_task_id = task.id
    return task


# ── Public worker entry points ────────────────────────────────────────────────


@asynccontextmanager
async def _session_scope(session_factory: Any | None = None):
    """Yield a short-lived session that commits on success, rolls back on error.

    ``session_factory`` defaults to the production
    :data:`async_session_factory`; tests pass a different one to point
    the worker at an in-memory SQLite engine.
    """
    factory = session_factory or async_session_factory
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def _fetch_pending_cross_tenant(
    db: AsyncSession,
    *,
    limit: int,
) -> list[AgentTask]:
    """Fetch pending tasks across all tenants (worker-only)."""
    from sqlmodel import select

    from shared.ai.task_queue import AgentTask as _AgentTask

    stmt = (
        select(_AgentTask)
        .where(_AgentTask.status == "pending")
        .order_by(_AgentTask.created_at.asc())
        .limit(max(1, int(limit)))
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def process_pending_tasks(
    *,
    batch_size: int = 10,
    on_progress: Any | None = None,
    session_factory: Any | None = None,
) -> list[AgentTask]:
    """Drain one batch of pending tasks.

    Returns the list of tasks that were processed (or attempted) in this
    call.  The function is safe to call repeatedly — it will simply do
    nothing when the queue is empty.

    ``session_factory`` is exposed so tests can point the worker at an
    in-memory SQLite engine without having to monkey-patch the global
    :data:`async_session_factory`.
    """
    processed: list[AgentTask] = []
    async with _session_scope(session_factory) as session:
        tasks = await _fetch_pending_cross_tenant(session, limit=batch_size)
        for task in tasks:
            worker_state.processed += 1
            updated = await _run_single_task(session, task, on_progress=on_progress)
            processed.append(updated)

    return processed


async def run_forever(
    *,
    poll_interval: float = 1.0,
    batch_size: int = 10,
    on_progress: Any | None = None,
    stop_event: asyncio.Event | None = None,
    session_factory: Any | None = None,
) -> None:
    """Long-running worker loop.  Polls the queue until ``stop_event`` is set.

    The default ``poll_interval`` is 1 second.  Use a small value in
    tests; a larger value in production to reduce DB churn.
    """
    worker_state.running = True
    stop_event = stop_event or asyncio.Event()
    try:
        while not stop_event.is_set():
            try:
                await process_pending_tasks(
                    batch_size=batch_size,
                    on_progress=on_progress,
                    session_factory=session_factory,
                )
            except Exception:  # pragma: no cover - guard against transient DB errors
                logger.exception("worker.loop_error")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=poll_interval)
            except asyncio.TimeoutError:
                continue
    finally:
        worker_state.running = False


def stop() -> None:
    """Mark the worker as not running.  Tests use this to break the loop."""
    worker_state.running = False


__all__ = [
    "worker_state",
    "process_pending_tasks",
    "run_forever",
    "stop",
    "WorkerState",
    "enqueue_task",
    "get_task",
    "list_tasks",
    "update_task_status",
]
