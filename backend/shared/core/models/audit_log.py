"""Audit log domain — tenant-scoped record of every auditable action.

This model is intentionally separate from ``compliance.AuditEntry`` (which is
the GDPR/SOC2 immutable audit trail).  The :class:`AuditLog` model is the
operational audit surface: admin-visible, queryable, and used by services to
record what happened, who did it, and which resource was affected.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlmodel import SQLModel, Field as SQLField
from sqlalchemy import Column, JSON


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AuditLog(SQLModel, table=True):
    """One row per auditable action performed in the platform.

    Append-only by convention — services should never ``UPDATE`` or
    ``DELETE`` an existing row (we don't enforce that in the model so we
    keep flexibility for tests and GDPR-style redactions).
    """

    __tablename__ = "audit_logs"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: Optional[str] = SQLField(default=None, index=True)
    action: str = SQLField(index=True, description="verb, e.g. 'user.login', 'candidate.update'")
    resource_type: str = SQLField(index=True, description="e.g. 'candidate', 'job', 'auth'")
    resource_id: Optional[str] = SQLField(default=None, index=True)
    details: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
        description="Free-form structured context for the action",
    )
    ip_address: Optional[str] = SQLField(default=None, max_length=64)
    user_agent: Optional[str] = SQLField(default=None, max_length=512)
    created_at: datetime = SQLField(
        default_factory=_utcnow,
        nullable=False,
        index=True,
    )
