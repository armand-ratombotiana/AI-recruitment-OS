"""PPE (Pair Programming Evaluation) API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.session import get_db_dependency
from src.domain.pair_programming.models import (
    PPESessionCreate,
    PPESessionRead,
    CodeExecutionRequest,
    PPEEvaluationRead,
)
from src.services.ppe.session_manager import PPESessionManager

router = APIRouter(prefix="/ppe")


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_ppe_session(data: PPESessionCreate, db: AsyncSession = Depends(get_db_dependency)):
    """Create a new pair programming evaluation session."""
    # Create coding session record
    # Select appropriate problem
    # Initialize PPE Agent
    # Return session details with WebSocket URL
    pass


@router.get("/sessions/{session_id}", response_model=PPESessionRead)
async def get_ppe_session(session_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get PPE session status and details."""
    pass


@router.post("/sessions/{session_id}/start")
async def start_ppe_session(session_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Start a PPE session — initializes agent and presents problem."""
    # Initialize PPE Agent
    # Load problem
    # Return greeting and problem presentation
    pass


@router.post("/sessions/{session_id}/code")
async def submit_code(
    session_id: str,
    data: CodeExecutionRequest,
    db: AsyncSession = Depends(get_db_dependency),
):
    """Submit code for execution and evaluation."""
    # Execute code in sandbox
    # Run test cases
    # Get AI agent response
    # Return execution results and agent feedback
    pass


@router.post("/sessions/{session_id}/execute")
async def execute_code(session_id: str, data: CodeExecutionRequest):
    """Execute code without evaluation (for testing)."""
    pass


@router.post("/sessions/{session_id}/hint")
async def request_hint(session_id: str):
    """Request a progressive hint from the PPE Agent."""
    # Get agent for session
    # Generate progressive hint
    # Return hint with remaining count
    pass


@router.post("/sessions/{session_id}/message")
async def send_message(session_id: str, message: str):
    """Send a message to the PPE Agent during the session."""
    # Route message to agent
    # Agent responds based on context
    pass


@router.post("/sessions/{session_id}/complete")
async def complete_ppe_session(session_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Complete a PPE session and trigger evaluation."""
    # End session
    # Trigger AI evaluation
    # Generate scores and reasoning
    # Return evaluation summary
    pass


@router.get("/sessions/{session_id}/evaluation", response_model=PPEEvaluationRead)
async def get_ppe_evaluation(session_id: str, db: AsyncSession = Depends(get_db_dependency)):
    """Get the full PPE evaluation for a completed session."""
    pass


@router.get("/problems")
async def list_problems(
    difficulty: str | None = None,
    language: str | None = None,
):
    """List available coding problems."""
    pass
