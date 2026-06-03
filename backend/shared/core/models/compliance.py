"""Compliance domain models — audit log, consent, GDPR data export/deletion."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field as SQLField


class AuditEntry(SQLModel, table=True):
    """One row per auditable action.  Append-only — never updated or deleted."""
    __tablename__ = "audit_entries"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    actor_id: str | None = SQLField(default=None, index=True)
    actor_email: str | None = None
    action: str = SQLField(index=True, description="verb, e.g. 'user.login', 'candidate.update'")
    resource_type: str = SQLField(index=True, description="e.g. 'candidate', 'job', 'auth'")
    resource_id: str | None = SQLField(default=None, index=True)
    ip_address: str | None = None
    user_agent: str | None = None
    details: str = SQLField(default="{}", description="JSON-serialised context for the action")
    outcome: str = SQLField(default="success", description="success | failure | denied")
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
        index=True,
    )


class ConsentRecord(SQLModel, table=True):
    """GDPR consent record per candidate per purpose."""
    __tablename__ = "consent_records"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    purpose: str = SQLField(description="data_processing | marketing | analytics | third_party")
    granted: bool
    ip_address: str | None = None
    recorded_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    withdrawn_at: datetime | None = None


class DataExportRequest(SQLModel, table=True):
    """A request for a candidate's data export (GDPR Art. 15 / 20)."""
    __tablename__ = "data_export_requests"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    requested_by: str | None = None
    format: str = "json"
    status: str = SQLField(default="processing", description="processing | ready | failed")
    payload: str = SQLField(default="{}", description="serialised export (populated when status=ready)")
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    completed_at: datetime | None = None


class DataDeletionRequest(SQLModel, table=True):
    """A request to delete / anonymise a candidate's data (GDPR Art. 17)."""
    __tablename__ = "data_deletion_requests"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    requested_by: str | None = None
    reason: str = "user_request"
    status: str = SQLField(default="processing", description="processing | completed | failed")
    anonymized_fields: str = SQLField(default="[]", description="JSON list of fields that were anonymised")
    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    completed_at: datetime | None = None
