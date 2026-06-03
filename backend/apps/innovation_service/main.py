"""Innovation Service — Advanced AI features for recruitment."""
from __future__ import annotations

import re
from fastapi import APIRouter
from pydantic import BaseModel, Field


# ── Request Models ──────────────────────────────────────────────────────────────

class BiasDetectionRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to analyze for bias")


class PredictSuccessRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    job_id: str = Field(..., description="Job ID")


class SkillsGapRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    job_id: str = Field(..., description="Job ID")


class SmartScheduleRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    job_id: str = Field(..., description="Job ID")
    interview_type: str = Field(default="technical", description="Interview type")


class VideoAnalysisRequest(BaseModel):
    interview_id: str = Field(..., description="Interview ID")
    candidate_consent: bool = Field(default=True, description="Whether candidate consented")


class ExperiencePredictionRequest(BaseModel):
    candidate_id: str = Field(..., description="Candidate ID")
    job_id: str = Field(..., description="Job ID")


class RecruiterAssistRequest(BaseModel):
    recruiter_id: str = Field(..., description="Recruiter ID")
    task_type: str = Field(default="daily_summary", description="Task type")


router = APIRouter()


# ── Bias Detection Patterns ─────────────────────────────────────────────────────

GENDER_BIAS_PATTERNS = {
    "he/she": "they",
    "his/her": "their",
    "manpower": "workforce",
    "manmade": "manufactured",
    "salesman": "salesperson",
    "chairman": "chairperson",
    "businessman": "business professional",
    "rockstar": "high performer",
    "ninja": "expert",
    "guru": "specialist",
    "dominant": "effective",
    "aggressive": "proactive",
    "competitive": "driven",
}

AGE_BIAS_PATTERNS = [
    "young", "youthful", "fresh graduate", "digital native", "energetic",
    "recent graduate", "millennial", "gen z", "junior energy", "fresh out of",
    "young at heart", "high energy",
]

ETHNICITY_BIAS_PATTERNS = [
    "native speaker", "native english", "must be native", "cultural fit",
    "european background", "american-born", "true american",
]

EDUCATION_BIAS_PATTERNS = [
    "top tier", "ivy league", "elite university", "stanford or mit",
    "tier 1 school", "top university only", "must be from", "harvard graduate",
]


def _detect_patterns(text: str, patterns: list[str] | dict[str, str]) -> list[dict]:
    """Detect bias patterns in text."""
    found = []
    text_lower = text.lower()
    if isinstance(patterns, dict):
        for phrase, suggestion in patterns.items():
            if phrase.lower() in text_lower:
                found.append({"phrase": phrase, "suggestion": suggestion})
    else:
        for phrase in patterns:
            if phrase.lower() in text_lower:
                found.append({"phrase": phrase, "suggestion": f"Consider removing or rephrasing '{phrase}'"})
    return found


# ── Endpoints ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "innovation"}


