"""Skills Gap Analysis Service for AI-ROS."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from shared.auth.dependencies import require_tenant_id
from shared.skills.gap_analysis import SkillsGapAnalyzer, SKILL_TAXONOMY, GapAnalysis

router = APIRouter()
_analyzer = SkillsGapAnalyzer()


class GapAnalysisRequest(BaseModel):
    candidate_id: str
    job_id: str


class BatchGapAnalysisRequest(BaseModel):
    pairs: list[GapAnalysisRequest] = Field(default_factory=list)


class DirectGapRequest(BaseModel):
    candidate_skills: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)


class LearningRecommendationRequest(BaseModel):
    candidate_skills: list[str] = Field(default_factory=list)
    target_role: str


class DirectAnalysisRequest(BaseModel):
    candidate_skills: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)


def _format_analysis(result: GapAnalysis) -> dict[str, Any]:
    return result.to_dict()


@router.post("/gap-analysis")
async def analyze_gap(
    body: DirectAnalysisRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    result = _analyzer.analyze(
        candidate_skills=body.candidate_skills,
        job_required_skills=body.required_skills,
        job_preferred_skills=body.preferred_skills,
    )
    return {"tenant_id": tenant_id, **_format_analysis(result)}


@router.post("/gap-analysis/batch")
async def batch_analyze_gap(
    body: BatchGapAnalysisRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    results = []
    for pair in body.pairs:
        result = _analyzer.analyze(
            candidate_skills=[],
            job_required_skills=[],
            job_preferred_skills=[],
        )
        results.append({
            "candidate_id": pair.candidate_id,
            "job_id": pair.job_id,
            **_format_analysis(result),
        })
    return {"tenant_id": tenant_id, "total": len(results), "results": results}


@router.get("/taxonomy")
async def get_taxonomy(
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    return {"tenant_id": tenant_id, "taxonomy": SKILL_TAXONOMY}


@router.get("/adjacency/{skill}")
async def get_adjacency(
    skill: str,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    alternatives = _analyzer.find_skill_alternatives(skill)
    adjacency_map = {}
    for alt in alternatives:
        adjacency_map[alt] = round(_analyzer.skill_adjacency(skill, alt), 4)
    return {
        "tenant_id": tenant_id,
        "skill": skill.lower().strip(),
        "related_skills": adjacency_map,
    }


@router.post("/recommend-learning")
async def recommend_learning(
    body: LearningRecommendationRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    recs = _analyzer.recommend_learning(
        candidate_skills=body.candidate_skills,
        target_role=body.target_role,
    )
    return {"tenant_id": tenant_id, "target_role": body.target_role, "recommendations": recs}
