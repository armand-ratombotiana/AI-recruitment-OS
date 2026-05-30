"""PPE Service — Pair Programming Evaluation."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

class PPESessionCreate(BaseModel):
    interview_id: str
    language: str = "python"
    difficulty: str = "medium"

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "ppe"}

@router.post("/sessions")
async def create_session(data: PPESessionCreate):
    return {"id": "ppe_new", "interview_id": data.interview_id, "language": data.language, "difficulty": data.difficulty, "status": "created", "room_id": f"ppe-{data.interview_id}"}

@router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    return {"id": session_id, "language": "python", "difficulty": "medium", "status": "active", "problem_title": "Two Sum", "hints_used": 1, "started_at": "2025-01-20T14:00:00Z"}

@router.post("/sessions/{session_id}/start")
async def start_session(session_id: str):
    return {"id": session_id, "status": "active", "problem": {"title": "Two Sum", "description": "Given an array of integers and a target, find two numbers that add up to target.", "examples": [{"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]"}]}}

@router.post("/sessions/{session_id}/execute")
async def execute_code(session_id: str):
    return {"session_id": session_id, "execution": {"exit_code": 0, "stdout": "", "stderr": "", "tests_passed": "3/5", "all_tests_passed": False}, "agent_response": {"role": "agent", "content": "3/5 tests pass. Consider edge cases with duplicate values."}}

@router.post("/sessions/{session_id}/hint")
async def request_hint(session_id: str):
    return {"session_id": session_id, "hint": "Have you considered using a hash map for O(1) lookup?", "hints_remaining": 2}

@router.post("/sessions/{session_id}/complete")
async def complete_session(session_id: str):
    return {"session_id": session_id, "status": "completed", "evaluation": {"overall_score": 7.8, "seniority_estimation": "senior", "hiring_recommendation": "hire"}}

@router.get("/sessions/{session_id}/evaluation")
async def get_evaluation(session_id: str):
    return {"session_id": session_id, "overall_score": 7.8, "seniority_estimation": "senior", "confidence_level": 0.85, "hiring_recommendation": "hire", "strengths": ["Strong Code Quality", "Solid CS Fundamentals"], "weaknesses": ["Edge case handling"]}

@router.get("/problems")
async def list_problems():
    return {"problems": [
        {"id": "p1", "title": "Two Sum", "difficulty": "easy", "languages": ["python", "javascript", "java"], "category": "array"},
        {"id": "p2", "title": "LRU Cache", "difficulty": "hard", "languages": ["python", "java"], "category": "design"},
        {"id": "p3", "title": "Binary Tree Level Order", "difficulty": "medium", "languages": ["python", "javascript", "go"], "category": "tree"},
    ], "total": 3}

@router.get("/problems/{problem_id}")
async def get_problem(problem_id: str):
    return {"id": problem_id, "title": "Two Sum", "difficulty": "easy", "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.", "examples": [{"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]"}], "constraints": ["2 <= nums.length <= 10^4"], "starter_code": {"python": "def two_sum(nums, target):\n    pass\n"}}

@router.get("/sessions/{session_id}/progress")
async def get_progress(session_id: str):
    return {"session_id": session_id, "progress": {"time_elapsed": 420, "time_remaining": 1380, "code_submissions": 3, "tests_passed": "3/5", "hints_used": 1}}

@router.websocket("/ws/{session_id}")
async def ppe_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            await websocket.send_json({"type": "ack", "data": data})
    except WebSocketDisconnect:
        pass
