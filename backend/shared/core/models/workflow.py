"""Workflow domain models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field as SQLField


class Workflow(SQLModel, table=True):
    __tablename__ = "workflows"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    description: str | None = None
    status: str = "draft"
    trigger_type: str = "event"
    trigger_config: str = "{}"
    steps_config: str = "[]"
    version: int = 1
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class WorkflowStep(SQLModel, table=True):
    __tablename__ = "workflow_steps"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workflow_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    step_order: int
    step_type: str
    name: str
    config: str = "{}"
    on_success: str | None = None
    on_failure: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class WorkflowExecution(SQLModel, table=True):
    __tablename__ = "workflow_executions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workflow_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    status: str = "running"
    context_data: str = "{}"
    started_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    completed_at: datetime | None = None
