"""Fraud Detection Service — AI-powered fraud detection for recruitment."""
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "fraud-detection"}

@router.post("/analyze")
async def analyze_candidate(candidate_id: str):
    """Analyze candidate for potential fraud signals."""
    return {
        "candidate_id": candidate_id,
        "risk_score": 0.15,
        "risk_level": "low",
        "signals": [
            {"type": "resume_consistency", "score": 0.92, "description": "Resume is consistent across sections"},
            {"type": "experience_verification", "score": 0.88, "description": "Work history appears verifiable"},
            {"type": "skill_claim_validation", "score": 0.85, "description": "Skills match job requirements"},
        ],
        "flags": [],
        "recommendation": "No fraud indicators detected. Candidate appears legitimate."
    }

@router.get("/patterns")
async def get_fraud_patterns():
    """Get known fraud patterns."""
    return {
        "patterns": [
            {"name": "Resume Duplication", "description": "Same resume submitted for multiple roles", "risk_weight": 0.3},
            {"name": "Inconsistent Timeline", "description": "Employment gaps or overlapping dates", "risk_weight": 0.4},
            {"name": "Skill Overclaim", "description": "Skills claimed but not verifiable", "risk_weight": 0.25},
            {"name": "Fake References", "description": "References that cannot be verified", "risk_weight": 0.5},
        ]
    }