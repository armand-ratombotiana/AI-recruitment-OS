"""Bulk operation primitives — tracking, progress, and async batch execution.

Provides:

* :class:`BulkOperation` — a SQLModel row that records the lifecycle of one
  bulk job (delete, status update, tag, close, …) along with running progress
  counters and a JSON ``errors`` log.
* :func:`start_bulk_operation` — create and persist a new :class:`BulkOperation`.
* :func:`update_progress` — bump ``processed``/``failed`` and append per-item
  errors.
* :func:`complete_bulk_operation` — mark the job done (with a final status).
* :func:`bulk_apply_async` — drive a callable across many items in configurable
  batches, updating the :class:`BulkOperation` row along the way.

The shared helpers are intentionally side-effect-light: they own the
:class:`BulkOperation` lifecycle and never touch domain rows directly.  The
callable passed to :func:`bulk_apply_async` is the only thing that should
mutate the target entity; it receives the item and a per-batch session and
may raise — the helper converts the exception into a structured error entry.
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Iterable, Sequence

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField, select
from sqlalchemy.ext.asyncio import AsyncSession


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class BulkOperation(SQLModel, table=True):
    """Persistent record of a single bulk operation.

    ``operation_type`` is the verb (e.g. ``"candidates.delete"``) and
    ``entity_type`` is the resource (e.g. ``"candidate"``).  The
    ``processed``/``failed`` counters and the ``errors`` JSON list are
    updated as the batch progresses so callers polling
    :func:`complete_bulk_operation` (or the ``GET /api/v1/bulk/operations/{id}``
    endpoint) see live progress.
    """

    __tablename__ = "bulk_operations"

    id: str = SQLField(
        default_factory=lambda: f"bulk_{uuid.uuid4().hex[:14]}",
        primary_key=True,
    )
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str | None = SQLField(default=None, index=True)
    operation_type: str = SQLField(index=True, nullable=False)
    entity_type: str = SQLField(index=True, nullable=False)
    total: int = SQLField(default=0, nullable=False)
    processed: int = SQLField(default=0, nullable=False)
    failed: int = SQLField(default=0, nullable=False)
    status: str = SQLField(
        default="pending",
        index=True,
        description="pending | running | completed | failed | partial",
    )
    errors: list[dict[str, Any]] = SQLField(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
        description="Per-item error log; capped at MAX_ERRORS to avoid runaway rows",
    )
    metadata_: dict[str, Any] | None = SQLField(
        default=None,
        sa_column=Column("metadata", JSON, nullable=True),
        description="Optional caller-supplied context (e.g. target status, tag name)",
    )
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
    completed_at: datetime | None = SQLField(default=None, nullable=True)

    model_config = {"populate_by_name": True}


# Cap the persisted error list so a 100k-row bad batch doesn't blow up
# the JSON column.  Failures beyond this cap are summarised as a count.
MAX_ERRORS: int = 1000


async def start_bulk_operation(
    db: AsyncSession,
    *,
    user_id: str,
    tenant_id: str,
    operation_type: str,
    entity_type: str,
    total: int = 0,
    metadata: dict[str, Any] | None = None,
) -> BulkOperation:
    """Create and persist a new :class:`BulkOperation` in ``pending`` status."""
    op = BulkOperation(
        tenant_id=tenant_id,
        user_id=user_id,
        operation_type=operation_type,
        entity_type=entity_type,
        total=total,
        processed=0,
        failed=0,
        status="pending",
        errors=[],
        metadata_=metadata,
    )
    db.add(op)
    await db.flush()
    await db.refresh(op)
    return op


async def update_progress(
    db: AsyncSession,
    op_id: str,
    *,
    processed: int,
    failed: int = 0,
    errors: Sequence[dict[str, Any]] | None = None,
    status: str | None = None,
) -> BulkOperation | None:
    """Update the running counters on a :class:`BulkOperation`.

    ``processed`` and ``failed`` are *deltas* (the number of items handled
    since the last call), not absolute totals — the helper adds them to the
    persisted row.  Passing ``errors`` appends to the persisted error list
    (truncated at :data:`MAX_ERRORS`).
    """
    result = await db.execute(
        select(BulkOperation).where(BulkOperation.id == op_id)
    )
    op = result.scalar_one_or_none()
    if op is None:
        return None

    op.processed = (op.processed or 0) + int(processed)
    op.failed = (op.failed or 0) + int(failed)

    if errors:
        existing = list(op.errors or [])
        remaining = MAX_ERRORS - len(existing)
        if remaining > 0:
            existing.extend(list(errors)[:remaining])
        op.errors = existing

    if status is not None:
        op.status = status
    elif op.status == "pending":
        op.status = "running"

    db.add(op)
    await db.flush()
    await db.refresh(op)
    return op


async def complete_bulk_operation(
    db: AsyncSession,
    op_id: str,
    *,
    status: str = "completed",
) -> BulkOperation | None:
    """Mark a :class:`BulkOperation` as finished and stamp ``completed_at``.

    Accepts any final status string, but the most common values are
    ``"completed"``, ``"failed"``, or ``"partial"`` (some items succeeded,
    others failed).
    """
    result = await db.execute(
        select(BulkOperation).where(BulkOperation.id == op_id)
    )
    op = result.scalar_one_or_none()
    if op is None:
        return None

    op.status = status
    op.completed_at = _utcnow()
    db.add(op)
    await db.flush()
    await db.refresh(op)
    return op


# Type alias for a per-item operation.  Receives the item and a session that
# lives for the duration of one batch.
ItemOperation = Callable[[Any, AsyncSession], Awaitable[None]]


async def bulk_apply_async(
    db: AsyncSession,
    op_id: str,
    items: Iterable[Any],
    operation: ItemOperation,
    *,
    batch_size: int = 50,
) -> BulkOperation | None:
    """Apply ``operation`` to every item in ``items`` in batches.

    The function yields control between batches so it can be ``await``-ed
    inside an async endpoint without holding a connection for the full
    duration of a 10k-row job.  Progress is flushed to the
    :class:`BulkOperation` row after every batch.

    Per-item exceptions are caught and recorded in the operation's ``errors``
    list; the loop never stops on a single bad item.  When the loop
    finishes, the :class:`BulkOperation` is marked ``completed`` (or
    ``partial`` if any item failed).

    Returns the final :class:`BulkOperation` row, or ``None`` if ``op_id``
    does not exist.
    """
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")

    # Mark the row as running and stamp the true total.  This may differ
    # from the ``total`` recorded at start time if the caller refined the
    # list (e.g. after deduping ids).
    result = await db.execute(
        select(BulkOperation).where(BulkOperation.id == op_id)
    )
    op = result.scalar_one_or_none()
    if op is None:
        return None

    materialised = list(items)
    op.total = len(materialised)
    op.status = "running"
    db.add(op)
    await db.flush()

    any_failed = False
    buffer: list[Any] = []
    pending_errors: list[dict[str, Any]] = []

    processed_in_batch = 0
    failed_in_batch = 0

    async def _flush() -> None:
        nonlocal processed_in_batch, failed_in_batch, pending_errors, any_failed
        if processed_in_batch == 0 and failed_in_batch == 0 and not pending_errors:
            return
        if failed_in_batch > 0:
            any_failed = True
        await update_progress(
            db,
            op_id,
            processed=processed_in_batch,
            failed=failed_in_batch,
            errors=pending_errors or None,
        )
        processed_in_batch = 0
        failed_in_batch = 0
        pending_errors = []

    for idx, item in enumerate(materialised):
        buffer.append((idx, item))
        if len(buffer) >= batch_size:
            batch = buffer
            buffer = []
            for batch_idx, item_value in batch:
                try:
                    await operation(item_value, db)
                    processed_in_batch += 1
                except Exception as exc:  # noqa: BLE001 — per-item isolation
                    failed_in_batch += 1
                    pending_errors.append(
                        {
                            "index": batch_idx,
                            "item": _safe_item_repr(item_value),
                            "error": str(exc) or exc.__class__.__name__,
                        }
                    )
            await _flush()
            # Let the event loop breathe between batches.
            await asyncio.sleep(0)

    # Trailing partial batch.
    if buffer:
        for batch_idx, item_value in buffer:
            try:
                await operation(item_value, db)
                processed_in_batch += 1
            except Exception as exc:  # noqa: BLE001
                failed_in_batch += 1
                pending_errors.append(
                    {
                        "index": batch_idx,
                        "item": _safe_item_repr(item_value),
                        "error": str(exc) or exc.__class__.__name__,
                    }
                )
        await _flush()

    final_status = "partial" if any_failed else "completed"
    return await complete_bulk_operation(db, op_id, status=final_status)


def _safe_item_repr(item: Any) -> Any:
    """Return a JSON-safe preview of ``item`` for the error log.

    Falls back to ``str(item)`` if the value is not serialisable.
    """
    if isinstance(item, (str, int, float, bool)) or item is None:
        return item
    if isinstance(item, dict):
        return {str(k): _safe_item_repr(v) for k, v in item.items()}
    if isinstance(item, (list, tuple, set)):
        return [_safe_item_repr(v) for v in item]
    return str(item)
