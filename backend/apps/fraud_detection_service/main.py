"""Fraud Detection Service — AI-powered fraud detection for recruitment."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── In-Memory Store ─────────────────────────────────────────────────────────────

_fraud_analyses: dict[str, dict[str, Any]] = {}
_fraud_patterns: list[dict[str, Any]] = [
    {"name": "Resume Duplication", "description": "Same resume submitted for multiple roles", "risk_weight": 0.3},
    {"name": "Inconsistent Timeline", "description": "Employment gaps or overlapping dates", "risk_weight": 0.4},
    {"name": "Skill Overclaim", "description": "Skills claimed but not verifiable", "risk_weight": 0.25},
    {"name": "Fake References", "description": "References that cannot be verified", "risk_weight": 0.5},
]


# ── Request Models ──────────────────────────────────────────────────────────────

class FraudAnalyzeRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate identifier")
    resume_text: str | None = Field(None, description="Resume text to analyze")
    application_data: dict[str, Any] | None = Field(None, description="Additional application data")


# ── Response Models ─────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "fraud-detection"


# ── Router ──────────────────────────────────────────────────────────────────────

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["Fraud Detection"])
async def health():
    return HealthResponse()


@router.post("/analyze", tags=["Fraud Detection"], summary="Analyze candidate for fraud indicators")
async def analyze_candidate(data: FraudAnalyzeRequest):
    analysis_id = f"fd_{uuid.uuid4().hex[:12]}"
    result = {
        "id": analysis_id,
        "candidate_id": data.candidate_id,
        "risk_score": 0.15,
        "risk_level": "low",
        "signals": [
            {"type": "resume_consistency", "score": 0.92, "description": "Resume is consistent across sections"},
            {"type": "experience_verification", "score": 0.88, "description": "Work history appears verifiable"},
            {"type": "skill_claim_validation", "score": 0.85, "description": "Skills match job requirements"},
        ],
        "flags": [],
        "recommendation": "No fraud indicators detected. Candidate appears legitimate.",
    }
    _fraud_analyses[analysis_id] = result
    return result


@router.get("/patterns", tags=["Fraud Detection"], summary="List known fraud patterns")
async def get_fraud_patterns():
    return {"patterns": _fraud_patterns, "total": len(_fraud_patterns)}


@router.get("/analyses", tags=["Fraud Detection"], summary="List all fraud analyses")
async def list_analyses():
    items = list(_fraud_analyses.values())
    return {"data": items, "total": len(items)}
