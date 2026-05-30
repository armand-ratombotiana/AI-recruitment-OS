from __future__ import annotations
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from enum import Enum
from pydantic import BaseModel, Field

class AgentType(str, Enum):
    ORCHESTRATOR = "orchestrator"
    RESUME_PARSING = "resume_parsing"
    PPE_EVALUATION = "ppe_evaluation"
    HR_INTERVIEW = "hr_interview"

class AgentStatus(str, Enum):
    IDLE = "idle"
    PROCESSING = "processing"

class AgentState(BaseModel):
    agent_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_type: AgentType
    tenant_id: str
    status: AgentStatus = AgentStatus.IDLE

class BaseAgent(ABC):
    def __init__(self, agent_type: AgentType, tenant_id: str):
        self.state = AgentState(agent_type=agent_type, tenant_id=tenant_id)
    @property
    def agent_id(self) -> str:
        return self.state.agent_id
    @abstractmethod
    async def process_task(self, task_data: dict) -> dict:
        ...
    @abstractmethod
    def get_system_prompt(self) -> str:
        ...
