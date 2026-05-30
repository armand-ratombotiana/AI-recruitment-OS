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
    "candidate.enriched": "Candidate enriched",
    "candidate.ranked": "Candidate ranked",

    # Resume events
    "resume.uploaded": "Resume uploaded",
    "resume.parsed": "Resume parsed",
    "resume.embedded": "Resume embedded",

    # Job events
    "job.created": "Job created",
    "job.updated": "Job updated",
    "job.opened": "Job opened",

    # Application events
    "application.submitted": "Application submitted",
    "application.stage_changed": "Application stage changed",

    # Interview events
    "interview.scheduled": "Interview scheduled",
    "interview.started": "Interview started",
    "interview.completed": "Interview completed",

    # Evaluation events
    "evaluation.started": "Evaluation started",
    "evaluation.completed": "Evaluation completed",
    "evaluation.explained": "Evaluation explained",

    # PPE events
    "ppe.session_created": "PPE session created",
    "ppe.code_executed": "Code executed",
    "ppe.evaluated": "PPE evaluated",

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
    "analytics.metric_collected": "Metric collected",
}
