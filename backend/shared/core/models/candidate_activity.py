"""Candidate activity timeline — chronological record of everything that
happens to a candidate (notes, status changes, interviews, score updates, …).

This model backs the candidate timeline API and is the authoritative source
of truth for the per-candidate activity feed.  Every entry is tenant-scoped
so a query against a candidate always returns only that candidate's tenant.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class CandidateActivityType(str, Enum):
    """Allowed activity types in the candidate timeline.

    ``note`` is the only user-authored type — the others are produced by the
    service itself when the corresponding action occurs (creation, status
    change, interview scheduled, score update, etc.).
    """

    NOTE = "note"
    EMAIL = "email"
    CALL = "call"
    MEETING = "meeting"
    STATUS_CHANGE = "status_change"
    SCORE_UPDATE = "score_update"
    CANDIDATE_CREATED = "candidate_created"
    INTERVIEW_SCHEDULED = "interview_scheduled"
    RESUME_UPLOADED = "resume_uploaded"
    RESUME_DELETED = "resume_deleted"


class CandidateActivity(SQLModel, table=True):
    """One row per activity entry on a candidate's timeline.

    The ``meta`` Python attribute is mapped to the ``metadata`` SQL column
    (renamed via ``sa_column``) because ``metadata`` is a reserved attribute
    on SQLAlchemy's declarative base.
    """

    __tablename__ = "candidate_activities"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)
    user_id: Optional[str] = SQLField(default=None, index=True)
    activity_type: str = SQLField(
        index=True,
        nullable=False,
        description="One of CandidateActivityType values",
    )
    title: str = SQLField(max_length=255, nullable=False)
    content: Optional[str] = SQLField(default=None)
    meta: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column("metadata", JSON, nullable=False, default=dict),
        description="Free-form structured context for the activity",
    )
    created_at: datetime = SQLField(
        default_factory=_utcnow,
        nullable=False,
        index=True,
        description="UTC timestamp when the activity was recorded",
    )
