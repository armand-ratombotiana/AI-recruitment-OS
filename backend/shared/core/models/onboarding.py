"""Onboarding domain — New hire onboarding workflows and progress tracking."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import Column, JSON
from sqlmodel import SQLModel, Field as SQLField


class OnboardingStepType(str, Enum):
    SIGN_DOCUMENT = "sign_document"
    WATCH_VIDEO = "watch_video"
    COMPLETE_TASK = "complete_task"
    ATTEND_MEETING = "attend_meeting"
    TAKE_ASSESSMENT = "take_assessment"
    REVIEW_POLICY = "review_policy"


class OnboardingStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


@dataclass
class OnboardingStep:
    id: str
    name: str
    type: OnboardingStepType
    config: dict[str, Any]
    order: int
    required: bool = True


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OnboardingWorkflow(SQLModel, table=True):
    __tablename__ = "onboarding_workflows"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    name: str
    steps: list[dict[str, Any]] = SQLField(
        default_factory=list,
        sa_column=Column("steps", JSON, nullable=False, default=list),
    )
    created_at: datetime = SQLField(default_factory=_utcnow, nullable=False)


class CandidateOnboarding(SQLModel, table=True):
    __tablename__ = "candidate_onboarding"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True, nullable=False)
    candidate_id: str = SQLField(index=True, nullable=False)
    workflow_id: str = SQLField(index=True, nullable=False)
    current_step: int = SQLField(default=0)
    status: OnboardingStatus = SQLField(default=OnboardingStatus.NOT_STARTED, index=True)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    step_progress: dict[str, Any] = SQLField(
        default_factory=dict,
        sa_column=Column("step_progress", JSON, nullable=False, default=dict),
    )


# --- API Schemas ---


class OnboardingStepCreate(BaseModel):
    id: str
    name: str
    type: OnboardingStepType
    config: dict[str, Any] = Field(default_factory=dict)
    order: int
    required: bool = True


class OnboardingStepRead(BaseModel):
    id: str
    name: str
    type: OnboardingStepType
    config: dict[str, Any]
    order: int
    required: bool

    model_config = {"from_attributes": True}


class OnboardingWorkflowCreate(BaseModel):
    name: str
    steps: list[OnboardingStepCreate] = Field(default_factory=list)


class OnboardingWorkflowUpdate(BaseModel):
    name: str | None = None
    steps: list[OnboardingStepCreate] | None = None


class OnboardingWorkflowRead(BaseModel):
    id: str
    tenant_id: str
    name: str
    steps: list[OnboardingStepRead]
    created_at: datetime

    model_config = {"from_attributes": True}


class OnboardingWorkflowList(BaseModel):
    id: str
    name: str
    steps_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignWorkflowRequest(BaseModel):
    candidate_id: str


class CandidateOnboardingRead(BaseModel):
    id: str
    tenant_id: str
    candidate_id: str
    workflow_id: str
    workflow_name: str | None = None
    current_step: int
    status: OnboardingStatus
    started_at: datetime | None
    completed_at: datetime | None
    step_progress: dict[str, Any]

    model_config = {"from_attributes": True}


class StepProgressUpdate(BaseModel):
    step_id: str
    completed: bool
    data: dict[str, Any] | None = None


STEP_TYPE_CONFIG_SCHEMAS: dict[OnboardingStepType, dict[str, Any]] = {
    OnboardingStepType.SIGN_DOCUMENT: {
        "document_id": "str (required)",
        "document_name": "str",
        "signature_fields": "list[str]",
    },
    OnboardingStepType.WATCH_VIDEO: {
        "video_url": "str (required)",
        "duration_seconds": "int",
        "require_full_watch": "bool",
    },
    OnboardingStepType.COMPLETE_TASK: {
        "task_description": "str (required)",
        "task_url": "str",
        "expected_output": "str",
    },
    OnboardingStepType.ATTEND_MEETING: {
        "meeting_title": "str (required)",
        "meeting_url": "str",
        "start_time": "datetime (ISO)",
        "duration_minutes": "int",
        "organizer_email": "str",
    },
    OnboardingStepType.TAKE_ASSESSMENT: {
        "assessment_id": "str (required)",
        "passing_score": "float",
        "max_attempts": "int",
    },
    OnboardingStepType.REVIEW_POLICY: {
        "document_id": "str (required)",
        "document_name": "str",
        "require_acknowledgment": "bool",
        "acknowledgment_text": "str",
    },
}