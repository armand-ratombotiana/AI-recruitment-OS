"""DEPRECATED: Matching engine — redirects to the canonical implementation.

All matching functionality has been consolidated into ``shared.ai.matching``.
This module exists only to avoid breaking any stale imports and will be
removed in a future release.
"""
from __future__ import annotations

import warnings
from typing import Any, Dict, List

from shared.ai.matching import (
    SEMANTIC_WEIGHT as _SEMANTIC_WEIGHT,
    STRUCTURED_WEIGHT as _STRUCTURED_WEIGHT,
    MatchResult as _MatchResult,
    BatchMatchResult,
    batch_match as _batch_match,
    compute_matched_missing_skills,
    match_candidates_to_job,
    match_job_to_candidates,
    semantic_match,
)
from shared.scoring.engine import ScoreBreakdown, score_candidate

warnings.warn(
    "shared.matching.engine is deprecated. "
    "Import from shared.ai.matching instead.",
    DeprecationWarning,
    stacklevel=2,
)

STRUCTURED_WEIGHT = _STRUCTURED_WEIGHT
SEMANTIC_WEIGHT = _SEMANTIC_WEIGHT


def match_candidate_to_jobs(
    candidate: Dict,
    jobs: List[Dict],
    top_n: int = 10,
    tenant_id: str = "default",
) -> list:
    return match_job_to_candidates(
        candidate=candidate,
        jobs=jobs,
        top_n=top_n,
    )


def match_job_to_candidates_legacy(
    job: Dict,
    candidates: List[Dict],
    top_n: int = 20,
    tenant_id: str = "default",
) -> list:
    return match_candidates_to_job(
        job=job,
        candidates=candidates,
        top_n=top_n,
    )


def batch_match_legacy(
    candidates: List[Dict],
    jobs: List[Dict],
    tenant_id: str = "default",
) -> BatchMatchResult:
    return _batch_match(candidates, jobs)
