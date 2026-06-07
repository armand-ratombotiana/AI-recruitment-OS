"""Email sequence (drip campaign) domain models.

A :class:`EmailSequence` is a tenant-owned, ordered list of email
templates that are sent to a candidate over time.  Three tables back the
feature:

* :class:`EmailSequence` — the parent record; stores the human-readable
  name/description plus a denormalized ``steps`` JSON snapshot for fast
  reads and the ``active`` flag used by the worker to enable scheduling.
* :class:`EmailSequenceStep` — one row per step (normalized form).
  ``order`` is 1-based; ``delay_hours`` is the wait time after the
  previous step fires (0 for the first step).  ``condition`` is a JSON
  blob describing skip rules (e.g. ``{"if_status": "hired", "then": "stop"}``).
* :class:`EmailSequenceEnrollment` — a per-candidate enrollment record.
  The ``current_step`` is the next step index to send, ``status`` is
  ``"active" | "completed" | "unenrolled" | "failed"``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class EmailSequence(SQLModel, table=True):
    """Parent record for a drip campaign."""

    __tablename__ = "email_sequences"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str = SQLField(index=True, nullable=False)
    description: str | None = SQLField(default=None)
    steps: list[dict[str, Any]] = SQLField(
        default_factory=list,
        sa_column=Column(JSON, nullable=False, default=list),
        description="JSON snapshot of the step definitions",
    )
    active: bool = SQLField(default=False, index=True, nullable=False)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class EmailSequenceStep(SQLModel, table=True):
    """A single ordered step inside a sequence."""

    __tablename__ = "email_sequence_steps"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    sequence_id: str = SQLField(index=True, nullable=False)
    order: int = SQLField(nullable=False)
    delay_hours: int = SQLField(default=0, nullable=False)
    template_id: str = SQLField(index=True, nullable=False)
    condition: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
        description="JSON-encoded skip / branching rule",
    )


class EmailSequenceEnrollment(SQLModel, table=True):
    """A candidate that has been enrolled into a sequence."""

    __tablename__ = "email_sequence_enrollments"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    sequence_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)
    current_step: int = SQLField(default=0, nullable=False)
    status: str = SQLField(default="active", index=True, nullable=False)
    enrolled_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    completed_at: datetime | None = SQLField(default=None)
