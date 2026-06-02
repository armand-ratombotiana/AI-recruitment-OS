"""AI Evaluation Service — Multi-dimensional candidate evaluation."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_evaluations: dict[str, dict[str, Any]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class EvaluationRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate identifier")
    job_id: str | None = Field(None, description="Target job identifier")
    evaluation_type: str = Field(default="comprehensive", description="Type of evaluation")


class CompareRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=2, description="Candidate IDs to compare")
    job_id: str | None = Field(None, description="Target job identifier")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "ai-evaluation"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["AI Evaluation"])
async def health():
    return HealthResponse()


@router.post("/evaluate", tags=["AI Evaluation"], summary="Evaluate candidate")
async def evaluate_candidate(data: EvaluationRequest):
    eval_id = f"eval_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()
    result = {
        "id": eval_id,
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "evaluation_type": data.evaluation_type,
        "overall_score": 8.2,
        "dimensions": {
            "technical_skills": 8.5,
            "experience": 8.0,
            "culture_fit": 7.5,
            "communication": 8.0,
            "problem_solving": 8.5,
        },
        "seniority_estimation": "senior",
        "confidence": 0.87,
        "explanation": "Strong technical background with 8 years of experience. Excellent problem-solving skills demonstrated through previous projects.",
        "strengths": ["Strong Python expertise", "Good system design skills", "Excellent communication"],
        "weaknesses": ["Limited cloud experience", "Could improve on testing practices"],
        "hiring_recommendation": "hire",
        "created_at": now,
    }
    _evaluations[eval_id] = result
    return result


@router.get("/list", tags=["AI Evaluation"], summary="List all evaluations")
async def list_evaluations():
    items = list(_evaluations.values())
    return {"data": items, "total": len(items)}


@router.get("/{evaluation_id}/explain", tags=["AI Evaluation"], summary="Explain evaluation score")
async def explain_evaluation(evaluation_id: str):
    if evaluation_id not in _evaluations:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    ev = _evaluations[evaluation_id]
    return {
        "evaluation_id": evaluation_id,
        "reasoning": {
            "technical_assessment": "Candidate demonstrates strong Python and system design skills with 8 years of production experience.",
            "experience_analysis": "Progressive career growth from junior to senior roles at reputable companies.",
            "culture_fit": "Communication style aligns well with team values of collaboration and transparency.",
            "scoring_methodology": "Multi-dimensional weighted scoring with AI reasoning traces.",
        },
        "confidence_factors": [
            "Consistent performance across evaluations",
            "Strong reference feedback",
            "Relevant domain experience",
        ],
        "risk_factors": [
            "Limited experience with specific tech stack",
            "Salary expectations may exceed budget",
        ],
    }


@router.post("/compare", tags=["AI Evaluation"], summary="Compare candidates")
async def compare_candidates(data: CompareRequest):
    comparison = []
    for i, cid in enumerate(data.candidate_ids):
        comparison.append({
            "candidate_id": cid,
            "overall_score": 8.5 - i * 0.3,
            "rank": i + 1,
            "strengths": ["Python", "System Design"] if i == 0 else ["Java", "Microservices"],
        })
    return {
        "comparison": comparison,
        "recommendation": f"Candidate {data.candidate_ids[0]} is the strongest match for this role.",
        "scoring_methodology": "Weighted multi-dimensional evaluation",
    }


@router.get("/benchmarks", tags=["AI Evaluation"], summary="Get evaluation benchmarks")
async def get_benchmarks():
    return {
        "benchmarks": {
            "junior": {"min_score": 3.0, "max_score": 5.0, "avg_score": 4.2},
            "mid": {"min_score": 5.0, "max_score": 7.0, "avg_score": 6.1},
            "senior": {"min_score": 7.0, "max_score": 8.5, "avg_score": 7.8},
            "staff": {"min_score": 8.5, "max_score": 9.5, "avg_score": 8.9},
            "principal": {"min_score": 9.0, "max_score": 10.0, "avg_score": 9.3},
        }
    }
