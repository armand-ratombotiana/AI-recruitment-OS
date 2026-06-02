"""Workflow Automation Service — No-code workflow builder."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_templates: list[dict[str, Any]] = [
    {"id": "t1", "name": "Auto-Screen Applicants", "description": "Automatically screen new applications", "category": "screening", "triggers": ["application.submitted"]},
    {"id": "t2", "name": "Interview Scheduling", "description": "Automatically schedule interviews", "category": "scheduling", "triggers": ["candidate.qualified"]},
    {"id": "t3", "name": "PPE Evaluation Pipeline", "description": "Run PPE evaluation after technical screening", "category": "evaluation", "triggers": ["technical_screen.passed"]},
    {"id": "t4", "name": "Hire Notification", "description": "Send notifications on hiring decision", "category": "notification", "triggers": ["hiring.decision_made"]},
    {"id": "t5", "name": "Compliance Check", "description": "Run compliance checks before offer", "category": "compliance", "triggers": ["offer.pending"]},
]

_triggers: dict[str, dict[str, Any]] = {}
_executions: dict[str, list[dict[str, Any]]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class TriggerCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, description="Trigger name")
    event_type: str = Field(..., description="Event type to listen for")
    workflow_id: str | None = Field(None, description="Workflow template ID")
    config: dict[str, Any] | None = Field(None, description="Trigger configuration")
    enabled: bool = Field(default=True, description="Whether trigger is active")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "workflow-automation"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Workflow Automation"])
async def health():
    return HealthResponse()


@router.get("/templates", tags=["Workflow Automation"], summary="List workflow templates")
async def list_templates():
    return {"templates": _templates, "total": len(_templates)}


@router.post("/triggers", tags=["Workflow Automation"], summary="Create a trigger")
async def create_trigger(data: TriggerCreateRequest):
    trigger_id = f"trg_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    trigger = {
        "id": trigger_id,
        "name": data.name,
        "event_type": data.event_type,
        "workflow_id": data.workflow_id,
        "config": data.config or {},
        "enabled": data.enabled,
        "created_at": now,
        "execution_count": 0,
    }
    _triggers[trigger_id] = trigger
    _executions[trigger_id] = []
    return trigger


@router.get("/triggers", tags=["Workflow Automation"], summary="List all triggers")
async def list_all_triggers():
    items = list(_triggers.values())
    return {"data": items, "total": len(items)}


@router.get("/executions", tags=["Workflow Automation"], summary="List all executions")
async def list_all_executions():
    all_execs = []
    for trigger_id, execs in _executions.items():
        all_execs.extend(execs)
    return {"data": all_execs, "total": len(all_execs)}


@router.get("/executions/{workflow_id}", tags=["Workflow Automation"], summary="List executions for a workflow")
async def list_executions(workflow_id: str):
    execs = _executions.get(workflow_id, [])
    return {"workflow_id": workflow_id, "executions": execs, "total": len(execs)}
