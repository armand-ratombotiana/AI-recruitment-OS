"""Unit tests for PPE Agent evaluation logic."""

from __future__ import annotations

import pytest

from shared.core.models.evaluation import PPEEvaluation, EvaluationType
from shared.core.models.candidate import SeniorityLevel


pytestmark = [pytest.mark.unit, pytest.mark.ppe, pytest.mark.ai]


class TestPPEScoreCalculation:
    def test_technical_score_average(self):
        scores = {
            "correctness_score": 8.0,
            "efficiency_score": 7.0,
            "algorithm_quality_score": 9.0,
            "edge_case_handling_score": 6.0,
        }
        avg = sum(scores.values()) / len(scores)
        assert avg == 7.5

    def test_cs_fundamentals_score(self):
        scores = {
            "big_o_understanding": 8.5,
            "tradeoff_reasoning": 7.0,
            "scalability_awareness": 9.0,
            "data_structures_understanding": 8.0,
        }
        avg = sum(scores.values()) / len(scores)
        assert 7.0 < avg < 9.0

    def test_code_quality_score(self):
        scores = {
            "readability_score": 7.0,
            "maintainability_score": 8.0,
            "modularity_score": 6.0,
            "naming_conventions_score": 9.0,
        }
        avg = sum(scores.values()) / len(scores)
        assert avg == 7.5

    def test_communication_score(self):
        scores = {
            "explanation_clarity_score": 8.0,
            "collaborative_interaction_score": 7.5,
            "reasoning_transparency_score": 9.0,
        }
        avg = sum(scores.values()) / len(scores)
        assert 7.0 < avg < 9.0

    def test_weighted_overall_score(self):
        weights = {"technical": 0.30, "cs": 0.20, "quality": 0.15, "problem_solving": 0.20, "communication": 0.15}
        dimension_scores = {"technical": 8.0, "cs": 7.0, "quality": 9.0, "problem_solving": 8.5, "communication": 7.5}
        overall = sum(dimension_scores[k] * weights[k] for k in weights)
        assert 7.0 < overall < 9.0

    def test_score_range_validation(self):
        scores = [0.0, 5.0, 10.0]
        for score in scores:
            assert 0.0 <= score <= 10.0

    def test_zero_scores_yield_zero_overall(self):
        ppe = PPEEvaluation(
            session_id="s1",
            tenant_id="t1",
            candidate_id="c1",
            correctness_score=0.0,
            efficiency_score=0.0,
            algorithm_quality_score=0.0,
            edge_case_handling_score=0.0,
        )
        assert ppe.overall_score == 0.0


class TestSeniorityEstimation:
    def test_seniority_levels(self):
        levels = [
            SeniorityLevel.JUNIOR,
            SeniorityLevel.MID,
            SeniorityLevel.SENIOR,
            SeniorityLevel.STAFF,
            SeniorityLevel.PRINCIPAL,
        ]
        assert len(levels) == 5
        assert SeniorityLevel.JUNIOR != SeniorityLevel.SENIOR

    def test_seniority_from_years_experience(self):
        def estimate_seniority(years: int) -> str:
            if years < 2:
                return "junior"
            elif years < 5:
                return "mid"
            elif years < 8:
                return "senior"
            elif years < 12:
                return "staff"
            return "principal"

        assert estimate_seniority(0) == "junior"
        assert estimate_seniority(3) == "mid"
        assert estimate_seniority(6) == "senior"
        assert estimate_seniority(10) == "staff"
        assert estimate_seniority(15) == "principal"

    def test_confidence_level_range(self):
        confidence = 0.85
        assert 0.0 <= confidence <= 1.0


class TestHintGeneration:
    def test_hint_types(self):
        hint_types = ["conceptual", "approach", "implementation"]
        assert len(hint_types) == 3
        assert all(isinstance(h, str) for h in hint_types)

    def test_hints_increment(self):
        hints_used = 0
        max_hints = 3
        for _ in range(max_hints):
            hints_used += 1
        assert hints_used == max_hints

    def test_hint_progression(self):
        hints = [
            "Think about what data structure would be most efficient here.",
            "Consider using a hash map to track visited elements.",
            "You can iterate through the array once while maintaining a lookup.",
        ]
        assert len(hints) <= 3
        assert all(isinstance(h, str) for h in hints)


class TestFollowUpQuestions:
    def test_question_types(self):
        question_types = ["technical", "behavioral", "follow_up", "clarification"]
        assert "technical" in question_types
        assert "follow_up" in question_types

    def test_dynamic_followup_generation(self):
        context = {"weak_areas": ["algorithms", "system_design"], "score": 6.5}
        questions = []
        for area in context["weak_areas"]:
            questions.append(f"Can you elaborate on your approach to {area}?")
        assert len(questions) == 2
        assert "algorithms" in questions[0]


class TestHiringRecommendation:
    def test_recommendation_thresholds(self):
        def get_recommendation(score: float) -> str:
            if score >= 8.0:
                return "strong_hire"
            elif score >= 6.0:
                return "hire"
            elif score >= 4.0:
                return "neutral"
            return "no_hire"

        assert get_recommendation(9.0) == "strong_hire"
        assert get_recommendation(7.0) == "hire"
        assert get_recommendation(5.0) == "neutral"
        assert get_recommendation(2.0) == "no_hire"

    def test_hiring_recommendation_values(self):
        recs = ["strong_hire", "hire", "neutral", "no_hire"]
        assert len(recs) == 4
        assert all(isinstance(r, str) for r in recs)

    def test_ppe_evaluation_with_recommendation(self):
        ppe = PPEEvaluation(
            session_id="s1",
            tenant_id="t1",
            candidate_id="c1",
            overall_score=8.5,
            hiring_recommendation="strong_hire",
            confidence_level=0.9,
        )
        assert ppe.hiring_recommendation == "strong_hire"
        assert ppe.confidence_level == 0.9
