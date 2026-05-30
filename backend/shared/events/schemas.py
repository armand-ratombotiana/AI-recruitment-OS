"""Event schemas for AI-ROS."""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field

class EventEnvelope(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tenant_id: str
    payload: dict = {}
    metadata: dict = {}

def build_event(event_type: str, tenant_id: str, payload: dict) -> EventEnvelope:
    return EventEnvelope(event_type=event_type, tenant_id=tenant_id, payload=payload)

EVENT_TYPES = {
    # Candidate events
    "candidate.created": "Candidate created",
    "candidate.updated": "Candidate updated",
    "candidate.enriched": "Candidate enriched via AI",
    "candidate.ranked": "Candidate ranked by AI",

    # Resume events
    "resume.uploaded": "Resume uploaded",
    "resume.parsed": "Resume parsed by AI",
    "resume.embedded": "Resume embedded for vector search",

    # Job events
    "job.created": "Job posting created",
    "job.updated": "Job posting updated",
    "job.opened": "Job opened for applications",

    # Application events
    "application.submitted": "Application submitted",
    "application.stage_changed": "Application moved to new stage",

    # Interview events
    "interview.scheduled": "Interview scheduled",
    "interview.started": "Interview started",
    "interview.completed": "Interview completed",

    # Evaluation events
    "evaluation.started": "AI evaluation started",
    "evaluation.completed": "AI evaluation completed",
    "evaluation.explained": "Evaluation explanation generated",

    # PPE events
    "ppe.session_created": "PPE session created",
    "ppe.code_executed": "Code executed in sandbox",
    "ppe.evaluated": "PPE evaluation completed",

    # Workflow events
    "workflow.triggered": "Workflow triggered",
    "workflow.step_completed": "Workflow step completed",
    "workflow.approved": "Workflow approved",

    # AI events
    "ai.agent_spawned": "AI agent spawned",
    "ai.task_completed": "AI task completed",

    # Notification events
    "notification.sent": "Notification sent",
    "notification.delivered": "Notification delivered",

    # Analytics events
    "analytics.metric_collected": "Analytics metric collected",
}
