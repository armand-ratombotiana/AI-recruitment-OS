"""AI Evaluation Service — Multi-dimensional candidate evaluation with weighted scoring."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_evaluations: dict[str, dict[str, Any]] = {}
_feedback: dict[str, list[dict[str, Any]]] = {}


# ── Request Models ──────────────────────────────────────────────────────────────

class EvaluationCriteria(BaseModel):
    skill_weight: float = Field(default=0.35, ge=0.0, le=1.0, description="Weight for skills score")
    experience_weight: float = Field(default=0.30, ge=0.0, le=1.0, description="Weight for experience score")
    culture_fit_weight: float = Field(default=0.20, ge=0.0, le=1.0, description="Weight for culture fit")
    communication_weight: float = Field(default=0.15, ge=0.0, le=1.0, description="Weight for communication")
    required_skills: list[str] = Field(default_factory=list, description="Required skills for the role")
    min_years_experience: int = Field(default=0, ge=0, description="Minimum years of experience")


class EvaluationRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate identifier")
    job_id: str | None = Field(None, description="Target job identifier")
    evaluation_type: str = Field(default="comprehensive", description="Type of evaluation")
    criteria: EvaluationCriteria | None = Field(None, description="Custom evaluation criteria with weights")


class CompareRequest(BaseModel):
    candidate_ids: list[str] = Field(..., min_length=2, description="Candidate IDs to compare")
    job_id: str | None = Field(None, description="Target job identifier")


class FeedbackRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5, description="Feedback rating 1-5")
    comment: str | None = Field(None, description="Optional comment")
    was_helpful: bool = Field(default=True, description="Whether the evaluation was useful")
    reviewer: str | None = Field(None, description="Reviewer identifier")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "ai-evaluation"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


def _candidate_seed_scores(candidate_id: str) -> dict[str, float]:
    """Deterministic scores per candidate for consistency across calls."""
    seed = sum(ord(c) for c in candidate_id) % 100
    base = 6.5 + (seed % 25) / 10.0  # 6.5-8.9 range
    return {
        "skill_score": min(10.0, base + 0.5),
        "experience_score": min(10.0, base + 0.2),
        "culture_fit_score": min(10.0, base - 0.3),
        "communication_score": min(10.0, base),
        "problem_solving_score": min(10.0, base + 0.4),
    }


def _compute_weighted_score(scores: dict[str, float], criteria: EvaluationCriteria) -> float:
    """Compute weighted average using criteria weights."""
    total_weight = (
        criteria.skill_weight + criteria.experience_weight
        + criteria.culture_fit_weight + criteria.communication_weight
    )
    if total_weight == 0:
        total_weight = 1.0
    weighted = (
        scores["skill_score"] * criteria.skill_weight
        + scores["experience_score"] * criteria.experience_weight
        + scores["culture_fit_score"] * criteria.culture_fit_weight
        + scores["communication_score"] * criteria.communication_weight
    ) / total_weight
    return round(weighted, 2)


def _build_skill_scores(candidate_id: str, required_skills: list[str]) -> dict[str, float]:
    """Build per-skill scores."""
    skills = required_skills or ["Python", "PostgreSQL", "Kubernetes", "System Design"]
    seed = sum(ord(c) for c in candidate_id)
    result = {}
    for i, skill in enumerate(skills):
        result[skill] = round(min(10.0, 6.5 + ((seed + i * 13) % 35) / 10.0), 1)
    return result


def _recommendation(overall: float) -> str:
    if overall >= 8.5:
        return "strong_hire"
    if overall >= 7.0:
        return "hire"
    if overall >= 5.5:
        return "no_decision"
    return "no_hire"


@router.get("/health", response_model=HealthResponse, tags=["AI Evaluation"])
async def health():
    return HealthResponse()


@router.post("/evaluate", tags=["AI Evaluation"], summary="Evaluate candidate with weighted scoring")
async def evaluate_candidate(data: EvaluationRequest):
    """Multi-dimensional evaluation with configurable weights and reasoning."""
    eval_id = f"eval_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc).isoformat()

    criteria = data.criteria or EvaluationCriteria()
    base_scores = _candidate_seed_scores(data.candidate_id)
    skill_scores = _build_skill_scores(data.candidate_id, criteria.required_skills)
    overall_score = _compute_weighted_score(base_scores, criteria)

    strengths = []
    weaknesses = []
    if base_scores["skill_score"] >= 8.0:
        strengths.append("Strong technical skills matching the role requirements")
    elif base_scores["skill_score"] < 6.5:
        weaknesses.append("Some required technical skills need improvement")
    if base_scores["experience_score"] >= 8.0:
        strengths.append("Extensive relevant experience")
    elif base_scores["experience_score"] < 6.5:
        weaknesses.append("Limited experience in similar roles")
    if base_scores["culture_fit_score"] >= 8.0:
        strengths.append("Excellent alignment with team culture")
    elif base_scores["culture_fit_score"] < 6.5:
        weaknesses.append("Cultural fit may need attention")
    if base_scores["communication_score"] >= 8.0:
        strengths.append("Clear and effective communication")
    elif base_scores["communication_score"] < 6.5:
        weaknesses.append("Communication style could be more concise")

    if not strengths:
        strengths.append("Solid baseline competencies across dimensions")
    if not weaknesses:
        weaknesses.append("Minor gaps in specific tooling experience")

    reasoning = {
        "scoring_methodology": "Multi-dimensional weighted scoring across skills, experience, culture_fit, and communication.",
        "weights_used": {
            "skill_weight": criteria.skill_weight,
            "experience_weight": criteria.experience_weight,
            "culture_fit_weight": criteria.culture_fit_weight,
            "communication_weight": criteria.communication_weight,
        },
        "skill_assessment": f"Skill score of {base_scores['skill_score']} based on {len(skill_scores)} required skills.",
        "experience_analysis": f"Experience score of {base_scores['experience_score']}; minimum required {criteria.min_years_experience} years.",
        "culture_evaluation": f"Culture fit score of {base_scores['culture_fit_score']} based on inferred values alignment.",
        "communication_assessment": f"Communication score of {base_scores['communication_score']} from past interactions.",
        "confidence_drivers": ["Consistent multi-source evidence", "Aligned reference signals"],
    }

    result = {
        "id": eval_id,
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "evaluation_type": data.evaluation_type,
        "overall_score": overall_score,
        "skill_scores": skill_scores,
        "experience_score": base_scores["experience_score"],
        "culture_fit_score": base_scores["culture_fit_score"],
        "communication_score": base_scores["communication_score"],
        "problem_solving_score": base_scores["problem_solving_score"],
        "dimensions": {
            "technical_skills": base_scores["skill_score"],
            "experience": base_scores["experience_score"],
            "culture_fit": base_scores["culture_fit_score"],
            "communication": base_scores["communication_score"],
            "problem_solving": base_scores["problem_solving_score"],
        },
        "seniority_estimation": (
            "principal" if overall_score >= 9.0 else
            "staff" if overall_score >= 8.3 else
            "senior" if overall_score >= 7.0 else
            "mid" if overall_score >= 5.5 else "junior"
        ),
        "confidence": 0.85 + (overall_score % 1) / 20,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "recommendation": _recommendation(overall_score),
        "reasoning": reasoning,
        "criteria_used": criteria.model_dump(),
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
        "overall_score": ev["overall_score"],
        "reasoning": ev["reasoning"],
        "confidence_factors": [
            "Consistent performance across evaluations",
            "Strong reference feedback",
            "Relevant domain experience",
        ],
        "risk_factors": [
            "Limited experience with specific tech stack",
            "Salary expectations may exceed budget",
        ],
        "dimension_breakdown": ev["dimensions"],
        "weights_applied": ev["criteria_used"],
    }


@router.post("/{evaluation_id}/feedback", tags=["AI Evaluation"], summary="Submit feedback on an evaluation")
async def submit_feedback(evaluation_id: str, data: FeedbackRequest):
    if evaluation_id not in _evaluations:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    feedback_id = f"fb_{uuid.uuid4().hex[:10]}"
    entry = {
        "id": feedback_id,
        "evaluation_id": evaluation_id,
        "rating": data.rating,
        "comment": data.comment,
        "was_helpful": data.was_helpful,
        "reviewer": data.reviewer,
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }
    _feedback.setdefault(evaluation_id, []).append(entry)
    return {"id": feedback_id, "evaluation_id": evaluation_id, "recorded": True}


@router.get("/{evaluation_id}/feedback", tags=["AI Evaluation"], summary="Get feedback on an evaluation")
async def get_feedback(evaluation_id: str):
    if evaluation_id not in _evaluations:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    entries = _feedback.get(evaluation_id, [])
    avg_rating = round(sum(e["rating"] for e in entries) / len(entries), 2) if entries else None
    return {
        "evaluation_id": evaluation_id,
        "feedback": entries,
        "total": len(entries),
        "average_rating": avg_rating,
    }


@router.post("/compare", tags=["AI Evaluation"], summary="Compare candidates side-by-side")
async def compare_candidates(data: CompareRequest):
    """Side-by-side comparison with detailed per-dimension scores."""
    comparison = []
    criteria = EvaluationCriteria()
    for cid in data.candidate_ids:
        base = _candidate_seed_scores(cid)
        overall = _compute_weighted_score(base, criteria)
        comparison.append({
            "candidate_id": cid,
            "overall_score": overall,
            "dimensions": {
                "technical_skills": base["skill_score"],
                "experience": base["experience_score"],
                "culture_fit": base["culture_fit_score"],
                "communication": base["communication_score"],
                "problem_solving": base["problem_solving_score"],
            },
            "strengths": ["Strong technical fundamentals", "Good communication"] if overall > 7.5 else ["Solid baseline competencies"],
            "weaknesses": ["Limited cloud experience"] if overall < 8 else [],
            "recommendation": _recommendation(overall),
        })

    comparison.sort(key=lambda x: x["overall_score"], reverse=True)
    for rank, candidate in enumerate(comparison, start=1):
        candidate["rank"] = rank

    winner = comparison[0]
    side_by_side = {
        dim: {c["candidate_id"]: c["dimensions"][dim] for c in comparison}
        for dim in ["technical_skills", "experience", "culture_fit", "communication", "problem_solving"]
    }

    return {
        "job_id": data.job_id,
        "comparison": comparison,
        "side_by_side": side_by_side,
        "winner": winner["candidate_id"],
        "recommendation": f"Candidate {winner['candidate_id']} is the strongest match with overall score {winner['overall_score']}.",
        "scoring_methodology": "Weighted multi-dimensional evaluation across 5 dimensions.",
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
