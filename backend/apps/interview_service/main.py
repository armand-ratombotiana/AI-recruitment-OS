"""Interview Service — Complete interview management."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class InterviewCreate(BaseModel):
    candidate_id: str
    job_id: str
    interview_type: str
    scheduled_at: Optional[str] = None
    is_ai_interview: bool = True

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "interview"}

@router.get("/")
async def list_interviews(candidate_id: str = None, job_id: str = None):
    interviews = [
        {"id": "i1", "candidate_id": "c1", "job_id": "j1", "type": "pair_programming", "status": "scheduled", "scheduled_at": "2025-01-20T14:00:00Z", "is_ai_interview": True, "interviewer": "PPE Agent"},
        {"id": "i2", "candidate_id": "c2", "job_id": "j2", "type": "system_design", "status": "completed", "scheduled_at": "2025-01-19T10:00:00Z", "is_ai_interview": True, "interviewer": "System Design Agent"},
        {"id": "i3", "candidate_id": "c3", "job_id": "j1", "type": "hr_screening", "status": "in_progress", "scheduled_at": "2025-01-20T11:00:00Z", "is_ai_interview": True, "interviewer": "HR Agent"},
    ]
    if candidate_id:
        interviews = [i for i in interviews if i["candidate_id"] == candidate_id]
    if job_id:
        interviews = [i for i in interviews if i["job_id"] == job_id]
    return {"data": interviews, "total": len(interviews)}

@router.get("/{interview_id}")
async def get_interview(interview_id: str):
    return {"id": interview_id, "candidate_id": "c1", "job_id": "j1", "type": "pair_programming", "status": "scheduled", "scheduled_at": "2025-01-20T14:00:00Z", "is_ai_interview": True, "interviewer": "PPE Agent", "duration_minutes": 60}

@router.post("/")
async def create_interview(data: InterviewCreate):
    return {"id": "i_new", "candidate_id": data.candidate_id, "job_id": data.job_id, "type": data.interview_type, "status": "scheduled", "created": True}

@router.post("/{interview_id}/start")
async def start_interview(interview_id: str):
    return {"id": interview_id, "status": "in_progress", "started_at": "2025-01-20T14:00:00Z"}

@router.post("/{interview_id}/complete")
async def complete_interview(interview_id: str):
    return {"id": interview_id, "status": "completed", "completed_at": "2025-01-20T15:00:00Z"}

@router.post("/{interview_id}/feedback")
async def submit_feedback(interview_id: str):
    return {"id": interview_id, "feedback_submitted": True, "overall_score": 8.2}

@router.get("/{interview_id}/transcript")
async def get_transcript(interview_id: str):
    return {"interview_id": interview_id, "transcript": [
        {"role": "interviewer", "content": "Tell me about your experience with distributed systems.", "timestamp": "2025-01-20T14:00:00Z"},
        {"role": "candidate", "content": "I have 8 years of experience building scalable backend systems...", "timestamp": "2025-01-20T14:01:00Z"},
    ], "total_messages": 2}

@router.get("/{interview_id}/analytics")
async def get_interview_analytics(interview_id: str):
    return {"interview_id": interview_id, "analytics": {"duration_minutes": 60, "questions_asked": 12, "candidate_talk_time": 0.65, "interviewer_talk_time": 0.35, "communication_score": 8.5, "technical_score": 7.8}}
