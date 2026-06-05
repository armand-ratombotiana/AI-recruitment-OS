"""Workflow domain — automation workflows and their execution history."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Workflow(SQLModel, table=True):
    __tablename__ = "workflows"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str
    description: str | None = None
    steps: dict[str, Any] | list[Any] = SQLField(
        default_factory=list,
        sa_column=Column("steps", JSON, nullable=False, default=list),
    )
    is_active: bool = SQLField(default=False, index=True)
    runs: int = SQLField(default=0)
    success_rate: float = SQLField(default=0.0)
    last_run: datetime | None = None
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class WorkflowRun(SQLModel, table=True):
    __tablename__ = "workflow_runs"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workflow_id: str = SQLField(index=True, nullable=False)
    status: str = SQLField(default="running", index=True)
    started_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    finished_at: datetime | None = None
    result: dict[str, Any] | list[Any] | None = SQLField(
        default=None,
        sa_column=Column("result", JSON, nullable=True),
    )
