"""Shared matching engine package.

All matching functionality is consolidated in ``shared.ai.matching``.
"""
from shared.ai.matching import (  # noqa: F401
    SEMANTIC_WEIGHT,
    STRUCTURED_WEIGHT,
    BatchMatchResult,
    CandidateJobMatcher,
    MatchReason,
    MatchResult,
    batch_match,
    compute_match_stats,
    compute_matched_missing_skills,
    match_candidates_to_job,
    match_job_to_candidates,
    semantic_match,
)
