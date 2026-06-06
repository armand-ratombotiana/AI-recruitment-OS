"""Candidate scoring engine for AI-ROS."""
from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class ScoreBreakdown:
    skills_score: float
    experience_score: float
    location_score: float
    salary_score: float
    culture_score: float
    total_score: float
    recommendation: str


DEFAULT_WEIGHTS = {
    "skills": 0.35,
    "experience": 0.25,
    "location": 0.15,
    "salary": 0.15,
    "culture": 0.10,
}


def _skills_score(candidate_skills, required_skills, preferred_skills=None):
    if not required_skills:
        return 1.0
    cand = set(s.lower().strip() for s in (candidate_skills or []))
    req = set(s.lower().strip() for s in required_skills)
    if not req:
        return 1.0
    matched = cand & req
    base = len(matched) / len(req)
    if preferred_skills:
        pref = set(s.lower().strip() for s in preferred_skills)
        bonus = 0.05 * (len(cand & pref) / max(len(pref), 1))
        return min(base + bonus, 1.0)
    return min(base, 1.0)


def _experience_score(years, required_years):
    if required_years is None or required_years <= 0:
        return 1.0
    if years is None:
        return 0.0
    if years >= required_years:
        return 1.0
    return max(years / required_years, 0.0)


def _location_score(candidate_location, job_location, remote_ok=False):
    if remote_ok:
        return 0.5
    if not candidate_location or not job_location:
        return 0.0
    cand = candidate_location.lower().strip()
    job = job_location.lower().strip()
    if cand == job:
        return 1.0
    if cand.split(",")[-1].strip() == job.split(",")[-1].strip():
        return 0.7
    return 0.0


def _salary_score(candidate_expected, job_min, job_max):
    if not job_min and not job_max:
        return 1.0
    if not candidate_expected:
        return 0.5
    lo = job_min or 0
    hi = job_max or (candidate_expected * 2)
    if lo <= candidate_expected <= hi:
        return 1.0
    if candidate_expected < lo:
        return max(0.0, candidate_expected / lo)
    if candidate_expected > hi:
        overage = (candidate_expected - hi) / max(hi, 1)
        return max(0.0, 1.0 - min(overage, 1.0))


def _culture_score(metadata):
    if not metadata:
        return 0.5
    val = metadata.get("culture_fit_signal")
    if val is None:
        return 0.5
    return max(0.0, min(1.0, float(val)))


def _recommendation(total):
    if total >= 0.85:
        return "STRONG_MATCH"
    if total >= 0.7:
        return "MATCH"
    if total >= 0.5:
        return "POSSIBLE"
    if total >= 0.3:
        return "WEAK"
    return "NO_MATCH"


def score_candidate(candidate: Dict, job: Dict, weights: Optional[Dict[str, float]] = None) -> ScoreBreakdown:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    total_w = sum(w.values()) or 1.0
    skills = _skills_score(
        candidate.get("skills") or [],
        job.get("required_skills") or [],
        job.get("preferred_skills") or [],
    )
    experience = _experience_score(
        candidate.get("experience_years"),
        job.get("required_experience_years") or job.get("min_experience_years"),
    )
    location = _location_score(
        candidate.get("location"),
        job.get("location"),
        job.get("remote_ok", False),
    )
    salary = _salary_score(
        candidate.get("expected_salary"),
        job.get("salary_min"),
        job.get("salary_max"),
    )
    culture = _culture_score(candidate.get("metadata") or {})
    total = (
        skills * w["skills"]
        + experience * w["experience"]
        + location * w["location"]
        + salary * w["salary"]
        + culture * w["culture"]
    ) / total_w
    return ScoreBreakdown(
        skills_score=round(skills, 4),
        experience_score=round(experience, 4),
        location_score=round(location, 4),
        salary_score=round(salary, 4),
        culture_score=round(culture, 4),
        total_score=round(total, 4),
        recommendation=_recommendation(total),
    )
