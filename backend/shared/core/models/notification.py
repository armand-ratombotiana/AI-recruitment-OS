"""Notification domain — in-app notification feed per tenant/user."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    user_id: str | None = SQLField(default=None, index=True)
    type: str = SQLField(default="info", index=True)
    title: str
    message: str
    read: bool = SQLField(default=False, index=True)
    link: str | None = None
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
