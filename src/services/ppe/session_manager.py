"""PPE Session Manager — orchestrates pair programming evaluation sessions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from src.ai.agents.ppe_agent import PPEAgent
from src.services.ppe.code_executor import CodeExecutionSandbox, ExecutionRequest
from src.domain.pair_programming.models import (
    CodingSession,
    CodingLanguage,
    DifficultyLevel,
    SessionStatus,
)


class PPESessionManager:
    """
    Manages the lifecycle of a pair programming evaluation session.

    Responsibilities:
    - Initialize PPE Agent with problem context
    - Process candidate code submissions
    - Execute code in sandbox
    - Route between hint/evaluation/follow-up flows
    - Generate final evaluation
    """

    def __init__(self, tenant_id: str) -> None:
        self.tenant_id = tenant_id
        self.sandbox = CodeExecutionSandbox()
        self.active_sessions: dict[str, PPEAgent] = {}

    async def start_session(
        self,
        session: CodingSession,
        problem: dict[str, Any],
        candidate_level: str = "mid",
    ) -> dict[str, Any]:
        agent = PPEAgent(tenant_id=self.tenant_id)
        self.active_sessions[session.id] = agent

        result = await agent.process_task({
            "task_type": "start_session",
            "candidate_id": session.candidate_id,
            "interview_id": session.interview_id,
            "language": session.language.value,
            "candidate_level": candidate_level,
            "difficulty": session.difficulty.value,
            "problem": problem,
        })

        session.status = SessionStatus.ACTIVE
        session.started_at = datetime.now(timezone.utc)
        session.room_id = f"ppe-{session.id}"

        return result

    async def submit_code(
        self,
        session_id: str,
        code: str,
        language: CodingLanguage,
    ) -> dict[str, Any]:
        agent = self.active_sessions.get(session_id)
        if not agent:
            raise ValueError(f"No active session: {session_id}")

        exec_request = ExecutionRequest(
            code=code,
            language=language.value,
            timeout_seconds=30,
        )
        exec_result = await self.sandbox.execute(exec_request)

        result = await agent.process_task({
            "task_type": "process_code_submission",
            "code": code,
            "execution_result": {
                "stdout": exec_result.stdout,
                "stderr": exec_result.stderr,
                "exit_code": exec_result.exit_code,
                "all_tests_passed": exec_result.all_tests_passed,
                "total_tests": exec_result.total_tests,
                "passed_tests": exec_result.passed_tests,
                "failed_tests": exec_result.failed_tests,
                "timeout_exceeded": exec_result.timeout_exceeded,
            },
        })

        return {
            "execution": {
                "stdout": exec_result.stdout,
                "stderr": exec_result.stderr,
                "exit_code": exec_result.exit_code,
                "tests_passed": f"{exec_result.passed_tests}/{exec_result.total_tests}",
                "all_tests_passed": exec_result.all_tests_passed,
            },
            "agent_response": result,
        }

    async def request_hint(self, session_id: str) -> dict[str, Any]:
        agent = self.active_sessions.get(session_id)
        if not agent:
            raise ValueError(f"No active session: {session_id}")

        return await agent.process_task({"task_type": "provide_hint"})

    async def handle_message(self, session_id: str, message: str) -> dict[str, Any]:
        agent = self.active_sessions.get(session_id)
        if not agent:
            raise ValueError(f"No active session: {session_id}")

        return await agent.process_task({
            "task_type": "handle_message",
            "message": message,
        })

    async def complete_session(self, session_id: str) -> dict[str, Any]:
        agent = self.active_sessions.get(session_id)
        if not agent:
            raise ValueError(f"No active session: {session_id}")

        evaluation = await agent.process_task({"task_type": "evaluate_session"})
        agent.update_status("terminated")
        del self.active_sessions[session_id]

        return evaluation
