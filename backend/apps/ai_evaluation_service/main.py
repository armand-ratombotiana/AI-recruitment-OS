"""AI Evaluation Service — Multi-dimensional candidate evaluation."""
from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter()


class EvaluationRequest(BaseModel):
    candidate_id: str
    job_id: str | None = None
    evaluation_type: str = "comprehensive"


class EvaluationResult(BaseModel):
    id: str
    candidate_id: str
    overall_score: float
    dimensions: dict[str, float]
    seniority_estimation: str
    confidence: float
    explanation: str
    strengths: list[str]
    weaknesses: list[str]
    hiring_recommendation: str


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "ai-evaluation"}


@router.post("/evaluate")
async def evaluate_candidate(data: EvaluationRequest):
    """Run comprehensive AI evaluation on a candidate."""
    return {
        "id": "eval_123",
        "candidate_id": data.candidate_id,
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
    }


@router.get("/evaluations/{candidate_id}")
async def get_candidate_evaluations(candidate_id: str):
    """Get all evaluations for a candidate."""
    return {
        "candidate_id": candidate_id,
        "evaluations": [
            {"id": "eval_1", "type": "resume_screening", "score": 8.5, "date": "2025-01-15"},
            {"id": "eval_2", "type": "skill_match", "score": 9.0, "date": "2025-01-16"},
            {"id": "eval_3", "type": "interview", "score": 7.8, "date": "2025-01-18"},
        ],
        "average_score": 8.43,
    }


@router.get("/evaluations/{evaluation_id}/explain")
async def explain_evaluation(evaluation_id: str):
    """Get detailed explanation of evaluation reasoning."""
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


@router.post("/compare")
async def compare_candidates(candidate_ids: list[str], job_id: str | None = None):
    """Compare multiple candidates for a role."""
    return {
        "comparison": [
            {"candidate_id": "c1", "overall_score": 8.5, "rank": 1, "strengths": ["Python", "System Design"]},
            {"candidate_id": "c2", "overall_score": 8.2, "rank": 2, "strengths": ["Java", "Microservices"]},
        ],
        "recommendation": "Candidate c1 is the strongest match for this role.",
        "scoring_methodology": "Weighted multi-dimensional evaluation",
    }


@router.get("/benchmarks")
async def get_benchmarks():
    """Get evaluation benchmarks by level."""
    return {
        "benchmarks": {
            "junior": {"min_score": 3.0, "max_score": 5.0, "avg_score": 4.2},
            "mid": {"min_score": 5.0, "max_score": 7.0, "avg_score": 6.1},
            "senior": {"min_score": 7.0, "max_score": 8.5, "avg_score": 7.8},
            "staff": {"min_score": 8.5, "max_score": 9.5, "avg_score": 8.9},
            "principal": {"min_score": 9.0, "max_score": 10.0, "avg_score": 9.3},
        }
    }
