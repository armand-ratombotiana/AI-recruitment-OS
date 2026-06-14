"""AI Matching Service — candidate-job matching with semantic scoring."""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from shared.auth import require_tenant_id
from shared.ai.matching import CandidateJobMatcher, compute_match_stats, match_candidates_to_job, match_job_to_candidates as _match_jobs

logger = logging.getLogger("ai.matching")

router = APIRouter()

_matcher = CandidateJobMatcher()


class CandidateToJobsRequest(BaseModel):
    candidate: dict = Field(..., description="Candidate object with skills, experience, etc.")
    jobs: list[dict] = Field(..., description="List of job objects to rank against")
    top_n: int = Field(default=10, ge=1, le=200)


class JobToCandidatesRequest(BaseModel):
    job: dict = Field(..., description="Job object with required_skills, title, etc.")
    candidates: list[dict] = Field(..., description="List of candidate objects to rank")
    top_n: int = Field(default=20, ge=1, le=200)


class BatchMatchItem(BaseModel):
    candidate: Optional[dict] = None
    job: Optional[dict] = None
    candidates: Optional[list[dict]] = None
    jobs: Optional[list[dict]] = None
    mode: str = Field(default="candidate_to_jobs", description="candidate_to_jobs or job_to_candidates")
    top_n: int = Field(default=10, ge=1, le=200)


class BatchMatchRequest(BaseModel):
    items: list[BatchMatchItem] = Field(..., min_length=1, max_length=100)


@router.post(
    "/candidate/{candidate_id}/jobs",
    tags=["AI Matching"],
    summary="Match a candidate to a list of jobs",
)
async def match_candidate_to_jobs_endpoint(
    candidate_id: str,
    data: CandidateToJobsRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    if not data.jobs:
        raise HTTPException(status_code=422, detail="At least one job is required")
    results = _matcher.match_candidate_to_jobs(
        candidate_id=candidate_id,
        candidate=data.candidate,
        jobs=data.jobs,
        top_n=data.top_n,
    )
    return {
        "tenant_id": tenant_id,
        "candidate_id": candidate_id,
        "total_scored": len(data.jobs),
        "returned": len(results),
        "matches": results,
    }


@router.post(
    "/job/{job_id}/candidates",
    tags=["AI Matching"],
    summary="Match a job to a list of candidates",
)
async def match_job_to_candidates_endpoint(
    job_id: str,
    data: JobToCandidatesRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    if not data.candidates:
        raise HTTPException(status_code=422, detail="At least one candidate is required")
    results = _matcher.match_job_to_candidates(
        job_id=job_id,
        job=data.job,
        candidates=data.candidates,
        top_n=data.top_n,
    )
    return {
        "tenant_id": tenant_id,
        "job_id": job_id,
        "total_scored": len(data.candidates),
        "returned": len(results),
        "matches": results,
    }


@router.post(
    "/batch",
    tags=["AI Matching"],
    summary="Batch matching — process multiple match requests in one call",
)
async def batch_match_endpoint(
    data: BatchMatchRequest,
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    for i, item in enumerate(data.items):
        try:
            if item.mode == "candidate_to_jobs":
                if not item.candidate or not item.jobs:
                    results.append({"index": i, "error": "candidate and jobs required for candidate_to_jobs mode"})
                    continue
                matches = _matcher.match_candidate_to_jobs(
                    candidate_id=item.candidate.get("id", f"batch-{i}"),
                    candidate=item.candidate,
                    jobs=item.jobs,
                    top_n=item.top_n,
                )
                results.append({"index": i, "mode": "candidate_to_jobs", "matches": matches})
            elif item.mode == "job_to_candidates":
                if not item.job or not item.candidates:
                    results.append({"index": i, "error": "job and candidates required for job_to_candidates mode"})
                    continue
                matches = _matcher.match_job_to_candidates(
                    job_id=item.job.get("id", f"batch-{i}"),
                    job=item.job,
                    candidates=item.candidates,
                    top_n=item.top_n,
                )
                results.append({"index": i, "mode": "job_to_candidates", "matches": matches})
            else:
                results.append({"index": i, "error": f"Unknown mode: {item.mode}"})
        except Exception as exc:
            logger.exception("batch_match.item_failed index=%d", i)
            results.append({"index": i, "error": str(exc)})
    return {
        "tenant_id": tenant_id,
        "total_items": len(data.items),
        "processed": len(results),
        "results": results,
    }


@router.get(
    "/stats",
    tags=["AI Matching"],
    summary="Get matching statistics and configuration",
)
async def matching_stats_endpoint(
    tenant_id: str = Depends(require_tenant_id),
) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "semantic_weight": _matcher.semantic_weight,
        "structured_weight": _matcher.structured_weight,
        "supported_dimensions": [
            "skills",
            "experience",
            "location",
            "salary",
            "culture",
            "semantic_similarity",
        ],
        "model": "tfidf-cosine + scoring-engine",
        "matcher_type": "rule-based" if not _matcher.use_llm else "llm-enhanced",
    }
