"""AI Orchestrator — Multi-agent task routing and LLM management."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


AGENTS_DB: dict[str, dict] = {
    "a1": {"id": "a1", "type": "resume_parsing", "status": "idle", "tasks_completed": 156, "description": "Parses and extracts structured data from resumes"},
    "a2": {"id": "a2", "type": "skill_extraction", "status": "idle", "tasks_completed": 142, "description": "Identifies and categorizes skills from text"},
    "a3": {"id": "a3", "type": "candidate_profiling", "status": "processing", "tasks_completed": 98, "description": "Builds comprehensive candidate profiles"},
    "a4": {"id": "a4", "type": "ppe_evaluation", "status": "idle", "tasks_completed": 67, "description": "Evaluates code submissions in pair programming"},
    "a5": {"id": "a5", "type": "hr_interview", "status": "idle", "tasks_completed": 89, "description": "Conducts behavioral HR interviews"},
    "a6": {"id": "a6", "type": "technical_interview", "status": "idle", "tasks_completed": 76, "description": "Conducts technical assessment interviews"},
}

TASKS_DB: dict[str, dict] = {}


class OrchestrateRequest(BaseModel):
    agent_type: str = Field(..., description="Agent type to use")
    input: dict = Field(default_factory=dict, description="Input data for the agent")
    context: Optional[dict] = Field(default=None, description="Additional context")


class CreateTaskRequest(BaseModel):
    agent_type: str
    payload: dict = Field(default_factory=dict)


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-orchestrator"}


@router.get("/agents")
async def list_agents():
    return {
        "agents": [
            {"id": a["id"], "type": a["type"], "status": a["status"],
             "tasks_completed": a["tasks_completed"], "description": a["description"]}
            for a in AGENTS_DB.values()
        ],
        "total": len(AGENTS_DB),
    }


@router.post("/orchestrate")
async def orchestrate(data: OrchestrateRequest):
    agent = None
    for a in AGENTS_DB.values():
        if a["type"] == data.agent_type:
            agent = a
            break

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent type '{data.agent_type}' not found")

    task_id = f"task_{uuid.uuid4().hex[:12]}"

    response_map = {
        "resume_parsing": {
            "parsed_data": {"name": "Extracted Name", "skills": ["Python", "FastAPI"], "experience_years": 5},
            "confidence": 0.94,
        },
        "skill_extraction": {
            "skills": [{"name": "Python", "level": "expert"}, {"name": "SQL", "level": "intermediate"}],
            "confidence": 0.89,
        },
        "candidate_profiling": {
            "profile": {"seniority": "senior", "domain": "backend", "strengths": ["system design", "APIs"]},
            "confidence": 0.87,
        },
        "ppe_evaluation": {
            "score": 7.5, "tests_passed": "8/10", "recommendation": "hire",
        },
        "hr_interview": {
            "scores": {"communication": 8, "culture_fit": 7, "motivation": 9},
            "recommendation": "hire",
        },
        "technical_interview": {
            "scores": {"coding": 8, "system_design": 7, "problem_solving": 8},
            "recommendation": "hire",
        },
    }

    result = response_map.get(data.agent_type, {"status": "processed"})

    task = {
        "id": task_id,
        "agent_type": data.agent_type,
        "agent_id": agent["id"],
        "status": "completed",
        "input": data.input,
        "context": data.context,
        "result": result,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    TASKS_DB[task_id] = task
    agent["tasks_completed"] += 1

    return {
        "task_id": task_id,
        "status": "completed",
        "agent_type": data.agent_type,
        "result": result,
    }


@router.post("/tasks")
async def create_task(data: CreateTaskRequest):
    agent = None
    for a in AGENTS_DB.values():
        if a["type"] == data.agent_type:
            agent = a
            break

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent type '{data.agent_type}' not found")

    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task = {
        "id": task_id,
        "agent_type": data.agent_type,
        "agent_id": agent["id"],
        "status": "queued",
        "payload": data.payload,
        "result": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
    }
    TASKS_DB[task_id] = task

    return {
        "task_id": task_id,
        "status": "queued",
        "agent_type": data.agent_type,
    }


@router.get("/tasks/{task_id}")
async def get_task(task_id: str):
    task = TASKS_DB.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    return {
        "task_id": task["id"],
        "status": task["status"],
        "agent_type": task["agent_type"],
        "result": task["result"],
        "created_at": task["created_at"],
        "completed_at": task["completed_at"],
    }