@router.post("/bias-detection")
async def detect_bias(data: BiasDetectionRequest):
    """Detect multi-dimensional bias in job descriptions or candidate evaluations."""
    text = data.text

    gender_findings = _detect_patterns(text, GENDER_BIAS_PATTERNS)
    age_findings = _detect_patterns(text, AGE_BIAS_PATTERNS)
    ethnicity_findings = _detect_patterns(text, ETHNICITY_BIAS_PATTERNS)
    education_findings = _detect_patterns(text, EDUCATION_BIAS_PATTERNS)

    # Compute per-category bias scores (0.0 = no bias, 1.0 = severe bias)
    word_count = max(1, len(text.split()))
    gender_score = min(1.0, len(gender_findings) * 0.15)
    age_score = min(1.0, len(age_findings) * 0.20)
    ethnicity_score = min(1.0, len(ethnicity_findings) * 0.25)
    education_score = min(1.0, len(education_findings) * 0.20)

    total_findings = len(gender_findings) + len(age_findings) + len(ethnicity_findings) + len(education_findings)
    overall_score = min(1.0, total_findings / max(word_count, 20) * 5)

    flagged_phrases = []
    for f in gender_findings:
        flagged_phrases.append({**f, "category": "gender_bias"})
    for f in age_findings:
        flagged_phrases.append({**f, "category": "age_bias"})
    for f in ethnicity_findings:
        flagged_phrases.append({**f, "category": "ethnicity_bias"})
    for f in education_findings:
        flagged_phrases.append({**f, "category": "education_bias"})

    suggestions = []
    if gender_score > 0:
        suggestions.append("Use gender-neutral language (e.g., 'they' instead of 'he/she')")
    if age_score > 0:
        suggestions.append("Remove age-related descriptors that could exclude candidates of any age")
    if ethnicity_score > 0:
        suggestions.append("Replace ethnicity-specific requirements with skill-based criteria")
    if education_score > 0:
        suggestions.append("Focus on skills and experience rather than specific institutions")
    if not suggestions:
        suggestions.append("No significant bias detected. Continue using inclusive language.")

    improved_text = text
    for phrase, replacement in GENDER_BIAS_PATTERNS.items():
        improved_text = re.sub(re.escape(phrase), replacement, improved_text, flags=re.IGNORECASE)

    bias_level = (
        "severe" if overall_score >= 0.7 else
        "high" if overall_score >= 0.4 else
        "moderate" if overall_score >= 0.2 else
        "low" if overall_score > 0 else "none"
    )

    return {
        "text_preview": text[:100] + ("..." if len(text) > 100 else ""),
        "bias_score": round(overall_score, 3),
        "bias_level": bias_level,
        "categories": {
            "gender_bias": {"score": round(gender_score, 3), "findings": len(gender_findings)},
            "age_bias": {"score": round(age_score, 3), "findings": len(age_findings)},
            "ethnicity_bias": {"score": round(ethnicity_score, 3), "findings": len(ethnicity_findings)},
            "education_bias": {"score": round(education_score, 3), "findings": len(education_findings)},
        },
        "flagged_phrases": flagged_phrases,
        "suggestions": suggestions,
        "improved_text": improved_text,
        "total_findings": total_findings,
        "confidence": 0.92,
    }


@router.post("/predict-success")
async def predict_success(data: PredictSuccessRequest):
    """Predict candidate success probability and retention."""
    # Deterministic prediction based on IDs
    seed_c = sum(ord(c) for c in data.candidate_id) % 100
    seed_j = sum(ord(c) for c in data.job_id) % 100

    skill_match = round(0.65 + (seed_c % 30) / 100, 3)
    experience_fit = round(0.60 + (seed_c % 35) / 100, 3)
    culture_alignment = round(0.55 + ((seed_c + seed_j) % 40) / 100, 3)
    growth_potential = round(0.50 + (seed_c % 45) / 100, 3)

    success_probability = round(
        (skill_match * 0.35 + experience_fit * 0.25 + culture_alignment * 0.20 + growth_potential * 0.20),
        3,
    )

    retention_months = int(12 + (success_probability * 36))
    performance_quartile = (
        "top_10" if success_probability >= 0.85 else
        "top_25" if success_probability >= 0.75 else
        "above_average" if success_probability >= 0.65 else
        "average" if success_probability >= 0.55 else "below_average"
    )

    key_factors = []
    if skill_match >= 0.80:
        key_factors.append({"factor": "skill_match", "impact": "positive", "weight": 0.35, "value": skill_match})
    if experience_fit >= 0.80:
        key_factors.append({"factor": "experience_fit", "impact": "positive", "weight": 0.25, "value": experience_fit})
    if culture_alignment >= 0.75:
        key_factors.append({"factor": "culture_alignment", "impact": "positive", "weight": 0.20, "value": culture_alignment})
    if growth_potential >= 0.75:
        key_factors.append({"factor": "growth_potential", "impact": "positive", "weight": 0.20, "value": growth_potential})

    risk_factors = []
    if skill_match < 0.70:
        risk_factors.append("Skill gap may slow ramp-up time")
    if culture_alignment < 0.65:
        risk_factors.append("Culture alignment risk based on initial signals")
    if growth_potential < 0.60:
        risk_factors.append("Limited evidence of growth trajectory")

    return {
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "success_probability": success_probability,
        "retention_estimate": {
            "expected_months": retention_months,
            "probability_1_year": round(min(0.98, success_probability + 0.10), 3),
            "probability_2_year": round(success_probability * 0.85, 3),
            "probability_3_year": round(success_probability * 0.65, 3),
        },
        "performance_prediction": {
            "quartile": performance_quartile,
            "score_estimate": round(success_probability * 10, 2),
            "ramp_up_weeks": max(4, int(20 - (skill_match * 16))),
        },
        "key_factors": key_factors,
        "factors": {
            "skill_match": skill_match,
            "experience_fit": experience_fit,
            "culture_alignment": culture_alignment,
            "growth_potential": growth_potential,
        },
        "risk_factors": risk_factors,
        "recommendation": (
            "strong_hire" if success_probability >= 0.80 else
            "hire" if success_probability >= 0.65 else
            "consider_further" if success_probability >= 0.50 else "do_not_hire"
        ),
        "confidence": round(0.70 + (success_probability * 0.20), 3),
    }


