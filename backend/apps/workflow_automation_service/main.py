"""Workflow Automation Service — No-code workflow builder."""
from fastapi import APIRouter


router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "workflow-automation"}


@router.get("/templates")
async def list_templates():
    """List available workflow templates."""
    return {
        "templates": [
            {"id": "t1", "name": "Auto-Screen Applicants", "description": "Automatically screen new applications", "category": "screening", "triggers": ["application.submitted"]},
            {"id": "t2", "name": "Interview Scheduling", "description": "Automatically schedule interviews", "category": "scheduling", "triggers": ["candidate.qualified"]},
            {"id": "t3", "name": "PPE Evaluation Pipeline", "description": "Run PPE evaluation after technical screening", "category": "evaluation", "triggers": ["technical_screen.passed"]},
            {"id": "t4", "name": "Hire Notification", "description": "Send notifications on hiring decision", "category": "notification", "triggers": ["hiring.decision_made"]},
            {"id": "t5", "name": "Compliance Check", "description": "Run compliance checks before offer", "category": "compliance", "triggers": ["offer.pending"]},
        ],
        "total": 5,
    }


@router.get("/triggers")
async def list_triggers():
    """List available workflow triggers."""
    return {
        "triggers": [
            {"type": "event", "name": "application.submitted", "description": "When a new application is submitted"},
            {"type": "event", "name": "candidate.qualified", "description": "When a candidate passes screening"},
            {"type": "event", "name": "interview.completed", "description": "When an interview is completed"},
            {"type": "event", "name": "evaluation.completed", "description": "When an evaluation is completed"},
            {"type": "event", "name": "hiring.decision_made", "description": "When a hiring decision is made"},
            {"type": "schedule", "name": "daily_report", "description": "Daily report generation"},
            {"type": "manual", "name": "manual_trigger", "description": "Manually trigger a workflow"},
        ],
        "total": 7,
    }


@router.get("/executions/{workflow_id}")
async def list_executions(workflow_id: str):
    """List workflow executions."""
    return {
        "workflow_id": workflow_id,
        "executions": [
            {"id": "exec_1", "status": "completed", "started_at": "2025-01-20T10:00:00Z", "completed_at": "2025-01-20T10:02:00Z"},
            {"id": "exec_2", "status": "running", "started_at": "2025-01-20T10:05:00Z"},
        ],
        "total": 2,
    }
