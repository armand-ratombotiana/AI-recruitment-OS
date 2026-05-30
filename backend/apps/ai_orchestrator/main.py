"""AI Orchestrator — Multi-agent task routing and LLM management."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class OrchestrateRequest(BaseModel):
    task_type: str = Field(..., description="Task type (resume_parse, skill_extract, evaluate, match)")
    input_data: dict = Field(default_factory=dict, description="Task input payload")
    priority: str = Field(default="normal", description="low | normal | high | urgent")

    model_config = {"json_schema_extra": {"examples": [
        {"task_type": "resume_parse", "input_data": {"resume_id": "r1"}, "priority": "normal"}
    ]}}


class SubmitTaskRequest(BaseModel):
    task_type: str = Field(..., description="Task type to execute")
    payload: dict = Field(default_factory=dict, description="Task payload data")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "ai-orchestrator"


class AgentSummary(BaseModel):
    id: str
    type: str
    status: str
    tasks_completed: int


class AgentListResponse(BaseModel):
    data: list[AgentSummary]
    total: int


class AgentDetailResponse(BaseModel):
    id: str
    type: str
    status: str
    tasks_completed: int
    tokens_consumed: int


class OrchestrateResponse(BaseModel):
    task_id: str
    status: str = "processing"
    agents_assigned: list[str]


class TaskSubmitResponse(BaseModel):
    task_id: str
    status: str = "queued"


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    result: dict = Field(default_factory=dict)


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["AI"], summary="AI orchestrator health check")
async def health():
    return HealthResponse()


@router.get("/agents", response_model=AgentListResponse, tags=["AI"], summary="List AI agents",
            description="Retrieve all registered AI agents and their current status.")
async def list_agents():
    return AgentListResponse(data=[
        AgentSummary(id="a1", type="resume_parsing", status="idle", tasks_completed=156),
        AgentSummary(id="a2", type="skill_extraction", status="idle", tasks_completed=142),
        AgentSummary(id="a3", type="candidate_profiling", status="processing", tasks_completed=98),
        AgentSummary(id="a4", type="ppe_evaluation", status="idle", tasks_completed=67),
    ], total=4)


@router.get("/agents/{agent_id}", response_model=AgentDetailResponse, tags=["AI"], summary="Get agent details")
async def get_agent(agent_id: str):
    return AgentDetailResponse(id=agent_id, type="resume_parsing", status="idle", tasks_completed=156, tokens_consumed=125000)


@router.post("/orchestrate", response_model=OrchestrateResponse, tags=["AI"], summary="Orchestrate AI task",
             description="Submit a task to the AI orchestrator which routes it to the best-suited agent(s).")
async def orchestrate(data: OrchestrateRequest):
    return OrchestrateResponse(task_id="task_new", agents_assigned=["resume_agent", "skill_agent"])


@router.post("/tasks", response_model=TaskSubmitResponse, tags=["AI"], summary="Submit AI task",
             description="Queue a task for asynchronous AI processing.")
async def submit_task(data: SubmitTaskRequest):
    return TaskSubmitResponse(task_id="task_new")


@router.get("/tasks/{task_id}", response_model=TaskStatusResponse, tags=["AI"], summary="Get AI task status",
            description="Check the status and result of an AI processing task.")
async def get_task(task_id: str):
    return TaskStatusResponse(task_id=task_id, status="completed",
                              result={"candidates_processed": 5, "evaluations_generated": 3})
