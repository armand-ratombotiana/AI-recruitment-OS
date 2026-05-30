"""Workflow domain — Workflow, Step, Rule, Execution aggregates."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field
from sqlmodel import SQLModel, Field as SQLField


class WorkflowStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class StepType(str, Enum):
    AI_EVALUATION = "ai_evaluation"
    AI_INTERVIEW = "ai_interview"
    NOTIFICATION = "notification"
    APPROVAL = "approval"
    CONDITION = "condition"
    DELAY = "delay"
    WEBHOOK = "webhook"
    EMAIL = "email"
    STATUS_CHANGE = "status_change"
    CANDIDATE_RANKING = "candidate_ranking"
    PPE_SESSION = "ppe_session"


class TriggerType(str, Enum):
    EVENT = "event"
    SCHEDULE = "schedule"
    MANUAL = "manual"
    CONDITION = "condition"


class Workflow(SQLModel, table=True):
    __tablename__ = "workflows"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    name: str
    description: str | None = None
    status: WorkflowStatus = WorkflowStatus.DRAFT
    trigger_type: TriggerType = TriggerType.EVENT
    trigger_config: str | None = None  # JSON — event name, schedule cron, etc.
    steps_config: str = "[]"  # JSON array of step definitions
    variables: str | None = None  # JSON — workflow-scoped variables
    version: int = 1
    created_by: str | None = None
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class WorkflowStep(SQLModel, table=True):
    __tablename__ = "workflow_steps"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workflow_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    step_order: int
    step_type: StepType
    name: str
    config: str | None = None  # JSON — step-specific configuration
    conditions: str | None = None  # JSON — conditions to execute this step
    on_success: str | None = None  # next step ID or "end"
    on_failure: str | None = None  # next step ID or "retry" or "abort"
    retry_count: int = 0
    timeout_seconds: int = 300
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class WorkflowExecution(SQLModel, table=True):
    __tablename__ = "workflow_executions"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workflow_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    trigger_event: str | None = None
    context_data: str | None = None  # JSON — execution context
    current_step_id: str | None = None
    status: str = "running"  # "running", "completed", "failed", "paused"
    started_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None
    error_message: str | None = None


class ApprovalChain(SQLModel, table=True):
    __tablename__ = "approval_chains"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    workflow_execution_id: str = SQLField(index=True)
    tenant_id: str = SQLField(index=True)
    step_id: str = SQLField(index=True)
    required_approvers: str = "[]"  # JSON array of user IDs
    current_approvals: str = "[]"  # JSON array of approval records
    status: str = "pending"  # "pending", "approved", "rejected"
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


# --- API Schemas ---

class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    trigger_type: TriggerType = TriggerType.EVENT
    trigger_config: dict | None = None
    steps_config: list[dict] = []


class WorkflowRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    status: WorkflowStatus
    trigger_type: TriggerType
    version: int
    created_at: datetime

    model_config = {"from_attributes": True}