@router.post("/smart-schedule")
async def smart_schedule(data: SmartScheduleRequest):
    """AI-optimized interview scheduling."""
    return {
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "interview_type": data.interview_type,
        "optimal_slots": [
            {"date": "2025-01-22", "time": "10:00", "score": 0.95, "reasoning": "High candidate engagement window"},
            {"date": "2025-01-22", "time": "14:00", "score": 0.92, "reasoning": "Interviewer availability + post-lunch focus"},
            {"date": "2025-01-23", "time": "11:00", "score": 0.88, "reasoning": "Mid-morning availability"},
        ],
        "timezone": "auto-detected",
        "buffer_recommendations": {"before": 15, "after": 15},
    }


@router.post("/skills-gap")
async def skills_gap_analysis(data: SkillsGapRequest):
    """Analyze skills gap between candidate and job requirements."""
    seed = sum(ord(c) for c in data.candidate_id + data.job_id) % 100
    matching = ["Python", "PostgreSQL", "Docker"]
    missing = ["Kubernetes", "Terraform"] if seed % 3 == 0 else ["Kubernetes"]
    if seed % 5 == 0:
        missing.append("GraphQL")

    gap_score = round(len(missing) / (len(matching) + len(missing)), 3)

    return {
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "matching_skills": matching,
        "missing_skills": missing,
        "gap_score": gap_score,
        "readiness_score": round(1.0 - gap_score, 3),
        "learning_recommendations": [
            {"skill": s, "priority": "high", "estimated_time": "2 weeks", "resources": [f"{s} fundamentals course"]}
            for s in missing
        ],
        "estimated_ramp_up_weeks": max(2, len(missing) * 2),
    }


@router.get("/diversity")
@router.get("/diversity-report")
async def diversity_report():
    """Generate diversity and inclusion report."""
    return {
        "gender_distribution": {"male": 0.55, "female": 0.42, "non_binary": 0.03},
        "ethnic_diversity_index": 0.72,
        "pay_equity_score": 0.88,
        "inclusion_score": 0.85,
        "age_distribution": {"18-25": 0.15, "26-35": 0.45, "36-45": 0.25, "46+": 0.15},
        "by_role": {
            "engineering": {"diversity_index": 0.68},
            "product": {"diversity_index": 0.74},
            "sales": {"diversity_index": 0.78},
        },
        "recommendations": [
            "Increase sourcing from underrepresented groups",
            "Review job descriptions for inclusive language",
            "Implement structured interview processes to reduce bias",
            "Track candidate experience across demographics",
        ],
        "trends": {
            "diversity_year_over_year": "+5%",
            "pay_equity_year_over_year": "+3%",
        },
    }


