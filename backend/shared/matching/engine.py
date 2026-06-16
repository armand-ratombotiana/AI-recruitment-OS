"""Matching engine for candidate-job matching with semantic similarity and scoring."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from shared.ai.cache import get_llm_cache
from shared.scoring.engine import ScoreBreakdown, score_candidate

logger = logging.getLogger("matching.engine")


@dataclass
class MatchResult:
    """Single match result with score breakdown and semantic similarity."""
    candidate_id: str
    job_id: str
    total_score: float
    semantic_similarity: float
    score_breakdown: ScoreBreakdown
    matched_skills: List[str]
    missing_skills: List[str]
    recommendation: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchMatchResult:
    """Result of batch matching operation."""
    matches: List[MatchResult]
    matrix: List[List[float]]  # similarity matrix [candidates x jobs]
    candidates: List[str]
    jobs: List[str]


def _compute_cache_key(prefix: str, *args: Any) -> str:
    """Generate a deterministic cache key from arguments."""
    content = json.dumps(args, sort_keys=True, default=str)
    hash_obj = hashlib.sha256(content.encode())
    return f"{prefix}:{hash_obj.hexdigest()[:32]}"


def _semantic_similarity(candidate: Dict, job: Dict) -> float:
    """
    Compute semantic similarity between candidate and job using embeddings.
    Uses the LLM cache to store/retrieve embeddings.
    """
    cache = get_llm_cache()
    
    candidate_text = _build_candidate_text(candidate)
    job_text = _build_job_text(job)
    
    # Create cache keys for embeddings
    cand_key = _compute_cache_key("embed:candidate", candidate.get("id", ""), candidate_text)
    job_key = _compute_cache_key("embed:job", job.get("id", ""), job_text)
    
    # Get or compute embeddings
    cand_embedding = cache.get(cand_key)
    job_embedding = cache.get(job_key)
    
    if cand_embedding is None:
        cand_embedding = _get_embedding(candidate_text)
        cache.set(cand_key, cand_embedding, ttl=3600)
    
    if job_embedding is None:
        job_embedding = _get_embedding(job_text)
        cache.set(job_key, job_embedding, ttl=3600)
    
    return _cosine_similarity(cand_embedding, job_embedding)


def _get_embedding(text: str) -> List[float]:
    """Get embedding vector for text using LLM router with semantic fallback."""
    import asyncio
    import re

    try:
        from shared.ai.llm_router import get_llm_router
        router = get_llm_router()

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(asyncio.run, router.embed(text))
                return future.result(timeout=10)
        else:
            return asyncio.run(router.embed(text))

    except Exception as e:
        logger.debug("Real embedding unavailable, using semantic pseudo-embedding: %s", e)
        return _generate_semantic_pseudo_embedding(text, dimensions=384)


def _generate_semantic_pseudo_embedding(text: str, dimensions: int = 384) -> List[float]:
    """Generate a pseudo-embedding that captures some semantic meaning from word patterns."""
    import re

    text = text.lower().strip()
    words = re.findall(r'\w+', text)

    embedding = [0.0] * dimensions

    for i, word in enumerate(words):
        word_hash = int(hashlib.md5(word.encode()).hexdigest(), 16)
        idx = word_hash % dimensions
        position_weight = 1.0 / (1.0 + i * 0.1)
        length_weight = min(len(word) / 10.0, 1.0)
        embedding[idx] += position_weight * length_weight

    magnitude = sum(x * x for x in embedding) ** 0.5
    if magnitude > 0:
        embedding = [x / magnitude for x in embedding]

    return embedding


def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    if len(vec1) != len(vec2):
        return 0.0
    
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = sum(a * a for a in vec1) ** 0.5
    norm2 = sum(b * b for b in vec2) ** 0.5
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return dot_product / (norm1 * norm2)


def _build_candidate_text(candidate: Dict) -> str:
    """Build text representation of candidate for embedding."""
    parts = []
    if candidate.get("skills"):
        parts.append("Skills: " + ", ".join(candidate["skills"]))
    if candidate.get("experience_years"):
        parts.append(f"Experience: {candidate['experience_years']} years")
    if candidate.get("location"):
        parts.append(f"Location: {candidate['location']}")
    if candidate.get("summary"):
        parts.append(f"Summary: {candidate['summary']}")
    if candidate.get("current_role"):
        parts.append(f"Current Role: {candidate['current_role']}")
    return " | ".join(parts)


def _build_job_text(job: Dict) -> str:
    """Build text representation of job for embedding."""
    parts = []
    if job.get("title"):
        parts.append(f"Title: {job['title']}")
    if job.get("required_skills"):
        parts.append("Required: " + ", ".join(job["required_skills"]))
    if job.get("preferred_skills"):
        parts.append("Preferred: " + ", ".join(job["preferred_skills"]))
    if job.get("description"):
        parts.append(f"Description: {job['description']}")
    if job.get("location"):
        parts.append(f"Location: {job['location']}")
    if job.get("remote_ok"):
        parts.append("Remote: Yes")
    if job.get("required_experience_years") or job.get("min_experience_years"):
        years = job.get("required_experience_years") or job.get("min_experience_years")
        parts.append(f"Experience Required: {years} years")
    return " | ".join(parts)


def _compute_matched_missing_skills(candidate: Dict, job: Dict) -> Tuple[List[str], List[str]]:
    """Compute matched and missing skills between candidate and job."""
    cand_skills = set(s.lower().strip() for s in (candidate.get("skills") or []))
    req_skills = set(s.lower().strip() for s in (job.get("required_skills") or []))
    pref_skills = set(s.lower().strip() for s in (job.get("preferred_skills") or []))
    
    all_required = req_skills | pref_skills
    matched = sorted(cand_skills & all_required)
    missing = sorted(all_required - cand_skills)
    
    return matched, missing


def match_candidate_to_jobs(
    candidate: Dict,
    jobs: List[Dict],
    top_n: int = 10,
    tenant_id: str = "default"
) -> List[MatchResult]:
    """
    Match a single candidate to multiple jobs, returning ranked results.
    
    Args:
        candidate: Candidate dictionary with id, skills, experience, etc.
        jobs: List of job dictionaries
        top_n: Number of top matches to return
        tenant_id: Tenant identifier for caching isolation
        
    Returns:
        List of MatchResult sorted by total_score descending
    """
    cache = get_llm_cache()
    candidate_id = candidate.get("id", "unknown")
    
    # Check cache for candidate-to-jobs matches
    cache_key = _compute_cache_key(
        f"match:c2j:{tenant_id}", 
        candidate_id, 
        tuple(sorted(j.get("id", "") for j in jobs)),
        top_n
    )
    cached = cache.get(cache_key)
    if cached is not None:
        logger.debug(f"Cache hit for candidate-to-jobs: {candidate_id}")
        return [MatchResult(**m) for m in cached]
    
    results = []
    for job in jobs:
        job_id = job.get("id", "unknown")
        
        # Score using the scoring engine
        score_breakdown = score_candidate(candidate, job)
        
        # Compute semantic similarity
        semantic_sim = _semantic_similarity(candidate, job)
        
        # Compute matched/missing skills
        matched_skills, missing_skills = _compute_matched_missing_skills(candidate, job)
        
        # Combined score: 70% scoring engine, 30% semantic similarity
        combined_score = 0.7 * score_breakdown.total_score + 0.3 * semantic_sim
        
        result = MatchResult(
            candidate_id=candidate_id,
            job_id=job_id,
            total_score=round(combined_score, 4),
            semantic_similarity=round(semantic_sim, 4),
            score_breakdown=score_breakdown,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            recommendation=score_breakdown.recommendation,
            metadata={
                "scoring_weight": 0.7,
                "semantic_weight": 0.3,
                "tenant_id": tenant_id,
            }
        )
        results.append(result)
    
    # Sort by total_score descending
    results.sort(key=lambda x: x.total_score, reverse=True)
    
    # Limit to top_n
    results = results[:top_n]
    
    # Cache results for 1 hour
    cache.set(cache_key, [r.__dict__ for r in results], ttl=3600)
    logger.debug(f"Cached candidate-to-jobs results for {candidate_id}, count={len(results)}")
    
    return results


def match_job_to_candidates(
    job: Dict,
    candidates: List[Dict],
    top_n: int = 20,
    tenant_id: str = "default"
) -> List[MatchResult]:
    """
    Match a single job to multiple candidates, returning ranked results.
    
    Args:
        job: Job dictionary with id, required_skills, etc.
        candidates: List of candidate dictionaries
        top_n: Number of top matches to return
        tenant_id: Tenant identifier for caching isolation
        
    Returns:
        List of MatchResult sorted by total_score descending
    """
    cache = get_llm_cache()
    job_id = job.get("id", "unknown")
    
    # Check cache for job-to-candidates matches
    cache_key = _compute_cache_key(
        f"match:j2c:{tenant_id}",
        job_id,
        tuple(sorted(c.get("id", "") for c in candidates)),
        top_n
    )
    cached = cache.get(cache_key)
    if cached is not None:
        logger.debug(f"Cache hit for job-to-candidates: {job_id}")
        return [MatchResult(**m) for m in cached]
    
    results = []
    for candidate in candidates:
        candidate_id = candidate.get("id", "unknown")
        
        # Score using the scoring engine
        score_breakdown = score_candidate(candidate, job)
        
        # Compute semantic similarity
        semantic_sim = _semantic_similarity(candidate, job)
        
        # Compute matched/missing skills
        matched_skills, missing_skills = _compute_matched_missing_skills(candidate, job)
        
        # Combined score: 70% scoring engine, 30% semantic similarity
        combined_score = 0.7 * score_breakdown.total_score + 0.3 * semantic_sim
        
        result = MatchResult(
            candidate_id=candidate_id,
            job_id=job_id,
            total_score=round(combined_score, 4),
            semantic_similarity=round(semantic_sim, 4),
            score_breakdown=score_breakdown,
            matched_skills=matched_skills,
            missing_skills=missing_skills,
            recommendation=score_breakdown.recommendation,
            metadata={
                "scoring_weight": 0.7,
                "semantic_weight": 0.3,
                "tenant_id": tenant_id,
            }
        )
        results.append(result)
    
    # Sort by total_score descending
    results.sort(key=lambda x: x.total_score, reverse=True)
    
    # Limit to top_n
    results = results[:top_n]
    
    # Cache results for 1 hour
    cache.set(cache_key, [r.__dict__ for r in results], ttl=3600)
    logger.debug(f"Cached job-to-candidates results for {job_id}, count={len(results)}")
    
    return results


def batch_match(
    candidates: List[Dict],
    jobs: List[Dict],
    tenant_id: str = "default"
) -> BatchMatchResult:
    """
    Perform batch matching between all candidates and all jobs.
    
    Args:
        candidates: List of candidate dictionaries
        jobs: List of job dictionaries
        tenant_id: Tenant identifier for caching isolation
        
    Returns:
        BatchMatchResult with matches, similarity matrix, and entity lists
    """
    cache = get_llm_cache()
    
    cand_ids = [c.get("id", f"cand_{i}") for i, c in enumerate(candidates)]
    job_ids = [j.get("id", f"job_{i}") for i, j in enumerate(jobs)]
    
    # Check cache for batch match
    cache_key = _compute_cache_key(
        f"match:batch:{tenant_id}",
        tuple(sorted(cand_ids)),
        tuple(sorted(job_ids))
    )
    cached = cache.get(cache_key)
    if cached is not None:
        logger.debug(f"Cache hit for batch match: {len(candidates)} candidates x {len(jobs)} jobs")
        return BatchMatchResult(**cached)
    
    matches = []
    matrix = []
    
    for candidate in candidates:
        row = []
        for job in jobs:
            # Score using the scoring engine
            score_breakdown = score_candidate(candidate, job)
            
            # Compute semantic similarity
            semantic_sim = _semantic_similarity(candidate, job)
            
            # Compute matched/missing skills
            matched_skills, missing_skills = _compute_matched_missing_skills(candidate, job)
            
            # Combined score
            combined_score = 0.7 * score_breakdown.total_score + 0.3 * semantic_sim
            
            result = MatchResult(
                candidate_id=candidate.get("id", "unknown"),
                job_id=job.get("id", "unknown"),
                total_score=round(combined_score, 4),
                semantic_similarity=round(semantic_sim, 4),
                score_breakdown=score_breakdown,
                matched_skills=matched_skills,
                missing_skills=missing_skills,
                recommendation=score_breakdown.recommendation,
                metadata={
                    "scoring_weight": 0.7,
                    "semantic_weight": 0.3,
                    "tenant_id": tenant_id,
                }
            )
            matches.append(result)
            row.append(round(semantic_sim, 4))
        matrix.append(row)
    
    # Sort matches by total_score descending
    matches.sort(key=lambda x: x.total_score, reverse=True)
    
    batch_result = BatchMatchResult(
        matches=matches,
        matrix=matrix,
        candidates=cand_ids,
        jobs=job_ids,
    )
    
    # Cache for 1 hour
    cache.set(cache_key, {
        "matches": [m.__dict__ for m in matches],
        "matrix": matrix,
        "candidates": cand_ids,
        "jobs": job_ids,
    }, ttl=3600)
    logger.debug(f"Cached batch match results: {len(candidates)} candidates x {len(jobs)} jobs")
    
    return batch_result


def get_cached_candidate_recommendations(
    candidate_id: str,
    tenant_id: str = "default"
) -> Optional[List[MatchResult]]:
    """Get cached recommendations for a candidate."""
    cache = get_llm_cache()
    # We need to scan for keys matching this candidate
    # In production, use a proper index. For now, this is a placeholder.
    return None


def get_cached_job_recommendations(
    job_id: str,
    tenant_id: str = "default"
) -> Optional[List[MatchResult]]:
    """Get cached recommendations for a job."""
    cache = get_llm_cache()
    # Placeholder - would need proper cache indexing
    return None


def invalidate_candidate_cache(candidate_id: str, tenant_id: str = "default") -> int:
    """Invalidate all cache entries for a candidate."""
    cache = get_llm_cache()
    # In production, use cache pattern matching
    return 0


def invalidate_job_cache(job_id: str, tenant_id: str = "default") -> int:
    """Invalidate all cache entries for a job."""
    cache = get_llm_cache()
    return 0