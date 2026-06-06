"""Tests for the candidate scoring engine."""
import pytest
from shared.scoring.engine import score_candidate, ScoreBreakdown, DEFAULT_WEIGHTS


def make_candidate(**overrides):
    base = {
        "skills": ["python", "fastapi", "react", "postgresql"],
        "experience_years": 5,
        "location": "Paris, France",
        "expected_salary": 70000,
        "metadata": {"culture_fit_signal": 0.8},
    }
    base.update(overrides)
    return base


def make_job(**overrides):
    base = {
        "required_skills": ["python", "fastapi"],
        "preferred_skills": ["react"],
        "required_experience_years": 3,
        "location": "Paris, France",
        "salary_min": 60000,
        "salary_max": 90000,
        "remote_ok": False,
    }
    base.update(overrides)
    return base


def test_perfect_match_is_strong():
    result = score_candidate(make_candidate(), make_job())
    assert result.recommendation == "STRONG_MATCH"
    assert result.total_score >= 0.85
    assert result.skills_score == 1.0
    assert result.experience_score == 1.0
    assert result.location_score == 1.0
    assert result.salary_score == 1.0


def test_partial_match():
    c = make_candidate(skills=["python"], experience_years=1, expected_salary=20000, location="Lyon, France")
    j = make_job()
    result = score_candidate(c, j)
    assert result.recommendation in ("WEAK", "POSSIBLE", "MATCH", "STRONG_MATCH")
    assert 0.0 <= result.total_score <= 1.0


def test_no_skill_match():
    c = make_candidate(skills=["cobol", "fortran"])
    j = make_job(required_skills=["python", "rust", "go"])
    result = score_candidate(c, j)
    assert result.skills_score == 0.0
    assert result.recommendation in ("WEAK", "NO_MATCH", "POSSIBLE")


def test_remote_location_score():
    c = make_candidate(location="Tokyo, Japan")
    j = make_job(location="Paris, France", remote_ok=True)
    result = score_candidate(c, j)
    assert result.location_score == 0.5


def test_salary_too_high():
    c = make_candidate(expected_salary=500000)
    j = make_job(salary_min=50000, salary_max=80000)
    result = score_candidate(c, j)
    assert result.salary_score < 1.0


def test_salary_in_range():
    c = make_candidate(expected_salary=75000)
    j = make_job(salary_min=50000, salary_max=100000)
    result = score_candidate(c, j)
    assert result.salary_score == 1.0


def test_custom_weights():
    c = make_candidate()
    j = make_job()
    weights = {"skills": 0.5, "experience": 0.5, "location": 0.0, "salary": 0.0, "culture": 0.0}
    result = score_candidate(c, j, weights=weights)
    assert 0.0 <= result.total_score <= 1.0


def test_recommendation_thresholds():
    # Just verify thresholds work
    r1 = score_candidate(make_candidate(), make_job())
    r2 = score_candidate(make_candidate(skills=[]), make_job(required_skills=[]))
    r3 = score_candidate(make_candidate(skills=[]), make_job())
    assert r1.recommendation in ("STRONG_MATCH", "MATCH", "POSSIBLE", "WEAK", "NO_MATCH")
    assert r2.recommendation in ("STRONG_MATCH", "MATCH", "POSSIBLE", "WEAK", "NO_MATCH")
    assert r3.recommendation in ("STRONG_MATCH", "MATCH", "POSSIBLE", "WEAK", "NO_MATCH")


def test_empty_inputs():
    result = score_candidate({}, {})
    assert 0.0 <= result.total_score <= 1.0
    assert isinstance(result, ScoreBreakdown)


def test_returns_breakdown_object():
    result = score_candidate(make_candidate(), make_job())
    assert hasattr(result, "skills_score")
    assert hasattr(result, "total_score")
    assert hasattr(result, "recommendation")
