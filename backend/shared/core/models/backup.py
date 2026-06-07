"""Backup domain model.

A :class:`Backup` is a tenant-scoped point-in-time snapshot of platform
data.  The actual snapshot payload is stored in the in-memory store
keyed by ``backup_id`` (see :mod:`shared.backup.engine`); the row
here only carries the metadata that drives the UI / API.
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


class Backup(SQLModel, table=True):
    """A point-in-time backup of tenant data.

    The backup payload itself lives in the in-memory store; this row
    records who created it, what kind of backup it is, and its current
    status in the lifecycle (``pending`` → ``completed`` → ``restored`` /
    ``failed`` / ``deleted``).
    """

    __tablename__ = "backups"

    id: str = SQLField(default_factory=_new_id, primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str = SQLField(max_length=255, nullable=False)
    type: str = SQLField(
        default="full",
        index=True,
        description="full | candidates | jobs | workflows | config",
    )
    size_bytes: int = SQLField(default=0, description="Size of the snapshot payload")
    status: str = SQLField(
        default="pending",
        index=True,
        description="pending | completed | restoring | restored | failed | deleted",
    )
    created_by: Optional[str] = SQLField(
        default=None,
        index=True,
        description="User id of the admin who triggered the backup",
    )
    meta: Optional[dict[str, Any]] = SQLField(
        default=None,
        sa_column=Column("metadata", JSON, nullable=True, default=None),
        description="Free-form backup metadata (resource counts, includes, etc.)",
    )
    created_at: datetime = SQLField(
        default_factory=_utcnow, nullable=False, index=True
    )
