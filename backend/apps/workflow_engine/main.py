"""Workflow Engine — Event-driven workflow automation and triggers."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class WorkflowCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Workflow name", examples=["Auto-Screen Applicants"])
    trigger: str = Field(..., description="Event trigger (e.g., application.submitted)")
    steps: list[dict] = Field(default_factory=list, description="Ordered list of workflow steps")

    model_config = {"json_schema_extra": {"examples": [
        {"name": "Auto-Screen Applicants", "trigger": "application.submitted", "steps": [
            {"type": "ai_evaluation", "name": "Screen Resume"},
            {"type": "notification", "name": "Notify Recruiter"},
        ]}
    ]}}


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "workflow-engine"


class WorkflowSummary(BaseModel):
    id: str
    name: str
    trigger: str
    status: str
    runs: int
    steps: int


class WorkflowListResponse(BaseModel):
    data: list[WorkflowSummary]
    total: int


class WorkflowStep(BaseModel):
    order: int
    type: str
    name: str


class WorkflowDetailResponse(BaseModel):
    id: str
    name: str
    trigger: str
    status: str
    steps: list[WorkflowStep]


class WorkflowCreateResponse(BaseModel):
    id: str
    created: bool = True


class WorkflowTriggerResponse(BaseModel):
    workflow_id: str
    execution_id: str
    status: str = "running"


class WorkflowActivateResponse(BaseModel):
    workflow_id: str
    status: str


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Workflows"], summary="Workflow engine health check")
async def health():
    return HealthResponse()


@router.get("/", response_model=WorkflowListResponse, tags=["Workflows"], summary="List workflows",
            description="Retrieve all configured workflows and their execution stats.")
async def list_workflows():
    return WorkflowListResponse(data=[
        WorkflowSummary(id="w1", name="Auto-Screen Applicants", trigger="application.submitted",
                        status="active", runs=156, steps=4),
        WorkflowSummary(id="w2", name="Interview Reminder", trigger="interview.scheduled",
                        status="active", runs=89, steps=3),
        WorkflowSummary(id="w3", name="PPE Evaluation Pipeline", trigger="ppe.session.completed",
                        status="active", runs=42, steps=5),
    ], total=3)


@router.get("/{workflow_id}", response_model=WorkflowDetailResponse, tags=["Workflows"],
            summary="Get workflow details")
async def get_workflow(workflow_id: str):
    return WorkflowDetailResponse(
        id=workflow_id, name="Auto-Screen Applicants", trigger="application.submitted", status="active",
        steps=[WorkflowStep(order=1, type="ai_evaluation", name="Screen Resume"),
               WorkflowStep(order=2, type="notification", name="Notify Recruiter")],
    )


@router.post("/", response_model=WorkflowCreateResponse, tags=["Workflows"], summary="Create workflow",
             description="Create a new event-driven workflow with trigger and steps.")
async def create_workflow(data: WorkflowCreateRequest):
    return WorkflowCreateResponse(id="w_new")


@router.post("/{workflow_id}/trigger", response_model=WorkflowTriggerResponse, tags=["Workflows"],
             summary="Trigger workflow execution", description="Manually trigger a workflow run.")
async def trigger_workflow(workflow_id: str):
    return WorkflowTriggerResponse(workflow_id=workflow_id, execution_id="exec_new")


@router.post("/{workflow_id}/activate", response_model=WorkflowActivateResponse, tags=["Workflows"],
             summary="Activate workflow")
async def activate_workflow(workflow_id: str):
    return WorkflowActivateResponse(workflow_id=workflow_id, status="active")
