"""PPE Service — Pair Programming Evaluation sessions, hints, and scoring."""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class PPESessionCreateRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    job_id: str = Field(..., description="Job ID")
    language: str = Field(default="python", description="Programming language")
    difficulty: str = Field(default="medium", description="easy | medium | hard")


class CodeExecuteRequest(BaseModel):
    code: str = Field(..., min_length=1, description="Source code to execute")
    language: str = Field(default="python", description="Programming language")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "ppe"


class PPESessionCreateResponse(BaseModel):
    id: str
    language: str
    difficulty: str
    status: str = "created"
    room_id: str


class PPESessionDetailResponse(BaseModel):
    id: str
    language: str
    difficulty: str
    status: str
    problem_title: str
    hints_used: int
    started_at: str


class PPEStartResponse(BaseModel):
    id: str
    status: str = "active"
    problem: dict = Field(default_factory=dict, description="Problem assigned to the session")


class ExecutionResult(BaseModel):
    exit_code: int
    stdout: str
    stderr: str
    tests_passed: str
    all_tests_passed: bool


class AgentResponse(BaseModel):
    role: str
    content: str


class CodeExecuteResponse(BaseModel):
    session_id: str
    execution: ExecutionResult
    agent_response: AgentResponse


class HintResponse(BaseModel):
    session_id: str
    hint: str
    hints_remaining: int


class PPECompleteResponse(BaseModel):
    session_id: str
    status: str = "completed"
    evaluation: dict = Field(default_factory=dict, description="Final evaluation scores")


class PPEEvaluationResponse(BaseModel):
    session_id: str
    overall_score: float
    seniority_estimation: str
    confidence_level: float
    hiring_recommendation: str
    strengths: list[str]
    weaknesses: list[str]


class PPEProblem(BaseModel):
    id: str
    title: str
    difficulty: str
    languages: list[str]
    category: str
    description: str


class PPEProblemListResponse(BaseModel):
    problems: list[PPEProblem]
    total: int


class PPEProblemDetailResponse(BaseModel):
    id: str
    title: str
    difficulty: str
    description: str
    examples: list[dict]
    constraints: list[str]
    starter_code: dict


class ProgressMetrics(BaseModel):
    time_elapsed_seconds: int
    time_remaining_seconds: int
    code_submissions: int
    tests_passed: str
    hints_used: int
    agent_engagement: str


class SessionScores(BaseModel):
    code_quality_score: float
    problem_solving_score: float
    communication_score: float


class PPESessionProgressResponse(BaseModel):
    session_id: str
    progress: ProgressMetrics
    metrics: SessionScores


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["PPE"], summary="PPE service health check")
async def health():
    return HealthResponse()


@router.post("/sessions", response_model=PPESessionCreateResponse, tags=["PPE"], summary="Create PPE session",
             description="Initialize a new Pair Programming Evaluation session for a candidate.")
async def create_session():
    return PPESessionCreateResponse(id="ppe_new", language="python", difficulty="medium", room_id="ppe-session-001")


@router.get("/sessions/{session_id}", response_model=PPESessionDetailResponse, tags=["PPE"], summary="Get PPE session details")
async def get_session(session_id: str):
    return PPESessionDetailResponse(
        id=session_id, language="python", difficulty="medium", status="active",
        problem_title="Two Sum", hints_used=1, started_at="2025-01-20T14:00:00Z",
    )


@router.post("/sessions/{session_id}/start", response_model=PPEStartResponse, tags=["PPE"],
             summary="Start PPE session", description="Assign a coding problem and begin the evaluation timer.")
async def start_session(session_id: str):
    return PPEStartResponse(
        id=session_id,
        problem={"title": "Two Sum", "description": "Given an array of integers nums and an integer target, return indices of the two numbers.",
                 "difficulty": "easy"},
    )


@router.post("/sessions/{session_id}/execute", response_model=CodeExecuteResponse, tags=["PPE"],
             summary="Execute candidate code",
             description="Run submitted code against test cases and return results with AI feedback.")
