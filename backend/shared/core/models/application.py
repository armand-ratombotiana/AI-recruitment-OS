"""Candidate ↔ Job Applications (pipeline / Kanban) domain models.

A candidate can apply to a job.  Each application moves through a fixed set of
pipeline stages::

    applied → screening → interview → offer → hired
                                               ↘ rejected (terminal)

Rejections can happen at any stage but are always terminal: a rejected
application stays rejected unless the caller explicitly re-opens it through
``PUT /applications/{id}/stage``.

This module is intentionally separate from
``shared.core.models.recruitment.Application`` so the two pipelines can evolve
independently:

* ``recruitment.Application`` — pre-existing lightweight row used by the
  recruitment analytics layer (separate table ``applications``).
* ``application.Application`` (this file) — the full pipeline / Kanban
  tracking model.  Lives in its own table ``candidate_applications`` so it
  does not collide with the existing one and so each service that needs
  pipeline data imports only what it uses.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class ApplicationStage(str, Enum):
    """Fixed hiring pipeline stages.

    ``rejected`` is the only terminal stage from which the caller cannot
    move forward (a rejected application must be re-opened by an explicit
    stage change to one of the active stages).
    """

    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    HIRED = "hired"
    REJECTED = "rejected"


#: Stages returned by the Kanban / pipeline view, in the order the UI renders
#: them.  The set is closed so the dashboard never has to deal with a
#: caller-defined stage that did not make it to the database.
PIPELINE_STAGES: tuple[str, ...] = (
    ApplicationStage.APPLIED.value,
    ApplicationStage.SCREENING.value,
    ApplicationStage.INTERVIEW.value,
    ApplicationStage.OFFER.value,
    ApplicationStage.HIRED.value,
    ApplicationStage.REJECTED.value,
)


class Application(SQLModel, table=True):
    """A candidate's application to a specific job.

    A candidate can apply to many jobs and a job can have many applicants,
    so ``(candidate_id, job_id)`` is logically unique within a tenant.  The
    uniqueness is enforced at the service layer (the API returns 409 on
    duplicate) because SQLAlchemy's cross-dialect unique index on TEXT
    columns has historically been flaky on SQLite.
    """

    __tablename__ = "candidate_applications"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)
    stage: ApplicationStage = ApplicationStage.APPLIED
    source: str | None = None
    applied_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    last_stage_change: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    notes: str | None = None
    score: float | None = None
    meta: str = SQLField(default="{}", description="Free-form JSON metadata")


# --- API Schemas --------------------------------------------------------------


class ApplicationCreate(BaseModel):
    """Payload for ``POST /candidates/{id}/apply``."""

    job_id: str = Field(..., min_length=1, description="Target job id")
    source: str | None = Field(
        default=None,
        max_length=120,
        description="Origin of the application (linkedin, referral, website, …)",
    )
    notes: str | None = Field(
        default=None,
        max_length=4000,
        description="Free-form context the candidate (or sourcer) attached",
    )
    score: float | None = Field(default=None, ge=0.0, le=1.0)
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional structured context stored on the application row",
    )


class ApplicationStageUpdate(BaseModel):
    """Payload for ``PUT /candidates/{id}/applications/{app_id}/stage``."""

    stage: str = Field(
        ...,
        description="New stage: applied | screening | interview | offer | hired | rejected",
    )
    notes: str | None = Field(default=None, max_length=4000)
    score: float | None = Field(default=None, ge=0.0, le=1.0)


class ApplicationRead(BaseModel):
    """Public shape returned by the application endpoints."""

    id: str
    tenant_id: str
    candidate_id: str
    job_id: str
    stage: str
    source: str | None = None
    applied_at: datetime
    last_stage_change: datetime
    notes: str | None = None
    score: float | None = None
    meta: dict[str, Any] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class ApplicationListResponse(BaseModel):
    data: list[ApplicationRead]
    total: int


class ApplicationsByStageResponse(BaseModel):
    """Map of stage → applications in that stage (used by the Kanban widget)."""

    job_id: str
    total: int
    by_stage: dict[str, list[ApplicationRead]]


class PipelineSummaryResponse(BaseModel):
    """Full pipeline view (Kanban-ready)."""

    job_id: str
    total: int
    stages: list[dict[str, Any]]
    by_stage: dict[str, list[ApplicationRead]]
    generated_at: datetime


class BulkStageMoveRequest(BaseModel):
    """Payload for ``POST /jobs/{id}/applications/bulk-stage``."""

    application_ids: list[str] = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Application ids to move (must all belong to this job)",
    )
    stage: str = Field(
        ...,
        description="Target stage: applied | screening | interview | offer | hired | rejected",
    )
    notes: str | None = Field(default=None, max_length=4000)


class BulkStageMoveResponse(BaseModel):
    job_id: str
    stage: str
    requested: int
    moved: int
    not_found: list[str] = Field(default_factory=list)


# --- Helpers ------------------------------------------------------------------


def parse_meta(raw: str | None) -> dict[str, Any]:
    """Decode the JSON ``meta`` blob on an application row.

    Tolerates ``None`` and any corrupt value by returning an empty dict so
    an end-user never sees a 500 because someone hand-edited the DB.
    """
    if not raw:
        return {}
    try:
        decoded = json.loads(raw)
        if isinstance(decoded, dict):
            return decoded
    except (TypeError, ValueError):
        pass
    return {}


def serialise_meta(meta: dict[str, Any] | None) -> str:
    """Encode a dict as the JSON string stored on :class:`Application.meta`."""
    if not meta:
        return "{}"
    return json.dumps(meta, default=str)


def validate_stage(value: str) -> ApplicationStage:
    """Return the enum for ``value`` or raise ``ValueError`` with a helpful msg."""
    try:
        return ApplicationStage(value)
    except ValueError as exc:
        raise ValueError(
            f"Unknown stage '{value}'. Valid: " + ", ".join(s.value for s in ApplicationStage)
        ) from exc


def application_to_read(app: Application) -> ApplicationRead:
    """Convert a DB row to its public read shape."""
    return ApplicationRead(
        id=app.id,
        tenant_id=app.tenant_id,
        candidate_id=app.candidate_id,
        job_id=app.job_id,
        stage=app.stage.value if isinstance(app.stage, ApplicationStage) else str(app.stage),
        source=app.source,
        applied_at=app.applied_at,
        last_stage_change=app.last_stage_change,
        notes=app.notes,
        score=app.score,
        meta=parse_meta(app.meta),
    )


__all__ = [
    "ApplicationStage",
    "PIPELINE_STAGES",
    "Application",
    "ApplicationCreate",
    "ApplicationStageUpdate",
    "ApplicationRead",
    "ApplicationListResponse",
    "ApplicationsByStageResponse",
    "PipelineSummaryResponse",
    "BulkStageMoveRequest",
    "BulkStageMoveResponse",
    "parse_meta",
    "serialise_meta",
    "validate_stage",
    "application_to_read",
]
