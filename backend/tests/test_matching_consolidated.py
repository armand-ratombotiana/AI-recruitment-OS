"""Tests for the consolidated matching engine.

Verifies that the canonical engine (shared.ai.matching) correctly provides
all functionality previously split across two engines, and that the
deprecated shim (shared.matching.engine) still works.
"""
from __future__ import annotations

import os
import sys
import warnings

import pytest

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from shared.ai.matching import (
    SEMANTIC_WEIGHT,
    STRUCTURED_WEIGHT,
    BatchMatchResult,
    CandidateJobMatcher,
    MatchResult,
    batch_match,
    compute_match_stats,
    compute_matched_missing_skills,
    match_candidates_to_job,
    match_job_to_candidates,
    semantic_match,
)


def _candidate(**kw):
    base = {
        "id": "c1",
        "skills": ["python", "react", "postgresql"],
        "experience_years": 5,
        "location": "San Francisco",
        "expected_salary": 120000,
        "title": "Full Stack Developer",
        "metadata": {"culture_fit_signal": 0.7},
    }
    base.update(kw)
    return base


def _job(**kw):
    base = {
        "id": "j1",
        "required_skills": ["python", "react"],
        "preferred_skills": ["postgresql"],
        "required_experience_years": 3,
        "location": "San Francisco",
        "salary_min": 100000,
        "salary_max": 150000,
        "remote_ok": False,
        "title": "Senior Full Stack Engineer",
        "description": "Build web applications with Python and React",
    }
    base.update(kw)
    return base


class TestWeights:
    def test_canonical_weights_sum_to_one(self):
        assert round(SEMANTIC_WEIGHT + STRUCTURED_WEIGHT, 4) == 1.0

    def test_semantic_weight_is_40(self):
        assert SEMANTIC_WEIGHT == 0.40

    def test_structured_weight_is_60(self):
        assert STRUCTURED_WEIGHT == 0.60


class TestMatcherInitialization:
    def test_default_init(self):
        matcher = CandidateJobMatcher()
        assert matcher is not None
        assert matcher.semantic_weight == SEMANTIC_WEIGHT
        assert matcher.structured_weight == STRUCTURED_WEIGHT

    def test_custom_weights(self):
        matcher = CandidateJobMatcher(semantic_weight=0.5, structured_weight=0.5)
        assert matcher.semantic_weight == 0.5
        assert matcher.structured_weight == 0.5


class TestMatchScoreRange:
    def test_score_0_to_100(self):
        matcher = CandidateJobMatcher()
        score = matcher.calculate_match_score(_candidate(), _job())
        assert 0 <= score <= 100

    def test_strong_match(self):
        matcher = CandidateJobMatcher()
        score = matcher.calculate_match_score(_candidate(), _job())
        assert score >= 50

    def test_weak_match(self):
        matcher = CandidateJobMatcher()
        c = _candidate(skills=["cobol"], experience_years=0, location="Timbuktu")
        j = _job(required_skills=["rust", "go"], required_experience_years=10)
        score = matcher.calculate_match_score(c, j)
        assert score < 50

    def test_empty_inputs(self):
        matcher = CandidateJobMatcher()
        score = matcher.calculate_match_score({}, {})
        assert 0 <= score <= 100


class TestMatchReasons:
    def test_reasons_generated(self):
        matcher = CandidateJobMatcher()
        reasons = matcher.generate_match_reasons(_candidate(), _job())
        assert isinstance(reasons, list)
        assert len(reasons) > 0

    def test_reasons_are_strings(self):
        matcher = CandidateJobMatcher()
        reasons = matcher.generate_match_reasons(_candidate(), _job())
        assert all(isinstance(r, str) for r in reasons)

    def test_skills_in_reasons(self):
        matcher = CandidateJobMatcher()
        reasons = matcher.generate_match_reasons(_candidate(), _job())
        text = " ".join(reasons).lower()
        assert "python" in text or "react" in text

    def test_experience_in_reasons(self):
        matcher = CandidateJobMatcher()
        reasons = matcher.generate_match_reasons(_candidate(), _job())
        text = " ".join(reasons).lower()
        assert "experience" in text


class TestSemanticMatch:
    def test_range(self):
        score = semantic_match(_candidate(), _job())
        assert 0.0 <= score <= 1.0

    def test_good_overlap(self):
        score = semantic_match(_candidate(), _job())
        assert score > 0.2

    def test_empty(self):
        assert semantic_match({}, {}) == 0.0


class TestComputeMatchedMissingSkills:
    def test_matched_skills(self):
        matched, missing = compute_matched_missing_skills(_candidate(), _job())
        assert "python" in matched
        assert "react" in matched
        assert "postgresql" in matched

    def test_missing_skills(self):
        c = _candidate(skills=["python"])
        matched, missing = compute_matched_missing_skills(c, _job())
        assert "react" in missing

    def test_empty_candidate(self):
        matched, missing = compute_matched_missing_skills({}, _job())
        assert matched == []
        assert len(missing) > 0

    def test_empty_job(self):
        matched, missing = compute_matched_missing_skills(_candidate(), {})
        assert matched == []
        assert missing == []


