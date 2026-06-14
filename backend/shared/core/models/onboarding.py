"""Onboarding domain — New hire onboarding workflows and progress tracking."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField


class OnboardingStepType(str, Enum):
    DOCUMENT = "document"
    VIDEO = "video"
    TASK = "task"
    MEETING = "meeting"
    ASSESSMENT = "assessment"


class OnboardingStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


@dataclass
class OnboardingStep:
    id: str
    name: str
    type: OnboardingStepType
    description: str = ""
    required: bool = True
    order: int = 0
    config: dict[str, Any] = field(default_factory=dict)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OnboardingWorkflow(SQLModel, table=True):
    __tablename__ = "onboarding_workflows"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str
    description: str | None = None
    steps: list[dict[str, Any]] = SQLField(
        default_factory=list,
        sa_column=Column("steps", JSON, nullable=False, default=list),
    )
    active: bool = SQLField(default=True, index=True)
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)
    updated_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class CandidateOnboarding(SQLModel, table=True):
    __tablename__ = "candidate_onboarding"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)
    workflow_id: str = SQLField(index=True, nullable=False)
    current_step: int = SQLField(default=0)
    status: str = SQLField(default=OnboardingStatus.PENDING.value, index=True)
    progress_pct: float = SQLField(default=0.0)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class OnboardingTask(SQLModel, table=True):
    __tablename__ = "onboarding_tasks"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    onboarding_id: str = SQLField(index=True, nullable=False)
    step_id: str = SQLField(index=True, nullable=False)
    status: str = SQLField(default=TaskStatus.PENDING.value, index=True)
    completed_at: datetime | None = None
    notes: str | None = None


# --- API Schemas ---


class OnboardingStepCreate(BaseModel):
    id: str
    name: str
    type: OnboardingStepType
    description: str = ""
    required: bool = True
    order: int = 0
    config: dict[str, Any] = Field(default_factory=dict)


class OnboardingStepRead(BaseModel):
    id: str
    name: str
    type: OnboardingStepType
    description: str
    required: bool
    order: int
    config: dict[str, Any]

    model_config = {"from_attributes": True}


class OnboardingWorkflowCreate(BaseModel):
    name: str
    description: str | None = None
    steps: list[OnboardingStepCreate] = Field(default_factory=list)
    active: bool = True


class OnboardingWorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    steps: list[OnboardingStepCreate] | None = None
    active: bool | None = None


class OnboardingWorkflowRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    description: str | None
    steps: list[dict[str, Any]]
    active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AssignWorkflowRequest(BaseModel):
    candidate_id: str


class CompleteTaskRequest(BaseModel):
    notes: str | None = None


class CandidateOnboardingRead(BaseModel):
    id: str
    tenant_id: str
    candidate_id: str
    workflow_id: str
    current_step: int
    status: str
    progress_pct: float
    started_at: datetime | None
    completed_at: datetime | None

    model_config = {"from_attributes": True}
