"""Screening Service — Candidate-to-job screening endpoints."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, Field as SQLField, select

from shared.core.database import get_db_dependency
from shared.auth.dependencies import require_tenant_id
from shared.core.models.candidate import Candidate
from shared.core.models.recruitment import Job, JobStatus


router = APIRouter()


class ScreeningResult(SQLModel, table=True):
    __tablename__ = "screening_results"

    id: str = SQLField(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    tenant_id: str = SQLField(index=True)
    candidate_id: str = SQLField(index=True)
    job_id: str = SQLField(index=True)

    score: float
    recommendation: str
    strengths: str = "[]"
    concerns: str = "[]"
    skills_match: str = "{}"

    created_at: datetime = SQLField(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )


class ScreenJobRequest(BaseModel):
    top_n: int = Field(default=20, ge=1, le=500)
    threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class ScreenCandidateRequest(BaseModel):
    top_n: int = Field(default=10, ge=1, le=500)


class BatchScreenRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=1)
    job_ids: list[str] = Field(..., min_length=1)


def _candidate_to_dict(c: Candidate) -> dict[str, Any]:
    return {
        "id": c.id,
        "full_name": c.full_name,
        "email": c.email,
        "phone": c.phone,
        "location": c.location,
        "status": c.status.value if hasattr(c.status, "value") else str(c.status),
        "source": c.source,
    }


def _job_to_dict(j: Job) -> dict[str, Any]:
    return {
        "id": j.id,
        "title": j.title,
        "description": j.description,
        "department": j.department,
        "location": j.location,
        "remote_policy": j.remote_policy,
        "job_type": j.job_type.value if hasattr(j.job_type, "value") else str(j.job_type),
        "seniority_required": j.seniority_required,
        "required_skills": json.loads(j.required_skills) if isinstance(j.required_skills, str) else j.required_skills,
        "preferred_skills": json.loads(j.preferred_skills) if isinstance(j.preferred_skills, str) else j.preferred_skills,
    }


def _score_to_recommendation(score: float) -> str:
    if score >= 0.85:
        return "STRONG_MATCH"
    if score >= 0.7:
        return "MATCH"
    if score >= 0.5:
        return "POSSIBLE"
    if score >= 0.3:
        return "WEAK"
    return "NO_MATCH"


async def _run_screening(tenant_id: str, candidate_dict: dict, job_dict: dict) -> dict[str, Any]:
    try:
        from apps.ai_orchestrator.agents import ScreeningAgent
        agent = ScreeningAgent(tenant_id=tenant_id)
        result = await agent.process_task({"candidate": candidate_dict, "job": job_dict})
        score = result.get("match_score", 0.0)
        return {
            "score": score,
            "recommendation": _score_to_recommendation(score),
            "strengths": result.get("passed_requirements", []),
            "concerns": result.get("missing_requirements", []),
            "red_flags": result.get("red_flags", []),
            "qualified": result.get("qualified", False),
            "summary": result.get("summary", ""),
            "confidence_score": result.get("confidence_score", 0.0),
        }
    except Exception:
        return {
            "score": 0.0,
            "recommendation": "NO_MATCH",
            "strengths": [],
            "concerns": ["Screening agent unavailable"],
            "red_flags": [],
            "qualified": False,
            "summary": "Screening unavailable",
            "confidence_score": 0.0,
        }


@router.post("/screen-job/{job_id}")
async def screen_candidates_for_job(
    job_id: str,
    data: ScreenJobRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    job_result = await db.execute(
        select(Job).where(Job.id == job_id, Job.tenant_id == tenant_id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    candidates_result = await db.execute(
        select(Candidate).where(Candidate.tenant_id == tenant_id)
    )
    candidates = candidates_result.scalars().all()

    job_dict = _job_to_dict(job)
    results: list[dict[str, Any]] = []

    for candidate in candidates:
        candidate_dict = _candidate_to_dict(candidate)
        screening = await _run_screening(tenant_id, candidate_dict, job_dict)

        if screening["score"] >= data.threshold:
            sr = ScreeningResult(
                tenant_id=tenant_id,
                candidate_id=candidate.id,
                job_id=job_id,
                score=screening["score"],
                recommendation=screening["recommendation"],
                strengths=json.dumps(screening["strengths"]),
                concerns=json.dumps(screening["concerns"]),
                skills_match=json.dumps({}),
            )
            db.add(sr)
            results.append({
                "candidate_id": candidate.id,
                "candidate_name": candidate.full_name,
                "score": screening["score"],
                "recommendation": screening["recommendation"],
                "strengths": screening["strengths"],
                "concerns": screening["concerns"],
                "qualified": screening["qualified"],
                "summary": screening["summary"],
            })

    await db.commit()
    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "job_id": job_id,
        "total_screened": len(candidates),
        "matched": len(results),
        "results": results[: data.top_n],
    }


@router.post("/screen-candidate/{candidate_id}")
async def screen_candidate_for_jobs(
    candidate_id: str,
    data: ScreenCandidateRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    candidate_result = await db.execute(
        select(Candidate).where(Candidate.id == candidate_id, Candidate.tenant_id == tenant_id)
    )
    candidate = candidate_result.scalar_one_or_none()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    jobs_result = await db.execute(
        select(Job).where(Job.tenant_id == tenant_id, Job.status == JobStatus.OPEN)
    )
    jobs = jobs_result.scalars().all()

    candidate_dict = _candidate_to_dict(candidate)
    results: list[dict[str, Any]] = []

    for job in jobs:
        job_dict = _job_to_dict(job)
        screening = await _run_screening(tenant_id, candidate_dict, job_dict)
        results.append({
            "job_id": job.id,
            "job_title": job.title,
            "score": screening["score"],
            "recommendation": screening["recommendation"],
            "strengths": screening["strengths"],
            "concerns": screening["concerns"],
            "qualified": screening["qualified"],
            "summary": screening["summary"],
        })

    results.sort(key=lambda x: x["score"], reverse=True)

    return {
        "candidate_id": candidate_id,
        "total_jobs": len(jobs),
        "results": results[: data.top_n],
    }


@router.post("/batch")
async def batch_screen(
    data: BatchScreenRequest,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    candidates_result = await db.execute(
        select(Candidate).where(Candidate.id.in_(data.candidate_ids), Candidate.tenant_id == tenant_id)
    )
    candidates = candidates_result.scalars().all()

    jobs_result = await db.execute(
        select(Job).where(Job.id.in_(data.job_ids), Job.tenant_id == tenant_id)
    )
    jobs = jobs_result.scalars().all()

    matrix: list[dict[str, Any]] = []

    for candidate in candidates:
        candidate_dict = _candidate_to_dict(candidate)
        candidate_results: list[dict[str, Any]] = []
        for job in jobs:
            job_dict = _job_to_dict(job)
            screening = await _run_screening(tenant_id, candidate_dict, job_dict)
            candidate_results.append({
                "job_id": job.id,
                "score": screening["score"],
                "recommendation": screening["recommendation"],
            })
        matrix.append({
            "candidate_id": candidate.id,
            "candidate_name": candidate.full_name,
            "results": candidate_results,
        })

    return {
        "candidates_screened": len(candidates),
        "jobs_screened": len(jobs),
        "matrix": matrix,
    }


@router.get("/results/{job_id}")
async def get_screening_results(
    job_id: str,
    tenant_id: str = Depends(require_tenant_id),
    db: AsyncSession = Depends(get_db_dependency),
):
    results_query = await db.execute(
        select(ScreeningResult)
        .where(ScreeningResult.job_id == job_id, ScreeningResult.tenant_id == tenant_id)
        .order_by(ScreeningResult.score.desc())
    )
    results = results_query.scalars().all()

    return {
        "job_id": job_id,
        "total_results": len(results),
        "results": [
            {
                "candidate_id": r.candidate_id,
                "score": r.score,
                "recommendation": r.recommendation,
                "screened_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results
        ],
    }