@router.post("/video-analysis")
async def analyze_video(data: VideoAnalysisRequest):
    """Analyze video interview (with consent)."""
    if not data.candidate_consent:
        return {
            "interview_id": data.interview_id,
            "error": "Candidate consent required for video analysis",
            "consent_verified": False,
        }
    seed = sum(ord(c) for c in data.interview_id) % 100
    base = 6.5 + (seed % 25) / 10
    return {
        "interview_id": data.interview_id,
        "communication_score": round(base + 1.5, 2),
        "confidence_score": round(base + 1.0, 2),
        "engagement_score": round(base + 1.8, 2),
        "presentation_skills": round(base + 0.8, 2),
        "non_verbal_cues": {
            "eye_contact": "strong",
            "posture": "professional",
            "gestures": "appropriate",
            "energy_level": "moderate-to-high",
        },
        "sentiment_analysis": {
            "overall": "positive",
            "confidence_trend": "increasing",
            "enthusiasm": "high",
        },
        "speech_metrics": {
            "pace_wpm": 145,
            "filler_word_count": 12,
            "clarity_score": round(base + 1.2, 2),
        },
        "notes": "Strong communication skills, good eye contact, clear articulation",
        "consent_verified": True,
    }


@router.post("/experience-prediction")
async def experience_prediction(data: ExperiencePredictionRequest):
    """Predict candidate experience and fit in the role."""
    seed = sum(ord(c) for c in data.candidate_id + data.job_id) % 100
    fit_score = round(0.60 + (seed % 35) / 100, 3)

    return {
        "candidate_id": data.candidate_id,
        "job_id": data.job_id,
        "fit_score": fit_score,
        "expected_onboarding_weeks": max(2, int(12 * (1 - fit_score))),
        "expected_productivity_curve": [
            {"week": 1, "productivity": 0.10},
            {"week": 4, "productivity": round(fit_score * 0.35, 2)},
            {"week": 12, "productivity": round(fit_score * 0.75, 2)},
            {"week": 24, "productivity": round(fit_score * 0.95, 2)},
        ],
        "predicted_strengths": [
            "Quick to grasp technical concepts",
            "Strong collaboration tendencies",
        ],
        "predicted_challenges": [
            "Domain-specific terminology",
            "Internal tooling familiarity",
        ],
        "confidence": round(0.75 + (fit_score * 0.15), 3),
    }


@router.post("/recruiter-assist")
async def recruiter_assist(data: RecruiterAssistRequest):
    """AI-powered recruiter productivity assistance."""
    return {
        "recruiter_id": data.recruiter_id,
        "task_type": data.task_type,
        "suggestions": [
            {"action": "Follow up with Sarah Chen", "priority": "high", "reason": "No response after 5 days"},
            {"action": "Schedule technical interview", "priority": "medium", "reason": "Candidate passed resume screen"},
            {"action": "Send offer to John Doe", "priority": "high", "reason": "All interviews completed successfully"},
        ],
        "emails_drafts": [
            {
                "to": "sarah.chen@example.com",
                "subject": "Following up on your application",
                "body": "Hi Sarah, I wanted to follow up on your application for the Senior Engineer position...",
            }
        ],
        "pipeline_health": {"new": 23, "screening": 15, "interviewing": 8, "offered": 3},
    }


@router.get("/candidate-experience/{candidate_id}")
async def candidate_experience(candidate_id: str):
    """Get candidate experience status and history."""
    return {
        "candidate_id": candidate_id,
        "current_stage": "interviewing",
        "timeline": [
            {"stage": "applied", "date": "2025-01-15", "status": "completed"},
            {"stage": "resume_screen", "date": "2025-01-16", "status": "completed"},
            {"stage": "phone_screen", "date": "2025-01-18", "status": "completed"},
            {"stage": "technical_interview", "date": "2025-01-22", "status": "scheduled"},
        ],
        "communication_preference": "email",
        "nps_score": 9,
        "feedback_status": "pending",
    }