class TestMatchCandidatesToJob:
    def test_ranking(self):
        c1 = _candidate(id="c1", skills=["python", "react"])
        c2 = _candidate(id="c2", skills=["cobol", "fortran"])
        results = match_candidates_to_job(_job(), [c2, c1])
        assert results[0].candidate_id == "c1"

    def test_top_n(self):
        candidates = [_candidate(id=f"c{i}") for i in range(10)]
        results = match_candidates_to_job(_job(), candidates, top_n=3)
        assert len(results) == 3

    def test_returns_match_results(self):
        results = match_candidates_to_job(_job(), [_candidate()])
        assert isinstance(results[0], MatchResult)


class TestMatchJobToCandidates:
    def test_ranking(self):
        j1 = _job(id="j1", required_skills=["python", "react"])
        j2 = _job(id="j2", required_skills=["cobol", "fortran"])
        results = match_job_to_candidates(_candidate(), [j2, j1])
        assert results[0].job_id == "j1"

    def test_top_n(self):
        jobs = [_job(id=f"j{i}") for i in range(10)]
        results = match_job_to_candidates(_candidate(), jobs, top_n=3)
        assert len(results) == 3


class TestBatchMatch:
    def test_batch_produces_results(self):
        candidates = [_candidate(id=f"c{i}") for i in range(3)]
        jobs = [_job(id=f"j{i}") for i in range(2)]
        result = batch_match(candidates, jobs)
        assert isinstance(result, BatchMatchResult)
        assert len(result.matches) == 6

    def test_matrix_dimensions(self):
        candidates = [_candidate(id=f"c{i}") for i in range(3)]
        jobs = [_job(id=f"j{i}") for i in range(2)]
        result = batch_match(candidates, jobs)
        assert len(result.matrix) == 3
        assert len(result.matrix[0]) == 2

    def test_matches_sorted(self):
        candidates = [_candidate(id=f"c{i}") for i in range(5)]
        jobs = [_job(id=f"j{i}") for i in range(3)]
        result = batch_match(candidates, jobs)
        scores = [m.hybrid_score for m in result.matches]
        assert scores == sorted(scores, reverse=True)

    def test_to_dict(self):
        result = batch_match([_candidate()], [_job()])
        d = result.to_dict()
        assert "matches" in d
        assert "matrix" in d
        assert "candidate_ids" in d
        assert "job_ids" in d


class TestComputeMatchStats:
    def test_empty(self):
        stats = compute_match_stats([])
        assert stats["total"] == 0

    def test_stats(self):
        results = match_candidates_to_job(
            _job(), [_candidate(id=f"c{i}") for i in range(3)]
        )
        stats = compute_match_stats(results)
        assert stats["total"] == 3
        assert 0.0 <= stats["avg_hybrid_score"] <= 1.0


class TestCandidateJobMatcherMethods:
    def test_match_candidate_to_jobs(self):
        matcher = CandidateJobMatcher()
        jobs = [_job(id=f"j{i}") for i in range(3)]
        results = matcher.match_candidate_to_jobs("c1", _candidate(), jobs)
        assert len(results) == 3
        assert results[0]["score"] >= results[1]["score"]

    def test_match_job_to_candidates(self):
        matcher = CandidateJobMatcher()
        candidates = [_candidate(id=f"c{i}") for i in range(3)]
        results = matcher.match_job_to_candidates("j1", _job(), candidates)
        assert len(results) == 3
        assert results[0]["score"] >= results[1]["score"]


class TestDeprecatedEngine:
    def test_deprecation_warning(self):
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            import importlib
            import shared.matching.engine as engine_mod
            importlib.reload(engine_mod)
            dep_warnings = [x for x in w if issubclass(x.category, DeprecationWarning)]
            assert len(dep_warnings) >= 1

    def test_shim_match_candidate_to_jobs(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            from shared.matching.engine import match_candidate_to_jobs
            results = match_candidate_to_jobs(_candidate(), [_job()])
            assert len(results) == 1

    def test_shim_batch_match(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            from shared.matching.engine import batch_match_legacy
            result = batch_match_legacy([_candidate()], [_job()])
            assert isinstance(result, BatchMatchResult)

    def test_shim_exports(self):
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            from shared.matching.engine import (
                STRUCTURED_WEIGHT,
                SEMANTIC_WEIGHT,
                compute_matched_missing_skills,
                semantic_match,
            )
            assert STRUCTURED_WEIGHT == 0.60
            assert SEMANTIC_WEIGHT == 0.40


class TestMatchingPackageRedirect:
    def test_package_exports(self):
        from shared.matching import (
            CandidateJobMatcher,
            MatchResult,
            batch_match,
            compute_matched_missing_skills,
            semantic_match,
        )
        assert CandidateJobMatcher is not None
        assert MatchResult is not None
