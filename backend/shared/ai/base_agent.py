"""Base agent for AI-ROS multi-agent system."""
from __future__ import annotations
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field

class AgentType(str, Enum):
    ORCHESTRATOR = "orchestrator"
    RESUME_PARSING = "resume_parsing"
    SKILL_EXTRACTION = "skill_extraction"
    CANDIDATE_PROFILING = "candidate_profiling"
    SEMANTIC_MATCHING = "semantic_matching"
    SENIORITY_EVALUATION = "seniority_evaluation"
    CANDIDATE_RANKING = "candidate_ranking"
    HR_INTERVIEW = "hr_interview"
    TECHNICAL_INTERVIEW = "technical_interview"
    BEHAVIORAL_INTERVIEW = "behavioral_interview"
    CODING_INTERVIEW = "coding_interview"
    PPE_EVALUATION = "ppe_evaluation"
    SYSTEM_DESIGN = "system_design"
    DEBUGGING = "debugging"
    COMMUNICATION_ANALYSIS = "communication_analysis"
    RECRUITER_COPILOT = "recruiter_copilot"
    HIRING_RECOMMENDATION = "hiring_recommendation"
    RAG_RETRIEVAL = "rag_retrieval"
    MEMORY_MANAGEMENT = "memory_management"

class AgentStatus(str, Enum):
    IDLE = "idle"
    PROCESSING = "processing"
    WAITING = "waiting"
    ERROR = "error"
    TERMINATED = "terminated"

class AgentState(BaseModel):
    agent_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_type: AgentType
    tenant_id: str
    status: AgentStatus = AgentStatus.IDLE
    current_task_id: str | None = None
    context: dict[str, Any] = {}
    total_tasks_completed: int = 0
    total_tokens_consumed: int = 0
    total_errors: int = 0
    last_active_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BaseAgent(ABC):
    def __init__(self, agent_type: AgentType, tenant_id: str):
        self.state = AgentState(agent_type=agent_type, tenant_id=tenant_id)

    @property
    def agent_id(self) -> str:
        return self.state.agent_id

    @abstractmethod
    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        ...

    @abstractmethod
    def get_system_prompt(self) -> str:
        ...

    def update_status(self, status: AgentStatus):
        self.state.status = status
        self.state.last_active_at = datetime.now(timezone.utc)

    def increment_tokens(self, count: int):
        self.state.total_tokens_consumed += count

    def increment_tasks(self):
        self.state.total_tasks_completed += 1

    def increment_errors(self):
        self.state.total_errors += 1
