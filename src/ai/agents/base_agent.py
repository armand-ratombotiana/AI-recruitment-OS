"""AI Agent base class and agent lifecycle management."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AgentType(str, Enum):
    ORCHESTRATOR = "orchestrator"
    TASK_PLANNER = "task_planner"
    WORKFLOW_COORDINATOR = "workflow_coordinator"
    AI_GOVERNANCE = "ai_governance"
    RESUME_PARSING = "resume_parsing"
    RESUME_UNDERSTANDING = "resume_understanding"
    CANDIDATE_PROFILING = "candidate_profiling"
    SKILL_EXTRACTION = "skill_extraction"
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
    TALENT_INTELLIGENCE = "talent_intelligence"
    SCHEDULING = "scheduling"
    CANDIDATE_ENGAGEMENT = "candidate_engagement"
    WORKFLOW_AUTOMATION = "workflow_automation"
    RAG_RETRIEVAL = "rag_retrieval"
    MEMORY_MANAGEMENT = "memory_management"
    CONTEXT_SYNCHRONIZATION = "context_synchronization"


class AgentStatus(str, Enum):
    IDLE = "idle"
    PROCESSING = "processing"
    WAITING = "waiting"
    ERROR = "error"
    TERMINATED = "terminated"


class AgentMessage(BaseModel):
    """Inter-agent communication message."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender_agent_id: str
    receiver_agent_id: str | None = None  # None = broadcast
    message_type: str  # "task_request", "task_result", "context_share", "error"
    payload: dict[str, Any] = {}
    correlation_id: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AgentState(BaseModel):
    """Persistent state for an agent instance."""

    agent_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_type: AgentType
    tenant_id: str
    status: AgentStatus = AgentStatus.IDLE
    current_task_id: str | None = None
    context: dict[str, Any] = {}
    memory_references: list[str] = []
    total_tasks_completed: int = 0
    total_tokens_consumed: int = 0
    total_errors: int = 0
    last_active_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BaseAgent(ABC):
    """Abstract base class for all AI agents in the system."""

    def __init__(self, agent_type: AgentType, tenant_id: str) -> None:
        self.state = AgentState(agent_type=agent_type, tenant_id=tenant_id)
        self._message_handlers: dict[str, Any] = {}

    @property
    def agent_id(self) -> str:
        return self.state.agent_id

    @property
    def agent_type(self) -> AgentType:
        return self.state.agent_type

    @abstractmethod
    async def process_task(self, task_data: dict[str, Any]) -> dict[str, Any]:
        """Execute a task and return results."""
        ...

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the system prompt for this agent's LLM calls."""
        ...

    async def handle_message(self, message: AgentMessage) -> AgentMessage | None:
        """Handle an incoming inter-agent message."""
        handler = self._message_handlers.get(message.message_type)
        if handler:
            return await handler(message)
        return None

    def register_handler(self, message_type: str, handler: Any) -> None:
        self._message_handlers[message_type] = handler

    def update_status(self, status: AgentStatus) -> None:
        self.state.status = status
        self.state.last_active_at = datetime.now(timezone.utc)

    def increment_tokens(self, count: int) -> None:
        self.state.total_tokens_consumed += count

    def increment_tasks(self) -> None:
        self.state.total_tasks_completed += 1

    def increment_errors(self) -> None:
        self.state.total_errors += 1

    def get_state(self) -> AgentState:
        return self.state
