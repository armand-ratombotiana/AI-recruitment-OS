"""Push notification models for mobile device management and delivery tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class PushPlatform(str, Enum):
    IOS = "ios"
    ANDROID = "android"
    WEB = "web"


class PushStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class PushDevice(SQLModel, table=True):
    __tablename__ = "push_devices"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = SQLField(index=True, nullable=False)
    tenant_id: str = SQLField(index=True, nullable=False)
    device_token: str = SQLField(nullable=False, index=True)
    platform: str = SQLField(nullable=False)
    app_version: str | None = SQLField(default=None, nullable=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    last_active_at: datetime | None = SQLField(default=None, nullable=True)


class PushNotification(SQLModel, table=True):
    __tablename__ = "push_notifications"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str = SQLField(index=True, nullable=False)
    device_id: str | None = SQLField(default=None, index=True, nullable=True)
    title: str = SQLField(nullable=False)
    body: str = SQLField(nullable=False)
    data: str | None = SQLField(default=None, nullable=True)
    status: str = SQLField(default=PushStatus.PENDING.value, nullable=False, index=True)
    sent_at: datetime | None = SQLField(default=None, nullable=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
