"""Integration configuration domain model.

Stores the per-tenant configuration of a third-party chat integration
(Slack or Microsoft Teams).  The webhook URL is the integration's
secret and is never returned in API responses; the API surfaces a
masked version instead.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


# Provider identifiers — kept as string constants so they survive schema
# evolution.  Only ``"slack"`` and ``"teams"`` are accepted.
SLACK = "slack"
TEAMS = "teams"
SUPPORTED_PROVIDERS: tuple[str, ...] = (SLACK, TEAMS)


class IntegrationConfig(SQLModel, table=True):
    """Per-tenant webhook configuration for a single chat provider.

    One row per ``(tenant_id, provider)`` pair — the service enforces the
    uniqueness in code (and via a composite index) so a tenant can have
    at most one Slack config and one Teams config.

    The webhook URL is stored verbatim in the database so the
    integrations service can post to it.  The API layer never returns
    the raw URL — it surfaces ``webhook_url_masked`` (a string with the
    secret portion replaced by ``***``).
    """

    __tablename__ = "integration_configs"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    provider: str = SQLField(index=True, nullable=False, max_length=32)
    webhook_url: str = SQLField(max_length=2048, nullable=False)
    channel_label: Optional[str] = SQLField(default=None, max_length=200)
    enabled: bool = SQLField(default=True, nullable=False, index=True)
    last_tested_at: Optional[datetime] = SQLField(default=None, nullable=True)
    last_test_status: Optional[str] = SQLField(default=None, nullable=True, max_length=32)
    last_test_status_code: Optional[int] = SQLField(default=None, nullable=True)
    last_test_error: Optional[str] = SQLField(default=None, nullable=True, max_length=1000)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
