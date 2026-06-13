"""Push notification models for mobile device management and delivery tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PushPlatform(str, Enum):
    """Supported push notification platforms."""

    ANDROID = "android"  # FCM
    IOS = "ios"          # APNs


class PushStatus(str, Enum):
    """Push notification delivery status."""

    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    EXPIRED = "expired"


class PushDevice(SQLModel, table=True):
    """Registered push device for a user."""

    __tablename__ = "push_devices"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str = SQLField(index=True, nullable=False)
    token: str = SQLField(nullable=False, index=True)
    platform: str = SQLField(nullable=False)  # PushPlatform.ANDROID or PushPlatform.IOS
    active: bool = SQLField(default=True, nullable=False, index=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    last_used_at: datetime | None = SQLField(default=None, nullable=True)


class PushNotification(SQLModel, table=True):
    """Record of a push notification sent to a user."""

    __tablename__ = "push_notifications"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str = SQLField(index=True, nullable=False)
    device_id: str | None = SQLField(default=None, index=True, nullable=True)
    title: str = SQLField(nullable=False)
    body: str = SQLField(nullable=False)
    data: str | None = SQLField(default=None, nullable=True)  # JSON string
    platform: str = SQLField(nullable=False)  # PushPlatform.ANDROID or PushPlatform.IOS
    status: str = SQLField(default=PushStatus.PENDING.value, nullable=False, index=True)
    error_message: str | None = SQLField(default=None, nullable=True)
    sent_at: datetime | None = SQLField(default=None, nullable=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