async def execute_code(session_id: str):
    return CodeExecuteResponse(
        session_id=session_id,
        execution=ExecutionResult(exit_code=0, stdout="", stderr="", tests_passed="3/5", all_tests_passed=False),
        agent_response=AgentResponse(role="agent", content="3/5 tests pass. Consider edge cases with duplicate values."),
    )


@router.post("/sessions/{session_id}/hint", response_model=HintResponse, tags=["PPE"],
             summary="Request AI hint", description="Get a contextual hint from the AI interviewer.")
async def request_hint(session_id: str):
    return HintResponse(session_id=session_id, hint="Have you considered using a hash map for O(1) lookup?", hints_remaining=2)


@router.post("/sessions/{session_id}/complete", response_model=PPECompleteResponse, tags=["PPE"],
             summary="Complete PPE session", description="End the session and generate final evaluation.")
async def complete_session(session_id: str):
    return PPECompleteResponse(
        session_id=session_id,
        evaluation={"overall_score": 7.8, "seniority_estimation": "senior", "hiring_recommendation": "hire"},
    )


@router.get("/sessions/{session_id}/evaluation", response_model=PPEEvaluationResponse, tags=["PPE"],
            summary="Get PPE evaluation", description="Retrieve the AI-generated evaluation for a completed session.")
async def get_evaluation(session_id: str):
    return PPEEvaluationResponse(
        session_id=session_id, overall_score=7.8, seniority_estimation="senior", confidence_level=0.85,
        hiring_recommendation="hire", strengths=["Strong Code Quality", "Solid CS Fundamentals"],
        weaknesses=["Edge case handling"],
    )


@router.get("/sessions/{session_id}/progress", response_model=PPESessionProgressResponse, tags=["PPE"],
            summary="Get real-time session progress", description="Poll for live session metrics during an active evaluation.")
async def get_session_progress(session_id: str):
    return PPESessionProgressResponse(
        session_id=session_id,
        progress=ProgressMetrics(time_elapsed_seconds=420, time_remaining_seconds=1380,
                                 code_submissions=3, tests_passed="3/5", hints_used=1, agent_engagement="high"),
        metrics=SessionScores(code_quality_score=7.5, problem_solving_score=8.0, communication_score=7.0),
    )


@router.get("/problems", response_model=PPEProblemListResponse, tags=["PPE"], summary="List coding problems",
            description="Retrieve available problems with optional difficulty and language filters.")
async def list_problems(difficulty: str | None = None, language: str | None = None):
    return PPEProblemListResponse(problems=[
        PPEProblem(id="p1", title="Two Sum", difficulty="easy", languages=["python", "javascript", "java"],
                   category="array", description="Find two numbers that add up to target."),
        PPEProblem(id="p2", title="LRU Cache", difficulty="hard", languages=["python", "java"],
                   category="design", description="Design an LRU cache data structure."),
        PPEProblem(id="p3", title="Binary Tree Level Order", difficulty="medium", languages=["python", "javascript", "go"],
                   category="tree", description="Return level order traversal of binary tree."),
        PPEProblem(id="p4", title="Merge Intervals", difficulty="medium", languages=["python", "java", "cpp"],
                   category="array", description="Merge all overlapping intervals."),
        PPEProblem(id="p5", title="Word Search", difficulty="hard", languages=["python", "java"],
                   category="backtracking", description="Find if a word exists in a 2D grid."),
    ], total=5)


@router.get("/problems/{problem_id}", response_model=PPEProblemDetailResponse, tags=["PPE"],
            summary="Get problem details", description="Retrieve full problem statement with examples and starter code.")
async def get_problem(problem_id: str):
    return PPEProblemDetailResponse(
        id=problem_id, title="Two Sum", difficulty="easy",
        description="Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.",
        examples=[{"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]",
                   "explanation": "Because nums[0] + nums[1] == 9, return [0, 1]."},
                  {"input": "nums = [3,2,4], target = 6", "output": "[1,2]"}],
        constraints=["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "Only one valid answer exists."],
        starter_code={"python": "def two_sum(nums, target):\n    # Your solution here\n    pass\n"},
    )


@router.websocket("/ws/{session_id}")
async def ppe_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            await websocket.send_json({"type": "ack", "session_id": session_id, "data": data})
    except WebSocketDisconnect:
        pass
