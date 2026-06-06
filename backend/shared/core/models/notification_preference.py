"""Notification preferences and channel management.

* :class:`NotificationPreference` — per-user, per-event, per-channel toggle
  that controls which notifications are delivered through which channels.
* :class:`NotificationChannel`   — per-user delivery endpoint (an email
  address, phone number, push token, or Slack webhook) that can be verified
  before being used for outbound delivery.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Enumerations ──────────────────────────────────────────────────────────────


class NotificationChannelType(str, Enum):
    """Supported delivery channels."""

    EMAIL = "email"
    IN_APP = "in_app"
    PUSH = "push"
    SLACK = "slack"
    SMS = "sms"


# ── Models ────────────────────────────────────────────────────────────────────


class NotificationPreference(SQLModel, table=True):
    __tablename__ = "notification_preferences"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str = SQLField(index=True, nullable=False)
    event_type: str = SQLField(index=True, nullable=False)
    channel: str = SQLField(index=True, nullable=False)
    enabled: bool = SQLField(default=True, nullable=False)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class NotificationChannel(SQLModel, table=True):
    __tablename__ = "notification_channels"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str = SQLField(index=True, nullable=False)
    channel_type: str = SQLField(index=True, nullable=False)
    address: str = SQLField(nullable=False)
    verified: bool = SQLField(default=False, nullable=False, index=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    verified_at: datetime | None = SQLField(default=None, nullable=True)
