"""Webhook subscription and delivery domain models.

A :class:`Webhook` is a tenant-scoped HTTP subscription that listens to a set
of events (e.g. ``candidate.created``). When one of those events is emitted by
a service, :mod:`shared.webhooks.dispatcher` signs the payload with the
webhook's secret using HMAC-SHA256 and POSTs it to the configured URL.

A :class:`WebhookDelivery` is an immutable audit record of one HTTP attempt
made for a webhook — the dispatcher's retry loop writes a row for every
attempt so operators can debug delivery issues.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, JSON, Text
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _new_id() -> str:
    return str(uuid.uuid4())


class Webhook(SQLModel, table=True):
    """Tenant-scoped outgoing webhook subscription.

    ``events`` is stored as a JSON-encoded list of event-name strings (e.g.
    ``["candidate.created", "job.updated"]``).  The list may contain the
    wildcard ``"*"`` to subscribe to every event.
    """

    __tablename__ = "webhooks"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    url: str = SQLField(max_length=2048, nullable=False)
    events: str = SQLField(
        default="[]",
        sa_column=Column(Text, nullable=False, default="[]"),
        description="JSON-encoded list of subscribed event names",
    )
    secret: str = SQLField(
        max_length=512,
        nullable=False,
        description="HMAC-SHA256 secret used to sign delivery payloads",
    )
    description: Optional[str] = SQLField(default=None, max_length=500)
    active: bool = SQLField(default=True, index=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class WebhookDelivery(SQLModel, table=True):
    """One HTTP delivery attempt made for a webhook.

    The dispatcher records one row per attempt (the initial POST and every
    retry) so operators can see status codes, response bodies, and timing for
    the full retry sequence.
    """

    __tablename__ = "webhook_deliveries"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    webhook_id: str = SQLField(index=True, nullable=False)
    tenant_id: str = SQLField(index=True, nullable=False)
    event: str = SQLField(index=True, nullable=False)
    payload: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column(JSON, nullable=False, default=dict),
        description="JSON-encoded event payload",
    )
    status: str = SQLField(
        default="pending",
        index=True,
        description="pending | success | failed",
    )
    response_code: Optional[int] = SQLField(default=None)
    response_body: Optional[str] = SQLField(default=None, sa_column=Column(Text))
    attempt: int = SQLField(default=1, description="1-based attempt number")
    error: Optional[str] = SQLField(default=None, description="Network / transport error")
    duration_ms: Optional[int] = SQLField(default=None)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False, index=True)
