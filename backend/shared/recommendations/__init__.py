"""Candidate recommendation, match-statistics, and skill-gap engines.

This package composes on top of :mod:`shared.scoring.engine` to provide the
higher-level analytics the job service exposes:

* :func:`recommend_candidates` — rank a list of candidates against a job and
  return the top-N above a configurable minimum score.
* :func:`match_stats` — aggregate the score distribution, average, and the
  most-attractive skills for a job.
* :func:`skill_gap_analysis` — break down the difference between a candidate's
  skill set and a job's required / preferred skills.

All functions accept plain ``dict`` payloads (the same shape the scoring
engine consumes) so they can be unit-tested in isolation without a database
and reused outside the job service.
"""

from shared.recommendations.engine import (
    match_stats,
    recommend_candidates,
    skill_gap_analysis,
)

__all__ = [
    "match_stats",
    "recommend_candidates",
    "skill_gap_analysis",
]
