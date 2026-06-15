"""Content template domain — reusable content templates per tenant.

Each :class:`ContentTemplate` row represents a stored, editable content
template that can be used for AI-powered content generation.  Templates
are tenant-scoped and persist to the database.

``variables`` is a JSON object describing the placeholder names the
template content expects, e.g. ``{"job_title": "string", "company": "string"}``.
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


class ContentTemplate(SQLModel, table=True):
    """A persisted, tenant-owned content template."""

    __tablename__ = "content_templates"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str = SQLField(index=True, nullable=False)
    type: str = SQLField(
        index=True,
        nullable=False,
        description="One of: job_description, email, offer_letter, rejection, linkedin_post",
    )
    content: str = SQLField(
        nullable=False,
        description="Template body, supports {{ var }} placeholders",
    )
    variables: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
        description="JSON map of placeholder name -> description/type",
    )
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
