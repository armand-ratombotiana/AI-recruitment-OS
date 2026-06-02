"""Workflow Engine — Full CRUD automation workflows."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


WORKFLOWS_DB: dict[str, dict] = {
    "w1": {
        "id": "w1",
        "name": "Auto-Screen Applicants",
        "trigger": "application.submitted",
        "status": "active",
        "runs": 156,
        "steps": [
            {"order": 1, "type": "ai_evaluation", "name": "Parse Resume"},
            {"order": 2, "type": "ai_evaluation", "name": "Extract Skills"},
            {"order": 3, "type": "condition", "name": "Check Minimum Requirements"},
            {"order": 4, "type": "notification", "name": "Notify Recruiter"},
        ],
        "created_at": "2025-01-01T00:00:00Z",
    },
    "w2": {
        "id": "w2",
        "name": "Interview Reminder",
        "trigger": "interview.scheduled",
        "status": "active",
        "runs": 89,
        "steps": [
            {"order": 1, "type": "delay", "name": "Wait 24h Before Interview"},
            {"order": 2, "type": "notification", "name": "Send Reminder Email"},
            {"order": 3, "type": "notification", "name": "Notify Interviewer"},
        ],
        "created_at": "2025-01-05T00:00:00Z",
    },
    "w3": {
        "id": "w3",
        "name": "PPE Evaluation Pipeline",
        "trigger": "technical_screen.passed",
        "status": "active",
        "runs": 42,
        "steps": [
            {"order": 1, "type": "ai_evaluation", "name": "Assign PPE Problem"},
            {"order": 2, "type": "notification", "name": "Send PPE Invitation"},
            {"order": 3, "type": "condition", "name": "Wait for Completion"},
            {"order": 4, "type": "ai_evaluation", "name": "Grade Submission"},
            {"order": 5, "type": "notification", "name": "Send Results"},
        ],
        "created_at": "2025-01-10T00:00:00Z",
    },
}

EXECUTIONS_DB: dict[str, dict] = {}


class WorkflowCreate(BaseModel):
    name: str
    trigger: str
    steps: list[dict] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    trigger: Optional[str] = None
    steps: Optional[list[dict]] = None


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "workflow-engine"}


@router.get("/")
async def list_workflows(status: Optional[str] = None):
    workflows = list(WORKFLOWS_DB.values())
    if status:
        workflows = [w for w in workflows if w["status"] == status]
    return {
        "workflows": [
            {"id": w["id"], "name": w["name"], "trigger": w["trigger"],
             "status": w["status"], "runs": w["runs"], "steps_count": len(w["steps"])}
            for w in workflows
        ],
        "total": len(workflows),
    }


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    workflow = WORKFLOWS_DB.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return workflow


@router.post("/")
async def create_workflow(data: WorkflowCreate):
    workflow_id = f"w_{uuid.uuid4().hex[:8]}"
    workflow = {
        "id": workflow_id,
        "name": data.name,
        "trigger": data.trigger,
        "status": "draft",
        "runs": 0,
        "steps": data.steps,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    WORKFLOWS_DB[workflow_id] = workflow
    return workflow


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, data: WorkflowUpdate):
    workflow = WORKFLOWS_DB.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    if data.name is not None:
        workflow["name"] = data.name
    if data.trigger is not None:
        workflow["trigger"] = data.trigger
    if data.steps is not None:
        workflow["steps"] = data.steps

    return workflow


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str):
    if workflow_id not in WORKFLOWS_DB:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    del WORKFLOWS_DB[workflow_id]
    return {"deleted": True, "workflow_id": workflow_id}


@router.post("/{workflow_id}/trigger")
async def trigger_workflow(workflow_id: str, context: Optional[dict] = None):
    workflow = WORKFLOWS_DB.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    if workflow["status"] != "active":
        raise HTTPException(status_code=400, detail="Workflow must be active to trigger")

    execution_id = f"exec_{uuid.uuid4().hex[:10]}"
    workflow["runs"] += 1

    execution = {
        "id": execution_id,
        "workflow_id": workflow_id,
        "status": "running",
        "context": context or {},
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "step_results": [
            {"step": step["name"], "status": "completed"}
            for step in workflow["steps"]
        ],
    }

    execution["status"] = "completed"
    execution["completed_at"] = datetime.now(timezone.utc).isoformat()
    EXECUTIONS_DB[execution_id] = execution

    return {
        "execution_id": execution_id,
        "workflow_id": workflow_id,
        "status": "completed",
        "steps_executed": len(workflow["steps"]),
    }


@router.post("/{workflow_id}/activate")
async def activate_workflow(workflow_id: str):
    workflow = WORKFLOWS_DB.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    workflow["status"] = "active"
    return {"workflow_id": workflow_id, "status": "active"}


@router.post("/{workflow_id}/deactivate")
async def deactivate_workflow(workflow_id: str):
    workflow = WORKFLOWS_DB.get(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    workflow["status"] = "inactive"
    return {"workflow_id": workflow_id, "status": "inactive"}


@router.get("/{workflow_id}/executions")
async def list_executions(workflow_id: str):
    if workflow_id not in WORKFLOWS_DB:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")

    executions = [e for e in EXECUTIONS_DB.values() if e["workflow_id"] == workflow_id]
    return {
        "executions": [
            {"id": e["id"], "status": e["status"], "started_at": e["started_at"], "completed_at": e["completed_at"]}
            for e in executions
        ],
        "total": len(executions),
    }
