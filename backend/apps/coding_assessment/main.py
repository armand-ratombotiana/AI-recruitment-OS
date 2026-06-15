"""Live coding assessment service.

Endpoints (all under ``/api/v1/coding``):

* ``GET    /problems``              list coding problems
* ``GET    /problems/{problem_id}`` fetch a problem with starter code
* ``POST   /problems``              create a coding problem
* ``POST   /submit``                submit a solution for evaluation
* ``GET    /submissions/{submission_id}`` fetch submission details
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.auth import require_tenant_id
from shared.coding.sandbox import CodeSandbox
from shared.core.database import get_db_dependency
from shared.core.models.coding_assessment import CodingProblem, CodingSubmission

logger = logging.getLogger("ai.coding_assessment.service")

router = APIRouter()

sandbox = CodeSandbox()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/problems")
async def list_problems(
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
    difficulty: Optional[str] = None,
):
    """List coding problems."""
    query = select(CodingProblem).where(CodingProblem.tenant_id == tenant_id)
    if difficulty:
        query = query.where(CodingProblem.difficulty == difficulty)

    result = await db.execute(query)
    problems = result.scalars().all()

    return [
        {
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "difficulty": p.difficulty,
            "time_limit_minutes": p.time_limit_minutes,
            "tags": json.loads(p.tags),
        }
        for p in problems
    ]


@router.get("/problems/{problem_id}")
async def get_problem(
    problem_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Get a coding problem with starter code."""
    result = await db.execute(
        select(CodingProblem).where(
            CodingProblem.id == problem_id,
            CodingProblem.tenant_id == tenant_id,
        )
    )
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Problem not found",
        )

    return {
        "id": problem.id,
        "title": problem.title,
        "description": problem.description,
        "difficulty": problem.difficulty,
        "starter_code": json.loads(problem.starter_code) if problem.starter_code else {},
        "time_limit_minutes": problem.time_limit_minutes,
    }


@router.post("/problems")
async def create_problem(
    data: dict,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Create a coding problem."""
    problem = CodingProblem(
        tenant_id=tenant_id,
        title=data["title"],
        description=data["description"],
        difficulty=data.get("difficulty", "medium"),
        starter_code=json.dumps(data.get("starter_code", {})),
        test_cases=json.dumps(data.get("test_cases", [])),
        solution=data.get("solution", ""),
        tags=json.dumps(data.get("tags", [])),
        time_limit_minutes=data.get("time_limit_minutes", 30),
    )
    db.add(problem)
    await db.commit()
    await db.refresh(problem)

    return {"id": problem.id, "title": problem.title}


@router.post("/submit")
async def submit_solution(
    data: dict,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Submit a coding solution for evaluation."""
    problem_id = data["problem_id"]
    candidate_id = data["candidate_id"]
    code = data["code"]
    language = data.get("language", "python")

    result = await db.execute(
        select(CodingProblem).where(
            CodingProblem.id == problem_id,
            CodingProblem.tenant_id == tenant_id,
        )
    )
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Problem not found",
        )

    test_cases = json.loads(problem.test_cases)
    execution_result = sandbox.execute(code, language, test_cases)

    submission = CodingSubmission(
        tenant_id=tenant_id,
        problem_id=problem_id,
        candidate_id=candidate_id,
        code=code,
        language=language,
        status=execution_result["status"],
        output=execution_result.get("output", ""),
        error=execution_result.get("error"),
        test_results=json.dumps(execution_result.get("test_results", [])),
        completed_at=_utcnow(),
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)

    return {
        "submission_id": submission.id,
        "status": submission.status,
        "test_results": execution_result.get("test_results", []),
        "summary": {
            "total_tests": execution_result.get("total_tests", 0),
            "passed_tests": execution_result.get("passed_tests", 0),
        },
    }


@router.get("/submissions/{submission_id}")
async def get_submission(
    submission_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    """Get submission details."""
    result = await db.execute(
        select(CodingSubmission).where(
            CodingSubmission.id == submission_id,
            CodingSubmission.tenant_id == tenant_id,
        )
    )
    submission = result.scalar_one_or_none()
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found",
        )

    return {
        "id": submission.id,
        "problem_id": submission.problem_id,
        "candidate_id": submission.candidate_id,
        "code": submission.code,
        "language": submission.language,
        "status": submission.status,
        "test_results": json.loads(submission.test_results),
        "submitted_at": submission.submitted_at,
        "completed_at": submission.completed_at,
    }
