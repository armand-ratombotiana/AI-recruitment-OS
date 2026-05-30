from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from shared.ai.llm_router import LLMRouter

dispatcher_llm = LLMRouter()

@dataclass
class AgentHandoff:
    agent_type: str
    task_data: dict[str, Any]
    reason: str = ""

@dataclass
class OrchestratorResult:
    task_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    agent_results: dict[str, Any] = field(default_factory=dict)
    status: str = "pending"
    error: str | None = None
    completed: bool = False

class Orchestrator:
    def __init__(self, tenant_id: str):
        self.tenant_id = tenant_id
        self.result = OrchestratorResult()

    async def route_task(self, task_type: str, task_data: dict[str, Any]) -> OrchestratorResult:
        self.result.status = "processing"
        self.result.agent_results[task_type] = {"status": "completed", "data": task_data}
        self.result.status = "completed"
        self.result.completed = True
        return self.result

    def get_system_prompt(self) -> str:
        return "You are the orchestrator agent for the AI-ROS recruitment system."
