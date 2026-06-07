"""Email template domain — reusable email templates per tenant.

Each :class:`EmailTemplate` row represents a stored, editable email body
(plus subject) that recruiters can use directly or reference from a
:class:`~shared.core.models.email_sequence.EmailSequence` step.  Templates
are tenant-scoped and persist to the database.

``variables`` is a JSON object describing the placeholder names the body
and subject expect, e.g. ``{"full_name": "string", "job_title": "string"}``.
This metadata is shown in the template editor so users know which slots
need to be filled when the template is rendered for a real candidate.

``category`` is a free-form taxonomy label — typical values include
``"outreach"``, ``"interview"``, ``"offer"``, ``"rejection"``,
``"transactional"`` — used to filter the template picker in the UI.
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


class EmailTemplate(SQLModel, table=True):
    """A persisted, tenant-owned email template."""

    __tablename__ = "email_templates"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str = SQLField(index=True, nullable=False)
    subject: str = SQLField(nullable=False)
    body: str = SQLField(
        nullable=False,
        description="HTML or plain-text body, supports {{ var }} placeholders",
    )
    variables: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
        description="JSON map of placeholder name -> description/type",
    )
    category: str = SQLField(default="outreach", index=True, nullable=False)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
